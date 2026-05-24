import path from "node:path"
import { parseArtifactManifest, type ArtifactManifest } from "@/lib/server/artifacts/manifest"
import { readStorageText } from "@/lib/server/object-storage"

export async function importManifestFromBundle(assetRoot: string): Promise<ArtifactManifest | null> {
  const manifestPath = path.posix.join(assetRoot, "artifacta.json")
  const raw = await readStorageText(manifestPath).catch(() => null)
  if (!raw) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error("Bundled artifacta.json is not valid JSON.")
  }

  return parseArtifactManifest(parsed)
}
