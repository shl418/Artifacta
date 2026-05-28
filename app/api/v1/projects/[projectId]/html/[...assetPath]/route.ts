import { NextResponse } from "next/server"
import { authenticateRequest } from "@/lib/server/auth"
import { canViewProject } from "@/lib/server/access"
import { cacheControlForVisibility } from "@/lib/server/artifacts/cache-control"
import { getProjectById, readDatabase } from "@/lib/server/db"
import { embedTokenFromRequest, verifyEmbedToken } from "@/lib/server/embed"
import { apiError } from "@/lib/server/responses"
import { readDashboardAsset } from "@/lib/server/storage"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ projectId: string; assetPath: string[] }> }

export async function GET(request: Request, context: RouteContext) {
  const { projectId, assetPath } = await context.params
  const hasEmbedAccess = verifyEmbedToken(embedTokenFromRequest(request), projectId)
  const project = await getProjectById(projectId)
  if (!project) return apiError(404, "NOT_FOUND", "项目不存在。")

  if (!hasEmbedAccess) {
    const auth = await authenticateRequest(request)
    const database = await readDatabase()
    if (!canViewProject(database, auth?.user ?? null, project)) return apiError(403, "FORBIDDEN", "无权访问该看板资源。")
  }

  const asset = await readDashboardAsset(project, assetPath)
  if (asset.kind === "missing") return apiError(404, "NOT_FOUND", "看板资源不存在。")
  if (asset.kind === "blocked") {
    const message = asset.reason === "html_sibling"
      ? "Artifacta 仅托管入口 HTML；同包内其他 .html 文件无法直接访问。"
      : "该项目不是 ZIP 看板包，未提供资源路由。"
    return apiError(409, "ASSET_BLOCKED", message, { reason: asset.reason })
  }

  return new NextResponse(new Uint8Array(asset.buffer), {
    headers: {
      "Content-Type": asset.contentType,
      "Cache-Control": cacheControlForVisibility(project.visibility),
      // Required so the sandboxed iframe (null/opaque origin) can read the
      // response.  The iframe has no allow-same-origin, so every fetch from
      // it is cross-origin from the browser's perspective.  Auth is handled
      // by the embed_token query param injected by injectEmbedFetchPatch.
      "Access-Control-Allow-Origin": "*",
    },
  })
}
