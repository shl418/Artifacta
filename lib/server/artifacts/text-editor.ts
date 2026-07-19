import { createHash } from "node:crypto"
import { parse } from "parse5"
import type { DashboardTextChange } from "@/lib/types"

const excludedElements = new Set([
  "script",
  "style",
  "template",
  "noscript",
  "svg",
  "math",
  "textarea",
  "option",
  "title",
])

const maxEditCount = 500
const maxTextLength = 10_000

interface ParsedNode {
  nodeName: string
  tagName?: string
  value?: string
  childNodes?: ParsedNode[]
  parentNode?: ParsedNode
  attrs?: Array<{ name: string; value: string }>
  sourceCodeLocation?: {
    startOffset: number
    endOffset: number
  } | null
}

export interface EditableTextNode {
  textKey: string
  path: string
  text: string
  context: string
  startOffset: number
  endOffset: number
}

export interface TextEditInput {
  textKey: string
  before: string
  after: string
}

export type TextMergeConflictReason = "both_modified" | "target_missing" | "target_ambiguous"

export interface TextMergeConflict {
  id: string
  textKey: string
  context: string
  base: string
  latest: string | null
  yours: string
  latestTextKey: string | null
  reason: TextMergeConflictReason
}

export interface TextMergeResult {
  automaticEdits: TextEditInput[]
  conflicts: TextMergeConflict[]
}

export function extractEditableTextNodes(html: string): EditableTextNode[] {
  const document = parse(html, { sourceCodeLocationInfo: true }) as unknown as ParsedNode
  const results: EditableTextNode[] = []

  const visit = (node: ParsedNode, path: string, insideBody: boolean, excluded: boolean) => {
    const tagName = node.tagName?.toLowerCase()
    const nextInsideBody = insideBody || tagName === "body"
    const nextExcluded = excluded || Boolean(tagName && excludedElements.has(tagName))

    if (
      node.nodeName === "#text" &&
      nextInsideBody &&
      !nextExcluded &&
      node.value &&
      node.value.trim() &&
      node.sourceCodeLocation
    ) {
      const textKey = hashKey(path)
      results.push({
        textKey,
        path,
        text: node.value,
        context: textContext(node.parentNode),
        startOffset: node.sourceCodeLocation.startOffset,
        endOffset: node.sourceCodeLocation.endOffset,
      })
    }

    const children = node.childNodes ?? []
    let elementIndex = 0
    let textIndex = 0
    for (const child of children) {
      let segment: string
      if (child.nodeName === "#text") {
        segment = `text:${textIndex}`
        textIndex += 1
      } else if (child.tagName) {
        segment = `${child.tagName.toLowerCase()}:${elementIndex}`
        elementIndex += 1
      } else {
        segment = `${child.nodeName}:${children.indexOf(child)}`
      }
      visit(child, path ? `${path}/${segment}` : segment, nextInsideBody, nextExcluded)
    }
  }

  visit(document, "", false, false)
  return results
}

export function instrumentEditableHtml(html: string) {
  const nodes = extractEditableTextNodes(html)
  const replacements = nodes
    .flatMap((node) => [
      { offset: node.endOffset, value: `<!--artifacta-text-end:${node.textKey}-->` },
      { offset: node.startOffset, value: `<!--artifacta-text-start:${node.textKey}-->` },
    ])
    .sort((left, right) => right.offset - left.offset)

  let instrumented = html
  for (const replacement of replacements) {
    instrumented =
      instrumented.slice(0, replacement.offset) +
      replacement.value +
      instrumented.slice(replacement.offset)
  }
  return { html: instrumented, nodes }
}

export function validateTextEdits(baseHtml: string, edits: TextEditInput[]) {
  if (!Array.isArray(edits) || edits.length === 0) throw new Error("NO_TEXT_EDITS")
  if (edits.length > maxEditCount) throw new Error("TOO_MANY_TEXT_EDITS")

  const nodes = new Map(extractEditableTextNodes(baseHtml).map((node) => [node.textKey, node]))
  const seen = new Set<string>()
  const normalized: TextEditInput[] = []

  for (const edit of edits) {
    if (
      !edit ||
      typeof edit.textKey !== "string" ||
      typeof edit.before !== "string" ||
      typeof edit.after !== "string"
    ) {
      throw new Error("INVALID_TEXT_EDIT")
    }
    if (seen.has(edit.textKey)) throw new Error("DUPLICATE_TEXT_EDIT")
    seen.add(edit.textKey)
    if (edit.after.length > maxTextLength) throw new Error("TEXT_EDIT_TOO_LONG")
    if (edit.after.includes("\u0000")) throw new Error("INVALID_TEXT_EDIT")

    const node = nodes.get(edit.textKey)
    if (!node || node.text !== edit.before) throw new Error("STALE_TEXT_EDIT")
    if (countNewlines(edit.after) > countNewlines(edit.before)) throw new Error("NEWLINES_NOT_ALLOWED")
    if (edit.before !== edit.after) normalized.push(edit)
  }

  if (normalized.length === 0) throw new Error("NO_TEXT_EDITS")
  return normalized
}

