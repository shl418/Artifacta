import type { Database } from "@/lib/types"
import { recordAudit } from "@/lib/server/audit"
import { addActivity } from "@/lib/server/db"
import { emitWebhooks } from "@/lib/server/webhooks"

export type DomainEvent =
  | { type: "project.created"; organizationId: string; actorId: string; project: { id: string; name: string }; meta?: { upload_session_id?: string; datasets_count?: number } }
  | { type: "project.updated"; organizationId: string; actorId: string; project: { id: string; name: string }; meta?: { visibility?: string } }
  | { type: "project.deleted"; organizationId: string; actorId: string; project: { id: string; name: string } }
  | { type: "project.html.updated"; organizationId: string; actorId: string; project: { id: string; name: string }; meta: { artifact_kind: string; original_name: string } }
  | { type: "project.rolled.back"; organizationId: string; actorId: string; project: { id: string; name: string }; meta: { version_id: string; version: number } }
  | { type: "dataset.created"; organizationId: string; actorId: string; dataset: { id: string; name: string; projectId: string; fileType: string } }
  | { type: "dataset.replaced"; organizationId: string; actorId: string; dataset: { id: string; name: string; projectId: string; version: number } }
  | { type: "dataset.deleted"; organizationId: string; actorId: string; dataset: { id: string; name: string; projectId: string } }
  | { type: "dataset.synced"; organizationId: string; actorId?: string; dataset: { id: string; name: string; projectId: string }; result: { status: "success" | "failed"; syncId: string; rowsSynced: number; error: string | null } }
  | { type: "permission.upserted"; organizationId: string; actorId: string; projectId: string; user: { id: string; name: string; email: string }; permission: string }
  | { type: "permission.updated"; organizationId: string; actorId: string; projectId: string; userId: string; permission: string }
  | { type: "permission.revoked"; organizationId: string; actorId: string; projectId: string; userId: string }

