import { NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/server/auth"
import { canViewProject } from "@/lib/server/access"
import { readDatabase } from "@/lib/server/db"
import { embedTokenFromRequest, verifyEmbedToken } from "@/lib/server/embed"
import { apiError } from "@/lib/server/responses"
import { readDashboardAsset } from "@/lib/server/storage"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ projectId: string; assetPath: string[] }> }

export async function GET(request: Request, context: RouteContext) {
  const { projectId, assetPath } = await context.params
  const auth = await authenticateRequest(request)
  const database = await readDatabase()
  const project = database.projects.find((candidate) => candidate.id === projectId)
  const hasEmbedAccess = verifyEmbedToken(embedTokenFromRequest(request), projectId)

  if (!project) return apiError(404, "NOT_FOUND", "项目不存在。")
  if (!hasEmbedAccess && !canViewProject(database, auth?.user ?? null, project)) return apiError(403, "FORBIDDEN", "无权访问该看板资源。")

  const asset = await readDashboardAsset(project, assetPath)
  if (!asset) return apiError(404, "NOT_FOUND", "看板资源不存在。")

  return new NextResponse(new Uint8Array(asset.buffer), {
    headers: {
      "Content-Type": asset.contentType,
      "Cache-Control": "public, max-age=300",
    },
  })
}
