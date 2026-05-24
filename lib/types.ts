export type UserRole = "admin" | "member"
export type UserStatus = "active" | "pending" | "disabled"
export type ProjectVisibility = "private" | "team" | "public"
export type ProjectPermission = "view" | "edit"
export type ArtifactKind = "html" | "zip"
export type DatasetSourceType = "manual" | "cos" | "presto"
export type DatasetUpdateMode = "full" | "incremental"
export type SyncStatus = "pending" | "running" | "success" | "failed"
export type SyncJobStatus = "queued" | "running" | "success" | "failed"
export type ActivityType = "dashboard" | "dataset" | "team" | "upload" | "permission"
export type DatasetOrigin = "bundle" | "upload" | "sync"
export type ScriptSyncRuntime = "python" | "node"
export type ManifestDatasetKind = "csv" | "json" | "jsonl" | "tsv" | "parquet" | "xlsx" | "other"
export type WebhookEvent = "project.created" | "project.updated" | "project.deleted" | "permission.changed" | "sync.success" | "sync.failed"

export interface Organization {
  id: string
  name: string
  slug: string
  description?: string
  createdAt: string
  updatedAt: string
}

export interface User {
  id: string
  organizationId: string
  email: string
  name: string
  role: UserRole
  status: UserStatus
  createdAt: string
  updatedAt: string
  lastLoginAt?: string
}

export interface Folder {
  id: string
  organizationId: string
  name: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface DashboardArtifact {
  kind: ArtifactKind
  originalName: string
  path: string
  size: number
  contentType: string
  entryPath?: string
  assetRoot?: string
}

export interface Project {
  id: string
  organizationId: string
  ownerId: string
  folderId: string | null
  name: string
  description: string
  visibility: ProjectVisibility
  htmlArtifact: DashboardArtifact
  viewsCount: number
  createdAt: string
  updatedAt: string
}

export interface DatasetColumn {
  name: string
  type: "string" | "number" | "boolean" | "date" | "unknown"
}

export interface DatasetSyncConfig {
  enabled: boolean
  sourceType: DatasetSourceType
  sourceConfig: Record<string, unknown>
  updateMode: DatasetUpdateMode
  schedule: string | null
  lastSyncAt?: string
  lastSyncStatus?: SyncStatus
  nextSyncAt?: string
}

export interface Dataset {
  id: string
  projectId: string
  organizationId: string
  name: string
  description: string
  fileName: string
  filePath: string
  fileType: string
  size: number
  rows: number | null
  columns: number | null
  schema: DatasetColumn[]
  version: number
  origin: DatasetOrigin
  syncConfig: DatasetSyncConfig
  createdAt: string
  updatedAt: string
}

export interface BundleFileEntry {
  path: string
  size: number
  extension: string
  inferredDataset: boolean
  existingDatasetId?: string
  currentRefresh?: "manual" | "sync"
}

export interface UploadSession {
  id: string
  userId: string
  organizationId: string
  projectId: string | null
  fileTree: BundleFileEntry[]
  originalName: string
  tempPath: string
  createdAt: string
  expiresAt: string
}

export interface ProjectMember {
  projectId: string
  userId: string
  permission: ProjectPermission
  addedAt: string
}

export interface ApiKey {
  id: string
  organizationId: string
  userId: string
  name: string
  prefix: string
  last4: string
  keyHash: string
  scopes?: string[]
  createdAt: string
  updatedAt: string
  expiresAt: string | null
  lastUsedAt: string | null
}

export interface SyncHistory {
  id: string
  projectId: string
  datasetId: string
  status: SyncStatus
  startedAt: string
  completedAt: string | null
  rowsSynced: number
  updateMode: DatasetUpdateMode
  error: string | null
}

export interface SyncJob {
  id: string
  projectId: string
  datasetId: string
  organizationId: string
  status: SyncJobStatus
  trigger: "manual" | "scheduled"
  requestedBy: string | null
  error: string | null
  createdAt: string
  startedAt: string | null
  completedAt: string | null
}

export interface ProjectSyncScript {
  id: string
  manifestId: string
  projectId: string
  scriptPath: string
  runtime: ScriptSyncRuntime
  outputs: string[]
  schedule: string | null
  enabled: boolean
  sourceConfig: Record<string, unknown>
  lastRunAt: string | null
  lastRunStatus: SyncStatus | null
  nextRunAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ScriptSyncJob {
  id: string
  projectId: string
  scriptId: string
  organizationId: string
  status: SyncJobStatus
  trigger: "manual" | "scheduled"
  requestedBy: string | null
  error: string | null
  createdAt: string
  startedAt: string | null
  completedAt: string | null
}

export interface ScriptSyncHistoryOutput {
  path: string
  datasetId: string | null
  status: SyncStatus
  rowsSynced: number
  error: string | null
}

export interface ScriptSyncHistory {
  id: string
  projectId: string
  scriptId: string
  jobId: string
  status: SyncStatus
  startedAt: string
  completedAt: string | null
  outputs: ScriptSyncHistoryOutput[]
  error: string | null
}

export interface DashboardVersion {
  id: string
  projectId: string
  organizationId: string
  htmlArtifact: DashboardArtifact
  version: number
  createdBy: string
  createdAt: string
  notes: string
}

export interface DatasetVersion {
  id: string
  datasetId: string
  projectId: string
  organizationId: string
  fileName: string
  filePath: string
  fileType: string
  size: number
  rows: number | null
  columns: number | null
  schema: DatasetColumn[]
  version: number
  createdBy: string | null
  createdAt: string
}

export interface WebhookEndpoint {
  id: string
  organizationId: string
  url: string
  events: WebhookEvent[]
  secret: string
  enabled: boolean
  createdAt: string
  updatedAt: string
  lastDeliveryAt: string | null
  lastDeliveryStatus: "success" | "failed" | null
}

export interface AuditLog {
  id: string
  organizationId: string
  actorUserId: string | null
  action: string
  targetType: string
  targetId: string
  summary: string
  metadata: Record<string, unknown>
  createdAt: string
}

export interface Activity {
  id: string
  organizationId: string
  type: ActivityType
  userId: string
  action: string
  target: string
  createdAt: string
}

export interface Database {
  version: number
  organizations: Organization[]
  users: User[]
  folders: Folder[]
  projects: Project[]
  datasets: Dataset[]
  projectMembers: ProjectMember[]
  apiKeys: ApiKey[]
  syncHistory: SyncHistory[]
  syncJobs: SyncJob[]
  projectSyncScripts: ProjectSyncScript[]
  scriptSyncJobs: ScriptSyncJob[]
  scriptSyncHistory: ScriptSyncHistory[]
  uploadSessions: UploadSession[]
  dashboardVersions: DashboardVersion[]
  datasetVersions: DatasetVersion[]
  webhookEndpoints: WebhookEndpoint[]
  auditLogs: AuditLog[]
  activities: Activity[]
}
