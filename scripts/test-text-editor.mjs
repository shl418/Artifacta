#!/usr/bin/env node
import assert from "node:assert/strict"
import { readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import ts from "typescript"

const repoRoot = process.cwd()
const outputPath = path.join(repoRoot, ".text-editor-test.mjs")

try {
  const sourcePath = path.join(repoRoot, "lib/server/artifacts/text-editor.ts")
  const source = await readFile(sourcePath, "utf8")
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  })
  await writeFile(outputPath, compiled.outputText, "utf8")
  const editor = await import(`${new URL(`file://${outputPath}`).href}?t=${Date.now()}`)

  const base = `<!doctype html><html><head><style>.x{color:red}</style></head><body>
    <h1>季度 &amp; 销售概览</h1>
    <p>保持不变</p>
    <button>立即查看</button>
    <svg><text>图表文字</text></svg>
    <script>window.label = "脚本文字"</script>
  </body></html>`

  const nodes = editor.extractEditableTextNodes(base)
  assert.deepEqual(nodes.map((node) => node.text.trim()), ["季度 & 销售概览", "保持不变", "立即查看"])

  const title = nodes[0]
  const changed = editor.applyTextEdits(base, [{
    textKey: title.textKey,
    before: title.text,
    after: "Q3 <销售>概览",
  }])
  assert.match(changed, /Q3 &lt;销售&gt;概览/)
  assert.doesNotMatch(changed, /Q3 <销售>/)
  assert.match(changed, /保持不变/, "Editing one occurrence should preserve other text nodes.")

  const deleted = editor.applyTextEdits(base, [{
    textKey: title.textKey,
    before: title.text,
    after: "",
  }])
  assert.match(deleted, /<h1><\/h1>/, "Clearing text should preserve its surrounding HTML element.")

  const instrumented = editor.instrumentEditableHtml(base)
  assert.match(instrumented.html, new RegExp(`artifacta-text-start:${title.textKey}`))
  assert.match(instrumented.html, new RegExp(`artifacta-text-end:${title.textKey}`))

  const latestDifferentNode = base.replace("保持不变", "服务器更新了这里")
  const cleanMerge = editor.mergeTextEdits(base, latestDifferentNode, [{
    textKey: title.textKey,
    before: title.text,
    after: "我的新标题",
  }])
  assert.equal(cleanMerge.conflicts.length, 0)
  assert.equal(cleanMerge.automaticEdits.length, 1)

  const latestSameNode = base.replace("季度 &amp; 销售概览", "服务器的新标题")
  const conflictMerge = editor.mergeTextEdits(base, latestSameNode, [{
    textKey: title.textKey,
    before: title.text,
    after: "我的新标题",
  }])
  assert.equal(conflictMerge.automaticEdits.length, 0)
  assert.equal(conflictMerge.conflicts.length, 1)
  assert.equal(conflictMerge.conflicts[0].reason, "both_modified")
  assert.equal(conflictMerge.conflicts[0].latest, "服务器的新标题")

  assert.throws(
    () => editor.applyTextEdits(base, [{
      textKey: title.textKey,
      before: title.text,
      after: "第一行\n第二行",
    }]),
    /NEWLINES_NOT_ALLOWED/,
  )

  console.log("Text editor parsing and merge tests passed.")
} finally {
  await rm(outputPath, { force: true })
}
