import { authenticateRequest } from "@/lib/server/auth"
import { canViewProject } from "@/lib/server/access"
import { readDatabase } from "@/lib/server/db"
import { apiError, ok } from "@/lib/server/responses"
import { serializeDataset } from "@/lib/server/serializers"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const auth = await authenticateRequest(request)
  if (!auth) return apiError(401, "UNAUTHORIZED", "请先登录或提供有效 API Key。")

  const database = await readDatabase()
  const visibleProjects = database.projects.filter((project) => canViewProject(database, auth.user, project))
  const projectById = new Map(visibleProjects.map((project) => [project.id, project]))
  const url = new URL(request.url)
  const source = url.searchParams.get("source")
  const search = url.searchParams.get("search")?.trim().toLowerCase() ?? ""

  const datasets = database.datasets
    .filter((dataset) => dataset.organizationId === auth.user.organizationId && projectById.has(dataset.projectId))
    .filter((dataset) => !source || source === "all" || dataset.syncConfig.sourceType === source)
    .filter((dataset) => !search || dataset.name.toLowerCase().includes(search) || dataset.description.toLowerCase().includes(search))

  return ok({
    data: datasets.map((dataset) => ({
      ...serializeDataset(dataset),
      project: {
        id: dataset.projectId,
        name: projectById.get(dataset.projectId)?.name ?? "Unknown",
      },
    })),
  })
}
