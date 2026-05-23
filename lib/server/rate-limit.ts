import { rateLimitMax, rateLimitWindowMs } from "@/lib/server/config"
import { apiError } from "@/lib/server/responses"

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

export function rateLimitResponse(request: Request, scope: string, limit = rateLimitMax) {
  const now = Date.now()
  const key = `${scope}:${clientKey(request)}`
  const bucket = buckets.get(key)

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + rateLimitWindowMs })
    cleanupBuckets(now)
    return null
  }

  bucket.count += 1
  if (bucket.count <= limit) return null

  const retryAfterSeconds = Math.max(Math.ceil((bucket.resetAt - now) / 1000), 1)
  return apiError(429, "RATE_LIMITED", "请求过于频繁，请稍后重试。", { retry_after_seconds: retryAfterSeconds })
}

function clientKey(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  const authorization = request.headers.get("authorization")?.slice(0, 24)
  return forwardedFor || authorization || request.headers.get("user-agent") || "anonymous"
}

function cleanupBuckets(now: number) {
  if (buckets.size < 1000) return
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}
