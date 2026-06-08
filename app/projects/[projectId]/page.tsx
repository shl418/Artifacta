"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import type { ProjectVisibility } from "@/lib/types"
import { Sidebar } from "@/components/sidebar"
import { Header } from "@/components/header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AlertCircle, Clock, Database, Eye, FileBarChart, RefreshCw, Shield, Users } from "lucide-react"
import { useLanguage } from "@/lib/i18n/context"

const visibilityLabel: Record<ProjectVisibility, string> = {
  private: "私有",
  team: "团队",
  public: "公开",
}

interface ProjectDetail {
  id: string
  name: string
  description: string
  visibility: ProjectVisibility
  preview_url: string
  html_url: string
  folder_id: string | null
  views_count: number
  updated_at: string
  artifact: { kind: string; original_name: string; size: number }
  datasets: Array<{
    id: string
    name: string
    file_type: string
    rows: number | null
    columns: number | null
    updated_at: string
    sync_config: { enabled: boolean; source_type: string; last_sync_status: string | null; next_sync_at: string | null }
  }>
  permissions: Array<{ user_id: string; user_name: string; user_email: string; permission: string }>
  recent_activity: Array<{ id: string; type: string; action: string; target: string; created_at: string; user?: { name: string } }>
  sync_scripts?: Array<{
    id: string
    manifest_id: string
    script_path: string
    runtime: string
    outputs: string[]
    schedule: string | null
    enabled: boolean
    last_run_status: string | null
    next_run_at: string | null
  }>
}

