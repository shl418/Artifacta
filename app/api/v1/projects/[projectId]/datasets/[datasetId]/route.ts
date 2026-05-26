import { authenticateRequest, requireRequestAuth } from "@/lib/server/auth"
import { canEditProject, canViewProject } from "@/lib/server/access"
import { inspectDataset } from "@/lib/server/datasets"
import { now, readDatabase, updateDatabase } from "@/lib/server/db"
import { dispatch } from "@/lib/server/dispatch"
import { rateLimitResponse } from "@/lib/server/rate-limit"
import { requestPayloadTooLarge } from "@/lib/server/request-size"
import { apiError, noContent, ok } from "@/lib/server/responses"
import { serializeDataset } from "@/lib/server/serializers"
import { removeDatasetArtifacts, replaceDatasetArtifact, sanitizeFileName } from "@/lib/server/storage"
import { recordDatasetVersion } from "@/lib/server/versions"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ projectId: string; datasetId: string }> }

export async function PUT(request: Request, context: RouteContext) {
  const limited = rateLimitResponse(request, "dataset-upload", 60)
  if (limited) return limited

  const tooLarge = requestPayloadTooLarge(request)
  if (tooLarge) return tooLarge

  const { projectId, datasetId } = await context.params
  const auth = await requireRequestAuth(request, "datasets:write")
  if (auth instanceof Response) return auth

  const database = await readDatabase()
  const project = database.projects.find((candidate) => candidate.id === projectId)
  const dataset = database.datasets.find((candidate) => candidate.id === datasetId && candidate.projectId === projectId)

  if (!project || !dataset) return apiError(404, "NOT_FOUND", "数据集不存在。")
  if (!canEditProject(database, auth.user, project)) return apiError(403, "FORBIDDEN", "无权更新该数据集。")

  const form = await request.formData().catch(() => null)
  const file = form?.get("file")
  const datasetFile = file && typeof file === "object" && "arrayBuffer" in file ? (file as File) : null
  if (!datasetFile) return apiError(400, "INVALID_REQUEST", "请上传 file。", { field: "file" })

  const fileName = sanitizeFileName(datasetFile.name)
  const artifact = await replaceDatasetArtifact(dataset.filePath, datasetFile).catch((error) => {
    if (error instanceof Error) return error
    return new Error("数据集保存失败。")
  })
  if (artifact instanceof Error) return apiError(400, "INVALID_DATASET", artifact.message, { field: "file" })
  const inspection = inspectDataset(fileName, artifact.buffer)
  const updated = await updateDatabase((mutable) => {
    const record = mutable.datasets.find((candidate) => candidate.id === datasetId)!
    record.fileName = fileName
    record.fileType = inspection.fileType
    record.size = artifact.size
    record.rows = inspection.rows
    record.columns = inspection.columns
    record.schema = inspection.schema
    record.version += 1
    record.updatedAt = now()
    const projectRecord = mutable.projects.find((candidate) => candidate.id === projectId)
    if (projectRecord) projectRecord.updatedAt = record.updatedAt
    recordDatasetVersion(mutable, record, auth.user.id)
    dispatch(mutable, { type: "dataset.replaced", organizationId: auth.user.organizationId, actorId: auth.user.id, dataset: { id: record.id, name: record.name, projectId, version: record.version } })
    return record
  })

  return ok(serializeDataset(updated))
}

export async function DELETE(request: Request, context: RouteContext) {
  const { projectId, datasetId } = await context.params
  const auth = await requireRequestAuth(request, "datasets:write")
  if (auth instanceof Response) return auth

  const database = await readDatabase()
  const project = database.projects.find((candidate) => candidate.id === projectId)
  const dataset = database.datasets.find((candidate) => candidate.id === datasetId && candidate.projectId === projectId)

  if (!project || !dataset) return apiError(404, "NOT_FOUND", "数据集不存在。")
  if (!canEditProject(database, auth.user, project)) return apiError(403, "FORBIDDEN", "无权删除该数据集。")

  await updateDatabase((mutable) => {
    mutable.datasets = mutable.datasets.filter((candidate) => candidate.id !== datasetId)
    mutable.syncHistory = mutable.syncHistory.filter((history) => history.datasetId !== datasetId)
    const record = mutable.projects.find((candidate) => candidate.id === projectId)
    if (record) record.updatedAt = now()
    dispatch(mutable, { type: "dataset.deleted", organizationId: auth.user.organizationId, actorId: auth.user.id, dataset: { id: datasetId, name: dataset.name, projectId } })
  })

  await removeDatasetArtifacts(projectId, datasetId)
  return noContent()
}

export async function GET(request: Request, context: RouteContext) {
  const { projectId, datasetId } = await context.params
  const auth = await authenticateRequest(request)
  const database = await readDatabase()
  const project = database.projects.find((candidate) => candidate.id === projectId)
  const dataset = database.datasets.find((candidate) => candidate.id === datasetId && candidate.projectId === projectId)

  if (!project || !dataset) return apiError(404, "NOT_FOUND", "数据集不存在。")
  if (!canViewProject(database, auth?.user ?? null, project)) return apiError(403, "FORBIDDEN", "无权访问该数据集。")

  return ok(serializeDataset(dataset))
}
