import { NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/server/auth"
import { canViewProject } from "@/lib/server/access"
import { readDatabase, updateDatabase } from "@/lib/server/db"
import { embedCookie, embedTokenFromRequest, verifyEmbedToken } from "@/lib/server/embed"
import { apiError } from "@/lib/server/responses"
import { readDashboardHtml } from "@/lib/server/storage"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ projectId: string }> }

export async function GET(request: Request, context: RouteContext) {
  const { projectId } = await context.params
  const auth = await authenticateRequest(request)
  const database = await readDatabase()
  const project = database.projects.find((candidate) => candidate.id === projectId)
  const embedToken = embedTokenFromRequest(request)
  const hasEmbedAccess = verifyEmbedToken(embedToken, projectId)

  if (!project) return apiError(404, "NOT_FOUND", "项目不存在。")
  if (!hasEmbedAccess && !canViewProject(database, auth?.user ?? null, project)) return apiError(403, "FORBIDDEN", "无权访问该看板。")

  const html = await readDashboardHtml(project)

  await updateDatabase((mutable) => {
    const record = mutable.projects.find((candidate) => candidate.id === projectId)
    if (record) record.viewsCount += 1
  })

  const response = new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "sandbox allow-scripts allow-forms allow-popups allow-downloads; default-src 'self' https: data: blob: 'unsafe-inline'; script-src https: data: blob: 'unsafe-inline' 'unsafe-eval'; style-src https: data: blob: 'unsafe-inline'; img-src https: data: blob:; font-src https: data: blob:; connect-src https: data: blob:;",
    },
  })
  if (hasEmbedAccess && embedToken) response.headers.append("Set-Cookie", embedCookie(embedToken))
  return response
}
