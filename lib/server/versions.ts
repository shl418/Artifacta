import type { Database, Dataset, Project } from "@/lib/types"
import { now } from "@/lib/server/db"

export function recordDashboardVersion(database: Database, project: Project, userId: string, notes: string) {
  const version = nextProjectVersion(database, project.id)
  database.dashboardVersions.unshift({
    id: `dashver_${crypto.randomUUID()}`,
    projectId: project.id,
    organizationId: project.organizationId,
    htmlArtifact: project.htmlArtifact,
    version,
    createdBy: userId,
    createdAt: now(),
    notes,
  })
  database.dashboardVersions = database.dashboardVersions.slice(0, 1000)
}

export function recordDatasetVersion(database: Database, dataset: Dataset, userId: string | null) {
  database.datasetVersions.unshift({
    id: `dsver_${crypto.randomUUID()}`,
    datasetId: dataset.id,
    projectId: dataset.projectId,
    organizationId: dataset.organizationId,
    fileName: dataset.fileName,
    filePath: dataset.filePath,
    fileType: dataset.fileType,
    size: dataset.size,
    rows: dataset.rows,
    columns: dataset.columns,
    schema: dataset.schema,
    version: dataset.version,
    createdBy: userId,
    createdAt: now(),
  })
  database.datasetVersions = database.datasetVersions.slice(0, 2000)
}

function nextProjectVersion(database: Database, projectId: string) {
  const latest = database.dashboardVersions
    .filter((version) => version.projectId === projectId)
    .reduce((max, version) => Math.max(max, version.version), 0)
  return latest + 1
}
