"use client"

import { useCallback, useEffect, useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Header } from "@/components/header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/ui/spinner"
import { AlertCircle, RefreshCw, Webhook } from "lucide-react"

interface WebhookRow {
  id: string
  url: string
  events: string[]
  enabled: boolean
  last_delivery_status: string | null
}

interface AuditRow {
  id: string
  action: string
  summary: string
  target_type: string
  target_id: string
  created_at: string
}

export default function OperationsPage() {
  const [webhooks, setWebhooks] = useState<WebhookRow[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditRow[]>([])
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [webhookUrl, setWebhookUrl] = useState("")
  const [latestSecret, setLatestSecret] = useState("")
  const [creatingWebhook, setCreatingWebhook] = useState(false)

  const load = useCallback(async () => {
    try {
      const [webhookResponse, auditResponse] = await Promise.all([
        fetch("/api/v1/webhooks"),
        fetch("/api/v1/audit-logs?per_page=20"),
      ])
      const webhookPayload = await webhookResponse.json().catch(() => null)
      const auditPayload = await auditResponse.json().catch(() => null)
      if (!webhookResponse.ok || !auditResponse.ok) {
        setError(webhookPayload?.error?.message ?? auditPayload?.error?.message ?? "无法加载运维数据。")
        return
      }
      setError("")
      setWebhooks(webhookPayload.data ?? [])
      setAuditLogs(auditPayload.data ?? [])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    load().catch(() => {
      setError("网络异常，无法加载运维数据。")
      setIsLoading(false)
    })
  }, [load])

  const createWebhook = async () => {
    if (creatingWebhook) return
    setCreatingWebhook(true)
    try {
      const response = await fetch("/api/v1/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: webhookUrl,
          events: ["project.created", "project.updated", "sync.success", "sync.failed", "permission.changed"],
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        setError(payload?.error?.message ?? "创建 Webhook 失败。")
        return
      }
      setWebhookUrl("")
      setLatestSecret(payload.secret ?? "")
      await load()
    } finally {
      setCreatingWebhook(false)
    }
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 p-2 pl-0">
        <main className="flex-1 flex flex-col bg-card rounded-xl shadow-sm overflow-hidden">
          <Header title="运维" />
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>运维面板加载失败</AlertTitle>
                <AlertDescription>
                  <p>{error}</p>
                  <Button variant="outline" size="sm" className="mt-2" onClick={load}>
                    <RefreshCw className="h-3.5 w-3.5" />
                    重试
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {isLoading && !error ? (
              <div className="flex flex-col items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
                <Spinner className="size-5" />
                加载中…
              </div>
            ) : (
            <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Webhook className="h-5 w-5" />Webhooks</CardTitle>
                <CardDescription>接收项目创建、同步成功/失败和权限变更事件。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                  <div className="space-y-2">
                    <Label>回调 URL</Label>
                    <Input value={webhookUrl} onChange={(event) => setWebhookUrl(event.target.value)} placeholder="https://hooks.example.com/artifacta" />
                  </div>
                  <div className="flex items-end">
                    <Button onClick={createWebhook} disabled={creatingWebhook}>{creatingWebhook ? "添加中…" : "添加 Webhook"}</Button>
                  </div>
                </div>
                {latestSecret && (
                  <Textarea readOnly rows={2} value={`新 Webhook Secret（仅显示一次）：${latestSecret}`} />
                )}
                <div className="space-y-2">
                  {webhooks.length === 0 && <p className="text-sm text-muted-foreground">还没有配置 Webhook。</p>}
                  {webhooks.map((webhook) => (
                    <div key={webhook.id} className="rounded-lg border p-3 text-sm space-y-2">
                      <p className="font-medium break-all">{webhook.url}</p>
                      <div className="flex flex-wrap gap-2">
                        {webhook.events.map((event) => (
                          <Badge key={event} variant="outline">{event}</Badge>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        最近投递：{webhook.last_delivery_status ?? "未投递"}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>审计日志</CardTitle>
                <CardDescription>最近的管理员可见操作记录。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {auditLogs.length === 0 && <p className="text-sm text-muted-foreground">还没有审计记录。</p>}
                {auditLogs.map((log) => (
                  <div key={log.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{log.summary}</p>
                      <span className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString("zh-CN")}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{log.action} · {log.target_type}:{log.target_id}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
            </>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
