import { requireRequestAuth } from "@/lib/server/auth"
import { canEditProject } from "@/lib/server/access"
import { now, readDatabase, updateDatabase } from "@/lib/server/db"
import { dispatch } from "@/lib/server/dispatch"
import { apiError, ok } from "@/lib/server/responses"
import { serializeProjectDetail } from "@/lib/server/serializers"
import { recordDashboardVersion } from "@/lib/server/versions"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ projectId: string; versionId: string }> }

export async function POST(request: Request, context: RouteContext) {
  const { projectId, versionId } = await context.params
  const auth = await requireRequestAuth(request, "projects:write")
  if (auth instanceof Response) return auth

  const database = await readDatabase()
  const project = database.projects.find((candidate) => candidate.id === projectId)
  const version = database.dashboardVersions.find((candidate) => candidate.id === versionId && candidate.projectId === projectId)
  if (!project || !version) return apiError(404, "NOT_FOUND", "项目版本不存在。")
  if (!canEditProject(database, auth.user, project)) return apiError(403, "FORBIDDEN", "无权回滚该项目。")

  const updated = await updateDatabase((mutable) => {
    const record = mutable.projects.find((candidate) => candidate.id === projectId)!
    recordDashboardVersion(mutable, record, auth.user.id, `Rollback point before ${version.id}`)
    record.htmlArtifact = version.htmlArtifact
    record.updatedAt = now()
    dispatch(mutable, { type: "project.rolled.back", organizationId: auth.user.organizationId, actorId: auth.user.id, project: { id: projectId, name: record.name }, meta: { version_id: version.id, version: version.version } })
    return record
  })

  const refreshed = await readDatabase()
  return ok(serializeProjectDetail(refreshed, updated))
}
