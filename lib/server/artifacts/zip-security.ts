import path from "node:path"
import type AdmZip from "adm-zip"

export const zipSecurityLimits = {
  maxEntries: 500,
  maxEntryBytes: 25 * 1024 * 1024,
  maxTotalBytes: 100 * 1024 * 1024,
}

const blockedExtensions = new Set([".exe", ".dll", ".bat", ".cmd", ".ps1", ".sh", ".jar"])

export function normalizeBundleEntry(entryName: string): string | null {
  const cleanPath = entryName.replace(/\\/g, "/")
  if (!cleanPath || cleanPath.startsWith("/") || /^[a-zA-Z]:/.test(cleanPath)) return null

  const rawSegments = cleanPath.split("/")
  if (rawSegments.includes("..")) return null

  const normalized = path.posix.normalize(cleanPath)
  if (!normalized || normalized === "." || normalized.startsWith("/") || normalized.split("/").includes("..")) return null
  if (normalized === "__MACOSX" || normalized.startsWith("__MACOSX/")) return null

  return normalized
}

export function validateZipBundle(zip: AdmZip): void {
  let entryCount = 0
  let totalBytes = 0

  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue

    const safePath = normalizeBundleEntry(entry.entryName)
    if (!safePath) {
      if (isBenignMacosxMetadataEntry(entry.entryName)) continue
      throw new Error(`ZIP bundle contains an unsafe path: ${entry.entryName}`)
    }

    entryCount += 1
    if (entryCount > zipSecurityLimits.maxEntries) {
      throw new Error(`ZIP bundle contains too many entries; maximum is ${zipSecurityLimits.maxEntries}`)
    }

    const extension = path.posix.extname(safePath).toLowerCase()
    if (blockedExtensions.has(extension)) {
      throw new Error(`ZIP bundle contains a blocked executable or script: ${safePath}`)
    }

    const entryBytes = entry.header.size
    if (entryBytes > zipSecurityLimits.maxEntryBytes) {
      throw new Error(`ZIP bundle entry exceeds ${zipSecurityLimits.maxEntryBytes} bytes: ${safePath}`)
    }

    totalBytes += entryBytes
    if (totalBytes > zipSecurityLimits.maxTotalBytes) {
      throw new Error(`ZIP bundle exceeds ${zipSecurityLimits.maxTotalBytes} total uncompressed bytes`)
    }
  }
}

function isBenignMacosxMetadataEntry(entryName: string) {
  const cleanPath = entryName.replace(/\\/g, "/")
  if (cleanPath.split("/").includes("..")) return false

  const normalized = path.posix.normalize(cleanPath)
  if (!normalized.startsWith("__MACOSX/")) return false
  return path.posix.basename(normalized).startsWith("._")
}
