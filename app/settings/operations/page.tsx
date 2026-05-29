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
import { AlertCircle, RefreshCw, Webhook } from "lucide-react"
import { useLanguage } from "@/lib/i18n/context"

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
  const { t } = useLanguage()
  const [webhooks, setWebhooks] = useState<WebhookRow[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditRow[]>([])
  const [error, setError] = useState("")
  const [webhookUrl, setWebhookUrl] = useState("")
  const [latestSecret, setLatestSecret] = useState("")

  const load = useCallback(async () => {
    const [webhookResponse, auditResponse] = await Promise.all([
      fetch("/api/v1/webhooks"),
      fetch("/api/v1/audit-logs?per_page=20"),
    ])
    const webhookPayload = await webhookResponse.json().catch(() => null)
    const auditPayload = await auditResponse.json().catch(() => null)
    if (!webhookResponse.ok || !auditResponse.ok) {
      setError(webhookPayload?.error?.message ?? auditPayload?.error?.message ?? t("settings.operations.load.error"))
      return
    }
    setError("")
    setWebhooks(webhookPayload.data ?? [])
    setAuditLogs(auditPayload.data ?? [])
  }, [t])

  useEffect(() => {
    load().catch(() => setError(t("settings.operations.load.error.network")))
  }, [load, t])

  const createWebhook = async () => {
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
      setError(payload?.error?.message ?? t("settings.operations.webhook.create.error"))
      return
    }
    setWebhookUrl("")
    setLatestSecret(payload.secret ?? "")
    await load()
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 p-2 pl-0">
        <main className="flex-1 flex flex-col bg-card rounded-xl shadow-sm overflow-hidden">
          <Header title={t("settings.operations.title")} />
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>{t("settings.operations.error.title")}</AlertTitle>
                <AlertDescription>
                  <p>{error}</p>
                  <Button variant="outline" size="sm" className="mt-2" onClick={load}>
                    <RefreshCw className="h-3.5 w-3.5" />
                    {t("common.retry")}
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Webhook className="h-5 w-5" />Webhooks</CardTitle>
                <CardDescription>{t("settings.operations.webhook.desc")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                  <div className="space-y-2">
                    <Label>{t("settings.operations.webhook.url.label")}</Label>
                    <Input value={webhookUrl} onChange={(event) => setWebhookUrl(event.target.value)} placeholder="https://hooks.example.com/artifacta" />
                  </div>
                  <div className="flex items-end">
                    <Button onClick={createWebhook}>{t("settings.operations.webhook.add")}</Button>
                  </div>
                </div>
                {latestSecret && (
                  <Textarea readOnly rows={2} value={`${t("settings.operations.webhook.secret")}${latestSecret}`} />
                )}
                <div className="space-y-2">
                  {webhooks.length === 0 && <p className="text-sm text-muted-foreground">{t("settings.operations.webhook.empty")}</p>}
                  {webhooks.map((webhook) => (
                    <div key={webhook.id} className="rounded-lg border p-3 text-sm space-y-2">
                      <p className="font-medium break-all">{webhook.url}</p>
                      <div className="flex flex-wrap gap-2">
                        {webhook.events.map((event) => (
                          <Badge key={event} variant="outline">{event}</Badge>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t("settings.operations.webhook.last")}{webhook.last_delivery_status ?? t("settings.operations.webhook.last_none")}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("settings.operations.audit.title")}</CardTitle>
                <CardDescription>{t("settings.operations.audit.desc")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {auditLogs.length === 0 && <p className="text-sm text-muted-foreground">{t("settings.operations.audit.empty")}</p>}
                {auditLogs.map((log) => (
                  <div key={log.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{log.summary}</p>
                      <span className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{log.action} · {log.target_type}:{log.target_id}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  )
}
