import { authenticateRequest } from "@/lib/server/auth"
import { canEditProject, canViewProject } from "@/lib/server/access"
import { inspectDataset } from "@/lib/server/datasets"
import { addActivity, now, readDatabase, updateDatabase } from "@/lib/server/db"
import { apiError, noContent, ok } from "@/lib/server/responses"
import { serializeDataset } from "@/lib/server/serializers"
import { removeDatasetArtifacts, replaceDatasetArtifact, sanitizeFileName } from "@/lib/server/storage"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ projectId: string; datasetId: string }> }

export async function PUT(request: Request, context: RouteContext) {
  const { projectId, datasetId } = await context.params
  const auth = await authenticateRequest(request)
  if (!auth) return apiError(401, "UNAUTHORIZED", "请先登录或提供有效 API Key。")

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
  const artifact = await replaceDatasetArtifact(dataset.filePath, datasetFile)
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
    addActivity(mutable, {
      organizationId: auth.user.organizationId,
      type: "dataset",
      userId: auth.user.id,
      action: "更新了数据集",
      target: record.name,
    })
    return record
  })

  return ok(serializeDataset(updated))
}

export async function DELETE(request: Request, context: RouteContext) {
  const { projectId, datasetId } = await context.params
  const auth = await authenticateRequest(request)
  if (!auth) return apiError(401, "UNAUTHORIZED", "请先登录或提供有效 API Key。")

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
