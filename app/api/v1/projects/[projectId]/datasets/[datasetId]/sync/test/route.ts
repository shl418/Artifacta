import { canEditProject } from "@/lib/server/access"
import { requireRequestAuth } from "@/lib/server/auth"
import { readDatabase } from "@/lib/server/db"
import { apiError, ok } from "@/lib/server/responses"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ projectId: string; datasetId: string }> }

export async function POST(request: Request, context: RouteContext) {
  const { projectId, datasetId } = await context.params
  const auth = await requireRequestAuth(request, "sync:run")
  if (auth instanceof Response) return auth

  const database = await readDatabase()
  const project = database.projects.find((candidate) => candidate.id === projectId)
  const dataset = database.datasets.find((candidate) => candidate.id === datasetId && candidate.projectId === projectId)

  if (!project || !dataset) return apiError(404, "NOT_FOUND", "数据集不存在。")
  if (!canEditProject(database, auth.user, project)) return apiError(403, "FORBIDDEN", "无权测试该数据集的同步来源。")

  void dataset
  return ok({
    ok: false,
    message: "数据集外部动态来源已移除，请在项目同步脚本中配置并手动触发更新。",
  })
}
