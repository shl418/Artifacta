"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Header } from "@/components/header"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { AlertCircle, CheckCircle2, Clock, Cloud, Database, FileSpreadsheet, Loader2, RefreshCw, Search, Settings2, Trash2, Upload } from "lucide-react"
import { cn } from "@/lib/utils"

type SourceType = "manual" | "cos" | "presto"

interface DatasetSummary {
  id: string
  project_id: string
  name: string
  description: string
  file_type: string
  size: number
  rows: number | null
  columns: number | null
  updated_at: string
  project: { id: string; name: string }
  sync_config: {
    enabled: boolean
    source_type: SourceType
    source_config: Record<string, unknown>
    update_mode: "full" | "incremental"
    schedule: string | null
    last_sync_status: "pending" | "running" | "success" | "failed" | null
    last_sync_at: string | null
  }
}

interface DatasetPreviewPayload {
  parsed: boolean
  message?: string
  schema: Array<{ name: string; type: string }>
  rows: Array<Record<string, unknown>>
}

interface DatasetVersionPayload {
  data: Array<{
    id: string
    version: number
    file_name: string
    file_type: string
    rows: number | null
    columns: number | null
    created_at: string
  }>
}

const sourceLabels = {
  manual: { label: "手动上传", icon: Upload, color: "text-muted-foreground" },
  cos: { label: "COS 对象存储", icon: Cloud, color: "text-blue-500" },
  presto: { label: "Presto SQL", icon: Database, color: "text-violet-500" },
}

