import type {
  DashboardTextChange,
  DashboardVersionOperation,
  Database,
  Project,
} from "@/lib/types"
import { now, updateDatabase } from "@/lib/server/db"
import { dispatch } from "@/lib/server/dispatch"
import { createEditedProjectArtifact } from "@/lib/server/storage"
import { recordDashboardVersion } from "@/lib/server/versions"

export async function commitProjectTextRevision(input: {
  project: Project
  expectedRevisionId: string
  html: string
  changes: DashboardTextChange[]
  userId: string
  notes: string
  operation: Extract<DashboardVersionOperation, "text_edit" | "merge">
}) {
  const artifact = await createEditedProjectArtifact(
    input.project.id,
    input.project.htmlArtifact,
    input.html,
  )

  return updateDatabase((database) => {
    const project = database.projects.find((candidate) => candidate.id === input.project.id)
    if (!project || project.htmlArtifact.revisionId !== input.expectedRevisionId) return null

    project.htmlArtifact = artifact
    project.updatedAt = now()
    const version = recordDashboardVersion(
      database,
      project,
      input.userId,
      input.notes,
      {
        operation: input.operation,
        parentRevisionId: input.expectedRevisionId,
        textChanges: input.changes,
      },
    )
    dispatch(database, {
      type: "project.html.updated",
      organizationId: project.organizationId,
      actorId: input.userId,
      project: { id: project.id, name: project.name },
      meta: {
        artifact_kind: artifact.kind,
        original_name: artifact.originalName,
        text_edit_count: input.changes.length,
        merged: input.operation === "merge",
      },
    })
    return { project, version }
  })
}

export function findProjectRevision(database: Database, projectId: string, revisionId: string) {
  const current = database.projects.find((candidate) => candidate.id === projectId)
  if (current?.htmlArtifact.revisionId === revisionId) return current.htmlArtifact
  return database.dashboardVersions.find(
    (version) =>
      version.projectId === projectId &&
      version.htmlArtifact.revisionId === revisionId,
  )?.htmlArtifact ?? null
}