export function applyTextEdits(html: string, edits: TextEditInput[]) {
  const normalized = validateTextEdits(html, edits)
  const nodes = new Map(extractEditableTextNodes(html).map((node) => [node.textKey, node]))
  const replacements = normalized
    .map((edit) => {
      const node = nodes.get(edit.textKey)!
      return {
        startOffset: node.startOffset,
        endOffset: node.endOffset,
        value: escapeHtmlText(edit.after),
      }
    })
    .sort((left, right) => right.startOffset - left.startOffset)

  let result = html
  for (const replacement of replacements) {
    result =
      result.slice(0, replacement.startOffset) +
      replacement.value +
      result.slice(replacement.endOffset)
  }
  return result
}

export function mergeTextEdits(baseHtml: string, latestHtml: string, edits: TextEditInput[]): TextMergeResult {
  const normalized = validateTextEdits(baseHtml, edits)
  const baseNodes = new Map(extractEditableTextNodes(baseHtml).map((node) => [node.textKey, node]))
  const latestNodes = extractEditableTextNodes(latestHtml)
  const latestByKey = new Map(latestNodes.map((node) => [node.textKey, node]))
  const automaticEdits: TextEditInput[] = []
  const conflicts: TextMergeConflict[] = []

  for (const edit of normalized) {
    const baseNode = baseNodes.get(edit.textKey)!
    let latestNode = latestByKey.get(edit.textKey)
    let ambiguous = false

    if (!latestNode) {
      const candidates = latestNodes.filter(
        (candidate) => candidate.text === baseNode.text && candidate.context === baseNode.context,
      )
      if (candidates.length === 1) latestNode = candidates[0]
      if (candidates.length > 1) ambiguous = true
    }

    if (!latestNode) {
      conflicts.push({
        id: conflictId(edit.textKey),
        textKey: edit.textKey,
        context: baseNode.context,
        base: baseNode.text,
        latest: null,
        yours: edit.after,
        latestTextKey: null,
        reason: ambiguous ? "target_ambiguous" : "target_missing",
      })
      continue
    }

    if (latestNode.text === edit.after) continue
    if (latestNode.text === baseNode.text) {
      automaticEdits.push({
        textKey: latestNode.textKey,
        before: latestNode.text,
        after: edit.after,
      })
      continue
    }

    conflicts.push({
      id: conflictId(edit.textKey),
      textKey: edit.textKey,
      context: baseNode.context,
      base: baseNode.text,
      latest: latestNode.text,
      yours: edit.after,
      latestTextKey: latestNode.textKey,
      reason: "both_modified",
    })
  }

  return { automaticEdits, conflicts }
}

export function toDashboardTextChanges(html: string, edits: TextEditInput[]): DashboardTextChange[] {
  const nodes = new Map(extractEditableTextNodes(html).map((node) => [node.textKey, node]))
  return edits.map((edit) => ({
    textKey: edit.textKey,
    context: nodes.get(edit.textKey)?.context ?? "",
    before: edit.before,
    after: edit.after,
  }))
}

function textContext(node: ParsedNode | undefined) {
  if (!node) return ""
  const text = collectText(node).replace(/\s+/g, " ").trim()
  return text.slice(0, 160)
}

function collectText(node: ParsedNode): string {
  if (node.nodeName === "#text") return node.value ?? ""
  if (node.tagName && excludedElements.has(node.tagName.toLowerCase())) return ""
  return (node.childNodes ?? []).map(collectText).join("")
}

function hashKey(path: string) {
  return createHash("sha256").update(path).digest("hex").slice(0, 20)
}

function conflictId(textKey: string) {
  return `conflict_${textKey}`
}

function countNewlines(value: string) {
  return (value.match(/\r\n|\r|\n/g) ?? []).length
}

function escapeHtmlText(value: string) {
  return value.replace(/[&<>]/g, (character) => {
    if (character === "&") return "&amp;"
    if (character === "<") return "&lt;"
    return "&gt;"
  })
}
