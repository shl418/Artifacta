export type UserRole = "admin" | "member"
export type UserStatus = "active" | "pending" | "disabled"
export type ProjectVisibility = "private" | "team" | "public"
export type ProjectPermission = "view" | "edit"
export type ArtifactKind = "html" | "zip"
export type DatasetSourceType = "manual" | "cos" | "presto"
export type DatasetUpdateMode = "full" | "incremental"
export type SyncStatus = "pending" | "running" | "success" | "failed"
export type ActivityType = "dashboard" | "dataset" | "team" | "upload" | "permission"

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
  syncConfig: DatasetSyncConfig
  createdAt: string
  updatedAt: string
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
  activities: Activity[]
}
