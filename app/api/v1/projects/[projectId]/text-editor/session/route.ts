import { requireRequestAuth } from "@/lib/server/auth"
import { canEditProject } from "@/lib/server/access"
import { readDatabase } from "@/lib/server/db"
import { ensureProjectArtifactRevision } from "@/lib/server/artifacts/revisions"
import { apiError, ok } from "@/lib/server/responses"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ projectId: string }> }

export async function POST(request: Request, context: RouteContext) {
  const { projectId } = await context.params
  const auth = await requireRequestAuth(request, "projects:write")
  if (auth instanceof Response) return auth

  const database = await readDatabase()
  const project = database.projects.find((candidate) => candidate.id === projectId)
  if (!project) return apiError(404, "NOT_FOUND", "项目不存在。")
  if (!canEditProject(database, auth.user, project)) {
    return apiError(403, "FORBIDDEN", "无权编辑该项目。")
  }

  const prepared = await ensureProjectArtifactRevision(projectId)
  const revisionId = prepared?.htmlArtifact.revisionId
  if (!prepared || !revisionId) {
    return apiError(500, "REVISION_PREPARE_FAILED", "无法准备可编辑的看板版本。")
  }

  return ok({
    project_id: projectId,
    base_revision_id: revisionId,
    edit_url: `/api/v1/projects/${projectId}/html/render?editor=1&revision_id=${encodeURIComponent(revisionId)}`,
    draft_key: `artifacta:text-draft:${projectId}:${revisionId}`,
  })
}
