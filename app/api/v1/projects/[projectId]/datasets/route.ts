import { authenticateRequest } from "@/lib/server/auth"
import { canEditProject, canViewProject } from "@/lib/server/access"
import { recordAudit } from "@/lib/server/audit"
import { buildDatasetRecord } from "@/lib/server/dataset-records"
import { addActivity, readDatabase, updateDatabase } from "@/lib/server/db"
import { rateLimitResponse } from "@/lib/server/rate-limit"
import { apiError, created, ok } from "@/lib/server/responses"
import { serializeDataset } from "@/lib/server/serializers"
import { recordDatasetVersion } from "@/lib/server/versions"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ projectId: string }> }

export async function GET(request: Request, context: RouteContext) {
  const { projectId } = await context.params
  const auth = await authenticateRequest(request)
  const database = await readDatabase()
  const project = database.projects.find((candidate) => candidate.id === projectId)

  if (!project) return apiError(404, "NOT_FOUND", "项目不存在。")
  if (!canViewProject(database, auth?.user ?? null, project)) return apiError(403, "FORBIDDEN", "无权访问该项目。")

  return ok({ data: database.datasets.filter((dataset) => dataset.projectId === projectId).map(serializeDataset) })
}

export async function POST(request: Request, context: RouteContext) {
  const limited = rateLimitResponse(request, "dataset-upload", 60)
  if (limited) return limited

  const { projectId } = await context.params
  const auth = await authenticateRequest(request)
  if (!auth) return apiError(401, "UNAUTHORIZED", "请先登录或提供有效 API Key。")

  const database = await readDatabase()
  const project = database.projects.find((candidate) => candidate.id === projectId)

  if (!project) return apiError(404, "NOT_FOUND", "项目不存在。")
  if (!canEditProject(database, auth.user, project)) return apiError(403, "FORBIDDEN", "无权更新该项目。")

  const form = await request.formData().catch(() => null)
  const file = form?.get("file")
  const datasetFile = file && typeof file === "object" && "arrayBuffer" in file ? (file as File) : null
  if (!datasetFile) return apiError(400, "INVALID_REQUEST", "请上传 file。", { field: "file" })

  const dataset = await buildDatasetRecord({
    projectId,
    organizationId: auth.user.organizationId,
    file: datasetFile,
    name: String(form?.get("name") ?? ""),
  }).catch((error) => {
    if (error instanceof Error) return error
    return new Error("数据集保存失败。")
  })
  if (dataset instanceof Error) return apiError(400, "INVALID_DATASET", dataset.message, { field: "file" })

  await updateDatabase((mutable) => {
    mutable.datasets.push(dataset)
    recordDatasetVersion(mutable, dataset, auth.user.id)
    const record = mutable.projects.find((candidate) => candidate.id === projectId)
    if (record) record.updatedAt = dataset.updatedAt
    addActivity(mutable, {
      organizationId: auth.user.organizationId,
      type: "dataset",
      userId: auth.user.id,
      action: "添加了数据集",
      target: dataset.name,
    })
    recordAudit(mutable, {
      organizationId: auth.user.organizationId,
      actorUserId: auth.user.id,
      action: "dataset.create",
      targetType: "dataset",
      targetId: dataset.id,
      summary: `Added dataset ${dataset.name}`,
      metadata: { project_id: projectId, file_type: dataset.fileType },
    })
  })

  return created(serializeDataset(dataset))
}