export function dispatch(database: Database, event: DomainEvent): void {
  switch (event.type) {
    case "project.created":
      addActivity(database, { organizationId: event.organizationId, type: "upload", userId: event.actorId, action: "上传了新看板", target: event.project.name, targetId: event.project.id })
      recordAudit(database, { organizationId: event.organizationId, actorUserId: event.actorId, action: "project.create", targetType: "project", targetId: event.project.id, summary: `Created project ${event.project.name}`, metadata: event.meta ?? {} })
      emitWebhooks(database, event.organizationId, "project.created", { project_id: event.project.id, name: event.project.name })
      return

    case "project.updated":
      addActivity(database, { organizationId: event.organizationId, type: "dashboard", userId: event.actorId, action: "更新了看板", target: event.project.name, targetId: event.project.id })
      recordAudit(database, { organizationId: event.organizationId, actorUserId: event.actorId, action: "project.update", targetType: "project", targetId: event.project.id, summary: `Updated project ${event.project.name}`, metadata: event.meta ?? {} })
      emitWebhooks(database, event.organizationId, "project.updated", { project_id: event.project.id, name: event.project.name })
      return

    case "project.deleted":
      addActivity(database, { organizationId: event.organizationId, type: "dashboard", userId: event.actorId, action: "删除了看板", target: event.project.name, targetId: event.project.id })
      recordAudit(database, { organizationId: event.organizationId, actorUserId: event.actorId, action: "project.delete", targetType: "project", targetId: event.project.id, summary: `Deleted project ${event.project.name}`, metadata: {} })
      emitWebhooks(database, event.organizationId, "project.deleted", { project_id: event.project.id, name: event.project.name })
      return

    case "project.html.updated":
      addActivity(database, { organizationId: event.organizationId, type: "dashboard", userId: event.actorId, action: "更新了看板文件", target: event.project.name, targetId: event.project.id })
      recordAudit(database, { organizationId: event.organizationId, actorUserId: event.actorId, action: "project.html.update", targetType: "project", targetId: event.project.id, summary: `Updated dashboard artifact for ${event.project.name}`, metadata: { artifact_kind: event.meta.artifact_kind, original_name: event.meta.original_name } })
      emitWebhooks(database, event.organizationId, "project.updated", { project_id: event.project.id, name: event.project.name })
      return

    case "project.rolled.back":
      recordAudit(database, { organizationId: event.organizationId, actorUserId: event.actorId, action: "project.rollback", targetType: "project", targetId: event.project.id, summary: `Rolled back ${event.project.name} to dashboard version ${event.meta.version}`, metadata: { version_id: event.meta.version_id, version: event.meta.version } })
      return

    case "dataset.created":
      addActivity(database, { organizationId: event.organizationId, type: "dataset", userId: event.actorId, action: "添加了数据集", target: event.dataset.name, targetId: event.dataset.projectId })
      recordAudit(database, { organizationId: event.organizationId, actorUserId: event.actorId, action: "dataset.create", targetType: "dataset", targetId: event.dataset.id, summary: `Added dataset ${event.dataset.name}`, metadata: { project_id: event.dataset.projectId, file_type: event.dataset.fileType } })
      return

    case "dataset.replaced":
      addActivity(database, { organizationId: event.organizationId, type: "dataset", userId: event.actorId, action: "更新了数据集", target: event.dataset.name, targetId: event.dataset.projectId })
      recordAudit(database, { organizationId: event.organizationId, actorUserId: event.actorId, action: "dataset.replace", targetType: "dataset", targetId: event.dataset.id, summary: `Replaced dataset ${event.dataset.name}`, metadata: { project_id: event.dataset.projectId, version: event.dataset.version } })
      return

    case "dataset.deleted":
      recordAudit(database, { organizationId: event.organizationId, actorUserId: event.actorId, action: "dataset.delete", targetType: "dataset", targetId: event.dataset.id, summary: `Deleted dataset ${event.dataset.name}`, metadata: { project_id: event.dataset.projectId } })
      return

    case "dataset.synced":
      if (event.actorId) {
        addActivity(database, { organizationId: event.organizationId, type: "dataset", userId: event.actorId, action: event.result.status === "success" ? "完成了数据同步" : "数据同步失败", target: event.dataset.name, targetId: event.dataset.projectId })
      }
      emitWebhooks(database, event.organizationId, event.result.status === "success" ? "sync.success" : "sync.failed", { project_id: event.dataset.projectId, dataset_id: event.dataset.id, sync_id: event.result.syncId, rows_synced: event.result.rowsSynced, error: event.result.error })
      return

    case "permission.upserted":
      addActivity(database, { organizationId: event.organizationId, type: "permission", userId: event.actorId, action: "更新了项目成员", target: event.user.name, targetId: event.projectId })
      recordAudit(database, { organizationId: event.organizationId, actorUserId: event.actorId, action: "permission.upsert", targetType: "project_member", targetId: `${event.projectId}:${event.user.id}`, summary: `Updated ${event.user.email} access to ${event.permission}`, metadata: { project_id: event.projectId, user_id: event.user.id, permission: event.permission } })
      emitWebhooks(database, event.organizationId, "permission.changed", { project_id: event.projectId, user_id: event.user.id, permission: event.permission })
      return

    case "permission.updated":
      addActivity(database, { organizationId: event.organizationId, type: "permission", userId: event.actorId, action: "修改了项目权限", target: event.userId, targetId: event.projectId })
      recordAudit(database, { organizationId: event.organizationId, actorUserId: event.actorId, action: "permission.update", targetType: "project_member", targetId: `${event.projectId}:${event.userId}`, summary: `Updated project member ${event.userId} to ${event.permission}`, metadata: { project_id: event.projectId, user_id: event.userId, permission: event.permission } })
      emitWebhooks(database, event.organizationId, "permission.changed", { project_id: event.projectId, user_id: event.userId, permission: event.permission })
      return

    case "permission.revoked":
      recordAudit(database, { organizationId: event.organizationId, actorUserId: event.actorId, action: "permission.delete", targetType: "project_member", targetId: `${event.projectId}:${event.userId}`, summary: `Removed project member ${event.userId}`, metadata: { project_id: event.projectId, user_id: event.userId } })
      emitWebhooks(database, event.organizationId, "permission.changed", { project_id: event.projectId, user_id: event.userId, permission: null })
      return
  }
}
