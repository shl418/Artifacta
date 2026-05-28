import type { ArtifactManifest } from "@/lib/server/artifacts/manifest"
import type { Database, ProjectSyncScript } from "@/lib/types"
import { now } from "@/lib/server/db"

export function listProjectSyncScripts(database: Database, projectId: string) {
  return (database.projectSyncScripts ?? []).filter((script) => script.projectId === projectId)
}

export function findProjectSyncScript(database: Database, projectId: string, scriptId: string) {
  return listProjectSyncScripts(database, projectId).find((script) => script.id === scriptId) ?? null
}

export function upsertProjectSyncScriptsFromManifest(
  database: Database,
  projectId: string,
  manifest: ArtifactManifest
) {
  database.projectSyncScripts ??= []
  const timestamp = now()
  const manifestScripts = manifest.sync_scripts ?? []
  const existing = listProjectSyncScripts(database, projectId)
  const seenManifestIds = new Set<string>()

  for (const manifestScript of manifestScripts) {
    seenManifestIds.add(manifestScript.id)
    const current = existing.find((script) => script.manifestId === manifestScript.id)
    if (current) {
      current.scriptPath = manifestScript.path
      current.runtime = manifestScript.runtime
      current.updatedAt = timestamp
      continue
    }

    database.projectSyncScripts.push({
      id: `sscript_${crypto.randomUUID()}`,
      manifestId: manifestScript.id,
      projectId,
      scriptPath: manifestScript.path,
      runtime: manifestScript.runtime,
      outputs: [...manifestScript.outputs],
      schedule: null,
      enabled: true,
      sourceConfig: {},
      lastRunAt: null,
      lastRunStatus: null,
      nextRunAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  }

  database.projectSyncScripts = database.projectSyncScripts.filter(
    (script) => script.projectId !== projectId || seenManifestIds.has(script.manifestId)
  )
}

export function updateProjectSyncScript(
  database: Database,
  script: ProjectSyncScript,
  patch: Partial<Pick<ProjectSyncScript, "enabled" | "outputs" | "sourceConfig">>
) {
  if (typeof patch.enabled === "boolean") script.enabled = patch.enabled
  if (patch.outputs) script.outputs = [...patch.outputs]
  if (patch.sourceConfig) script.sourceConfig = { ...patch.sourceConfig }
  script.schedule = null
  script.nextRunAt = null
  script.updatedAt = now()
  return script
}
