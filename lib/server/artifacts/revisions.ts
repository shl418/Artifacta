import type { DashboardArtifact, Database, Project } from "@/lib/types"
import { readDatabase, updateDatabase } from "@/lib/server/db"
import { snapshotProjectArtifact } from "@/lib/server/storage"

export function findProjectArtifactRevision(
  database: Database,
  projectId: string,
  revisionId: string,
): DashboardArtifact | null {
  const project = database.projects.find((candidate) => candidate.id === projectId)
  if (project?.htmlArtifact.revisionId === revisionId) return project.htmlArtifact

  return (
    database.dashboardVersions.find(
      (version) =>
        version.projectId === projectId &&
        version.htmlArtifact.revisionId === revisionId,
    )?.htmlArtifact ?? null
  )
}

export async function ensureProjectArtifactRevision(projectId: string): Promise<Project | null> {
  const database = await readDatabase()
  const project = database.projects.find((candidate) => candidate.id === projectId)
  if (!project) return null
  if (project.htmlArtifact.revisionId) return project

  const previousArtifact = project.htmlArtifact
  const snapshot = await snapshotProjectArtifact(projectId, previousArtifact)

  return updateDatabase((mutable) => {
    const current = mutable.projects.find((candidate) => candidate.id === projectId)
    if (!current) return null
    if (current.htmlArtifact.revisionId) return current
    if (!sameArtifactLocation(current.htmlArtifact, previousArtifact)) {
      return current
    }

    current.htmlArtifact = snapshot
    for (const version of mutable.dashboardVersions) {
      if (
        version.projectId === projectId &&
        !version.htmlArtifact.revisionId &&
        sameArtifactLocation(version.htmlArtifact, previousArtifact)
      ) {
        version.htmlArtifact = { ...snapshot }
      }
    }
    return current
  })
}

function sameArtifactLocation(left: DashboardArtifact, right: DashboardArtifact) {
  return (
    left.kind === right.kind &&
    left.path === right.path &&
    left.assetRoot === right.assetRoot &&
    left.entryPath === right.entryPath
  )
}