export default function DatasetsPage() {
  const [datasets, setDatasets] = useState<DatasetSummary[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [sourceFilter, setSourceFilter] = useState("all")
  const [selectedDataset, setSelectedDataset] = useState<DatasetSummary | null>(null)
  const [pendingDelete, setPendingDelete] = useState<DatasetSummary | null>(null)
  const [error, setError] = useState("")
  const [queuedSyncIds, setQueuedSyncIds] = useState<Set<string>>(new Set())

  const loadDatasets = useCallback(async () => {
    const params = new URLSearchParams()
    if (searchQuery) params.set("search", searchQuery)
    if (sourceFilter !== "all") params.set("source", sourceFilter)
    const response = await fetch(`/api/v1/datasets?${params.toString()}`)
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      setError(payload?.error?.message ?? "无法加载数据集。")
      return
    }
    setError("")
    setDatasets(payload.data)
  }, [searchQuery, sourceFilter])

  useEffect(() => {
    loadDatasets().catch(() => {
      setDatasets([])
      setError("网络异常，无法加载数据集。")
    })
  }, [loadDatasets])

  const stats = useMemo(() => ({
    total: datasets.length,
    automated: datasets.filter((dataset) => dataset.sync_config.source_type !== "manual").length,
    success: datasets.filter((dataset) => dataset.sync_config.last_sync_status === "success").length,
    failed: datasets.filter((dataset) => dataset.sync_config.last_sync_status === "failed").length,
  }), [datasets])

  const triggerSync = async (dataset: DatasetSummary) => {
    const response = await fetch(`/api/v1/projects/${dataset.project_id}/datasets/${dataset.id}/sync/trigger`, { method: "POST" })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      setError(payload?.error?.message ?? "触发同步失败。")
      return
    }
    setQueuedSyncIds((current) => new Set(current).add(dataset.id))
    await loadDatasets()
  }

  const deleteDataset = async () => {
    if (!pendingDelete) return
    const response = await fetch(`/api/v1/projects/${pendingDelete.project_id}/datasets/${pendingDelete.id}`, { method: "DELETE" })
    setPendingDelete(null)
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      setError(payload?.error?.message ?? "删除数据集失败。")
      return
    }
    await loadDatasets()
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 p-2 pl-0">
        <main className="flex-1 flex flex-col bg-card rounded-xl shadow-sm overflow-hidden">
          <Header title="数据集" />
          <div className="flex-1 overflow-y-auto p-6">
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="搜索数据集..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="pl-9 bg-secondary/50 border-border/50" />
              </div>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="w-44 bg-secondary/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部来源</SelectItem>
                  <SelectItem value="cos">COS 对象存储</SelectItem>
                  <SelectItem value="presto">Presto SQL</SelectItem>
                  <SelectItem value="manual">手动上传</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <MetricCard label="总数据集" value={stats.total} />
              <MetricCard label="自动更新" value={stats.automated} />
              <MetricCard label="同步正常" value={stats.success} tone="success" />
              <MetricCard label="同步失败" value={stats.failed} tone="danger" />
            </div>

            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>数据集操作失败</AlertTitle>
                <AlertDescription>
                  <p>{error}</p>
                  <Button variant="outline" size="sm" className="mt-2" onClick={() => loadDatasets()}>
                    <RefreshCw className="h-3.5 w-3.5" />
                    重试
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-3">
              {!error && datasets.length === 0 && (
                <Empty className="border py-16">
                  <EmptyHeader>
                    <EmptyMedia variant="icon"><FileSpreadsheet /></EmptyMedia>
                    <EmptyTitle>还没有数据集</EmptyTitle>
                    <EmptyDescription>上传项目时附加 CSV、TSV、JSON 或 JSONL 后，这里会显示字段、样例和同步状态。</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
              {datasets.map((dataset) => {
                const sourceInfo = sourceLabels[dataset.sync_config.source_type]
                const SourceIcon = sourceInfo.icon
                const syncState = queuedSyncIds.has(dataset.id) ? { label: "已排队", icon: Clock, color: "text-primary", spinning: false } : getSyncState(dataset)
                const StatusIcon = syncState.icon
                return (
                  <Card key={dataset.id} className="border-border bg-card hover:border-primary/30 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="flex items-start gap-4 min-w-0">
                          <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                            <FileSpreadsheet className="h-5 w-5 text-emerald-500" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-medium text-foreground truncate">{dataset.name}</h3>
                              <Badge variant="secondary" className="text-xs shrink-0">{formatSize(dataset.size)}</Badge>
                              <Badge variant="outline" className="text-xs shrink-0">{dataset.file_type}</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mb-2">{dataset.description || dataset.project.name}</p>
                            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                              <span>{dataset.rows ?? "?"} 行</span>
                              <span>{dataset.columns ?? "?"} 列</span>
                              <span>用于 {dataset.project.name}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 shrink-0">
                          <div className="text-right">
                            <div className={cn("flex items-center justify-end gap-1.5 text-sm", sourceInfo.color)}>
                              <SourceIcon className="h-4 w-4" />
                              <span>{sourceInfo.label}</span>
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">{dataset.sync_config.schedule || "手动"}</div>
                          </div>

                          <div className={cn("flex items-center gap-1.5 text-sm min-w-24", syncState.color)}>
                            <StatusIcon className={cn("h-4 w-4", syncState.spinning && "animate-spin")} />
                            <span>{syncState.label}</span>
                          </div>

                          {dataset.sync_config.source_type !== "manual" && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => triggerSync(dataset)}>
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedDataset(dataset)}>
                            <Settings2 className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setPendingDelete(dataset)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        </main>
      </div>

      <DatasetConfigDialog dataset={selectedDataset} open={!!selectedDataset} onOpenChange={(open) => !open && setSelectedDataset(null)} onSaved={loadDatasets} />

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除数据集</AlertDialogTitle>
            <AlertDialogDescription>
              这会删除 “{pendingDelete?.name}” 的文件、同步历史和版本记录，项目看板中引用它的代码不会自动修改。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={deleteDataset}>
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function getSyncState(dataset: DatasetSummary) {
  const status = dataset.sync_config.last_sync_status

  if (dataset.sync_config.source_type === "manual") {
    return { label: "无需同步", icon: CheckCircle2, color: "text-muted-foreground", spinning: false }
  }

  if (status === "success") return { label: "同步成功", icon: CheckCircle2, color: "text-emerald-500", spinning: false }
  if (status === "failed") return { label: "同步失败", icon: AlertCircle, color: "text-destructive", spinning: false }
  if (status === "running") return { label: "同步中", icon: Loader2, color: "text-primary", spinning: true }
  return { label: "等待同步", icon: Clock, color: "text-muted-foreground", spinning: false }
}

function MetricCard({ label, value, tone }: { label: string; value: number; tone?: "success" | "danger" }) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="pt-4 pb-4">
        <div className={cn("text-2xl font-semibold text-foreground", tone === "success" && "text-emerald-500", tone === "danger" && "text-destructive")}>{value}</div>
        <div className="text-sm text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  )
}

function DatasetConfigDialog({ dataset, open, onOpenChange, onSaved }: { dataset: DatasetSummary | null; open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => Promise<void> }) {
  const [sourceType, setSourceType] = useState<SourceType>("manual")
  const [schedule, setSchedule] = useState("")
  const [sourceConfig, setSourceConfig] = useState("")
  const [dialogError, setDialogError] = useState("")
  const [preview, setPreview] = useState<DatasetPreviewPayload | null>(null)
  const [versions, setVersions] = useState<DatasetVersionPayload["data"]>([])

  useEffect(() => {
    if (!dataset) return
    setSourceType(dataset.sync_config.source_type)
    setSchedule(dataset.sync_config.schedule ?? "")
    setSourceConfig(JSON.stringify(dataset.sync_config.source_config ?? {}, null, 2))
    setDialogError("")
    Promise.all([
      fetch(`/api/v1/projects/${dataset.project_id}/datasets/${dataset.id}/preview`).then((response) => response.json()),
      fetch(`/api/v1/projects/${dataset.project_id}/datasets/${dataset.id}/versions`).then((response) => response.json()),
    ])
      .then(([previewPayload, versionPayload]) => {
        if (previewPayload?.error) setDialogError(previewPayload.error.message)
        else setPreview(previewPayload)
        if (versionPayload?.data) setVersions(versionPayload.data)
      })
      .catch(() => setDialogError("无法加载数据集预览。"))
  }, [dataset])

  const save = async () => {
    if (!dataset) return
    let parsedConfig: Record<string, unknown> = {}
    try {
      parsedConfig = sourceConfig ? JSON.parse(sourceConfig) : {}
    } catch {
      parsedConfig = { raw: sourceConfig }
    }
    const response = await fetch(`/api/v1/projects/${dataset.project_id}/datasets/${dataset.id}/sync`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: sourceType !== "manual",
        source_type: sourceType,
        source_config: parsedConfig,
        update_mode: "full",
        schedule: sourceType === "manual" ? null : schedule || "0 8 * * *",
      }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      setDialogError(payload?.error?.message ?? "保存同步配置失败。")
      return
    }
    onOpenChange(false)
    await onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>配置数据更新</DialogTitle>
        </DialogHeader>
        {dialogError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>数据集配置失败</AlertTitle>
            <AlertDescription>{dialogError}</AlertDescription>
          </Alert>
        )}
        <Tabs defaultValue="sync" className="py-4">
          <TabsList>
            <TabsTrigger value="sync">同步</TabsTrigger>
            <TabsTrigger value="preview">预览</TabsTrigger>
            <TabsTrigger value="history">版本</TabsTrigger>
          </TabsList>
          <TabsContent value="sync" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>数据来源</Label>
              <Select value={sourceType} onValueChange={(value) => setSourceType(value as SourceType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">手动上传</SelectItem>
                  <SelectItem value="cos">S3/COS/R2 对象存储</SelectItem>
                  <SelectItem value="presto">Presto / Trino SQL</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {sourceType !== "manual" && (
              <>
                <div className="rounded-lg border bg-secondary/20 p-3 text-xs text-muted-foreground">
                  对象存储支持 <code>bucket</code> + <code>key</code>；Presto/Trino 支持 <code>endpoint</code> + <code>query</code>；本地开发也可以继续使用 <code>mock_rows</code>。
                </div>
              <div className="space-y-2">
                <Label>Cron 计划</Label>
                <Input value={schedule} onChange={(event) => setSchedule(event.target.value)} placeholder="0 8 * * *" />
              </div>
              <div className="space-y-2">
                <Label>来源配置 JSON</Label>
                <Textarea className="font-mono text-sm" rows={6} value={sourceConfig} onChange={(event) => setSourceConfig(event.target.value)} />
              </div>
              </>
            )}
          </TabsContent>
          <TabsContent value="preview" className="pt-4">
            {preview?.parsed === false && <p className="text-sm text-muted-foreground">{preview.message}</p>}
            {preview?.schema?.length ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {preview.schema.map((column) => (
                    <Badge key={column.name} variant="outline">{column.name}: {column.type}</Badge>
                  ))}
                </div>
                <div className="max-h-64 overflow-auto rounded-lg border">
                  <pre className="p-3 text-xs">{JSON.stringify(preview.rows, null, 2)}</pre>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">暂无可结构化预览的字段。</p>
            )}
          </TabsContent>
          <TabsContent value="history" className="pt-4">
            <div className="space-y-2">
              {versions.length === 0 && <p className="text-sm text-muted-foreground">暂无版本记录。</p>}
              {versions.map((version) => (
                <div key={version.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <div>
                    <p className="font-medium">v{version.version} · {version.file_name}</p>
                    <p className="text-xs text-muted-foreground">{version.rows ?? "?"} 行 · {version.columns ?? "?"} 列 · {version.file_type}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{new Date(version.created_at).toLocaleString("zh-CN")}</p>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={save}>保存配置</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function formatSize(size: number) {
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}
