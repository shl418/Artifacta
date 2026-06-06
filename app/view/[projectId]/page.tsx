"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { ExternalLink, RefreshCw, Settings2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

const visibilityLabel: Record<"private" | "team" | "public", string> = {
  private: "私有",
  team: "团队",
  public: "公开",
}

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
  const [errorStatus, setErrorStatus] = useState<number | null>(null)

  useEffect(() => {
    let mounted = true
    fetch(`/api/v1/projects/${params.projectId}`)
      .then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => null)
          const failure = new Error(payload?.error?.message ?? "无法访问该看板。") as Error & { status?: number }
          failure.status = response.status
          throw failure
        }
        return response.json()
      })
      .then((payload) => {
        if (!mounted) return
        setProject(payload)
        setIframeSrc(payload.html_url)
      })
      .catch((reason) => {
        if (!mounted) return
        setErrorStatus(typeof reason?.status === "number" ? reason.status : null)
        setError(reason instanceof Error ? reason.message : "无法访问该看板。")
      })
    return () => {
      mounted = false
    }
  }, [params.projectId])

  if (error) {
    // Only an auth failure should send the user to login; a missing/forbidden
    // board (e.g. deleted or private) should not dead-end an already-logged-in user.
    const isAuthError = errorStatus === 401
    return (
      <main className="min-h-screen bg-background grid place-items-center p-6">
        <div className="max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-foreground">看板不可访问</h1>
          <p className="text-sm text-muted-foreground mt-2">{error}</p>
          {isAuthError ? (
            <Button className="mt-5" onClick={() => router.push("/login")}>登录后重试</Button>
          ) : (
            <Button className="mt-5" variant="outline" onClick={() => router.push("/dashboards")}>返回看板列表</Button>
          )}
        </div>
      </main>
    )
  }

  if (!project) {
    return <main className="min-h-screen bg-background grid place-items-center text-sm text-muted-foreground">加载看板中...</main>
  }

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <header className="min-h-12 border-b border-border bg-card flex flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-4 shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <Button variant="ghost" size="icon" onClick={() => router.push("/dashboards")} className="h-8 w-8">
            <X className="h-5 w-5" />
          </Button>
          <div className="h-5 w-px bg-border" />
          <h1 className="font-medium text-sm truncate">{project.name}</h1>
          <Badge variant="outline" className="text-xs">{visibilityLabel[project.visibility]}</Badge>
        </div>
        <div className="flex w-full sm:w-auto items-center justify-end gap-1.5 sm:gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs px-2 sm:px-3"
            onClick={() => {
              const url = new URL(project.html_url, window.location.origin)
              url.searchParams.set("_t", String(Date.now()))
              setIframeSrc(url.toString())
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">刷新数据</span>
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs px-2 sm:px-3" onClick={() => router.push(`/projects/${project.id}`)}>
            <Settings2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">设置</span>
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs px-2 sm:px-3" asChild>
            <a href={project.html_url} target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">新窗口</span>
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
