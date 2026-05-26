import type { Project } from "@/lib/types"
import { isBlockedHostedExtension } from "@/lib/server/artifacts/mime"
import { normalizeBundleEntry } from "@/lib/server/artifacts/zip-security"

export type AssetBlockedReason = "html_sibling" | "not_zip_bundle"

export type DashboardAssetClassification =
  | { kind: "ready"; assetRoot: string; safePath: string }
  | { kind: "blocked"; reason: AssetBlockedReason }
  | { kind: "missing" }

export function classifyDashboardAssetRequest(project: Project, assetPath: string[]): DashboardAssetClassification {
  if (project.htmlArtifact.kind !== "zip" || !project.htmlArtifact.assetRoot) {
    return { kind: "blocked", reason: "not_zip_bundle" }
  }

  const safePath = normalizeBundleEntry(assetPath.join("/"))
  if (!safePath) return { kind: "missing" }
  if (isBlockedHostedExtension(safePath)) return { kind: "blocked", reason: "html_sibling" }

  return { kind: "ready", assetRoot: project.htmlArtifact.assetRoot, safePath }
}
