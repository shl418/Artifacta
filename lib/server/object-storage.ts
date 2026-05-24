import { promises as fs } from "node:fs"
import path from "node:path"
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import {
  absoluteUploadPath,
  s3AccessKeyId,
  s3Bucket,
  s3Endpoint,
  s3ForcePathStyle,
  s3Region,
  s3SecretAccessKey,
  storageDriver,
  uploadDir,
} from "@/lib/server/config"

let s3Client: S3Client | null = null

export async function writeStorageObject(relativePath: string, body: Buffer | string, contentType = "application/octet-stream") {
  if (storageDriver === "s3") {
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: requireS3Bucket(),
        Key: normalizeStorageKey(relativePath),
        Body: body,
        ContentType: contentType,
      })
    )
    return
  }

  const absolutePath = absoluteUploadPath(relativePath)
  await fs.mkdir(path.dirname(absolutePath), { recursive: true })
  await fs.writeFile(absolutePath, body)
}

export async function readStorageObject(relativePath: string) {
  if (storageDriver === "s3") {
    const response = await getS3Client().send(
      new GetObjectCommand({
        Bucket: requireS3Bucket(),
        Key: normalizeStorageKey(relativePath),
      })
    )
    const bytes = await response.Body?.transformToByteArray()
    if (!bytes) throw new Error(`Storage object not found: ${relativePath}`)
    return Buffer.from(bytes)
  }

  return fs.readFile(absoluteUploadPath(relativePath))
}

export async function readStorageText(relativePath: string) {
  return (await readStorageObject(relativePath)).toString("utf8")
}

export async function removeStoragePrefix(relativePrefix: string) {
  if (storageDriver === "s3") {
    const keys = await listStorageKeys(relativePrefix)
    for (let index = 0; index < keys.length; index += 1000) {
      const batch = keys.slice(index, index + 1000)
      if (batch.length === 0) continue
      await getS3Client().send(
        new DeleteObjectsCommand({
          Bucket: requireS3Bucket(),
          Delete: {
            Objects: batch.map((Key) => ({ Key })),
            Quiet: true,
          },
        })
      )
    }
    return
  }

  await fs.rm(absoluteUploadPath(relativePrefix), { recursive: true, force: true })
}

export async function removeStorageObject(relativePath: string) {
  if (storageDriver === "s3") {
    await getS3Client().send(
      new DeleteObjectsCommand({
        Bucket: requireS3Bucket(),
        Delete: {
          Objects: [{ Key: normalizeStorageKey(relativePath) }],
          Quiet: true,
        },
      })
    )
    return
  }

  await fs.rm(absoluteUploadPath(relativePath), { force: true })
}

export async function listStorageEntries(relativePrefix: string) {
  const normalizedPrefix = normalizeStorageKey(relativePrefix)

  if (storageDriver === "s3") {
    const keys = await listStorageKeys(normalizedPrefix)
    return keys
      .filter((key) => key !== normalizedPrefix)
      .map((key) => key.slice(normalizedPrefix.endsWith("/") ? normalizedPrefix.length : normalizedPrefix.length + 1))
      .filter(Boolean)
  }

  const root = absoluteUploadPath(relativePrefix)
  return listLocalFiles(root, root)
}

function getS3Client() {
  s3Client ??= new S3Client({
    region: s3Region,
    endpoint: s3Endpoint,
    forcePathStyle: s3ForcePathStyle,
    credentials:
      s3AccessKeyId && s3SecretAccessKey
        ? {
            accessKeyId: s3AccessKeyId,
            secretAccessKey: s3SecretAccessKey,
          }
        : undefined,
  })
  return s3Client
}

function requireS3Bucket() {
  if (!s3Bucket) throw new Error("S3_BUCKET must be set when STORAGE_DRIVER=s3.")
  return s3Bucket
}

function normalizeStorageKey(relativePath: string) {
  const key = relativePath.replace(/\\/g, "/").replace(/^\/+/, "")
  if (!key || key.split("/").includes("..")) throw new Error("Storage path must be relative and cannot traverse directories.")
  return key
}

async function listStorageKeys(relativePrefix: string) {
  const prefix = normalizeStorageKey(relativePrefix).replace(/\/?$/, "/")
  const keys: string[] = []
  let ContinuationToken: string | undefined

  do {
    const response = await getS3Client().send(
      new ListObjectsV2Command({
        Bucket: requireS3Bucket(),
        Prefix: prefix,
        ContinuationToken,
      })
    )
    for (const item of response.Contents ?? []) {
      if (item.Key) keys.push(item.Key)
    }
    ContinuationToken = response.NextContinuationToken
  } while (ContinuationToken)

  return keys
}

async function listLocalFiles(root: string, current: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(current, { withFileTypes: true })
    const files: string[] = []
    for (const entry of entries) {
      const absolutePath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        files.push(...(await listLocalFiles(root, absolutePath)))
      } else if (entry.isFile()) {
        files.push(path.relative(root, absolutePath).split(path.sep).join("/"))
      }
    }
    return files
  } catch {
    return []
  }
}

export { storageDriver, uploadDir }
