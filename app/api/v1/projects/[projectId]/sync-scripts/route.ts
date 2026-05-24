import { authenticateRequest } from "@/lib/server/auth"
import { canViewProject } from "@/lib/server/access"
import { readDatabase } from "@/lib/server/db"
import { apiError, ok } from "@/lib/server/responses"
import { listProjectSyncScripts } from "@/lib/server/sync/sync-scripts"
import { serializeProjectSyncScript } from "@/lib/server/serializers"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ projectId: string }> }

export async function GET(request: Request, context: RouteContext) {
  const { projectId } = await context.params
  const auth = await authenticateRequest(request)
  const database = await readDatabase()
  const project = database.projects.find((candidate) => candidate.id === projectId)

  if (!project) return apiError(404, "NOT_FOUND", "项目不存在。")
  if (!canViewProject(database, auth?.user ?? null, project)) return apiError(403, "FORBIDDEN", "无权访问同步脚本。")

  const scripts = listProjectSyncScripts(database, projectId).map(serializeProjectSyncScript)
  return ok({ data: scripts })
}
