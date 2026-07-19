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
import type { ProjectVisibility } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/lib/i18n/context"

export default function UploadPage() {
  const { t } = useLanguage()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [visibility, setProjectVisibility] = useState<ProjectVisibility>("team")
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
      setError(payload?.error?.message ?? t("upload.error"))
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
      setError(sessionPayload?.error?.message ?? t("upload.error"))
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
      setError(payload?.error?.message ?? t("upload.error"))
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
            <Header title={t("upload.title")} />
            <div className="flex-1 overflow-y-auto p-6 grid place-items-center">
              <Card className="w-full max-w-xl border-primary/20 bg-card">
                <CardContent className="pt-8 pb-8 text-center">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 className="h-8 w-8 text-primary" />
                  </div>
                  <h2 className="text-xl font-semibold text-foreground mb-2">{t("upload.success.heading")}</h2>
                  <p className="text-muted-foreground mb-6">{createdProject.name} {t("upload.success.hosted")}</p>
                  <div className="flex justify-center gap-3">
                    <Button variant="secondary" onClick={() => window.location.reload()}>{t("upload.continue")}</Button>
                    <Button asChild>
                      <Link href={`/view/${createdProject.id}`}>{t("upload.view")}</Link>
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
          <Header title={t("upload.title")} />
          <div className="flex-1 overflow-y-auto p-6">
            <div className="mx-auto mb-6 max-w-3xl rounded-lg border bg-secondary/20 p-4 text-sm text-muted-foreground">
              <div className="grid gap-2 md:grid-cols-2">
                <p><span className="font-medium text-foreground">{t("upload.file.label")}{t("common.colon")}</span>{t("upload.limits.file")}</p>
                <p><span className="font-medium text-foreground">ZIP{t("common.colon")}</span>{t("upload.limits.zip")}</p>
                <p><span className="font-medium text-foreground">{t("datasets.title")}{t("common.colon")}</span>{t("upload.card.desc")}</p>
                <p><span className="font-medium text-foreground">{t("project.tab.scripts")}{t("common.colon")}</span>{t("project.scripts.empty")}</p>
              </div>
            </div>

            <form className="max-w-3xl mx-auto space-y-6" onSubmit={onSubmit}>
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="text-lg">{t("upload.card.project.title")}</CardTitle>
                  <CardDescription>
                    {isZipBundle
                      ? t("upload.card.project.desc.zip")
                      : t("upload.card.project.desc.html")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">{t("upload.name.label")}</Label>
                    <Input id="name" value={name} onChange={(event) => setName(event.target.value)} placeholder={t("upload.name.placeholder")} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description">{t("upload.desc.label")}</Label>
                    <Textarea id="description" value={description} onChange={(event) => setDescription(event.target.value)} rows={3} placeholder={t("upload.desc.placeholder")} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("upload.visibility.label")}</Label>
                    <Select value={visibility} onValueChange={(value) => setProjectVisibility(value as ProjectVisibility)}>
                      <SelectTrigger aria-label={t("upload.visibility.label")}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="private"><Lock className="h-4 w-4" />{t("upload.visibility.private")}</SelectItem>
                        <SelectItem value="team"><Users className="h-4 w-4" />{t("upload.visibility.team")}</SelectItem>
                        <SelectItem value="public"><Globe className="h-4 w-4" />{t("upload.visibility.public")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2"><FileCode2 className="h-5 w-5 text-primary" />{t("upload.card.file.title")}</CardTitle>
                  <CardDescription>{t("upload.card.file.desc")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ZipDropZone htmlFile={htmlFile} isDragging={isDraggingHtml} setDragging={setIsDraggingHtml} onFile={setHtmlFile} onClear={() => setHtmlFile(null)} dropText={t("upload.drop.text")} clearText={t("upload.file.clear")} />
                </CardContent>
              </Card>

              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex justify-end">
                <Button type="submit" disabled={!name || !htmlFile || isSubmitting}>
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {isSubmitting ? t("upload.submitting") : isZipBundle ? t("upload.submit.zip") : t("upload.submit.html")}
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
  dropText,
  clearText,
}: {
  htmlFile: File | null
  isDragging: boolean
  setDragging: (value: boolean) => void
  onFile: (file: File) => void
  onClear: () => void
  dropText: string
  clearText: string
}) {
  return (
    <div
      role={htmlFile ? undefined : "button"}
      tabIndex={htmlFile ? -1 : 0}
      aria-label={dropText}
      onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        const file = event.dataTransfer.files[0]
        if (file && /\.(html|zip)$/i.test(file.name)) onFile(file)
      }}
      onClick={() => document.getElementById("html-input")?.click()}
      onKeyDown={(event) => {
        if (!htmlFile && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault()
          document.getElementById("html-input")?.click()
        }
      }}
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
          <Button
            variant="ghost"
            size="icon"
            type="button"
            aria-label={clearText}
            title={clearText}
            onClick={(event) => { event.stopPropagation(); onClear() }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <>
          <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-foreground font-medium">{dropText}</p>
        </>
      )}
    </div>
  )
}

function formatSize(size: number) {
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}
