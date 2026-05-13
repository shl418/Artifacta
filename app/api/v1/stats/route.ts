import { authenticateRequest } from "@/lib/server/auth"
import { canViewProject } from "@/lib/server/access"
import { readDatabase } from "@/lib/server/db"
import { apiError, ok } from "@/lib/server/responses"
import { serializeProject } from "@/lib/server/serializers"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const auth = await authenticateRequest(request)
  if (!auth) return apiError(401, "UNAUTHORIZED", "请先登录或提供有效 API Key。")

  const database = await readDatabase()
  const projects = database.projects.filter(
    (project) => project.organizationId === auth.user.organizationId && canViewProject(database, auth.user, project)
  )
  const projectIds = new Set(projects.map((project) => project.id))
  const datasets = database.datasets.filter((dataset) => projectIds.has(dataset.projectId))
  const members = database.users.filter((user) => user.organizationId === auth.user.organizationId)
  const views = projects.reduce((total, project) => total + project.viewsCount, 0)

  return ok({
    stats: {
      projects: projects.length,
      datasets: datasets.length,
      members: members.length,
      views,
    },
    recent_projects: projects
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 5)
      .map((project) => serializeProject(database, project)),
    popular_projects: projects
      .slice()
      .sort((a, b) => b.viewsCount - a.viewsCount)
      .slice(0, 5)
      .map((project) => serializeProject(database, project)),
  })
}
