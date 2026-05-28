import { NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/server/auth"
import { canViewProject } from "@/lib/server/access"
import { readDatabase, updateDatabase } from "@/lib/server/db"
import { createEmbedToken, embedCookie, embedTokenFromRequest, verifyEmbedToken } from "@/lib/server/embed"
import { apiError } from "@/lib/server/responses"
import { BundleIncompleteError, injectEmbedFetchPatch, readDashboardHtml } from "@/lib/server/storage"

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

  let html: string
  try {
    html = await readDashboardHtml(project)
  } catch (error) {
    if (error instanceof BundleIncompleteError) {
      return apiError(500, error.code, error.message)
    }
    throw error
  }

  // The HTML is served inside a sandboxed iframe (no allow-same-origin), which
  // gives the document a null/opaque origin.  Relative fetch() calls resolve
  // via <base href> to the same server but are treated as cross-origin requests
  // and therefore carry no session cookies.  We inject a token into the HTML
  // so that the fetch patch can attach it to every same-origin request, letting
  // the asset route authenticate without needing a session cookie.
  const assetToken = createEmbedToken(projectId)
  html = injectEmbedFetchPatch(html, assetToken)

  await updateDatabase((mutable) => {
    const record = mutable.projects.find((candidate) => candidate.id === projectId)
    if (record) record.viewsCount += 1
  })

  const response = new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "sandbox allow-scripts allow-forms allow-popups allow-downloads; default-src 'self' https: data: blob: 'unsafe-inline'; script-src https: data: blob: 'unsafe-inline' 'unsafe-eval'; style-src https: data: blob: 'unsafe-inline'; img-src https: data: blob:; font-src https: data: blob:; connect-src 'self' http: https: data: blob:;",
    },
  })
  if (hasEmbedAccess && embedToken) response.headers.append("Set-Cookie", embedCookie(embedToken))
  return response
}