export default function ProjectDetailPage() {
  const params = useParams<{ projectId: string }>()
  const { t } = useLanguage()
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [versions, setVersions] = useState<Array<{ id: string; version: number; notes: string; created_at: string }>>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState("")
  const [embedUrl, setEmbedUrl] = useState("")
  const [actionMessage, setActionMessage] = useState("")
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const actionMessageTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showActionMessage = (message: string) => {
    setActionMessage(message)
    if (actionMessageTimer.current) clearTimeout(actionMessageTimer.current)
    actionMessageTimer.current = setTimeout(() => setActionMessage(""), 5000)
  }

  const loadProject = useCallback(async () => {
    const [projectResponse, versionsResponse] = await Promise.all([
      fetch(`/api/v1/projects/${params.projectId}`),
      fetch(`/api/v1/projects/${params.projectId}/versions`),
    ])
    const projectPayload = await projectResponse.json().catch(() => null)
    const versionPayload = await versionsResponse.json().catch(() => null)
    if (!projectResponse.ok) {
      setError(projectPayload?.error?.message ?? t("project.load.error"))
      setIsLoading(false)
      return
    }
    setError("")
    setProject(projectPayload)
    setVersions(versionPayload?.data ?? [])
    setIsLoading(false)
  }, [params.projectId, t])

  useEffect(() => {
    loadProject().catch(() => {
      setError(t("common.error.network"))
      setIsLoading(false)
    })
  }, [loadProject, t])

  const createEmbedLink = async () => {
    if (pendingAction) return
    setPendingAction("embed")
    try {
      const response = await fetch(`/api/v1/projects/${params.projectId}/embed-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expires_in_seconds: 3600 }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        showActionMessage(payload?.error?.message ?? t("project.embed.error"))
        return
      }
      setEmbedUrl(payload.embed_url)
      showActionMessage(t("project.embed.generated"))
    } finally {
      setPendingAction(null)
    }
  }

  const rollbackVersion = async (versionId: string) => {
    if (pendingAction) return
    setPendingAction(`rollback:${versionId}`)
    try {
      const response = await fetch(`/api/v1/projects/${params.projectId}/versions/${versionId}/rollback`, { method: "POST" })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        showActionMessage(payload?.error?.message ?? t("project.versions.rollback.error"))
        return
      }
      showActionMessage(t("project.versions.rollback.success"))
      await loadProject()
    } finally {
      setPendingAction(null)
    }
  }

  const triggerScriptSync = async (scriptId: string) => {
    if (pendingAction) return
    setPendingAction(`sync:${scriptId}`)
    try {
      const response = await fetch(`/api/v1/projects/${params.projectId}/sync-scripts/${scriptId}/trigger`, { method: "POST" })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        showActionMessage(payload?.error?.message ?? t("project.scripts.trigger.error"))
        return
      }
      showActionMessage(`${t("project.scripts.trigger.success")}${payload.job_id}`)
      await loadProject()
    } finally {
      setPendingAction(null)
    }
  }

  const updateVisibility = async (visibility: ProjectVisibility) => {
    const response = await fetch(`/api/v1/projects/${params.projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visibility }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      setError(payload?.error?.message ?? t("project.visibility.update.error"))
      return
    }
    await loadProject()
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 p-2 pl-0">
        <main className="flex-1 flex flex-col bg-card rounded-xl shadow-sm overflow-hidden">
          <Header title={t("project.title")} />
          <div className="flex-1 overflow-y-auto p-6">
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>{t("project.load.error.title")}</AlertTitle>
                <AlertDescription>
                  <p>{error}</p>
                  <Button variant="outline" size="sm" className="mt-2" onClick={loadProject}>
                    <RefreshCw className="h-3.5 w-3.5" />
                    {t("common.retry")}
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {isLoading && !error && (
              <div className="mx-auto max-w-6xl space-y-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-6 w-48" />
                    <Skeleton className="h-4 w-80" />
                  </div>
                  <div className="flex gap-2">
                    <Skeleton className="h-9 w-16" />
                    <Skeleton className="h-9 w-20" />
                    <Skeleton className="h-9 w-32" />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-4">
                  {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
                </div>
                <Skeleton className="h-64" />
              </div>
            )}

            {!isLoading && project && (
              <div className="mx-auto max-w-6xl space-y-6">
                <div className="space-y-4">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <FileBarChart className="h-5 w-5 shrink-0 text-primary" />
                        <h2 className="text-xl font-semibold">{project.name}</h2>
                        <Badge variant="outline">{visibilityLabel[project.visibility]}</Badge>
                      </div>
                      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{project.description || t("project.no_desc")}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button asChild variant="outline" size="sm"><Link href={`/view/${project.id}`}>{t("project.preview")}</Link></Button>
                      <Button variant="outline" size="sm" onClick={createEmbedLink} disabled={pendingAction === "embed"}>{t("project.embed")}</Button>
                      <Select value={project.visibility} onValueChange={(value) => updateVisibility(value as ProjectVisibility)}>
                        <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="private">{t("common.visibility.private")}</SelectItem>
                          <SelectItem value="team">{t("common.visibility.team")}</SelectItem>
                          <SelectItem value="public">{t("common.visibility.public")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {(actionMessage || embedUrl) && (
                    <div className="space-y-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                      {actionMessage && <p className="text-sm text-muted-foreground">{actionMessage}</p>}
                      {embedUrl && (
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">
                            <span className="font-medium">{t("project.embed.label")}</span>
                            <a className="break-all text-primary underline" href={embedUrl} target="_blank" rel="noreferrer">
                              {embedUrl}
                            </a>
                          </p>
                          <p className="text-xs text-amber-600">{t("project.embed.token_warning")}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-4">
                  <Metric icon={Eye} label={t("project.metric.views")} value={project.views_count} />
                  <Metric icon={Database} label={t("project.metric.datasets")} value={project.datasets.length} />
                  <Metric icon={Users} label={t("project.metric.members")} value={project.permissions.length} />
                  <Metric icon={Shield} label={t("project.metric.versions")} value={versions.length} />
                </div>

                <Tabs defaultValue="overview">
                  <TabsList>
                    <TabsTrigger value="overview">{t("project.tab.overview")}</TabsTrigger>
                    <TabsTrigger value="datasets">{t("project.tab.datasets")}</TabsTrigger>
                    <TabsTrigger value="sync-scripts">{t("project.tab.scripts")}</TabsTrigger>
                    <TabsTrigger value="permissions">{t("project.tab.permissions")}</TabsTrigger>
                    <TabsTrigger value="versions">{t("project.tab.versions")}</TabsTrigger>
                    <TabsTrigger value="activity">{t("project.tab.activity")}</TabsTrigger>
                  </TabsList>
                  <TabsContent value="overview" className="mt-4">
                    <Card>
                      <CardHeader>
                        <CardTitle>{t("project.overview.card.title")}</CardTitle>
                        <CardDescription>{t("project.overview.card.desc")}</CardDescription>
                      </CardHeader>
                      <CardContent className="grid gap-3 text-sm md:grid-cols-2">
                        <p><span className="text-muted-foreground">{t("project.overview.id")}</span>{project.id}</p>
                        <p><span className="text-muted-foreground">{t("project.overview.folder")}</span>{project.folder_id ?? t("project.overview.folder.root")}</p>
                        <p><span className="text-muted-foreground">{t("project.overview.artifact")}</span>{project.artifact.original_name} · {project.artifact.kind}</p>
                        <p><span className="text-muted-foreground">{t("project.overview.updated")}</span>{new Date(project.updated_at).toLocaleString()}</p>
                      </CardContent>
                    </Card>
                  </TabsContent>
                  <TabsContent value="datasets" className="mt-4 space-y-3">
                    {project.datasets.length === 0 && (
                      <Card>
                        <CardContent className="p-6 text-sm text-muted-foreground">
                          {t("project.datasets.empty")}
                        </CardContent>
                      </Card>
                    )}
                    {project.datasets.map((dataset) => (
                      <Card key={dataset.id}>
                        <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="font-medium">{dataset.name}</p>
                            <p className="text-xs text-muted-foreground">{dataset.file_type} · {dataset.rows ?? "?"} {t("common.rows")} · {dataset.columns ?? "?"} {t("common.cols")}</p>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Clock className="h-4 w-4" />
                            {dataset.sync_config.enabled ? dataset.sync_config.last_sync_status ?? t("project.datasets.sync.waiting") : t("project.datasets.sync.manual")}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </TabsContent>
                  <TabsContent value="sync-scripts" className="mt-4 space-y-3">
                    {(project.sync_scripts ?? []).length === 0 && (
                      <Card>
                        <CardContent className="p-6 text-sm text-muted-foreground">
                          {t("project.scripts.empty")}
                        </CardContent>
                      </Card>
                    )}
                    {(project.sync_scripts ?? []).map((script) => (
                      <Card key={script.id}>
                        <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="font-medium">{script.manifest_id}</p>
                            <p className="text-xs text-muted-foreground">
                              {script.script_path} · {script.runtime} · {script.outputs.join(", ")}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {t("project.scripts.schedule")}{script.schedule ?? t("project.scripts.schedule.manual")} · {t("project.scripts.next")}{script.next_run_at ? new Date(script.next_run_at).toLocaleString() : t("project.scripts.never")}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={script.enabled ? "default" : "secondary"}>{script.enabled ? t("project.scripts.status.enabled") : t("project.scripts.status.disabled")}</Badge>
                            <Badge variant="outline">{script.last_run_status ?? t("project.scripts.status.unrun")}</Badge>
                            <Button variant="outline" size="sm" disabled={!script.enabled || pendingAction !== null} onClick={() => triggerScriptSync(script.id)}>
                              {t("project.scripts.trigger")}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </TabsContent>
                  <TabsContent value="permissions" className="mt-4 space-y-3">
                    {project.permissions.length === 0 && (
                      <Card>
                        <CardContent className="p-6 text-sm text-muted-foreground">
                          {t("project.permissions.empty")}
                        </CardContent>
                      </Card>
                    )}
                    {project.permissions.map((member) => (
                      <Card key={member.user_id}>
                        <CardContent className="flex items-center justify-between p-4 text-sm">
                          <div>
                            <p className="font-medium">{member.user_name}</p>
                            <p className="text-muted-foreground">{member.user_email}</p>
                          </div>
                          <Badge variant="secondary">{member.permission}</Badge>
                        </CardContent>
                      </Card>
                    ))}
                  </TabsContent>
                  <TabsContent value="versions" className="mt-4 space-y-3">
                    {versions.length === 0 && (
                      <Card>
                        <CardContent className="p-6 text-sm text-muted-foreground">
                          {t("project.versions.empty")}
                        </CardContent>
                      </Card>
                    )}
                    {versions.map((version) => (
                      <Card key={version.id}>
                        <CardContent className="flex flex-col gap-3 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="font-medium">v{version.version}</p>
                            <p className="text-muted-foreground">{version.notes}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-muted-foreground">{new Date(version.created_at).toLocaleString()}</p>
                            <Button variant="outline" size="sm" disabled={pendingAction !== null} onClick={() => rollbackVersion(version.id)}>{t("project.versions.rollback")}</Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </TabsContent>
                  <TabsContent value="activity" className="mt-4 space-y-3">
                    {(project.recent_activity ?? []).length === 0 && (
                      <Card>
                        <CardContent className="p-6 text-sm text-muted-foreground">{t("project.activity.empty")}</CardContent>
                      </Card>
                    )}
                    {(project.recent_activity ?? []).map((item) => (
                      <Card key={item.id}>
                        <CardContent className="flex items-center justify-between p-4 text-sm">
                          <div>
                            <p className="font-medium">{item.action}</p>
                            <p className="text-muted-foreground">{item.target}</p>
                          </div>
                          <p className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

function Metric({ icon: Icon, label, value }: { icon: typeof Eye; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold">{value}</p>
        </div>
        <Icon className="h-5 w-5 text-primary" />
      </CardContent>
    </Card>
  )
}
