import type { ProjectVisibility } from "@/lib/types"

const MAX_AGE_SECONDS = 300

export function cacheControlForVisibility(visibility: ProjectVisibility) {
  const scope = visibility === "public" ? "public" : "private"
  return `${scope}, max-age=${MAX_AGE_SECONDS}`
}
