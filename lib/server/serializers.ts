import type { Activity, Database, Dataset, Folder, Project, ProjectMember, User } from "@/lib/types"
import { appUrl } from "@/lib/server/config"

export function initials(name: string) {
  return name.trim().slice(0, 1).toUpperCase() || "U"
}

export function projectUrls(projectId: string) {
  return {
    html_url: `${appUrl}/api/v1/projects/${projectId}/html/render`,
    preview_url: `${appUrl}/view/${projectId}`,
  }
}

export function serializeUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    initials: initials(user.name),
    role: user.role,
    status: user.status,
    organization_id: user.organizationId,
    created_at: user.createdAt,
    updated_at: user.updatedAt,
    last_login_at: user.lastLoginAt ?? null,
  }
}

export function serializeProject(database: Database, project: Project) {
  const owner = database.users.find((user) => user.id === project.ownerId)
  const datasets = database.datasets.filter((dataset) => dataset.projectId === project.id)

  return {
    id: project.id,
    name: project.name,
    description: project.description,
    visibility: project.visibility,
    folder_id: project.folderId,
    ...projectUrls(project.id),
    owner_id: project.ownerId,
    owner: owner
      ? {
          id: owner.id,
          name: owner.name,
          email: owner.email,
          initials: initials(owner.name),
        }
      : null,
    datasets_count: datasets.length,
    views_count: project.viewsCount,
    artifact: {
      kind: project.htmlArtifact.kind,
      original_name: project.htmlArtifact.originalName,
      size: project.htmlArtifact.size,
      content_type: project.htmlArtifact.contentType,
      entry_path: project.htmlArtifact.entryPath ?? null,
    },
    created_at: project.createdAt,
    updated_at: project.updatedAt,
  }
}

export function serializeProjectDetail(database: Database, project: Project) {
  return {
    ...serializeProject(database, project),
    datasets: database.datasets.filter((dataset) => dataset.projectId === project.id).map(serializeDataset),
    permissions: database.projectMembers
      .filter((member) => member.projectId === project.id)
      .map((member) => serializeProjectMember(database, member)),
  }
}

export function serializeFolder(folder: Folder, projectCount = 0) {
  return {
    id: folder.id,
    name: folder.name,
    project_count: projectCount,
    created_at: folder.createdAt,
    updated_at: folder.updatedAt,
  }
}

export function serializeDataset(dataset: Dataset) {
  return {
    id: dataset.id,
    project_id: dataset.projectId,
    name: dataset.name,
    description: dataset.description,
    file_name: dataset.fileName,
    file_type: dataset.fileType,
    size: dataset.size,
    rows: dataset.rows,
    columns: dataset.columns,
    schema: dataset.schema,
    version: dataset.version,
    origin: dataset.origin,
    sync_config: serializeSyncConfig(dataset),
    created_at: dataset.createdAt,
    updated_at: dataset.updatedAt,
  }
}

export function serializeSyncConfig(dataset: Dataset) {
  return {
    enabled: dataset.syncConfig.enabled,
    source_type: dataset.syncConfig.sourceType,
    source_config: dataset.syncConfig.sourceConfig,
    update_mode: dataset.syncConfig.updateMode,
    schedule: dataset.syncConfig.schedule,
    last_sync_at: dataset.syncConfig.lastSyncAt ?? null,
    last_sync_status: dataset.syncConfig.lastSyncStatus ?? null,
    next_sync_at: dataset.syncConfig.nextSyncAt ?? null,
  }
}

export function serializeProjectMember(database: Database, member: ProjectMember) {
  const user = database.users.find((candidate) => candidate.id === member.userId)

  return {
    user_id: member.userId,
    user_name: user?.name ?? "Unknown",
    user_email: user?.email ?? "unknown@example.com",
    permission: member.permission,
    added_at: member.addedAt,
  }
}

export function serializeActivity(database: Database, activity: Activity) {
  const user = database.users.find((candidate) => candidate.id === activity.userId)

  return {
    id: activity.id,
    type: activity.type,
    user: {
      id: user?.id ?? activity.userId,
      name: user?.name ?? "Unknown",
      initials: initials(user?.name ?? "Unknown"),
    },
    action: activity.action,
    target: activity.target,
    created_at: activity.createdAt,
  }
}
