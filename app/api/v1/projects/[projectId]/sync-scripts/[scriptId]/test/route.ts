import { canEditProject } from "@/lib/server/access"
import { requireRequestAuth } from "@/lib/server/auth"
import { readDatabase } from "@/lib/server/db"
import { apiError, ok } from "@/lib/server/responses"
import { findProjectSyncScript } from "@/lib/server/sync/sync-scripts"
import { probeScriptSync } from "@/lib/server/sync/script-runner"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ projectId: string; scriptId: string }> }

export async function POST(request: Request, context: RouteContext) {
  const { projectId, scriptId } = await context.params
  const auth = await requireRequestAuth(request, "sync:run")
  if (auth instanceof Response) return auth

  const database = await readDatabase()
  const project = database.projects.find((candidate) => candidate.id === projectId)
  const script = findProjectSyncScript(database, projectId, scriptId)

  if (!project || !script) return apiError(404, "NOT_FOUND", "同步脚本不存在。")
  if (!canEditProject(database, auth.user, project)) return apiError(403, "FORBIDDEN", "无权测试同步脚本。")

  const assetRoot = project.htmlArtifact.assetRoot
  if (!assetRoot) return apiError(400, "INVALID_REQUEST", "项目没有 bundle 根目录。")

  try {
    const result = await probeScriptSync(script, assetRoot)
    return ok(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : "脚本路径校验失败。"
    return apiError(400, "INVALID_REQUEST", message)
  }
}
