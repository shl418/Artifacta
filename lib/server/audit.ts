import type { AuditLog, Database } from "@/lib/types"
import { now } from "@/lib/server/db"

export function recordAudit(database: Database, input: Omit<AuditLog, "id" | "createdAt">) {
  database.auditLogs.unshift({
    ...input,
    id: `audit_${crypto.randomUUID()}`,
    createdAt: now(),
  })
  database.auditLogs = database.auditLogs.slice(0, 2000)
}

