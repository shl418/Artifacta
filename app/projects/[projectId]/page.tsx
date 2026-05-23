"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { Sidebar } from "@/components/sidebar"
import { Header } from "@/components/header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AlertCircle, Clock, Database, Eye, FileBarChart, RefreshCw, Shield, Users } from "lucide-react"

type Visibility = "private" | "team" | "public"

interface ProjectDetail {
  id: string
  name: string
  description: string
  visibility: Visibility
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
}

export default function ProjectDetailPage() {
  const params = useParams<{ projectId: string }>()
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [versions, setVersions] = useState<Array<{ id: string; version: number; notes: string; created_at: string }>>([])
  const [error, setError] = useState("")

  const loadProject = useCallback(async () => {
    const [projectResponse, versionsResponse] = await Promise.all([
      fetch(`/api/v1/projects/${params.projectId}`),
      fetch(`/api/v1/projects/${params.projectId}/versions`),
    ])
    const projectPayload = await projectResponse.json().catch(() => null)
    const versionPayload = await versionsResponse.json().catch(() => null)
    if (!projectResponse.ok) {
      setError(projectPayload?.error?.message ?? "无法加载项目详情。")
      return
    }
    setError("")
    setProject(projectPayload)
    setVersions(versionPayload?.data ?? [])
  }, [params.projectId])

  useEffect(() => {
    loadProject().catch(() => setError("网络异常，无法加载项目详情。"))
  }, [loadProject])

  const updateVisibility = async (visibility: Visibility) => {
    const response = await fetch(`/api/v1/projects/${params.projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visibility }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      setError(payload?.error?.message ?? "更新项目失败。")
      return
    }
    await loadProject()
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 p-2 pl-0">
        <main className="flex-1 flex flex-col bg-card rounded-xl shadow-sm overflow-hidden">
          <Header title="项目详情" />
          <div className="flex-1 overflow-y-auto p-6">
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>项目详情加载失败</AlertTitle>
                <AlertDescription>
                  <p>{error}</p>
                  <Button variant="outline" size="sm" className="mt-2" onClick={loadProject}>
                    <RefreshCw className="h-3.5 w-3.5" />
                    重试
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {project && (
              <div className="mx-auto max-w-6xl space-y-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <FileBarChart className="h-5 w-5 text-primary" />
                      <h2 className="text-xl font-semibold">{project.name}</h2>
                      <Badge variant="outline">{project.visibility}</Badge>
                    </div>
                    <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{project.description || "暂无描述"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm"><Link href={`/view/${project.id}`}>预览</Link></Button>
                    <Select value={project.visibility} onValueChange={(value) => updateVisibility(value as Visibility)}>
                      <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="private">私有</SelectItem>
                        <SelectItem value="team">团队</SelectItem>
                        <SelectItem value="public">公开</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-4">
                  <Metric icon={Eye} label="浏览" value={project.views_count} />
                  <Metric icon={Database} label="数据集" value={project.datasets.length} />
                  <Metric icon={Users} label="协作者" value={project.permissions.length} />
                  <Metric icon={Shield} label="版本" value={versions.length} />
                </div>

                <Tabs defaultValue="overview">
                  <TabsList>
                    <TabsTrigger value="overview">概览</TabsTrigger>
                    <TabsTrigger value="datasets">数据集</TabsTrigger>
                    <TabsTrigger value="permissions">协作</TabsTrigger>
                    <TabsTrigger value="versions">版本</TabsTrigger>
                  </TabsList>
                  <TabsContent value="overview" className="mt-4">
                    <Card>
                      <CardHeader>
                        <CardTitle>元数据</CardTitle>
                        <CardDescription>项目、文件和最近更新信息。</CardDescription>
                      </CardHeader>
                      <CardContent className="grid gap-3 text-sm md:grid-cols-2">
                        <p><span className="text-muted-foreground">项目 ID：</span>{project.id}</p>
                        <p><span className="text-muted-foreground">文件夹：</span>{project.folder_id ?? "根目录"}</p>
                        <p><span className="text-muted-foreground">产物：</span>{project.artifact.original_name} · {project.artifact.kind}</p>
                        <p><span className="text-muted-foreground">更新时间：</span>{new Date(project.updated_at).toLocaleString("zh-CN")}</p>
                      </CardContent>
                    </Card>
                  </TabsContent>
                  <TabsContent value="datasets" className="mt-4 space-y-3">
                    {project.datasets.length === 0 && (
                      <Card>
                        <CardContent className="p-6 text-sm text-muted-foreground">
                          该项目还没有绑定数据集。可在上传页添加数据文件，或在 ZIP 发布向导中绑定包内数据文件。
                        </CardContent>
                      </Card>
                    )}
                    {project.datasets.map((dataset) => (
                      <Card key={dataset.id}>
                        <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="font-medium">{dataset.name}</p>
                            <p className="text-xs text-muted-foreground">{dataset.file_type} · {dataset.rows ?? "?"} 行 · {dataset.columns ?? "?"} 列</p>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Clock className="h-4 w-4" />
                            {dataset.sync_config.enabled ? dataset.sync_config.last_sync_status ?? "等待同步" : "手动"}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </TabsContent>
                  <TabsContent value="permissions" className="mt-4 space-y-3">
                    {project.permissions.length === 0 && (
                      <Card>
                        <CardContent className="p-6 text-sm text-muted-foreground">
                          还没有额外协作者。可在设置 → 权限管理 中为团队成员分配 view 或 edit 权限。
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
                          还没有记录看板版本。更新 HTML 或 ZIP 产物后会自动保存版本历史。
                        </CardContent>
                      </Card>
                    )}
                    {versions.map((version) => (
                      <Card key={version.id}>
                        <CardContent className="flex items-center justify-between p-4 text-sm">
                          <div>
                            <p className="font-medium">v{version.version}</p>
                            <p className="text-muted-foreground">{version.notes}</p>
                          </div>
                          <p className="text-xs text-muted-foreground">{new Date(version.created_at).toLocaleString("zh-CN")}</p>
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
