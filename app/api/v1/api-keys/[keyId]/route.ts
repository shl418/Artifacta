import { requireSessionAuth } from "@/lib/server/auth"
import { updateDatabase, readDatabase } from "@/lib/server/db"
import { apiError, noContent } from "@/lib/server/responses"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ keyId: string }> }

export async function DELETE(request: Request, context: RouteContext) {
  const { keyId } = await context.params
  const auth = await requireSessionAuth(request)
  if (auth instanceof Response) return auth

  const database = await readDatabase()
  const apiKey = database.apiKeys.find(
    (candidate) => candidate.id === keyId && candidate.organizationId === auth.user.organizationId && candidate.userId === auth.user.id
  )
  if (!apiKey) return apiError(404, "NOT_FOUND", "API Key 不存在。")

  await updateDatabase((mutable) => {
    mutable.apiKeys = mutable.apiKeys.filter((candidate) => candidate.id !== keyId)
  })

  return noContent()
}
