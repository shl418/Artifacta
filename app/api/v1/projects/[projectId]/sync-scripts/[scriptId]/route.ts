import { canEditProject, canViewProject } from "@/lib/server/access"
import { authenticateRequest, requireRequestAuth } from "@/lib/server/auth"
import { readDatabase, updateDatabase } from "@/lib/server/db"
import { apiError, ok } from "@/lib/server/responses"
import { serializeProjectSyncScript } from "@/lib/server/serializers"
import { findProjectSyncScript, updateProjectSyncScript } from "@/lib/server/sync/sync-scripts"
import { relativizeBundlePath } from "@/lib/server/artifacts/upload-session"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ projectId: string; scriptId: string }> }

export async function GET(request: Request, context: RouteContext) {
  const { projectId, scriptId } = await context.params
  const auth = await authenticateRequest(request)
  const database = await readDatabase()
  const project = database.projects.find((candidate) => candidate.id === projectId)
  const script = findProjectSyncScript(database, projectId, scriptId)

  if (!project || !script) return apiError(404, "NOT_FOUND", "同步脚本不存在。")
  if (!canViewProject(database, auth?.user ?? null, project)) return apiError(403, "FORBIDDEN", "无权访问同步脚本。")

  const includeSecrets = auth ? canEditProject(database, auth.user, project) : false
  return ok(serializeProjectSyncScript(script, includeSecrets))
}

export async function PUT(request: Request, context: RouteContext) {
  const { projectId, scriptId } = await context.params
  const auth = await requireRequestAuth(request, "sync:run")
  if (auth instanceof Response) return auth

  const body = await request.json().catch(() => null)
  const database = await readDatabase()
  const project = database.projects.find((candidate) => candidate.id === projectId)
  const script = findProjectSyncScript(database, projectId, scriptId)

  if (!project || !script) return apiError(404, "NOT_FOUND", "同步脚本不存在。")
  if (!canEditProject(database, auth.user, project)) return apiError(403, "FORBIDDEN", "无权修改同步脚本。")

  const outputs = Array.isArray(body?.outputs) ? body.outputs.map(String) : undefined
  if (outputs) {
    const assetRoot = project.htmlArtifact.assetRoot
    if (!assetRoot) return apiError(400, "INVALID_REQUEST", "项目没有 bundle 根目录。")

    const bundlePaths = new Set(
      database.datasets
        .filter((dataset) => dataset.projectId === projectId && dataset.origin === "bundle")
        .map((dataset) => relativizeBundlePath(dataset.filePath, assetRoot))
    )

    for (const outputPath of outputs) {
      if (!bundlePaths.has(outputPath)) {
        return apiError(400, "INVALID_REQUEST", `outputs 包含未知路径：${outputPath}`, { field: "outputs" })
      }
    }
  }

  const updated = await updateDatabase((mutable) => {
    const record = findProjectSyncScript(mutable, projectId, scriptId)
    if (!record) throw new Error("SCRIPT_NOT_FOUND")
    const patch: Parameters<typeof updateProjectSyncScript>[2] = {}
    if (body && "enabled" in body) patch.enabled = Boolean(body.enabled)
    if (outputs) patch.outputs = outputs
    const sourceConfig = (body?.source_config ?? body?.sourceConfig) as Record<string, unknown> | undefined
    if (sourceConfig) patch.sourceConfig = sourceConfig
    return updateProjectSyncScript(mutable, record, patch)
  }).catch((error) => {
    if (error instanceof Error && error.message === "SCRIPT_NOT_FOUND") return null
    throw error
  })

  if (!updated) return apiError(404, "NOT_FOUND", "同步脚本不存在。")
  return ok(serializeProjectSyncScript(updated, true))
}
