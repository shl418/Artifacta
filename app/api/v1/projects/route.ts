import type { Project, ProjectVisibility } from "@/lib/types"
import { requireRequestAuth } from "@/lib/server/auth"
import { canViewProject } from "@/lib/server/access"
import { recordAudit } from "@/lib/server/audit"
import { buildDatasetRecord } from "@/lib/server/dataset-records"
import { addActivity, now, readDatabase, updateDatabase } from "@/lib/server/db"
import { apiError, created, ok, paginate, parsePagination } from "@/lib/server/responses"
import { rateLimitResponse } from "@/lib/server/rate-limit"
import { requestPayloadTooLarge } from "@/lib/server/request-size"
import { serializeFolder, serializeProject, serializeProjectDetail } from "@/lib/server/serializers"
import { commitUploadSession } from "@/lib/server/artifacts/upload-session"
import { saveProjectArtifact } from "@/lib/server/storage"
import { recordDashboardVersion, recordDatasetVersion } from "@/lib/server/versions"
import { emitWebhooks } from "@/lib/server/webhooks"

export const runtime = "nodejs"

const visibilityValues = new Set(["private", "team", "public"])

export async function GET(request: Request) {
  const auth = await requireRequestAuth(request, "projects:read")
  if (auth instanceof Response) return auth

  const database = await readDatabase()
  const url = new URL(request.url)
  const { page, perPage } = parsePagination(url)
  const search = url.searchParams.get("search")?.trim().toLowerCase() ?? ""
  const visibility = url.searchParams.get("visibility")
  const ownerId = url.searchParams.get("owner_id")
  const folderParam = url.searchParams.get("folder_id")

  const visibleProjects = database.projects.filter(
    (project) => project.organizationId === auth.user.organizationId && canViewProject(database, auth.user, project)
  )

  const globallyFiltered = visibleProjects.filter((project) => {
    const matchesSearch = !search || project.name.toLowerCase().includes(search) || project.description.toLowerCase().includes(search)
    const matchesVisibility = !visibility || project.visibility === visibility
    const matchesOwner = !ownerId || project.ownerId === ownerId
    return matchesSearch && matchesVisibility && matchesOwner
  })

  const currentFolderId = folderParam === "root" || folderParam === "null" ? null : folderParam
  const folderFiltered = folderParam === null ? globallyFiltered : globallyFiltered.filter((project) => project.folderId === currentFolderId)

  const folderCounts = globallyFiltered.reduce<Record<string, number>>((accumulator, project) => {
    const key = project.folderId ?? "root"
    accumulator[key] = (accumulator[key] ?? 0) + 1
    return accumulator
  }, {})

  const serializedFolders = database.folders
    .filter((folder) => folder.organizationId === auth.user.organizationId)
    .map((folder) => serializeFolder(folder, folderCounts[folder.id] ?? 0))
    .filter((folder) => folder.project_count > 0 || !search)

  const result = paginate(folderFiltered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), page, perPage)

  return ok({
    data: result.data.map((project) => serializeProject(database, project)),
    folders: serializedFolders,
    folder_counts: { root: folderCounts.root ?? 0, ...folderCounts },
    pagination: result.pagination,
  })
}

