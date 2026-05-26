export class InvalidBundleError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = "InvalidBundleError"
    this.code = code
  }
}

export interface ResolveEntryPathInput {
  htmlFiles: string[]
  defaultIndex: string | null
  manifestEntry: string | null
}

export function pickDefaultIndex(htmlFiles: string[]): string | null {
  if (htmlFiles.length === 0) return null
  const lowerByOriginal = new Map<string, string>()
  for (const file of htmlFiles) lowerByOriginal.set(file.toLowerCase(), file)

  const rootMatch = Array.from(lowerByOriginal.entries()).find(([lower]) => lower === "index.html")
  if (rootMatch) return rootMatch[1]

  const nestedMatch = Array.from(lowerByOriginal.entries()).find(([lower]) => lower.endsWith("/index.html"))
  if (nestedMatch) return nestedMatch[1]

  return null
}

export function resolveBundleEntryPath({ htmlFiles, defaultIndex, manifestEntry }: ResolveEntryPathInput): string {
  if (manifestEntry) {
    if (htmlFiles.includes(manifestEntry)) return manifestEntry
    throw new InvalidBundleError(
      "MANIFEST_ENTRYPOINT_MISSING",
      `Manifest entrypoint '${manifestEntry}' was not found in the bundle.`,
    )
  }

  if (defaultIndex) return defaultIndex

  throw new InvalidBundleError(
    "NO_ENTRYPOINT",
    "Bundle must contain an index.html file, or declare entrypoint in artifacta.json.",
  )
}
