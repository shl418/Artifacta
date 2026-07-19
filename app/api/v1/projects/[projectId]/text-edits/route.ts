import { requireRequestAuth } from "@/lib/server/auth"
import { canEditProject } from "@/lib/server/access"
import { readDatabase } from "@/lib/server/db"
import { rateLimitResponse } from "@/lib/server/rate-limit"
import { requestPayloadTooLarge } from "@/lib/server/request-size"
import { apiError, ok } from "@/lib/server/responses"
import { serializeProjectDetail } from "@/lib/server/serializers"
import {
  applyTextEdits,
  mergeTextEdits,
  toDashboardTextChanges,
  type TextEditInput,
  type TextMergeConflict,
} from "@/lib/server/artifacts/text-editor"
import {
  commitProjectTextRevision,
  findProjectRevision,
} from "@/lib/server/artifacts/text-edit-operations"
import { readDashboardArtifactSource } from "@/lib/server/storage"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ projectId: string }> }

export async function PUT(request: Request, context: RouteContext) {
  const limited = rateLimitResponse(request, "text-edits", 60)
  if (limited) return limited
  const tooLarge = requestPayloadTooLarge(request)
  if (tooLarge) return tooLarge

  const { projectId } = await context.params
  const auth = await requireRequestAuth(request, "projects:write")
  if (auth instanceof Response) return auth

  const body = await request.json().catch(() => null)
  const baseRevisionId = typeof body?.base_revision_id === "string" ? body.base_revision_id : ""
  const edits = parseEdits(body?.edits)
  const notes = typeof body?.notes === "string" ? body.notes.trim().slice(0, 500) : ""
  if (!baseRevisionId || !edits) {
    return apiError(400, "INVALID_REQUEST", "base_revision_id 和 edits 为必填字段。")
  }

  const database = await readDatabase()
  const project = database.projects.find((candidate) => candidate.id === projectId)
  if (!project) return apiError(404, "NOT_FOUND", "项目不存在。")
  if (!canEditProject(database, auth.user, project)) {
    return apiError(403, "FORBIDDEN", "无权编辑该项目。")
  }

  const baseArtifact = findProjectRevision(database, projectId, baseRevisionId)
  if (!baseArtifact) {
    return apiError(409, "BASE_REVISION_MISSING", "基础版本已经不可用，请刷新后重新编辑。")
  }
  const latestRevisionId = project.htmlArtifact.revisionId
  if (!latestRevisionId) {
    return apiError(409, "REVISION_CHANGED", "项目版本已经变化，请刷新后重新编辑。")
  }

  const baseHtml = await readDashboardArtifactSource(baseArtifact)
  if (latestRevisionId !== baseRevisionId) {
    const latestHtml = await readDashboardArtifactSource(project.htmlArtifact)
    try {
      const merge = mergeTextEdits(baseHtml, latestHtml, edits)
      return mergeRequired(baseRevisionId, latestRevisionId, merge.automaticEdits, merge.conflicts)
    } catch (error) {
      return textEditError(error)
    }
  }

  let html: string
  let changes
  try {
    html = applyTextEdits(baseHtml, edits)
    changes = toDashboardTextChanges(baseHtml, edits)
  } catch (error) {
    return textEditError(error)
  }

  const committed = await commitProjectTextRevision({
    project,
    expectedRevisionId: baseRevisionId,
    html,
    changes,
    userId: auth.user.id,
    notes: notes || `在线编辑 ${changes.length} 处文字`,
    operation: "text_edit",
  })

  if (!committed) {
    const refreshed = await readDatabase()
    const latest = refreshed.projects.find((candidate) => candidate.id === projectId)
    return apiError(409, "MERGE_REQUIRED", "其他人已经发布了新版本，请合并后再提交。", {
      base_revision_id: baseRevisionId,
      latest_revision_id: latest?.htmlArtifact.revisionId ?? null,
      retry_merge: true,
    })
  }

  const refreshed = await readDatabase()
  return ok({
    project: serializeProjectDetail(refreshed, committed.project),
    version: {
      id: committed.version.id,
      version: committed.version.version,
      revision_id: committed.project.htmlArtifact.revisionId,
      operation: committed.version.operation,
      notes: committed.version.notes,
      text_changes: serializeChanges(committed.version.textChanges ?? []),
      created_at: committed.version.createdAt,
    },
  })
}

function parseEdits(value: unknown): TextEditInput[] | null {
  if (!Array.isArray(value)) return null
  return value.map((item) => ({
    textKey: typeof item?.text_key === "string" ? item.text_key : "",
    before: typeof item?.before === "string" ? item.before : "",
    after: typeof item?.after === "string" ? item.after : "",
  }))
}

function mergeRequired(
  baseRevisionId: string,
  latestRevisionId: string,
  automaticEdits: TextEditInput[],
  conflicts: TextMergeConflict[],
) {
  return apiError(409, "MERGE_REQUIRED", "其他人已经编辑过该页面，请确认合并结果。", {
    base_revision_id: baseRevisionId,
    latest_revision_id: latestRevisionId,
    automatic_changes: automaticEdits.map((edit) => ({
      text_key: edit.textKey,
      before: edit.before,
      after: edit.after,
    })),
    conflicts: conflicts.map((conflict) => ({
      id: conflict.id,
      text_key: conflict.textKey,
      latest_text_key: conflict.latestTextKey,
      context: conflict.context,
      base: conflict.base,
      latest: conflict.latest,
      yours: conflict.yours,
      reason: conflict.reason,
    })),
  })
}

function serializeChanges(changes: Array<{ textKey: string; context: string; before: string; after: string }>) {
  return changes.map((change) => ({
    text_key: change.textKey,
    context: change.context,
    before: change.before,
    after: change.after,
  }))
}

function textEditError(error: unknown) {
  const code = error instanceof Error ? error.message : "INVALID_TEXT_EDIT"
  const messages: Record<string, string> = {
    NO_TEXT_EDITS: "没有需要保存的文字修改。",
    TOO_MANY_TEXT_EDITS: "一次最多修改 500 处文字。",
    TEXT_EDIT_TOO_LONG: "单处文字长度不能超过 10000 个字符。",
    NEWLINES_NOT_ALLOWED: "V1 不支持新增换行。",
    STALE_TEXT_EDIT: "文字定位已经失效，请刷新后重新编辑。",
  }
  return apiError(400, code, messages[code] ?? "文字修改请求无效。")
}
