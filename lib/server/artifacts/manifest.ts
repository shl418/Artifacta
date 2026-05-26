import path from "node:path"
import { z } from "zod"
import type { ManifestDatasetKind } from "@/lib/types"

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

const scriptPathSchema = relativePathSchema.refine(
  (value) => /\.(py|js|mjs)$/i.test(value),
  "Script path must end with .py, .js, or .mjs"
)

const datasetKindSchema = z.enum(["csv", "json", "jsonl", "tsv", "parquet", "xlsx", "other"])

export const artifactManifestSchema = z
  .object({
    schema_version: z.literal(1),
    name: z.string().min(1).max(120),
    entrypoint: relativePathSchema,
    datasets: z
      .array(
        z.object({
          id: z.string().regex(/^[a-zA-Z0-9_-]+$/).max(80),
          name: z.string().min(1).max(120),
          kind: datasetKindSchema,
          path: relativePathSchema.optional(),
          refresh: z.enum(["manual", "sync"]).default("manual"),
        })
      )
      .default([]),
    sync_scripts: z
      .array(
        z.object({
          id: z.string().regex(/^[a-zA-Z0-9_-]+$/).max(80),
          path: scriptPathSchema,
          runtime: z.enum(["python", "node"]),
          outputs: z.array(relativePathSchema).min(1),
          schedule: z.string().min(1).max(120).optional(),
        })
      )
      .optional()
      .default([]),
  })
  .superRefine((manifest, context) => {
    for (const [datasetIndex, dataset] of manifest.datasets.entries()) {
      if (!dataset.path || dataset.kind === "other") continue
      const expected = manifestKindForPath(dataset.path)
      if (expected !== "other" && expected !== dataset.kind) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `datasets[${datasetIndex}].kind '${dataset.kind}' does not match path extension (.${expected}). DATASET_KIND_EXTENSION_MISMATCH`,
          path: ["datasets", datasetIndex, "kind"],
        })
      }
    }

    const datasetPaths = new Set(
      manifest.datasets.map((dataset) => dataset.path).filter((value): value is string => Boolean(value))
    )

    for (const [index, script] of manifest.sync_scripts.entries()) {
      for (const outputPath of script.outputs) {
        if (!datasetPaths.has(outputPath)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `sync_scripts[${index}].outputs must reference a datasets[].path`,
            path: ["sync_scripts", index, "outputs"],
          })
        }
      }

      const syncDatasetPaths = new Set(
        manifest.datasets.filter((dataset) => dataset.refresh === "sync" && dataset.path).map((dataset) => dataset.path as string)
      )
      for (const outputPath of script.outputs) {
        if (!syncDatasetPaths.has(outputPath)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `sync_scripts[${index}].outputs must reference datasets with refresh: "sync"`,
            path: ["sync_scripts", index, "outputs"],
          })
        }
      }
    }
  })

export type ArtifactManifest = z.infer<typeof artifactManifestSchema>

export function parseArtifactManifest(input: unknown) {
  return artifactManifestSchema.parse(input)
}

export function manifestKindForPath(bundlePath: string): ManifestDatasetKind {
  const extension = path.extname(bundlePath).toLowerCase()
  if (extension === ".csv") return "csv"
  if (extension === ".tsv") return "tsv"
  if (extension === ".jsonl") return "jsonl"
  if (extension === ".json") return "json"
  if (extension === ".parquet") return "parquet"
  if (extension === ".xlsx") return "xlsx"
  return "other"
}

export function datasetIdFromBundlePath(bundlePath: string) {
  const stem = path.basename(bundlePath, path.extname(bundlePath))
  const slug = stem.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/^_+|_+$/g, "")
  return (slug || "dataset").slice(0, 80)
}

export function generateManifest(
  projectName: string,
  entryPath: string,
  datasets: Array<{ id: string; name: string; bundlePath: string; refresh: "manual" | "sync" }>,
  syncScripts?: ArtifactManifest["sync_scripts"]
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
    sync_scripts: syncScripts ?? [],
  }
}

export function manifestDatasetsToCommitInput(manifest: ArtifactManifest) {
  return manifest.datasets
    .filter((dataset): dataset is typeof dataset & { path: string } => Boolean(dataset.path))
    .map((dataset) => ({
      bundle_path: dataset.path,
      name: dataset.name,
      refresh: dataset.refresh,
    }))
}
