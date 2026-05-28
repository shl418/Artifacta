import { authenticateRequest } from "@/lib/server/auth"
import { apiError, ok } from "@/lib/server/responses"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const auth = await authenticateRequest(request)
  if (!auth) return apiError(401, "UNAUTHORIZED", "请先登录或提供有效 API Key。")
  void auth
  return ok({ job: null })
}
