import path from "node:path"
import { z } from "zod"

const relativePathSchema = z
  .string()
  .min(1)
  .transform((value) => {
    const clean = value.replace(/\\/g, "/")
    return { clean, normalized: path.posix.normalize(clean), raw: value }
  })
  .refine(({ clean, normalized, raw }) => {
    return (
      Boolean(normalized) &&
      normalized !== "." &&
      !path.win32.isAbsolute(raw) &&
      !/^[a-zA-Z]:/.test(raw) &&
      !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(clean) &&
      !normalized.startsWith("/") &&
      !normalized.startsWith("../") &&
      !clean.startsWith("//") &&
      !clean.split("/").includes("..") &&
      !normalized.split("/").includes("..")
    )
  }, "Path must be relative and must not contain parent traversal")
  .transform(({ normalized }) => normalized)

export const artifactManifestSchema = z.object({
  schema_version: z.literal(1),
  name: z.string().min(1).max(120),
  entrypoint: relativePathSchema,
  datasets: z
    .array(
      z.object({
        id: z.string().regex(/^[a-zA-Z0-9_-]+$/).max(80),
        name: z.string().min(1).max(120),
        kind: z.enum(["csv", "json"]),
        path: relativePathSchema.optional(),
        refresh: z.enum(["manual", "sync"]).default("manual"),
      }),
    )
    .default([]),
})

export type ArtifactManifest = z.infer<typeof artifactManifestSchema>

export function parseArtifactManifest(input: unknown) {
  return artifactManifestSchema.parse(input)
}

function manifestKindForPath(bundlePath: string): "csv" | "json" {
  const extension = path.extname(bundlePath).toLowerCase()
  if (extension === ".csv" || extension === ".tsv") return "csv"
  return "json"
}

export function datasetIdFromBundlePath(bundlePath: string) {
  const stem = path.basename(bundlePath, path.extname(bundlePath))
  const slug = stem.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/^_+|_+$/g, "")
  return (slug || "dataset").slice(0, 80)
}

export function generateManifest(
  projectName: string,
  entryPath: string,
  datasets: Array<{ id: string; name: string; bundlePath: string; refresh: "manual" | "sync" }>
): ArtifactManifest {
  return {
    schema_version: 1,
    name: projectName,
    entrypoint: entryPath,
    datasets: datasets.map((dataset) => ({
      id: dataset.id,
      name: dataset.name,
      kind: manifestKindForPath(dataset.bundlePath),
      path: dataset.bundlePath,
      refresh: dataset.refresh,
    })),
  }
}
