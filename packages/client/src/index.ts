export interface ArtifactaClientOptions {
  baseUrl: string
  apiKey: string
}

export type ArtifactaProjectVisibility = "private" | "team" | "public"

export interface ArtifactaProject {
  id: string
  name: string
  visibility: ArtifactaProjectVisibility
  preview_url?: string
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

export interface ArtifactaSyncQueuedResponse {
  job_id: string
  status: string
}

export class ArtifactaClient {
  private readonly baseUrl: string
  private readonly apiKey: string

  constructor(options: ArtifactaClientOptions) {
    this.baseUrl = options.baseUrl
    this.apiKey = options.apiKey
  }

  listProjects(): Promise<ArtifactaProjectListResponse> {
    return this.request("/api/v1/projects")
  }

  triggerSync(projectId: string, datasetId: string): Promise<ArtifactaSyncQueuedResponse> {
    return this.request(
      `/api/v1/projects/${encodeURIComponent(projectId)}/datasets/${encodeURIComponent(datasetId)}/sync/trigger`,
      { method: "POST" }
    )
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
      throw new Error(`Artifacta request failed: ${response.status} ${response.statusText}`.trim())
    }

    return response.json() as Promise<T>
  }
}
