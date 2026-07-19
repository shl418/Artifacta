import type { ProjectVisibility } from "@/lib/types"
import { authenticateRequest, requireRequestAuth } from "@/lib/server/auth"
import { canEditProject, canViewProject } from "@/lib/server/access"
import { now, readDatabase, updateDatabase } from "@/lib/server/db"
import { dispatch } from "@/lib/server/dispatch"
import { apiError, noContent, ok } from "@/lib/server/responses"
import { serializeProjectDetail } from "@/lib/server/serializers"
import { removeProjectArtifacts } from "@/lib/server/storage"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ projectId: string }> }

const visibilityValues = new Set(["private", "team", "public"])

export async function GET(request: Request, context: RouteContext) {
  const { projectId } = await context.params
  const auth = await authenticateRequest(request)
  const database = await readDatabase()
  const project = database.projects.find((candidate) => candidate.id === projectId)

  if (!project) return apiError(404, "NOT_FOUND", "项目不存在。")
  if (!canViewProject(database, auth?.user ?? null, project)) return apiError(403, "FORBIDDEN", "无权访问该项目。")

  return ok({
    ...serializeProjectDetail(database, project),
    capabilities: {
      can_edit: Boolean(auth?.user && canEditProject(database, auth.user, project)),
    },
  })
}

export async function PATCH(request: Request, context: RouteContext) {
  const { projectId } = await context.params
  const auth = await requireRequestAuth(request, "projects:write")
  if (auth instanceof Response) return auth

  const body = await request.json().catch(() => null)
  const database = await readDatabase()
  const project = database.projects.find((candidate) => candidate.id === projectId)

  if (!project) return apiError(404, "NOT_FOUND", "项目不存在。")
  if (!canEditProject(database, auth.user, project)) return apiError(403, "FORBIDDEN", "无权编辑该项目。")

  const updated = await updateDatabase((mutable) => {
    const record = mutable.projects.find((candidate) => candidate.id === projectId)!

    if (typeof body?.name === "string") record.name = body.name.trim() || record.name
    if (typeof body?.description === "string") record.description = body.description.trim()
    if (typeof body?.visibility === "string") {
      if (!visibilityValues.has(body.visibility)) throw new Error("INVALID_VISIBILITY")
      record.visibility = body.visibility as ProjectVisibility
    }

    record.updatedAt = now()
    dispatch(mutable, { type: "project.updated", organizationId: auth.user.organizationId, actorId: auth.user.id, project: { id: record.id, name: record.name }, meta: { visibility: record.visibility } })
    return record
  }).catch((error) => {
    if (error instanceof Error && error.message === "INVALID_VISIBILITY") return null
    throw error
  })

  if (!updated) return apiError(400, "INVALID_REQUEST", "visibility 必须是 private、team 或 public。")

  const refreshed = await readDatabase()
  return ok(serializeProjectDetail(refreshed, updated))
}

export async function DELETE(request: Request, context: RouteContext) {
  const { projectId } = await context.params
  const auth = await requireRequestAuth(request, "projects:write")
  if (auth instanceof Response) return auth

  const database = await readDatabase()
  const project = database.projects.find((candidate) => candidate.id === projectId)

  if (!project) return apiError(404, "NOT_FOUND", "项目不存在。")
  if (!canEditProject(database, auth.user, project)) return apiError(403, "FORBIDDEN", "无权删除该项目。")

  await updateDatabase((mutable) => {
    mutable.projects = mutable.projects.filter((candidate) => candidate.id !== projectId)
    mutable.datasets = mutable.datasets.filter((dataset) => dataset.projectId !== projectId)
    mutable.projectMembers = mutable.projectMembers.filter((member) => member.projectId !== projectId)
    mutable.syncHistory = mutable.syncHistory.filter((history) => history.projectId !== projectId)
    // Cascade to every project-scoped child collection so deletion leaves no orphans.
    mutable.syncJobs = mutable.syncJobs.filter((job) => job.projectId !== projectId)
    mutable.projectSyncScripts = mutable.projectSyncScripts.filter((script) => script.projectId !== projectId)
    mutable.scriptSyncJobs = (mutable.scriptSyncJobs ?? []).filter((job) => job.projectId !== projectId)
    mutable.scriptSyncHistory = (mutable.scriptSyncHistory ?? []).filter((history) => history.projectId !== projectId)
    mutable.dashboardVersions = mutable.dashboardVersions.filter((version) => version.projectId !== projectId)
    mutable.datasetVersions = mutable.datasetVersions.filter((version) => version.projectId !== projectId)
    dispatch(mutable, { type: "project.deleted", organizationId: auth.user.organizationId, actorId: auth.user.id, project: { id: project.id, name: project.name } })
  })

  await removeProjectArtifacts(projectId)
  return noContent()
}
