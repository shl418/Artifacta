"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ExternalLink, RefreshCw, Settings2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

interface ProjectDetail {
  id: string
  name: string
  visibility: "private" | "team" | "public"
  html_url: string
  views_count: number
}

export default function ProjectPreviewPage() {
  const params = useParams<{ projectId: string }>()
  const router = useRouter()
  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [iframeSrc, setIframeSrc] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    let mounted = true
    fetch(`/api/v1/projects/${params.projectId}`)
      .then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => null)
          throw new Error(payload?.error?.message ?? "无法访问该看板。")
        }
        return response.json()
      })
      .then((payload) => {
        if (!mounted) return
        setProject(payload)
        setIframeSrc(payload.html_url)
      })
      .catch((reason) => mounted && setError(reason instanceof Error ? reason.message : "无法访问该看板。"))
    return () => {
      mounted = false
    }
  }, [params.projectId])

  if (error) {
    return (
      <main className="min-h-screen bg-background grid place-items-center p-6">
        <div className="max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-foreground">看板不可访问</h1>
          <p className="text-sm text-muted-foreground mt-2">{error}</p>
          <Button className="mt-5" onClick={() => router.push("/login")}>登录后重试</Button>
        </div>
      </main>
    )
  }

  if (!project) {
    return <main className="min-h-screen bg-background grid place-items-center text-sm text-muted-foreground">加载看板中...</main>
  }

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <header className="h-12 border-b border-border bg-card flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => router.push("/dashboards")} className="h-8 w-8">
            <X className="h-5 w-5" />
          </Button>
          <div className="h-5 w-px bg-border" />
          <h1 className="font-medium text-sm truncate">{project.name}</h1>
          <Badge variant="outline" className="text-xs">{project.visibility}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => {
              const url = new URL(project.html_url, window.location.origin)
              url.searchParams.set("_t", String(Date.now()))
              setIframeSrc(url.toString())
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            刷新数据
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => router.push(`/dashboards?selected=${project.id}`)}>
            <Settings2 className="h-3.5 w-3.5" />
            设置
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" asChild>
            <a href={project.html_url} target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              新窗口
            </a>
          </Button>
        </div>
      </header>
      <iframe
        title={project.name}
        className="w-full flex-1 border-0 bg-white"
        src={iframeSrc || project.html_url}
        sandbox="allow-scripts allow-forms allow-popups allow-downloads"
      />
    </div>
  )
}
