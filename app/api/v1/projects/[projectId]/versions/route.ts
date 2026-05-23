import { authenticateRequest } from "@/lib/server/auth"
import { canViewProject } from "@/lib/server/access"
import { readDatabase } from "@/lib/server/db"
import { apiError, ok } from "@/lib/server/responses"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ projectId: string }> }

export async function GET(request: Request, context: RouteContext) {
  const { projectId } = await context.params
  const auth = await authenticateRequest(request)
  const database = await readDatabase()
  const project = database.projects.find((candidate) => candidate.id === projectId)

  if (!project) return apiError(404, "NOT_FOUND", "项目不存在。")
  if (!canViewProject(database, auth?.user ?? null, project)) return apiError(403, "FORBIDDEN", "无权访问项目版本。")

  return ok({
    data: database.dashboardVersions
      .filter((version) => version.projectId === projectId)
      .map((version) => ({
        id: version.id,
        project_id: version.projectId,
        version: version.version,
        artifact: {
          kind: version.htmlArtifact.kind,
          original_name: version.htmlArtifact.originalName,
          size: version.htmlArtifact.size,
          content_type: version.htmlArtifact.contentType,
          entry_path: version.htmlArtifact.entryPath ?? null,
        },
        created_by: version.createdBy,
        created_at: version.createdAt,
        notes: version.notes,
      })),
  })
}
