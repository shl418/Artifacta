"use client"

import { FormEvent, useMemo, useState } from "react"
import Link from "next/link"
import { Sidebar } from "@/components/sidebar"
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { CheckCircle2, FileCode2, FileSpreadsheet, Globe, Loader2, Lock, Upload, Users, X } from "lucide-react"
import { cn } from "@/lib/utils"

type Visibility = "private" | "team" | "public"

interface BundleFileEntry {
  path: string
  size: number
  extension: string
  inferred_dataset: boolean
}

interface DatasetSelection {
  bundle_path: string
  name: string
  refresh: "manual" | "sync"
  selected: boolean
}

export default function UploadPage() {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [visibility, setVisibility] = useState<Visibility>("team")
  const [htmlFile, setHtmlFile] = useState<File | null>(null)
  const [dataFiles, setDataFiles] = useState<File[]>([])
  const [isDraggingHtml, setIsDraggingHtml] = useState(false)
  const [isDraggingData, setIsDraggingData] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [createdProject, setCreatedProject] = useState<{ id: string; name: string; preview_url: string } | null>(null)
  const [zipStep, setZipStep] = useState<1 | 2 | 3>(1)
  const [uploadSessionId, setUploadSessionId] = useState<string | null>(null)
  const [fileTree, setFileTree] = useState<BundleFileEntry[]>([])
  const [datasetSelections, setDatasetSelections] = useState<DatasetSelection[]>([])
  const [manifestDetected, setManifestDetected] = useState(false)

  const isZipBundle = Boolean(htmlFile?.name.toLowerCase().endsWith(".zip"))
const selectedDatasets = useMemo(() => datasetSelections.filter((item) => item.selected), [datasetSelections])

  const publishHtml = async (event: FormEvent) => {
    event.preventDefault()
    if (!htmlFile || isZipBundle) return

    setIsSubmitting(true)
    setError("")
    const form = new FormData()
    form.set("name", name)
    form.set("description", description)
    form.set("visibility", visibility)
    form.set("html_file", htmlFile)
    dataFiles.forEach((file) => form.append("data_files", file))

    const response = await fetch("/api/v1/projects", { method: "POST", body: form })
    const payload = await response.json().catch(() => null)
    setIsSubmitting(false)

    if (!response.ok) {
      setError(payload?.error?.message ?? "上传失败，请检查文件后重试。")
      return
    }

    setCreatedProject({ id: payload.id, name: payload.name, preview_url: payload.preview_url })
  }

  const startZipSession = async () => {
    if (!htmlFile || !name.trim()) return

    setIsSubmitting(true)
    setError("")
    const form = new FormData()
    form.set("file", htmlFile)

    const response = await fetch("/api/v1/upload-sessions", { method: "POST", body: form })
    const payload = await response.json().catch(() => null)
    setIsSubmitting(false)

    if (!response.ok) {
      setError(payload?.error?.message ?? "无法解析 ZIP 包，请检查后重试。")
      return
    }

    const tree = (payload.file_tree ?? []) as BundleFileEntry[]
    const detected = Boolean(payload.manifest_detected)
    setUploadSessionId(payload.session_id)
    setFileTree(tree)
    setManifestDetected(detected)
    setDatasetSelections(
      tree.map((entry) => ({
        bundle_path: entry.path,
        name: entry.path.split("/").pop() ?? entry.path,
        refresh: "manual" as const,
        selected: entry.inferred_dataset,
      }))
    )
    setZipStep(detected ? 3 : 2)
  }

  const publishZipBundle = async () => {
    if (!uploadSessionId) return

    setIsSubmitting(true)
    setError("")
    const form = new FormData()
    form.set("name", name)
    form.set("description", description)
    form.set("visibility", visibility)
    form.set("upload_session_id", uploadSessionId)
    if (manifestDetected) form.set("manifest_mode", "auto")
    form.set(
      "datasets",
      JSON.stringify(
        selectedDatasets.map((item) => ({
          bundle_path: item.bundle_path,
          name: item.name,
          refresh: item.refresh,
        }))
      )
    )

    const response = await fetch("/api/v1/projects", { method: "POST", body: form })
    const payload = await response.json().catch(() => null)
    setIsSubmitting(false)

    if (!response.ok) {
      setError(payload?.error?.message ?? "发布失败，请检查配置后重试。")
      return
    }

    setCreatedProject({ id: payload.id, name: payload.name, preview_url: payload.preview_url })
  }

  const addDataFiles = (files: FileList | File[]) => {
    const accepted = Array.from(files).filter((file) => /\.(csv|tsv|json|jsonl|xlsx)$/i.test(file.name))
    setDataFiles((current) => [...current, ...accepted])
  }

  const resetZipWizard = () => {
    setZipStep(1)
    setUploadSessionId(null)
    setFileTree([])
    setDatasetSelections([])
    setManifestDetected(false)
  }

  if (createdProject) {
    return (
      <div className="flex h-screen bg-background">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 p-2 pl-0">
          <main className="flex-1 flex flex-col bg-card rounded-xl shadow-sm overflow-hidden">
            <Header title="创建项目" />
            <div className="flex-1 overflow-y-auto p-6 grid place-items-center">
              <Card className="w-full max-w-xl border-primary/20 bg-card">
                <CardContent className="pt-8 pb-8 text-center">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 className="h-8 w-8 text-primary" />
                  </div>
                  <h2 className="text-xl font-semibold text-foreground mb-2">项目发布成功</h2>
                  <p className="text-muted-foreground mb-6">{createdProject.name} 已经托管到 Artifacta。</p>
                  <div className="flex justify-center gap-3">
                    <Button variant="secondary" onClick={() => window.location.reload()}>继续上传</Button>
                    <Button asChild>
                      <Link href={`/view/${createdProject.id}`}>查看项目</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </main>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 p-2 pl-0">
        <main className="flex-1 flex flex-col bg-card rounded-xl shadow-sm overflow-hidden">
          <Header title="创建项目" />
          <div className="flex-1 overflow-y-auto p-6">
            <div className="mx-auto mb-6 max-w-3xl rounded-lg border bg-secondary/20 p-4 text-sm text-muted-foreground">
              <div className="grid gap-2 md:grid-cols-2">
                <p><span className="font-medium text-foreground">应用文件：</span>HTML 或 ZIP，最大 100 MB。</p>
                <p><span className="font-medium text-foreground">ZIP 安全限制：</span>最多 500 个文件，单文件 25 MB，解压后总计 100 MB。</p>
                <p><span className="font-medium text-foreground">数据集：</span>单文件最大 50 MB。</p>
                <p><span className="font-medium text-foreground">结构化预览：</span>CSV、TSV、JSON、JSONL；XLSX 会保存但不解析字段。</p>
              </div>
            </div>
            {isZipBundle ? (
              <div className="max-w-3xl mx-auto space-y-6">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant={zipStep === 1 ? "default" : "secondary"}>1. 上传</Badge>
                  <Badge variant={zipStep === 2 ? "default" : "secondary"}>2. 数据集</Badge>
                  <Badge variant={zipStep === 3 ? "default" : "secondary"}>3. 发布</Badge>
                </div>

                {zipStep === 1 && (
                  <>
                    <Card>
                      <CardHeader>
                        <CardTitle>项目信息</CardTitle>
                        <CardDescription>上传 ZIP 看板包，下一步会引导你绑定包内数据文件。</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="zip-name">项目名称</Label>
                          <Input id="zip-name" value={name} onChange={(event) => setName(event.target.value)} required />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="zip-description">描述</Label>
                          <Textarea id="zip-description" value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
                        </div>
                        <div className="space-y-2">
                          <Label>访问权限</Label>
                          <Select value={visibility} onValueChange={(value) => setVisibility(value as Visibility)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="private">仅自己</SelectItem>
                              <SelectItem value="team">团队可见</SelectItem>
                              <SelectItem value="public">公开链接</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <ZipDropZone htmlFile={htmlFile} isDragging={isDraggingHtml} setDragging={setIsDraggingHtml} onFile={(file) => { setHtmlFile(file); resetZipWizard() }} onClear={() => { setHtmlFile(null); resetZipWizard() }} />
                      </CardContent>
                    </Card>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                    <div className="flex justify-end">
                      <Button type="button" disabled={!name || !htmlFile || isSubmitting} onClick={startZipSession}>
                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        配置数据集
                      </Button>
                    </div>
                  </>
                )}

                {zipStep === 2 && (
                  <>
                    <Card>
                      <CardHeader>
                        <CardTitle>数据集配置</CardTitle>
                        <CardDescription>
                          {manifestDetected
                            ? "检测到 artifacta.json，发布时将自动导入清单中的数据集与 sync_scripts。"
                            : "选择包内数据文件，并标记为静态（manual）或可同步（sync）。"}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setDatasetSelections((current) =>
                                current.map((item) => ({ ...item, selected: fileTree.find((entry) => entry.path === item.bundle_path)?.inferred_dataset ?? false }))
                              )
                            }
                          >
                            选择全部数据文件
                          </Button>
                          <Button type="button" variant="outline" size="sm" onClick={() => setDatasetSelections((current) => current.map((item) => ({ ...item, selected: false })))}>
                            清空
                          </Button>
                        </div>
                        <div className="space-y-3 max-h-[420px] overflow-y-auto">
                          {fileTree.map((entry) => {
                            const selection = datasetSelections.find((item) => item.bundle_path === entry.path)
                            if (!selection) return null
                            return (
                              <div key={entry.path} className="rounded-lg border p-3 space-y-3">
                                <label className="flex items-center gap-3">
                                  <Checkbox checked={selection.selected} onCheckedChange={(checked) => setDatasetSelections((current) => current.map((item) => item.bundle_path === selection.bundle_path ? { ...item, selected: checked === true } : item))} />
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium truncate">{entry.path}</p>
                                    <p className="text-xs text-muted-foreground">{formatSize(entry.size)} · .{entry.extension}</p>
                                  </div>
                                </label>
                                {selection.selected && (
                                  <div className="grid gap-3 sm:grid-cols-2 pl-7">
                                    <div className="space-y-1">
                                      <Label>显示名称</Label>
                                      <Input value={selection.name} onChange={(event) => setDatasetSelections((current) => current.map((item) => item.bundle_path === selection.bundle_path ? { ...item, name: event.target.value } : item))} />
                                    </div>
                                    <div className="space-y-1">
                                      <Label>刷新方式</Label>
                                      <Select value={selection.refresh} onValueChange={(value) => setDatasetSelections((current) => current.map((item) => item.bundle_path === selection.bundle_path ? { ...item, refresh: value as "manual" | "sync" } : item))}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="manual">静态（manual）</SelectItem>
                                          <SelectItem value="sync">可同步（sync）</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </CardContent>
                    </Card>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                    <div className="flex justify-between">
                      <Button type="button" variant="outline" onClick={() => setZipStep(1)}>返回</Button>
                      <Button type="button" onClick={() => setZipStep(3)}>确认发布</Button>
                    </div>
                  </>
                )}

                {zipStep === 3 && (
                  <>
                    <Card>
                      <CardHeader>
                        <CardTitle>确认发布</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2 text-sm">
                        <p><span className="text-muted-foreground">项目：</span>{name}</p>
                        <p><span className="text-muted-foreground">可见性：</span>{visibility}</p>
                        <p><span className="text-muted-foreground">ZIP 文件：</span>{htmlFile?.name}</p>
                        <p><span className="text-muted-foreground">绑定数据集：</span>{manifestDetected ? "来自 artifacta.json" : selectedDatasets.length}</p>
                        <ul className="list-disc pl-5 text-muted-foreground">
                          {selectedDatasets.map((item) => (
                            <li key={item.bundle_path}>{item.name} ({item.refresh})</li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                    <div className="flex justify-between">
                      <Button type="button" variant="outline" onClick={() => setZipStep(2)}>返回</Button>
                      <Button type="button" disabled={isSubmitting} onClick={publishZipBundle}>
                        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        发布项目
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <form className="max-w-3xl mx-auto space-y-6" onSubmit={publishHtml}>
                <Card className="border-border bg-card">
                  <CardHeader>
                    <CardTitle className="text-lg">项目信息</CardTitle>
                    <CardDescription>上传本地生成的 HTML 应用，并选择团队可见性。</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">项目名称</Label>
                      <Input id="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：Q2 销售分析看板" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="description">描述</Label>
                      <Textarea id="description" value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
                    </div>
                    <div className="space-y-2">
                      <Label>访问权限</Label>
                      <Select value={visibility} onValueChange={(value) => setVisibility(value as Visibility)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="private"><Lock className="h-4 w-4" />仅自己</SelectItem>
                          <SelectItem value="team"><Users className="h-4 w-4" />团队可见</SelectItem>
                          <SelectItem value="public"><Globe className="h-4 w-4" />公开链接</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2"><FileCode2 className="h-5 w-5 text-primary" />应用文件</CardTitle>
                    <CardDescription>支持 `.html` 单文件；ZIP 看板包会进入三步配置向导。</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ZipDropZone htmlFile={htmlFile} isDragging={isDraggingHtml} setDragging={setIsDraggingHtml} onFile={setHtmlFile} onClear={() => setHtmlFile(null)} />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-emerald-500" />数据集</CardTitle>
                    <CardDescription>可选上传 CSV / TSV / JSON / JSONL / XLSX；XLSX 会保存但不做结构化解析。</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div
                      onDragOver={(event) => { event.preventDefault(); setIsDraggingData(true) }}
                      onDragLeave={() => setIsDraggingData(false)}
                      onDrop={(event) => { event.preventDefault(); setIsDraggingData(false); addDataFiles(event.dataTransfer.files) }}
                      onClick={() => document.getElementById("data-input")?.click()}
                      className={cn("border-2 border-dashed rounded-lg p-6 text-center transition-all cursor-pointer", isDraggingData ? "border-primary bg-primary/5" : "border-border/50 hover:border-primary/50")}
                    >
                      <input id="data-input" type="file" accept=".csv,.tsv,.json,.jsonl,.xlsx" multiple className="hidden" onChange={(event) => event.target.files && addDataFiles(event.target.files)} />
                      <p className="text-sm text-muted-foreground">添加数据文件 · CSV / TSV / JSON / JSONL 可预览，XLSX 仅存储</p>
                    </div>
                    <div className="space-y-2">
                      {dataFiles.map((file, index) => (
                        <div key={`${file.name}-${index}`} className="flex items-center justify-between rounded-lg bg-secondary/30 p-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <FileSpreadsheet className="h-4 w-4 text-emerald-500" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{file.name}</p>
                              <p className="text-xs text-muted-foreground">{formatSize(file.size)}</p>
                            </div>
                          </div>
                          <Badge variant="secondary">待上传</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {error && <p className="text-sm text-destructive">{error}</p>}
                <div className="flex justify-end">
                  <Button type="submit" disabled={!name || !htmlFile || isSubmitting}>
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    发布项目
                  </Button>
                </div>
              </form>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

function ZipDropZone({
  htmlFile,
  isDragging,
  setDragging,
  onFile,
  onClear,
}: {
  htmlFile: File | null
  isDragging: boolean
  setDragging: (value: boolean) => void
  onFile: (file: File) => void
  onClear: () => void
}) {
  return (
    <div
      onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        const file = event.dataTransfer.files[0]
        if (file && /\.(html|zip)$/i.test(file.name)) onFile(file)
      }}
      onClick={() => document.getElementById("html-input")?.click()}
      className={cn(
        "border-2 border-dashed rounded-lg p-8 text-center transition-all cursor-pointer",
        isDragging ? "border-primary bg-primary/5" : "border-border/50 hover:border-primary/50",
        htmlFile && "border-primary/50 bg-primary/5"
      )}
    >
      <input id="html-input" type="file" accept=".html,.zip" className="hidden" onChange={(event) => event.target.files?.[0] && onFile(event.target.files[0])} />
      {htmlFile ? (
        <div className="flex items-center justify-center gap-3">
          <FileCode2 className="h-8 w-8 text-primary" />
          <div className="text-left">
            <p className="font-medium text-foreground">{htmlFile.name}</p>
            <p className="text-sm text-muted-foreground">{formatSize(htmlFile.size)}</p>
          </div>
          <Button variant="ghost" size="icon" type="button" onClick={(event) => { event.stopPropagation(); onClear() }}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <>
          <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-foreground font-medium">拖放 HTML 或 ZIP 文件到这里</p>
        </>
      )}
    </div>
  )
}

function formatSize(size: number) {
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}