export async function POST(request: Request) {
  const limited = rateLimitResponse(request, "projects-upload", 30)
  if (limited) return limited

  const tooLarge = requestPayloadTooLarge(request)
  if (tooLarge) return tooLarge

  const auth = await requireRequestAuth(request, "projects:write")
  if (auth instanceof Response) return auth

  const form = await request.formData().catch(() => null)
  if (!form) return apiError(400, "INVALID_REQUEST", "请求体必须是 multipart/form-data。")

  const name = String(form.get("name") ?? "").trim()
  const description = String(form.get("description") ?? "").trim()
  const visibilityInput = String(form.get("visibility") ?? "private")
  const folderId = nullableString(form.get("folder_id"))
  const uploadSessionId = String(form.get("upload_session_id") ?? "").trim()
  const htmlFile = asFile(form.get("html_file"))

  if (!name) return apiError(400, "INVALID_REQUEST", "项目名称不能为空。", { field: "name" })
  if (!visibilityValues.has(visibilityInput)) {
    return apiError(400, "INVALID_REQUEST", "visibility 必须是 private、team 或 public。", { field: "visibility" })
  }

  if (uploadSessionId) {
    let datasetsConfig: Array<{ bundle_path: string; name: string; refresh: "manual" | "sync" }>
    try {
      datasetsConfig = JSON.parse(String(form.get("datasets") ?? "[]"))
    } catch {
      return apiError(400, "INVALID_REQUEST", "datasets 必须是 JSON 数组。", { field: "datasets" })
    }

    if (!Array.isArray(datasetsConfig)) {
      return apiError(400, "INVALID_REQUEST", "datasets 必须是 JSON 数组。", { field: "datasets" })
    }

    const manifestModeInput = String(form.get("manifest_mode") ?? "").trim()
    const manifestMode =
      manifestModeInput === "auto" || manifestModeInput === "wizard"
        ? (manifestModeInput as "auto" | "wizard")
        : undefined

    const project = await updateDatabase<Project | null>(async (database) => {
      if (folderId && !database.folders.some((folder) => folder.id === folderId && folder.organizationId === auth.user.organizationId)) {
        throw new Error("FOLDER_NOT_FOUND")
      }

      try {
        const committed = await commitUploadSession(database, {
          sessionId: uploadSessionId,
          userId: auth.user.id,
          organizationId: auth.user.organizationId,
          name,
          description,
          visibility: visibilityInput as ProjectVisibility,
          folderId,
          datasets: datasetsConfig,
          manifestMode,
        })

        addActivity(database, {
          organizationId: auth.user.organizationId,
          type: "upload",
          userId: auth.user.id,
          action: "上传了新看板",
          target: name,
        })
        recordDashboardVersion(database, committed.project, auth.user.id, "Created from ZIP upload session")
        for (const dataset of committed.datasets) recordDatasetVersion(database, dataset, auth.user.id)
        recordAudit(database, {
          organizationId: auth.user.organizationId,
          actorUserId: auth.user.id,
          action: "project.create",
          targetType: "project",
          targetId: committed.project.id,
          summary: `Created project ${name}`,
          metadata: { upload_session_id: uploadSessionId, datasets_count: committed.datasets.length },
        })
        emitWebhooks(database, auth.user.organizationId, "project.created", { project_id: committed.project.id, name })

        return committed.project
      } catch (error) {
        if (error instanceof Error && error.message === "UPLOAD_SESSION_NOT_FOUND") throw new Error("UPLOAD_SESSION_NOT_FOUND")
        if (error instanceof Error && error.message === "PROJECT_NOT_FOUND") throw new Error("PROJECT_NOT_FOUND")
        if (error instanceof Error && error.message === "INVALID_BUNDLED_MANIFEST") throw new Error("INVALID_BUNDLED_MANIFEST")
        throw error
      }
    }).catch((error) => {
      if (error instanceof Error && error.message === "FOLDER_NOT_FOUND") return null
      if (error instanceof Error && error.message === "UPLOAD_SESSION_NOT_FOUND") return "UPLOAD_SESSION_NOT_FOUND"
      if (error instanceof Error && error.message === "PROJECT_NOT_FOUND") return "PROJECT_NOT_FOUND"
      if (error instanceof Error && error.message === "INVALID_BUNDLED_MANIFEST") return "INVALID_BUNDLED_MANIFEST"
      throw error
    })

    if (project === "INVALID_BUNDLED_MANIFEST") {
      return apiError(400, "INVALID_REQUEST", "ZIP 包内的 artifacta.json 无效。", { field: "upload_session_id" })
    }
    if (project === "UPLOAD_SESSION_NOT_FOUND") {
      return apiError(404, "NOT_FOUND", "上传会话不存在或已过期。", { field: "upload_session_id" })
    }
    if (project === "PROJECT_NOT_FOUND") return apiError(404, "NOT_FOUND", "项目不存在。")
    if (!project) return apiError(404, "NOT_FOUND", "文件夹不存在。")

    const database = await readDatabase()
    return created(serializeProjectDetail(database, project))
  }

  if (!htmlFile) return apiError(400, "INVALID_REQUEST", "请上传 html_file 或提供 upload_session_id。", { field: "html_file" })

  const projectId = `proj_${crypto.randomUUID()}`
  const artifact = await saveProjectArtifact(projectId, htmlFile).catch((error) => {
    if (error instanceof Error) return error
    return new Error("看板文件保存失败。")
  })
  if (artifact instanceof Error) return apiError(400, "INVALID_ARTIFACT", artifact.message, { field: "html_file" })

  if (artifact.kind === "zip") {
    return apiError(
      400,
      "DEPRECATED",
      "ZIP 看板包请使用 POST /upload-sessions 创建会话，再通过 upload_session_id 发布。",
      { field: "html_file" }
    )
  }

  const datasetFiles = [
    ...form.getAll("data_files"),
    ...form.getAll("data_files[]"),
    ...form.getAll("data"),
  ].map(asFile).filter(Boolean) as File[]
  const datasets = await Promise.all(
    datasetFiles.map((file) => buildDatasetRecord({ projectId, organizationId: auth.user.organizationId, file }))
  ).catch((error) => {
    if (error instanceof Error) return error
    return new Error("数据集保存失败。")
  })
  if (datasets instanceof Error) return apiError(400, "INVALID_DATASET", datasets.message, { field: "data_files" })

  const project = await updateDatabase<Project>((database) => {
    if (folderId && !database.folders.some((folder) => folder.id === folderId && folder.organizationId === auth.user.organizationId)) {
      throw new Error("FOLDER_NOT_FOUND")
    }

    const createdAt = now()
    const record: Project = {
      id: projectId,
      organizationId: auth.user.organizationId,
      ownerId: auth.user.id,
      folderId,
      name,
      description,
      visibility: visibilityInput as ProjectVisibility,
      htmlArtifact: artifact,
      viewsCount: 0,
      createdAt,
      updatedAt: createdAt,
    }

    database.projects.push(record)
    database.datasets.push(...datasets)
    recordDashboardVersion(database, record, auth.user.id, "Created from direct upload")
    for (const dataset of datasets) recordDatasetVersion(database, dataset, auth.user.id)
    addActivity(database, {
      organizationId: auth.user.organizationId,
      type: "upload",
      userId: auth.user.id,
      action: "上传了新看板",
      target: name,
    })
    recordAudit(database, {
      organizationId: auth.user.organizationId,
      actorUserId: auth.user.id,
      action: "project.create",
      targetType: "project",
      targetId: record.id,
      summary: `Created project ${name}`,
      metadata: { datasets_count: datasets.length },
    })
    emitWebhooks(database, auth.user.organizationId, "project.created", { project_id: record.id, name })

    return record
  }).catch((error) => {
    if (error instanceof Error && error.message === "FOLDER_NOT_FOUND") return null
    throw error
  })

  if (!project) return apiError(404, "NOT_FOUND", "文件夹不存在。")

  const database = await readDatabase()
  return created(serializeProjectDetail(database, project))
}

function asFile(value: FormDataEntryValue | null): File | null {
  return value && typeof value === "object" && "arrayBuffer" in value ? (value as File) : null
}

function nullableString(value: FormDataEntryValue | null) {
  const stringValue = String(value ?? "").trim()
  return !stringValue || stringValue === "null" || stringValue === "root" ? null : stringValue
}
