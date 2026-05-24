import { authenticateRequest } from "@/lib/server/auth"
import { canViewProject } from "@/lib/server/access"
import { readDatabase } from "@/lib/server/db"
import { apiError, ok } from "@/lib/server/responses"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ projectId: string; datasetId: string }> }

export async function GET(request: Request, context: RouteContext) {
  const { projectId, datasetId } = await context.params
  const auth = await authenticateRequest(request)
  const database = await readDatabase()
  const project = database.projects.find((candidate) => candidate.id === projectId)
  const dataset = database.datasets.find((candidate) => candidate.id === datasetId && candidate.projectId === projectId)

  if (!project || !dataset) return apiError(404, "NOT_FOUND", "数据集不存在。")
  if (!canViewProject(database, auth?.user ?? null, project)) return apiError(403, "FORBIDDEN", "无权访问数据集版本。")

  return ok({
    data: database.datasetVersions
      .filter((version) => version.datasetId === datasetId)
      .map((version) => ({
        id: version.id,
        dataset_id: version.datasetId,
        project_id: version.projectId,
        file_name: version.fileName,
        file_type: version.fileType,
        size: version.size,
        rows: version.rows,
        columns: version.columns,
        schema: version.schema,
        version: version.version,
        created_by: version.createdBy,
        created_at: version.createdAt,
      })),
  })
}
