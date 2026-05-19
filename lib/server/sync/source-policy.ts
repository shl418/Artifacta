import { existsSync, realpathSync } from "node:fs"
import * as dns from "node:dns/promises"
import net from "node:net"
import path from "node:path"

const SUPPORTED_URL_PROTOCOLS = new Set(["http:", "https:"])
const RESTRICTED_POSIX_DIRS = ["/etc", "/proc", "/sys", "/dev"]
const RESTRICTED_WINDOWS_DIRS = ["C:\\Windows\\System32"]

export async function assertAllowedSyncUrl(rawUrl: string): Promise<URL> {
  let parsedUrl: URL
  try {
    parsedUrl = new URL(rawUrl)
  } catch {
    throw new Error("Invalid dataset sync URL.")
  }

  if (!SUPPORTED_URL_PROTOCOLS.has(parsedUrl.protocol)) {
    throw new Error(`Unsupported dataset sync URL protocol: ${parsedUrl.protocol}`)
  }

  const hostname = normalizedHostname(parsedUrl.hostname)
  if (isLocalhost(hostname)) {
    throw new Error("Dataset sync URL host cannot be localhost.")
  }

  if (isPrivateOrLinkLocalAddress(hostname)) {
    throw new Error("Dataset sync URL host cannot be a private or link-local address.")
  }

  const allowlist = parseAllowlist(process.env.SYNC_URL_ALLOWLIST)
  if (allowlist.size > 0) {
    if (!allowlist.has(hostname)) {
      throw new Error("Dataset sync URL host is not in SYNC_URL_ALLOWLIST.")
    }
    await assertPublicDnsResolution(hostname)
    return parsedUrl
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("Remote URL sync is disabled in production unless SYNC_URL_ALLOWLIST is configured.")
  }

  await assertPublicDnsResolution(hostname)

  return parsedUrl
}

export function assertAllowedLocalPath(rawPath: string): string {
  if (isRestrictedSystemPath(rawPath)) {
    throw new Error("Dataset sync local path targets a restricted system directory.")
  }

  const normalizedPath = normalizeLocalPath(rawPath)
  const baseDir = process.env.SYNC_LOCAL_BASE_DIR?.trim()

  if (isRestrictedSystemPath(normalizedPath)) {
    throw new Error("Dataset sync local path targets a restricted system directory.")
  }

  if (baseDir) {
    const normalizedBaseDir = normalizeLocalPath(baseDir)
    if (!isPathInsideOrEqual(normalizedPath, normalizedBaseDir) || !isRealPathInsideOrEqual(normalizedPath, normalizedBaseDir)) {
      throw new Error("Dataset sync local path is outside SYNC_LOCAL_BASE_DIR.")
    }
    return normalizedPath
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("Local file sync is disabled in production unless SYNC_LOCAL_BASE_DIR is configured.")
  }

  return normalizedPath
}

export function assertAllowedUploadPath(relativeUploadPath: string): string {
  if (path.isAbsolute(relativeUploadPath)) {
    throw new Error("Dataset sync upload_path must be relative to UPLOAD_DIR.")
  }

  const normalizedUploadDir = path.resolve(process.env.UPLOAD_DIR ?? path.join(process.env.DATA_DIR ?? ".artifacta", "uploads"))
  const resolvedPath = path.resolve(normalizedUploadDir, relativeUploadPath)
  if (!isPathInsideOrEqual(resolvedPath, normalizedUploadDir)) {
    throw new Error("Dataset sync upload_path is outside UPLOAD_DIR.")
  }

  return resolvedPath
}

function parseAllowlist(rawAllowlist: string | undefined) {
  return new Set(
    (rawAllowlist ?? "")
      .split(",")
      .map((host) => normalizedHostname(host.trim()))
      .filter(Boolean),
  )
}

function normalizedHostname(hostname: string) {
  return hostname.replace(/^\[(.*)\]$/, "$1").toLowerCase()
}

