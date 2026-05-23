import { authenticateRequest } from "@/lib/server/auth"
import { canEditProject } from "@/lib/server/access"
import { createEmbedToken, embedUrl } from "@/lib/server/embed"
import { readDatabase } from "@/lib/server/db"
import { apiError, created } from "@/lib/server/responses"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ projectId: string }> }

export async function POST(request: Request, context: RouteContext) {
  const { projectId } = await context.params
  const auth = await authenticateRequest(request)
  if (!auth) return apiError(401, "UNAUTHORIZED", "请先登录或提供有效 API Key。")

  const database = await readDatabase()
  const project = database.projects.find((candidate) => candidate.id === projectId)
  if (!project) return apiError(404, "NOT_FOUND", "项目不存在。")
  if (!canEditProject(database, auth.user, project)) return apiError(403, "FORBIDDEN", "无权创建嵌入链接。")

  const body = await request.json().catch(() => null)
  const expiresInSeconds = Math.min(Math.max(Number(body?.expires_in_seconds ?? 3600), 60), 60 * 60 * 24 * 7)
  const token = createEmbedToken(projectId, expiresInSeconds)
  return created({
    token,
    embed_url: embedUrl(projectId, token),
    expires_in_seconds: expiresInSeconds,
  })
}
