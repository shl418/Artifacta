export class BundleIncompleteError extends Error {
  readonly code = "BUNDLE_INCOMPLETE"
  constructor(message = "Bundle metadata is incomplete; please re-upload the ZIP.") {
    super(message)
    this.name = "BundleIncompleteError"
  }
}

export interface BundledManifestIssue {
  code: string
  message: string
  path?: (string | number)[]
}

export class InvalidBundledManifestError extends Error {
  readonly code = "INVALID_BUNDLED_MANIFEST"
  readonly issues: BundledManifestIssue[]
  constructor(issues: BundledManifestIssue[]) {
    super(issues[0]?.message ?? "Invalid bundled manifest.")
    this.name = "InvalidBundledManifestError"
    this.issues = issues
  }
}
