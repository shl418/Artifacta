export interface ArtifactaClientOptions {
  baseUrl: string
  apiKey: string
}

export type ArtifactaProjectVisibility = "private" | "team" | "public"
export type ArtifactaSourceType = "manual" | "cos" | "presto"
export type ArtifactaUpdateMode = "full" | "incremental"

export interface ArtifactaProject {
  id: string
  name: string
  description?: string
  visibility: ArtifactaProjectVisibility
  preview_url?: string
  html_url?: string
  datasets?: ArtifactaDataset[]
}

export interface ArtifactaDataset {
  id: string
  project_id: string
  name: string
  file_name: string
  file_type: string
  size: number
  rows: number | null
  columns: number | null
  version: number
  sync_config: ArtifactaSyncConfig
}

export interface ArtifactaSyncConfig {
  enabled: boolean
  source_type: ArtifactaSourceType
  source_config: Record<string, unknown>
  update_mode: ArtifactaUpdateMode
  schedule: string | null
  last_sync_at?: string | null
  last_sync_status?: string | null
  next_sync_at?: string | null
}

export interface ArtifactaPagination {
  page: number
  per_page: number
  total: number
  total_pages: number
}

export interface ArtifactaProjectListResponse {
  data: ArtifactaProject[]
  pagination?: ArtifactaPagination
}

export interface ArtifactaDatasetListResponse {
  data: ArtifactaDataset[]
}

export interface ArtifactaSyncQueuedResponse {
  job_id: string
  status: string
}

export interface ArtifactaApiErrorEnvelope {
  error: {
    code: string
    message: string
    details?: unknown
  }
}

export interface UploadProjectInput {
  name: string
  description?: string
  visibility?: ArtifactaProjectVisibility
  folderId?: string | null
  htmlFile: Blob
  htmlFileName?: string
}

export interface UploadDatasetInput {
  projectId: string
  file: Blob
  fileName: string
  name?: string
}

export interface SetSyncConfigInput {
  projectId: string
  datasetId: string
  enabled: boolean
  sourceType: ArtifactaSourceType
  sourceConfig?: Record<string, unknown>
  updateMode?: ArtifactaUpdateMode
  schedule?: string | null
  nextSyncAt?: string | null
}

export class ArtifactaApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown

  constructor(status: number, envelope: ArtifactaApiErrorEnvelope) {
    super(envelope.error.message)
    this.name = "ArtifactaApiError"
    this.status = status
    this.code = envelope.error.code
    this.details = envelope.error.details
  }
}

export class ArtifactaClient {
  private readonly baseUrl: string
  private readonly apiKey: string

  constructor(options: ArtifactaClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "")
    this.apiKey = options.apiKey
  }

  listProjects(params: { search?: string; visibility?: ArtifactaProjectVisibility; page?: number; perPage?: number } = {}): Promise<ArtifactaProjectListResponse> {
    const search = new URLSearchParams()
    if (params.search) search.set("search", params.search)
    if (params.visibility) search.set("visibility", params.visibility)
    if (params.page) search.set("page", String(params.page))
    if (params.perPage) search.set("per_page", String(params.perPage))
    return this.request(`/api/v1/projects${querySuffix(search)}`)
  }

  uploadProject(input: UploadProjectInput): Promise<ArtifactaProject> {
    const form = new FormData()
    form.set("name", input.name)
    if (input.description) form.set("description", input.description)
    if (input.visibility) form.set("visibility", input.visibility)
    if (input.folderId) form.set("folder_id", input.folderId)
    form.set("html_file", input.htmlFile, input.htmlFileName ?? "dashboard.html")
    return this.request("/api/v1/projects", { method: "POST", body: form })
  }

  updateHtml(projectId: string, file: Blob, fileName = "dashboard.html"): Promise<ArtifactaProject> {
    const form = new FormData()
    form.set("html_file", file, fileName)
    return this.request(`/api/v1/projects/${encodeURIComponent(projectId)}/html`, { method: "PUT", body: form })
  }

  listDatasets(params: { source?: ArtifactaSourceType | "all"; search?: string } = {}): Promise<ArtifactaDatasetListResponse> {
    const search = new URLSearchParams()
    if (params.source) search.set("source", params.source)
    if (params.search) search.set("search", params.search)
    return this.request(`/api/v1/datasets${querySuffix(search)}`)
  }

  uploadDataset(input: UploadDatasetInput): Promise<ArtifactaDataset> {
    const form = new FormData()
    if (input.name) form.set("name", input.name)
    form.set("file", input.file, input.fileName)
    return this.request(`/api/v1/projects/${encodeURIComponent(input.projectId)}/datasets`, { method: "POST", body: form })
  }

  replaceDataset(projectId: string, datasetId: string, file: Blob, fileName: string): Promise<ArtifactaDataset> {
    const form = new FormData()
    form.set("file", file, fileName)
    return this.request(
      `/api/v1/projects/${encodeURIComponent(projectId)}/datasets/${encodeURIComponent(datasetId)}`,
      { method: "PUT", body: form }
    )
  }

  setSyncConfig(input: SetSyncConfigInput): Promise<ArtifactaSyncConfig> {
    return this.request(
      `/api/v1/projects/${encodeURIComponent(input.projectId)}/datasets/${encodeURIComponent(input.datasetId)}/sync`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: input.enabled,
          source_type: input.sourceType,
          source_config: input.sourceConfig ?? {},
          update_mode: input.updateMode ?? "full",
          schedule: input.schedule ?? null,
          next_sync_at: input.nextSyncAt ?? undefined,
        }),
      }
    )
  }

  triggerSync(projectId: string, datasetId: string): Promise<ArtifactaSyncQueuedResponse> {
    return this.request(
      `/api/v1/projects/${encodeURIComponent(projectId)}/datasets/${encodeURIComponent(datasetId)}/sync/trigger`,
      { method: "POST" }
    )
  }

  async parseApiError(response: Response): Promise<ArtifactaApiError | null> {
    const envelope = await readErrorEnvelope(response)
    return envelope ? new ArtifactaApiError(response.status, envelope) : null
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = {
      ...(init.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${this.apiKey}`,
    }

    const response = await fetch(new URL(path, this.baseUrl), {
      ...init,
      headers,
    })

    if (!response.ok) {
      const envelope = await readErrorEnvelope(response)
      if (envelope) throw new ArtifactaApiError(response.status, envelope)
      throw new Error(`Artifacta request failed: ${response.status} ${response.statusText}`.trim())
    }

    return response.json() as Promise<T>
  }
}

async function readErrorEnvelope(response: Response): Promise<ArtifactaApiErrorEnvelope | null> {
  const payload = (await response.clone().json().catch(() => null)) as Partial<ArtifactaApiErrorEnvelope> | null
  return payload?.error?.code && payload.error.message ? (payload as ArtifactaApiErrorEnvelope) : null
}

function querySuffix(search: URLSearchParams) {
  const query = search.toString()
  return query ? `?${query}` : ""
}
