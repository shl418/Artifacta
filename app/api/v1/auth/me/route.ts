import { authenticateRequest } from "@/lib/server/auth"
import { apiError, ok } from "@/lib/server/responses"
import { serializeUser } from "@/lib/server/serializers"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const auth = await authenticateRequest(request)

  if (!auth) {
    return apiError(401, "UNAUTHORIZED", "请先登录或提供有效 API Key。")
  }

  return ok({ ...serializeUser(auth.user), auth_type: auth.authType })
}
