import { requireRequestAuth } from "@/lib/server/auth"
import { canEditProject } from "@/lib/server/access"
import { readDatabase } from "@/lib/server/db"
import { apiError, ok } from "@/lib/server/responses"
import { serializeProjectDetail } from "@/lib/server/serializers"
import {
  applyTextEdits,
  mergeTextEdits,
  toDashboardTextChanges,
  type TextEditInput,
} from "@/lib/server/artifacts/text-editor"
import {
  commitProjectTextRevision,
  findProjectRevision,
} from "@/lib/server/artifacts/text-edit-operations"
import { readDashboardArtifactSource } from "@/lib/server/storage"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ projectId: string }> }
type Resolution = {
  conflictId: string
  choice: "latest" | "yours" | "manual"
  value?: string
}

export async function POST(request: Request, context: RouteContext) {
  const { projectId } = await context.params
  const auth = await requireRequestAuth(request, "projects:write")
  if (auth instanceof Response) return auth

  const body = await request.json().catch(() => null)
  const baseRevisionId = typeof body?.base_revision_id === "string" ? body.base_revision_id : ""
  const latestRevisionId = typeof body?.latest_revision_id === "string" ? body.latest_revision_id : ""
  const edits = parseEdits(body?.edits)
  const resolutions = parseResolutions(body?.resolutions)
  const notes = typeof body?.notes === "string" ? body.notes.trim().slice(0, 500) : ""
  if (!baseRevisionId || !latestRevisionId || !edits || !resolutions) {
    return apiError(400, "INVALID_REQUEST", "合并请求字段不完整。")
  }

  const database = await readDatabase()
  const project = database.projects.find((candidate) => candidate.id === projectId)
  if (!project) return apiError(404, "NOT_FOUND", "项目不存在。")
  if (!canEditProject(database, auth.user, project)) {
    return apiError(403, "FORBIDDEN", "无权编辑该项目。")
  }
  if (project.htmlArtifact.revisionId !== latestRevisionId) {
    return apiError(409, "MERGE_REQUIRED", "合并期间项目再次发生变化，请重新计算合并。", {
      latest_revision_id: project.htmlArtifact.revisionId ?? null,
      retry_merge: true,
    })
  }

  const baseArtifact = findProjectRevision(database, projectId, baseRevisionId)
  if (!baseArtifact) {
    return apiError(409, "BASE_REVISION_MISSING", "基础版本已经不可用，请刷新后重新编辑。")
  }

  const baseHtml = await readDashboardArtifactSource(baseArtifact)
  const latestHtml = await readDashboardArtifactSource(project.htmlArtifact)
  let merge
  try {
    merge = mergeTextEdits(baseHtml, latestHtml, edits)
  } catch (error) {
    return textEditError(error)
  }

  const resolutionById = new Map(resolutions.map((resolution) => [resolution.conflictId, resolution]))
  const finalEdits = [...merge.automaticEdits]
  for (const conflict of merge.conflicts) {
    const resolution = resolutionById.get(conflict.id)
    if (!resolution) {
      return apiError(400, "UNRESOLVED_CONFLICT", "所有冲突都必须处理后才能发布。", {
        conflict_id: conflict.id,
      })
    }
    if (resolution.choice === "latest") continue
    if (!conflict.latestTextKey || conflict.latest === null) {
      return apiError(400, "TARGET_MISSING", "该文字在最新版中已不存在，只能采用最新版。", {
        conflict_id: conflict.id,
      })
    }
    const after = resolution.choice === "manual" ? resolution.value : conflict.yours
    if (typeof after !== "string") {
      return apiError(400, "INVALID_RESOLUTION", "手工合并内容不能为空。", {
        conflict_id: conflict.id,
      })
    }
    finalEdits.push({
      textKey: conflict.latestTextKey,
      before: conflict.latest,
      after,
    })
  }

  if (finalEdits.length === 0) {
    return ok({
      project: serializeProjectDetail(database, project),
      no_changes: true,
      revision_id: latestRevisionId,
    })
  }

  let html: string
  let changes
  try {
    html = applyTextEdits(latestHtml, finalEdits)
    changes = toDashboardTextChanges(latestHtml, finalEdits)
  } catch (error) {
    return textEditError(error)
  }

  const committed = await commitProjectTextRevision({
    project,
    expectedRevisionId: latestRevisionId,
    html,
    changes,
    userId: auth.user.id,
    notes: notes || `合并并在线编辑 ${changes.length} 处文字`,
    operation: "merge",
  })

  if (!committed) {
    const refreshed = await readDatabase()
    const latest = refreshed.projects.find((candidate) => candidate.id === projectId)
    return apiError(409, "MERGE_REQUIRED", "合并期间项目再次发生变化，请重新计算合并。", {
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
      text_changes: (committed.version.textChanges ?? []).map((change) => ({
        text_key: change.textKey,
        context: change.context,
        before: change.before,
        after: change.after,
      })),
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

function parseResolutions(value: unknown): Resolution[] | null {
  if (!Array.isArray(value)) return null
  const result: Resolution[] = []
  for (const item of value) {
    if (
      typeof item?.conflict_id !== "string" ||
      !["latest", "yours", "manual"].includes(item?.choice)
    ) {
      return null
    }
    result.push({
      conflictId: item.conflict_id,
      choice: item.choice,
      value: typeof item.value === "string" ? item.value : undefined,
    })
  }
  return result
}

function textEditError(error: unknown) {
  const code = error instanceof Error ? error.message : "INVALID_TEXT_EDIT"
  return apiError(400, code, code === "NEWLINES_NOT_ALLOWED" ? "V1 不支持新增换行。" : "文字合并请求无效。")
}
