import type { ProjectVisibility } from "@/lib/types"

const MAX_AGE_SECONDS = 300

export function cacheControlForVisibility(visibility: ProjectVisibility) {
  // Only genuinely public dashboards are cacheable. Private/team content (which
  // may be reached via a short-lived embed token) must not linger in browser or
  // shared caches after access is revoked or the token expires.
  if (visibility === "public") return `public, max-age=${MAX_AGE_SECONDS}`
  return "private, no-store"
}
