import { maxRequestBytes } from "@/lib/server/config"
import { apiError } from "@/lib/server/responses"

export function requestPayloadTooLarge(request: Request) {
  const header = request.headers.get("content-length")
  if (!header) return null

  const bytes = Number(header)
  if (!Number.isFinite(bytes) || bytes <= maxRequestBytes) return null

  return apiError(413, "PAYLOAD_TOO_LARGE", `请求体超过 ${formatLimit(maxRequestBytes)} 限制。请减小上传文件，或在部署配置中调整 ARTIFACTA_MAX_REQUEST_BYTES。`, {
    max_bytes: maxRequestBytes,
    received_bytes: bytes,
  })
}

function formatLimit(bytes: number) {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / 1024 / 1024)} MB`
  return `${Math.round(bytes / 1024)} KB`
}
