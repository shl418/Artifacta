"use client"

import { FormEvent, useState } from "react"
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
import { CheckCircle2, FileCode2, FileSpreadsheet, Globe, Loader2, Lock, Upload, Users, X } from "lucide-react"
import { cn } from "@/lib/utils"

type Visibility = "private" | "team" | "public"

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

  const publish = async (event: FormEvent) => {
    event.preventDefault()
    if (!htmlFile) return

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

  const addDataFiles = (files: FileList | File[]) => {
    const accepted = Array.from(files).filter((file) => /\.(csv|xlsx|json)$/i.test(file.name))
    setDataFiles((current) => [...current, ...accepted])
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
                  <p className="text-muted-foreground mb-6">{createdProject.name} 已经托管到 DataVision。</p>
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
            <form className="max-w-3xl mx-auto space-y-6" onSubmit={publish}>
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-lg">项目信息</CardTitle>
                  <CardDescription>上传本地生成的 HTML 看板，并选择团队可见性。</CardDescription>
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
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="private"><Lock className="h-4 w-4" />仅自己</SelectItem>
                        <SelectItem value="team"><Users className="h-4 w-4" />团队可见</SelectItem>
                        <SelectItem value="public"><Globe className="h-4 w-4" />公开链接</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileCode2 className="h-5 w-5 text-primary" />
                    看板文件
                  </CardTitle>
                  <CardDescription>支持 `.html` 单文件和 `.zip` 看板包；当前 MVP 中 HTML 可直接预览，ZIP 会作为托管包保存。</CardDescription>
                </CardHeader>
                <CardContent>
                  <div
                    onDragOver={(event) => {
                      event.preventDefault()
                      setIsDraggingHtml(true)
                    }}
                    onDragLeave={() => setIsDraggingHtml(false)}
                    onDrop={(event) => {
                      event.preventDefault()
                      setIsDraggingHtml(false)
                      const file = event.dataTransfer.files[0]
                      if (file && /\.(html|zip)$/i.test(file.name)) setHtmlFile(file)
                    }}
                    onClick={() => document.getElementById("html-input")?.click()}
                    className={cn(
                      "border-2 border-dashed rounded-lg p-8 text-center transition-all cursor-pointer",
                      isDraggingHtml ? "border-primary bg-primary/5" : "border-border/50 hover:border-primary/50",
                      htmlFile && "border-primary/50 bg-primary/5"
                    )}
                  >
                    <input id="html-input" type="file" accept=".html,.zip" className="hidden" onChange={(event) => event.target.files?.[0] && setHtmlFile(event.target.files[0])} />
                    {htmlFile ? (
                      <div className="flex items-center justify-center gap-3">
                        <FileCode2 className="h-8 w-8 text-primary" />
                        <div className="text-left">
                          <p className="font-medium text-foreground">{htmlFile.name}</p>
                          <p className="text-sm text-muted-foreground">{formatSize(htmlFile.size)}</p>
                        </div>
                        <Button variant="ghost" size="icon" type="button" onClick={(event) => { event.stopPropagation(); setHtmlFile(null) }}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                        <p className="text-foreground font-medium">拖放看板文件到这里</p>
                        <p className="text-sm text-muted-foreground mt-1">或点击选择 `.html` / `.zip` 文件</p>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileSpreadsheet className="h-5 w-5 text-emerald-500" />
                    数据集
                  </CardTitle>
                  <CardDescription>可选上传 CSV / Excel / JSON，平台会保存并解析基础元数据。</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div
                    onDragOver={(event) => {
                      event.preventDefault()
                      setIsDraggingData(true)
                    }}
                    onDragLeave={() => setIsDraggingData(false)}
                    onDrop={(event) => {
                      event.preventDefault()
                      setIsDraggingData(false)
                      addDataFiles(event.dataTransfer.files)
                    }}
                    onClick={() => document.getElementById("data-input")?.click()}
                    className={cn(
                      "border-2 border-dashed rounded-lg p-6 text-center transition-all cursor-pointer",
                      isDraggingData ? "border-primary bg-primary/5" : "border-border/50 hover:border-primary/50"
                    )}
                  >
                    <input id="data-input" type="file" accept=".csv,.xlsx,.json" multiple className="hidden" onChange={(event) => event.target.files && addDataFiles(event.target.files)} />
                    <p className="text-sm text-muted-foreground">添加数据文件 · 支持 .csv / .xlsx / .json</p>
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
          </div>
        </main>
      </div>
    </div>
  )
}

function formatSize(size: number) {
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}
