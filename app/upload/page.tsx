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
import { CheckCircle2, FileCode2, Globe, Loader2, Lock, Upload, Users, X } from "lucide-react"
import { cn } from "@/lib/utils"

type Visibility = "private" | "team" | "public"

export default function UploadPage() {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [visibility, setVisibility] = useState<Visibility>("team")
  const [htmlFile, setHtmlFile] = useState<File | null>(null)
  const [isDraggingHtml, setIsDraggingHtml] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [createdProject, setCreatedProject] = useState<{ id: string; name: string; preview_url: string } | null>(null)

  const isZipBundle = Boolean(htmlFile?.name.toLowerCase().endsWith(".zip"))

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

    const response = await fetch("/api/v1/projects", { method: "POST", body: form })
    const payload = await response.json().catch(() => null)
    setIsSubmitting(false)

    if (!response.ok) {
      setError(payload?.error?.message ?? "上传失败，请检查文件后重试。")
      return
    }

    setCreatedProject({ id: payload.id, name: payload.name, preview_url: payload.preview_url })
  }

  const publishZip = async (event: FormEvent) => {
    event.preventDefault()
    if (!htmlFile || !isZipBundle) return

    setIsSubmitting(true)
    setError("")

    const sessionForm = new FormData()
    sessionForm.set("file", htmlFile)
    const sessionResponse = await fetch("/api/v1/upload-sessions", { method: "POST", body: sessionForm })
    const sessionPayload = await sessionResponse.json().catch(() => null)

    if (!sessionResponse.ok) {
      setIsSubmitting(false)
      setError(sessionPayload?.error?.message ?? "无法解析 ZIP 包，请检查后重试。")
      return
    }

    const publishForm = new FormData()
    publishForm.set("name", name)
    publishForm.set("description", description)
    publishForm.set("visibility", visibility)
    publishForm.set("upload_session_id", sessionPayload.session_id)

    const response = await fetch("/api/v1/projects", { method: "POST", body: publishForm })
    const payload = await response.json().catch(() => null)
    setIsSubmitting(false)

    if (!response.ok) {
      setError(payload?.error?.message ?? "发布失败，请检查 ZIP 包后重试。")
      return
    }

    setCreatedProject({ id: payload.id, name: payload.name, preview_url: payload.preview_url })
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

  const onSubmit = isZipBundle ? publishZip : publishHtml

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
                <p><span className="font-medium text-foreground">数据文件：</span>放在 ZIP 包内（或由包内 artifacta.json 声明）；单 HTML 仅支持内联数据。</p>
                <p><span className="font-medium text-foreground">发布后同步：</span>可在项目设置或数据集页为包内数据配置 COS / Presto 等同步源。</p>
              </div>
            </div>

            <form className="max-w-3xl mx-auto space-y-6" onSubmit={onSubmit}>
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-lg">项目信息</CardTitle>
                  <CardDescription>
                    {isZipBundle
                      ? "上传 ZIP 看板包；CSV/JSON 等数据文件请与 HTML 放在同一包内。"
                      : "上传单文件 HTML 应用；若需 fetch 外部数据，请打成 ZIP 包上传。"}
                  </CardDescription>
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
                  <CardDescription>支持 `.html` 单文件，或包含 `index.html` 与数据文件的 `.zip` 看板包。</CardDescription>
                </CardHeader>
                <CardContent>
                  <ZipDropZone htmlFile={htmlFile} isDragging={isDraggingHtml} setDragging={setIsDraggingHtml} onFile={setHtmlFile} onClear={() => setHtmlFile(null)} />
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
