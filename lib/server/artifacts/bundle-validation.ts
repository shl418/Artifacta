import path from "node:path"
import { InvalidBundleError } from "@/lib/server/artifacts/entrypoint"
import type { ArtifactManifest } from "@/lib/server/artifacts/manifest"
import { contentTypeForPath } from "@/lib/server/artifacts/mime"

export interface BundleHostingIssue {
  code: string
  message: string
  path?: string
}

export interface BundleHostingValidationResult {
  errors: BundleHostingIssue[]
  warnings: BundleHostingIssue[]
}

export interface ValidateBundleForHostingInput {
  htmlFiles: string[]
  manifest: ArtifactManifest | null
  entryPath: string
}

const OCTET_STREAM = "application/octet-stream"

export function validateBundleForHosting(input: ValidateBundleForHostingInput): BundleHostingValidationResult {
  const errors: BundleHostingIssue[] = []
  const warnings: BundleHostingIssue[] = []

  if (input.htmlFiles.length > 1) {
    const list = input.htmlFiles.join(", ")
    errors.push({
      code: "MULTIPLE_HTML_FILES",
      message: `Bundle contains ${input.htmlFiles.length} HTML files (${list}). Artifacta only serves the entrypoint; sibling HTML files return 404. Keep a single-page bundle.`,
    })
  }

  if (input.manifest) {
    for (const dataset of input.manifest.datasets) {
      if (!dataset.path) continue
      if (contentTypeForPath(dataset.path) === OCTET_STREAM) {
        const extension = path.extname(dataset.path).toLowerCase() || "(none)"
        warnings.push({
          code: "DATASET_MIME_FALLBACK",
          message: `Dataset '${dataset.path}' has extension ${extension} which is served as application/octet-stream. Works for CDN parsers, but CSV / JSON is the smoothest path.`,
          path: dataset.path,
        })
      }
    }
  }

  return { errors, warnings }
}

export function throwOnBundleHostingErrors(result: BundleHostingValidationResult) {
  if (result.errors.length === 0) return
  const first = result.errors[0]
  const error = new InvalidBundleError(first.code, first.message)
  ;(error as unknown as { issues: BundleHostingIssue[] }).issues = result.errors
  throw error
}
