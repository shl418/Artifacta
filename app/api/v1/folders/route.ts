import type { Folder } from "@/lib/types"
import { authenticateRequest } from "@/lib/server/auth"
import { addActivity, now, readDatabase, updateDatabase } from "@/lib/server/db"
import { apiError, created, ok } from "@/lib/server/responses"
import { serializeFolder } from "@/lib/server/serializers"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const auth = await authenticateRequest(request)
  if (!auth) return apiError(401, "UNAUTHORIZED", "请先登录或提供有效 API Key。")

  const database = await readDatabase()
  const folders = database.folders.filter((folder) => folder.organizationId === auth.user.organizationId)

  return ok({
    data: folders.map((folder) =>
      serializeFolder(folder, database.projects.filter((project) => project.folderId === folder.id).length)
    ),
  })
}

export async function POST(request: Request) {
  const auth = await authenticateRequest(request)
  if (!auth) return apiError(401, "UNAUTHORIZED", "请先登录或提供有效 API Key。")

  const body = await request.json().catch(() => null)
  const name = String(body?.name ?? "").trim()
  if (!name) return apiError(400, "INVALID_REQUEST", "文件夹名称不能为空。", { field: "name" })

  const folder = await updateDatabase<Folder>((database) => {
    const createdAt = now()
    const record: Folder = {
      id: `folder_${crypto.randomUUID()}`,
      organizationId: auth.user.organizationId,
      name,
      createdBy: auth.user.id,
      createdAt,
      updatedAt: createdAt,
    }
    database.folders.push(record)
    addActivity(database, {
      organizationId: auth.user.organizationId,
      type: "dashboard",
      userId: auth.user.id,
      action: "创建了文件夹",
      target: name,
    })
    return record
  })

  return created(serializeFolder(folder, 0))
}
