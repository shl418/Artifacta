import type { Dataset } from "@/lib/types"
import { inspectDataset } from "@/lib/server/datasets"
import { now } from "@/lib/server/db"
import { saveDatasetArtifact } from "@/lib/server/storage"

interface BuildDatasetInput {
  projectId: string
  organizationId: string
  file: File
  name?: string
  description?: string
}

export async function buildDatasetRecord(input: BuildDatasetInput): Promise<Dataset> {
  const datasetId = `ds_${crypto.randomUUID()}`
  const artifact = await saveDatasetArtifact(input.projectId, datasetId, input.file)
  const inspection = inspectDataset(artifact.fileName, artifact.buffer)
  const createdAt = now()

  return {
    id: datasetId,
    projectId: input.projectId,
    organizationId: input.organizationId,
    name: input.name?.trim() || artifact.fileName,
    description: input.description?.trim() || "",
    fileName: artifact.fileName,
    filePath: artifact.relativePath,
    fileType: inspection.fileType,
    size: artifact.size,
    rows: inspection.rows,
    columns: inspection.columns,
    schema: inspection.schema,
    version: 1,
    origin: "upload",
    syncConfig: {
      enabled: false,
      sourceType: "manual",
      sourceConfig: {},
      updateMode: "full",
      schedule: null,
    },
    createdAt,
    updatedAt: createdAt,
  }
}
