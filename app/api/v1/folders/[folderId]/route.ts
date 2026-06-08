import { requireRequestAuth } from "@/lib/server/auth"
import { now, readDatabase, updateDatabase } from "@/lib/server/db"
import { apiError, noContent, ok } from "@/lib/server/responses"
import { serializeFolder } from "@/lib/server/serializers"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ folderId: string }> }

export async function PATCH(request: Request, context: RouteContext) {
  const { folderId } = await context.params
  const auth = await requireRequestAuth(request, "projects:write")
  if (auth instanceof Response) return auth

  const body = await request.json().catch(() => null)
  const name = String(body?.name ?? "").trim()
  if (!name) return apiError(400, "INVALID_REQUEST", "文件夹名称不能为空。", { field: "name" })

  const database = await readDatabase()
  const folder = database.folders.find((candidate) => candidate.id === folderId && candidate.organizationId === auth.user.organizationId)
  if (!folder) return apiError(404, "NOT_FOUND", "文件夹不存在。")

  const updated = await updateDatabase((mutable) => {
    const record = mutable.folders.find((candidate) => candidate.id === folderId)!
    record.name = name
    record.updatedAt = now()
    return record
  })

  const refreshed = await readDatabase()
  return ok(serializeFolder(updated, refreshed.projects.filter((project) => project.folderId === folderId).length))
}

export async function DELETE(request: Request, context: RouteContext) {
  const { folderId } = await context.params
  const auth = await requireRequestAuth(request, "projects:write")
  if (auth instanceof Response) return auth

  const url = new URL(request.url)
  const moveTo = url.searchParams.get("move_to")
  const targetFolderId = !moveTo || moveTo === "root" || moveTo === "null" ? null : moveTo
  const database = await readDatabase()
  const folder = database.folders.find((candidate) => candidate.id === folderId && candidate.organizationId === auth.user.organizationId)

  if (!folder) return apiError(404, "NOT_FOUND", "文件夹不存在。")
  if (targetFolderId && !database.folders.some((candidate) => candidate.id === targetFolderId && candidate.organizationId === auth.user.organizationId)) {
    return apiError(404, "NOT_FOUND", "目标文件夹不存在。")
  }

  await updateDatabase((mutable) => {
    mutable.folders = mutable.folders.filter((candidate) => candidate.id !== folderId)
    mutable.projects.forEach((project) => {
      if (project.folderId === folderId) {
        project.folderId = targetFolderId
        project.updatedAt = now()
      }
    })
  })

  return noContent()
}
