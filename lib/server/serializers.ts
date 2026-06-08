import type { Activity, Database, Dataset, Folder, Project, ProjectMember, ProjectSyncScript, ScriptSyncHistory, User } from "@/lib/types"
import { appUrl } from "@/lib/server/config"
import { listProjectSyncScripts } from "@/lib/server/sync/sync-scripts"

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
  const datasetNames = new Set(
    database.datasets.filter((dataset) => dataset.projectId === project.id).map((dataset) => dataset.name)
  )

  return {
    ...serializeProject(database, project),
    datasets: database.datasets.filter((dataset) => dataset.projectId === project.id).map(serializeDataset),
    permissions: database.projectMembers
      .filter((member) => member.projectId === project.id)
      .map((member) => serializeProjectMember(database, member)),
    recent_activity: database.activities
      .filter(
        (activity) =>
          activity.organizationId === project.organizationId &&
          (activity.targetId === project.id ||
            (!activity.targetId && (activity.target === project.name || datasetNames.has(activity.target))))
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 20)
      .map((activity) => serializeActivity(database, activity)),
    sync_scripts: listProjectSyncScripts(database, project.id).map((script) => serializeProjectSyncScript(script)),
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

// source_config can carry script credentials (it is injected into the sync
// subprocess). Mask values for non-editors so anonymous viewers of a public
// project cannot read secrets, while still revealing which keys are configured.
function redactSourceConfig(config: Record<string, unknown> | undefined) {
  if (!config) return config
  return Object.fromEntries(Object.keys(config).map((key) => [key, "***"]))
}

export function serializeProjectSyncScript(script: ProjectSyncScript, includeSecrets = false) {
  return {
    id: script.id,
    manifest_id: script.manifestId,
    project_id: script.projectId,
    script_path: script.scriptPath,
    runtime: script.runtime,
    outputs: script.outputs,
    schedule: script.schedule,
    enabled: script.enabled,
    source_config: includeSecrets ? script.sourceConfig : redactSourceConfig(script.sourceConfig),
    last_run_at: script.lastRunAt,
    last_run_status: script.lastRunStatus,
    next_run_at: script.nextRunAt,
    created_at: script.createdAt,
    updated_at: script.updatedAt,
  }
}

export function serializeScriptSyncHistory(history: ScriptSyncHistory) {
  return {
    id: history.id,
    project_id: history.projectId,
    script_id: history.scriptId,
    job_id: history.jobId,
    status: history.status,
    started_at: history.startedAt,
    completed_at: history.completedAt,
    outputs: history.outputs.map((output) => ({
      path: output.path,
      dataset_id: output.datasetId,
      status: output.status,
      rows_synced: output.rowsSynced,
      error: output.error,
    })),
    error: history.error,
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
