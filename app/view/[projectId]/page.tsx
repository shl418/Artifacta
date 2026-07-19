"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  AlertTriangle,
  Check,
  Edit3,
  ExternalLink,
  Eye,
  History,
  Merge,
  Redo2,
  RefreshCw,
  RotateCcw,
  Save,
  Settings2,
  Trash2,
  Undo2,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"

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
  artifact: { revision_id: string | null }
  capabilities?: { can_edit?: boolean }
}

interface TextChange {
  text_key: string
  before: string
  after: string
  context: string
}

interface MergeConflict {
  id: string
  text_key: string
  latest_text_key: string | null
  context: string
  base: string
  latest: string | null
  yours: string
  reason: "both_modified" | "target_missing" | "target_ambiguous"
}

interface MergeState {
  latest_revision_id: string
  automatic_changes: TextChange[]
  conflicts: MergeConflict[]
}

type ConflictResolution = {
  choice: "latest" | "yours" | "manual"
  value?: string
}

export default function ProjectPreviewPage() {
  const params = useParams<{ projectId: string }>()
  const router = useRouter()
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const editorPort = useRef<MessagePort | null>(null)
  const changesRef = useRef<TextChange[]>([])
  const undoStack = useRef<TextChange[][]>([])
  const redoStack = useRef<TextChange[][]>([])

  const [project, setProject] = useState<ProjectDetail | null>(null)
  const [iframeSrc, setIframeSrc] = useState("")
  const [error, setError] = useState("")
  const [errorStatus, setErrorStatus] = useState<number | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editorActive, setEditorActive] = useState(true)
  const [baseRevisionId, setBaseRevisionId] = useState("")
  const [draftKey, setDraftKey] = useState("")
  const [changes, setChanges] = useState<TextChange[]>([])
  const [editableCount, setEditableCount] = useState(0)
  const [selectedTextKey, setSelectedTextKey] = useState<string | null>(null)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [notes, setNotes] = useState("")
  const [mergeState, setMergeState] = useState<MergeState | null>(null)
  const [resolutions, setResolutions] = useState<Record<string, ConflictResolution>>({})

  const loadProject = useCallback(async () => {
    const response = await fetch(`/api/v1/projects/${params.projectId}`)
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      const failure = new Error(payload?.error?.message ?? "无法访问该看板。") as Error & { status?: number }
      failure.status = response.status
      throw failure
    }
    setProject(payload)
    return payload as ProjectDetail
  }, [params.projectId])

  useEffect(() => {
    let mounted = true
    loadProject()
      .then((payload) => {
        if (!mounted) return
        setIframeSrc(payload.html_url)
      })
      .catch((reason) => {
        if (!mounted) return
        setErrorStatus(typeof reason?.status === "number" ? reason.status : null)
        setError(reason instanceof Error ? reason.message : "无法访问该看板。")
      })
    return () => {
      mounted = false
      editorPort.current?.close()
    }
  }, [loadProject])

  useEffect(() => {
    changesRef.current = changes
    if (!draftKey) return
    if (changes.length === 0) {
      localStorage.removeItem(draftKey)
    } else {
      localStorage.setItem(draftKey, JSON.stringify({ base_revision_id: baseRevisionId, changes }))
    }
  }, [baseRevisionId, changes, draftKey])

  const replaceChanges = useCallback((next: TextChange[], recordHistory = true) => {
    if (recordHistory) {
      undoStack.current.push(changesRef.current)
      redoStack.current = []
      setCanUndo(true)
      setCanRedo(false)
    }
    changesRef.current = next
    setChanges(next)
  }, [])

  const applySnapshotToFrame = useCallback((next: TextChange[], current: TextChange[]) => {
    const nextByKey = new Map(next.map((change) => [change.text_key, change]))
    const currentByKey = new Map(current.map((change) => [change.text_key, change]))
    for (const key of new Set([...nextByKey.keys(), ...currentByKey.keys()])) {
      const after = nextByKey.get(key)?.after ?? currentByKey.get(key)?.before
      if (after !== undefined) {
        editorPort.current?.postMessage({ type: "apply_change", text_key: key, after })
      }
    }
  }, [])

  const handleEditorMessage = useCallback((event: MessageEvent) => {
    const payload = event.data ?? {}
    if (payload.type === "ready") {
      setEditableCount(Number(payload.editable_count) || 0)
      for (const change of changesRef.current) {
        editorPort.current?.postMessage({
          type: "apply_change",
          text_key: change.text_key,
          after: change.after,
        })
      }
      return
    }
    if (payload.type === "selected") {
      setSelectedTextKey(typeof payload.text_key === "string" ? payload.text_key : null)
      return
    }
    if (
      payload.type === "change" &&
      typeof payload.text_key === "string" &&
      typeof payload.before === "string" &&
      typeof payload.after === "string"
    ) {
      const current = changesRef.current
      const existing = current.find((change) => change.text_key === payload.text_key)
      const before = existing?.before ?? payload.before
      const next = current.filter((change) => change.text_key !== payload.text_key)
      if (payload.after !== before) {
        next.push({
          text_key: payload.text_key,
          before,
          after: payload.after,
          context: typeof payload.context === "string" ? payload.context : "",
        })
      }
      replaceChanges(next)
      setMergeState(null)
      setResolutions({})
    }
  }, [replaceChanges])

  const connectEditorFrame = useCallback(() => {
    if (!isEditing || !iframeRef.current?.contentWindow) return
    editorPort.current?.close()
    const channel = new MessageChannel()
    channel.port1.onmessage = handleEditorMessage
    channel.port1.start()
    editorPort.current = channel.port1
    iframeRef.current.contentWindow.postMessage({ type: "artifacta:connect" }, "*", [channel.port2])
  }, [handleEditorMessage, isEditing])

  const startEditing = async () => {
    if (window.matchMedia("(max-width: 767px)").matches) {
      setMessage("文字编辑仅支持桌面端。")
      return
    }
    setMessage("")
    const response = await fetch(`/api/v1/projects/${params.projectId}/text-editor/session`, {
      method: "POST",
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      setMessage(payload?.error?.message ?? "无法进入编辑模式。")
      return
    }

    const restored = readDraft(payload.draft_key)
    let restoredChanges: TextChange[] = []
    if (restored.length > 0 && window.confirm(`发现 ${restored.length} 处未提交修改，是否恢复？`)) {
      restoredChanges = restored
    } else {
      localStorage.removeItem(payload.draft_key)
    }

    undoStack.current = []
    redoStack.current = []
    setCanUndo(false)
    setCanRedo(false)
    changesRef.current = restoredChanges
    setChanges(restoredChanges)
    setBaseRevisionId(payload.base_revision_id)
    setDraftKey(payload.draft_key)
    setMergeState(null)
    setResolutions({})
    setNotes("")
    setEditorActive(true)
    setIsEditing(true)
    setIframeSrc(`${payload.edit_url}&_t=${Date.now()}`)
  }

  const cancelEditing = () => {
    if (changesRef.current.length > 0 && !window.confirm("放弃所有未发布的文字修改？")) return
    if (draftKey) localStorage.removeItem(draftKey)
    editorPort.current?.close()
    editorPort.current = null
    changesRef.current = []
    setChanges([])
    setCanUndo(false)
    setCanRedo(false)
    setIsEditing(false)
    setMergeState(null)
    setMessage("")
    if (project) setIframeSrc(cacheBusted(project.html_url))
  }

  const toggleEditorMode = () => {
    const next = !editorActive
    setEditorActive(next)
    editorPort.current?.postMessage({ type: "set_mode", active: next })
  }

  const undo = () => {
    const previous = undoStack.current.pop()
    if (!previous) return
    const current = changesRef.current
    redoStack.current.push(current)
    setCanUndo(undoStack.current.length > 0)
    setCanRedo(true)
    applySnapshotToFrame(previous, current)
    replaceChanges(previous, false)
  }

  const redo = () => {
    const next = redoStack.current.pop()
    if (!next) return
    const current = changesRef.current
    undoStack.current.push(current)
    setCanUndo(true)
    setCanRedo(redoStack.current.length > 0)
    applySnapshotToFrame(next, current)
    replaceChanges(next, false)
  }

  const discardChange = (change: TextChange) => {
    const next = changesRef.current.filter((candidate) => candidate.text_key !== change.text_key)
    editorPort.current?.postMessage({
      type: "apply_change",
      text_key: change.text_key,
      after: change.before,
    })
    replaceChanges(next)
  }

  const save = async () => {
    if (changesRef.current.length === 0 || isSaving) return
    setIsSaving(true)
    setMessage("")
    try {
      const response = await fetch(`/api/v1/projects/${params.projectId}/text-edits`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base_revision_id: baseRevisionId,
          edits: changesRef.current.map(({ text_key, before, after }) => ({ text_key, before, after })),
          notes,
        }),
      })
      const payload = await response.json().catch(() => null)
      if (response.status === 409 && payload?.error?.code === "MERGE_REQUIRED") {
        const details = payload.error.details
        if (details?.retry_merge) {
          setMessage("项目刚刚再次更新，请重新点击保存以计算合并。")
          return
        }
        setMergeState({
          latest_revision_id: details.latest_revision_id,
          automatic_changes: details.automatic_changes ?? [],
          conflicts: details.conflicts ?? [],
        })
        setResolutions({})
        setMessage("检测到其他人的新版本，请确认合并结果。")
        return
      }
      if (!response.ok) {
        setMessage(payload?.error?.message ?? "保存失败。")
        return
      }
      await finishPublished(payload)
    } finally {
      setIsSaving(false)
    }
  }

  const commitMerge = async () => {
    if (!mergeState || isSaving) return
    if (mergeState.conflicts.some((conflict) => !resolutions[conflict.id])) {
      setMessage("请先处理所有冲突。")
      return
    }
    setIsSaving(true)
    setMessage("")
    try {
      const response = await fetch(`/api/v1/projects/${params.projectId}/text-edits/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base_revision_id: baseRevisionId,
          latest_revision_id: mergeState.latest_revision_id,
          edits: changesRef.current.map(({ text_key, before, after }) => ({ text_key, before, after })),
          resolutions: mergeState.conflicts.map((conflict) => ({
            conflict_id: conflict.id,
            choice: resolutions[conflict.id].choice,
            value: resolutions[conflict.id].value,
          })),
          notes,
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        setMessage(payload?.error?.message ?? "合并失败。")
        if (response.status === 409) setMergeState(null)
        return
      }
      await finishPublished(payload)
    } finally {
      setIsSaving(false)
    }
  }

  const finishPublished = async (payload: { version?: { version?: number }; no_changes?: boolean }) => {
    if (draftKey) localStorage.removeItem(draftKey)
    editorPort.current?.close()
    editorPort.current = null
    const refreshed = await loadProject()
    changesRef.current = []
    setChanges([])
    setCanUndo(false)
    setCanRedo(false)
    setMergeState(null)
    setResolutions({})
    setIsEditing(false)
    setMessage(payload.no_changes ? "已采用服务器最新版。" : `文字修改已发布${payload.version?.version ? `（版本 ${payload.version.version}）` : ""}。`)
    setIframeSrc(cacheBusted(refreshed.html_url))
  }

  const resolvedCount = useMemo(
    () => mergeState?.conflicts.filter((conflict) => resolutions[conflict.id]).length ?? 0,
    [mergeState, resolutions],
  )

  if (error) {
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
          <Button
            variant="ghost"
            size="icon"
            aria-label={isEditing ? "退出文字编辑" : "关闭预览"}
            title={isEditing ? "退出文字编辑" : "关闭预览"}
            onClick={() => isEditing ? cancelEditing() : router.push("/dashboards")}
            className="h-8 w-8"
          >
            <X className="h-5 w-5" />
          </Button>
          <div className="h-5 w-px bg-border" />
          <h1 className="font-medium text-sm truncate">{project.name}</h1>
          <Badge variant="outline" className="text-xs">{visibilityLabel[project.visibility]}</Badge>
          {isEditing && <Badge className="text-xs">文字编辑</Badge>}
          {message && <span className="hidden lg:inline text-xs text-muted-foreground truncate">{message}</span>}
        </div>

        {isEditing ? (
          <div className="flex items-center justify-end gap-1.5">
            <span className="hidden lg:inline text-xs text-muted-foreground">{editableCount} 处可编辑 · {changes.length} 处修改</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="撤销" title="撤销" disabled={!canUndo} onClick={undo}>
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="重做" title="重做" disabled={!canRedo} onClick={redo}>
              <Redo2 className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={toggleEditorMode}>
              {editorActive ? <Eye className="h-3.5 w-3.5" /> : <Edit3 className="h-3.5 w-3.5" />}
              {editorActive ? "预览" : "继续编辑"}
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={cancelEditing}>取消</Button>
            <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={changes.length === 0 || isSaving} onClick={save}>
              <Save className="h-3.5 w-3.5" />
              {isSaving ? "处理中..." : "保存并发布"}
            </Button>
          </div>
        ) : (
          <div className="flex w-full sm:w-auto items-center justify-end gap-1.5 sm:gap-2">
            {project.capabilities?.can_edit && (
              <Button size="sm" className="hidden md:inline-flex h-8 gap-1.5 text-xs" onClick={startEditing}>
                <Edit3 className="h-3.5 w-3.5" />
                编辑文字
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs px-2 sm:px-3"
              onClick={() => setIframeSrc(cacheBusted(project.html_url))}
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
        )}
      </header>

      <div className="min-h-0 flex flex-1">
        <iframe
          ref={iframeRef}
          title={project.name}
          className="min-w-0 flex-1 border-0 bg-white"
          src={iframeSrc || project.html_url}
          sandbox="allow-scripts allow-forms allow-popups allow-downloads"
          onLoad={connectEditorFrame}
        />

        {isEditing && (
          <aside className="hidden md:flex w-[380px] shrink-0 border-l border-border bg-card flex-col">
            <div className="border-b border-border p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="font-medium text-sm">{mergeState ? "合并修改" : "本次修改"}</h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    {mergeState
                      ? `${resolvedCount}/${mergeState.conflicts.length} 个冲突已处理`
                      : "点击页面文字即可在原位置修改"}
                  </p>
                </div>
                {mergeState ? <Merge className="size-5 text-amber-500" /> : <History className="size-5 text-muted-foreground" />}
              </div>
              <Input
                className="mt-3 h-8 text-xs"
                placeholder="修改说明（可选）"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                maxLength={500}
              />
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {mergeState ? (
                <>
                  <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                    <div className="flex gap-2">
                      <AlertTriangle className="size-4 shrink-0" />
                      <span>服务器已有新版本。无冲突内容将自动合并，以下冲突需要你确认。</span>
                    </div>
                    <p className="mt-2">自动合并 {mergeState.automatic_changes.length} 处，冲突 {mergeState.conflicts.length} 处。</p>
                  </div>
                  {mergeState.conflicts.map((conflict) => (
                    <ConflictCard
                      key={conflict.id}
                      conflict={conflict}
                      resolution={resolutions[conflict.id]}
                      onChange={(resolution) => setResolutions((current) => ({ ...current, [conflict.id]: resolution }))}
                    />
                  ))}
                  {mergeState.conflicts.length === 0 && (
                    <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900 flex gap-2">
                      <Check className="size-4 shrink-0" />
                      没有文字冲突，可以安全合并到最新版。
                    </div>
                  )}
                </>
              ) : changes.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  <Edit3 className="size-8 mx-auto mb-3 opacity-50" />
                  尚未修改文字
                </div>
              ) : (
                changes.map((change) => (
                  <button
                    key={change.text_key}
                    type="button"
                    className={`w-full rounded-md border p-3 text-left transition-colors hover:bg-muted/60 ${selectedTextKey === change.text_key ? "border-primary bg-primary/5" : "border-border"}`}
                    onClick={() => editorPort.current?.postMessage({ type: "focus_text", text_key: change.text_key })}
                  >
                    <p className="text-[11px] text-muted-foreground truncate">{change.context || "页面文字"}</p>
                    <p className="mt-2 text-xs text-muted-foreground line-through break-words">{change.before || "（空）"}</p>
                    <p className="mt-1 text-sm text-foreground break-words">{change.after || "（删除文字）"}</p>
                    <span
                      role="button"
                      tabIndex={0}
                      className="mt-2 inline-flex items-center gap-1 text-xs text-destructive"
                      onClick={(event) => {
                        event.stopPropagation()
                        discardChange(change)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") discardChange(change)
                      }}
                    >
                      <Trash2 className="size-3" />
                      撤销此处
                    </span>
                  </button>
                ))
              )}
            </div>

            {mergeState && (
              <div className="border-t border-border p-3 flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => { setMergeState(null); setResolutions({}) }}>
                  <RotateCcw className="size-4" />
                  返回修改
                </Button>
                <Button
                  className="flex-1"
                  disabled={isSaving || mergeState.conflicts.some((conflict) => !resolutions[conflict.id])}
                  onClick={commitMerge}
                >
                  <Merge className="size-4" />
                  确认合并
                </Button>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  )
}

function ConflictCard({
  conflict,
  resolution,
  onChange,
}: {
  conflict: MergeConflict
  resolution?: ConflictResolution
  onChange: (resolution: ConflictResolution) => void
}) {
  const missing = conflict.latest === null || !conflict.latest_text_key
  return (
    <div className="rounded-md border border-border p-3 space-y-3">
      <p className="text-[11px] text-muted-foreground truncate">{conflict.context || "页面文字"}</p>
      <VersionText label="原内容" value={conflict.base} />
      <VersionText label="最新版" value={conflict.latest ?? "（该位置已被删除或无法定位）"} />
      <VersionText label="我的内容" value={conflict.yours} />
      <div className="grid grid-cols-2 gap-2">
        <Button
          size="sm"
          variant={resolution?.choice === "latest" ? "default" : "outline"}
          className="text-xs"
          onClick={() => onChange({ choice: "latest" })}
        >
          采用最新版
        </Button>
        <Button
          size="sm"
          variant={resolution?.choice === "yours" ? "default" : "outline"}
          className="text-xs"
          disabled={missing}
          onClick={() => onChange({ choice: "yours" })}
        >
          采用我的
        </Button>
      </div>
      {!missing && (
        <>
          <Button
            size="sm"
            variant={resolution?.choice === "manual" ? "default" : "outline"}
            className="w-full text-xs"
            onClick={() => onChange({ choice: "manual", value: resolution?.value ?? conflict.yours })}
          >
            手工调整
          </Button>
          {resolution?.choice === "manual" && (
            <textarea
              className="min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              value={resolution.value ?? ""}
              onChange={(event) => onChange({ choice: "manual", value: event.target.value.replace(/[\r\n]+/g, " ") })}
              maxLength={10000}
            />
          )}
        </>
      )}
    </div>
  )
}

function VersionText({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 rounded bg-muted px-2 py-1.5 text-xs break-words">{value || "（空）"}</p>
    </div>
  )
}

function cacheBusted(url: string) {
  const result = new URL(url, window.location.origin)
  result.searchParams.set("_t", String(Date.now()))
  return result.toString()
}

function readDraft(key: string): TextChange[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? "null")
    if (!Array.isArray(parsed?.changes)) return []
    return parsed.changes.filter(
      (change: unknown): change is TextChange =>
        Boolean(
          change &&
          typeof (change as TextChange).text_key === "string" &&
          typeof (change as TextChange).before === "string" &&
          typeof (change as TextChange).after === "string",
        ),
    )
  } catch {
    return []
  }
}