function isLocalhost(hostname: string) {
  return hostname === "localhost" || hostname.endsWith(".localhost")
}

function isPrivateOrLinkLocalAddress(address: string): boolean {
  const normalizedAddress = normalizedHostname(address)

  if (normalizedAddress === "::" || normalizedAddress === "::1") return true
  if (/^f[cd][0-9a-f]{2}:/i.test(normalizedAddress)) return true
  if (/^fe[89ab][0-9a-f]:/i.test(normalizedAddress)) return true
  if (/^ff[0-9a-f]{2}:/i.test(normalizedAddress)) return true
  if (/^2001:db8:/i.test(normalizedAddress)) return true
  if (normalizedAddress.startsWith("::ffff:")) {
    const mappedAddress = normalizedAddress.slice("::ffff:".length)
    return isPrivateOrLinkLocalAddress(mappedAddress) || isPrivateOrLinkLocalAddress(ipv4FromMappedIpv6(mappedAddress))
  }

  const parts = normalizedAddress.split(".")
  if (parts.length !== 4 || parts.some((part) => !/^\d+$/.test(part))) {
    return false
  }

  const octets = parts.map(Number)
  if (octets.some((octet) => octet < 0 || octet > 255)) return false

  const [first, second] = octets
  return (
    first === 0 ||
    first === 127 ||
    first === 10 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 192 && second === 168) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 169 && second === 254) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 88) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51) ||
    (first === 203 && second === 0) ||
    first >= 224
  )
}

function ipv4FromMappedIpv6(value: string) {
  const parts = value.split(":")
  if (parts.length !== 2) return value

  const high = Number.parseInt(parts[0], 16)
  const low = Number.parseInt(parts[1], 16)
  if (!Number.isFinite(high) || !Number.isFinite(low)) return value
  if (high < 0 || high > 0xffff || low < 0 || low > 0xffff) return value

  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`
}

function normalizeLocalPath(rawPath: string) {
  return path.isAbsolute(rawPath) ? path.normalize(rawPath) : path.resolve(/* turbopackIgnore: true */ process.cwd(), rawPath)
}

async function assertPublicDnsResolution(hostname: string) {
  if (net.isIP(hostname) !== 0) return

  const addresses = await dns.lookup(hostname, { all: true })
  if (addresses.some((address) => isPrivateOrLinkLocalAddress(address.address))) {
    throw new Error("Dataset sync URL DNS resolved to a private or link-local address.")
  }
}

function isPathInsideOrEqual(candidatePath: string, basePath: string) {
  const comparableCandidate = comparablePath(candidatePath)
  const comparableBase = comparablePath(basePath)
  const relativePath = path.relative(comparableBase, comparableCandidate)
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
}

function isRealPathInsideOrEqual(candidatePath: string, basePath: string) {
  if (!existsSync(candidatePath) || !existsSync(basePath)) return true
  return isPathInsideOrEqual(realpathSync(candidatePath), realpathSync(basePath))
}

function isRestrictedSystemPath(candidatePath: string) {
  return (
    RESTRICTED_POSIX_DIRS.some((restrictedDir) => isPathInsideOrEqual(candidatePath, path.normalize(restrictedDir))) ||
    RESTRICTED_WINDOWS_DIRS.some((restrictedDir) => isWindowsPathInsideOrEqual(candidatePath, restrictedDir))
  )
}

function isWindowsPathInsideOrEqual(candidatePath: string, basePath: string) {
  const normalizedCandidate = candidatePath.replace(/\//g, "\\").toLowerCase()
  const normalizedBase = path.win32.normalize(basePath).toLowerCase()
  return normalizedCandidate === normalizedBase || normalizedCandidate.startsWith(`${normalizedBase}\\`)
}

function comparablePath(candidatePath: string) {
  return process.platform === "win32" ? candidatePath.toLowerCase() : candidatePath
}
