import { requireRequestAuth } from "@/lib/server/auth"
import { canEditProject } from "@/lib/server/access"
import { updateDatabase } from "@/lib/server/db"
import { rateLimitResponse } from "@/lib/server/rate-limit"
import { apiError, ok } from "@/lib/server/responses"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ projectId: string; datasetId: string }> }

export async function POST(request: Request, context: RouteContext) {
  const limited = rateLimitResponse(request, "sync-trigger", 60)
  if (limited) return limited

  const { projectId, datasetId } = await context.params
  const auth = await requireRequestAuth(request, "sync:run")
  if (auth instanceof Response) return auth

  const result = await updateDatabase((mutable) => {
    const project = mutable.projects.find((candidate) => candidate.id === projectId)
    const dataset = mutable.datasets.find((candidate) => candidate.id === datasetId && candidate.projectId === projectId)

    if (!project || !dataset) return { status: "not_found" as const }
    if (!canEditProject(mutable, auth.user, project)) return { status: "forbidden" as const }

    return { status: "removed" as const }
  })

  if (result.status === "not_found") return apiError(404, "NOT_FOUND", "数据集不存在。")
  if (result.status === "forbidden") return apiError(403, "FORBIDDEN", "无权触发同步。")
  if (result.status === "removed") {
    return apiError(410, "SYNC_REMOVED", "数据集外部动态更新已移除，请使用项目同步脚本并手动触发。")
  }

  return ok({ status: "removed" }, { status: 410 })
}
