"use client"

import { useCallback, useEffect, useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { AlertCircle, Check, Code2, Copy, Key, Plus, Terminal, Trash2 } from "lucide-react"
import { useLanguage } from "@/lib/i18n/context"

interface ApiKeyRecord {
  id: string
  name: string
  prefix: string
  last4: string
  scopes: string[]
  created_at: string
  expires_at: string | null
  last_used_at: string | null
}

const scopeOptions = [
  { value: "projects:read", label: { zh: "读取项目", en: "Read projects" } },
  { value: "projects:write", label: { zh: "写入项目", en: "Write projects" } },
  { value: "datasets:read", label: { zh: "读取数据集", en: "Read datasets" } },
  { value: "datasets:write", label: { zh: "写入数据集", en: "Write datasets" } },
  { value: "sync:run", label: { zh: "触发同步", en: "Run sync scripts" } },
  { value: "team:read", label: { zh: "读取团队", en: "Read team" } },
  { value: "team:write", label: { zh: "管理团队", en: "Manage team" } },
  { value: "admin:read", label: { zh: "运维只读", en: "Read operations" } },
] as const

function buildCliInstallExample(siteUrl: string, lang: "zh" | "en") {
  return lang === "zh" ? `# 1. 安装 Artifacta Publisher skill
npx -y skills@latest add github:shl418/Artifacta --skill artifacta-publisher

# 2. 配置当前站点
export ARTIFACTA_URL=${siteUrl}
export ARTIFACTA_API_KEY=art_...

# 3. 零安装运行 CLI（推荐）
npx -y @artifacta/cli@latest doctor
npx -y @artifacta/cli@latest projects list` : `# 1. Install the Artifacta Publisher skill
npx -y skills@latest add github:shl418/Artifacta --skill artifacta-publisher

# 2. Configure this site
export ARTIFACTA_URL=${siteUrl}
export ARTIFACTA_API_KEY=art_...

# 3. Run the CLI without installing it globally
npx -y @artifacta/cli@latest doctor
npx -y @artifacta/cli@latest projects list`
}

const cliExample = `# ZIP 内含 HTML、数据和静态资源；单 HTML 仅适合内联数据
npx -y @artifacta/cli@latest projects upload \
  --file ./dashboard.zip \
  --name "Q2 销售看板" \
  --visibility team

# 替换已有项目的 HTML
npx -y @artifacta/cli@latest projects update-html \
  --project-id proj_123 \
  --file ./dashboard-v2.zip

# 手动触发项目同步脚本
npx -y @artifacta/cli@latest sync-scripts trigger \
  --project-id proj_123 \
  --script-id sscript_456`

function buildApiExample(siteUrl: string) {
  return `curl -X POST ${siteUrl}/api/v1/upload-sessions \\
  -H "Authorization: Bearer $ARTIFACTA_API_KEY" \\
  -F "file=@./dashboard.zip"
# 使用返回的 session_id：
curl -X POST ${siteUrl}/api/v1/projects \\
  -H "Authorization: Bearer $ARTIFACTA_API_KEY" \\
  -F "name=Q2 销售看板" \\
  -F "visibility=team" \\
  -F "upload_session_id=<session_id>"`
}

export default function ApiDocsPage() {
  const { lang, t } = useLanguage()
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([])
  const [newKeyName, setNewKeyName] = useState("CI/CD Pipeline")
  const [selectedScopes, setSelectedScopes] = useState<string[]>([])
  const [latestSecret, setLatestSecret] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [creatingKey, setCreatingKey] = useState(false)
  const [deletingKey, setDeletingKey] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<ApiKeyRecord | null>(null)
  const [siteUrl, setSiteUrl] = useState("http://localhost:3000")

  const loadKeys = useCallback(async () => {
    try {
      const response = await fetch("/api/v1/api-keys")
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        setError(payload?.error?.message ?? t("settings.api.load.error"))
        return
      }
      setError("")
      setApiKeys(payload.data)
    } finally {
      setIsLoading(false)
    }
  }, [t])

  useEffect(() => {
    loadKeys().catch(() => {
      setApiKeys([])
      setError(t("common.error.network"))
      setIsLoading(false)
    })
  }, [loadKeys, t])

  useEffect(() => {
    setSiteUrl(window.location.origin)
  }, [])

  const createKey = async () => {
    if (creatingKey) return
    setCreatingKey(true)
    try {
      const response = await fetch("/api/v1/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newKeyName,
          scopes: selectedScopes.length > 0 ? selectedScopes : undefined,
        }),
      })
      if (response.ok) {
        const payload = await response.json()
        setLatestSecret(payload.key)
        await loadKeys()
      } else {
        const payload = await response.json().catch(() => null)
        setError(payload?.error?.message ?? t("settings.api.load.error"))
      }
    } catch {
      setError(t("common.error.network"))
    } finally {
      setCreatingKey(false)
    }
  }

  const deleteKey = async () => {
    if (!pendingDelete || deletingKey) return
    setDeletingKey(true)
    try {
      const response = await fetch(`/api/v1/api-keys/${pendingDelete.id}`, { method: "DELETE" })
      setPendingDelete(null)
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        setError(payload?.error?.message ?? t("settings.api.load.error"))
        return
      }
      await loadKeys()
    } catch {
      setError(t("common.error.network"))
    } finally {
      setDeletingKey(false)
    }
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 p-2 pl-0">
        <main className="flex-1 flex flex-col bg-card rounded-xl shadow-sm overflow-hidden">
          <Header title={t("settings.api.title")} />
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-4xl mx-auto space-y-6">
              <Alert>
                <Terminal className="h-4 w-4" />
                <AlertTitle>{lang === "zh" ? "Agent / CLI 从这里开始" : "Start here for agents and the CLI"}</AlertTitle>
                <AlertDescription>
                  {lang === "zh"
                    ? "在本页创建 API Key，复制一次性密钥，再按下方命令设置 ARTIFACTA_URL 与 ARTIFACTA_API_KEY。"
                    : "Create an API key on this page, copy the one-time secret, then set ARTIFACTA_URL and ARTIFACTA_API_KEY using the commands below."}
                </AlertDescription>
              </Alert>

              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Key className="h-5 w-5 text-primary" />
                    API Keys
                  </CardTitle>
                  <CardDescription>{t("settings.api.key.desc")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col gap-3">
                    <div className="flex gap-2">
                      <Input value={newKeyName} onChange={(event) => setNewKeyName(event.target.value)} placeholder={t("settings.api.key.placeholder")} />
                      <Button onClick={createKey} disabled={!newKeyName.trim() || creatingKey}>
                        <Plus className="h-4 w-4" />
                        {t("common.create")}
                      </Button>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">{t("settings.api.scope.label")}</Label>
                      <div className="flex flex-wrap gap-2">
                        {scopeOptions.map((scope) => {
                          const active = selectedScopes.includes(scope.value)
                          return (
                            <Button
                              key={scope.value}
                              type="button"
                              size="sm"
                              variant={active ? "default" : "outline"}
                              aria-pressed={active}
                              onClick={() =>
                                setSelectedScopes((current) =>
                                  active ? current.filter((item) => item !== scope.value) : [...current, scope.value],
                                )
                              }
                            >
                              {scope.label[lang]}
                            </Button>
                          )
                        })}
                      </div>
                    </div>
                  </div>

                  {error && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>{t("settings.api.error.title")}</AlertTitle>
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  {latestSecret && (
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                      <Label className="text-xs text-muted-foreground">{t("settings.api.key.once")}</Label>
                      <div className="flex items-center gap-2 mt-2">
                        <Input readOnly value={latestSecret} className="font-mono text-sm bg-background" />
                        <CopyButton value={latestSecret} />
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    {isLoading && (
                      <div className="flex flex-col items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                        <Spinner className="size-5" />
                        加载中…
                      </div>
                    )}
                    {!isLoading && apiKeys.length === 0 && (
                      <Empty className="border py-10">
                        <EmptyHeader>
                          <EmptyMedia variant="icon"><Key /></EmptyMedia>
                          <EmptyTitle>{t("settings.api.empty")}</EmptyTitle>
                          <EmptyDescription>{t("settings.api.empty.hint")}</EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    )}
                    {apiKeys.map((apiKey) => (
                      <div key={apiKey.id} className="flex items-center justify-between rounded-lg bg-secondary/30 p-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-foreground">{apiKey.name}</p>
                            <Badge variant="secondary" className="font-mono text-xs">{apiKey.prefix}...{apiKey.last4}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {t("settings.api.key.created_at")} {new Date(apiKey.created_at).toLocaleDateString()}
                            {apiKey.expires_at ? ` · ${t("settings.api.key.expires_at")} ${new Date(apiKey.expires_at).toLocaleDateString()}` : ""}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {(apiKey.scopes ?? ["*"]).map((scope) => (
                              <Badge key={scope} variant="outline" className="text-[10px] font-mono">{scope}</Badge>
                            ))}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          aria-label={`${t("common.delete")} ${apiKey.name}`}
                          title={`${t("common.delete")} ${apiKey.name}`}
                          onClick={() => setPendingDelete(apiKey)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Tabs defaultValue="cli" className="space-y-6">
                <TabsList className="bg-secondary/50">
                  <TabsTrigger value="cli" className="gap-2">
                    <Terminal className="h-4 w-4" />
                    {t("settings.api.cli.tab")}
                  </TabsTrigger>
                  <TabsTrigger value="api" className="gap-2">
                    <Code2 className="h-4 w-4" />
                    {t("settings.api.rest.tab")}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="cli">
                  <Card className="border-border bg-card">
                    <CardHeader>
                      <CardTitle className="text-lg">{lang === "zh" ? "安装与连接" : "Install and connect"}</CardTitle>
                      <CardDescription>
                        {lang === "zh"
                          ? "外部用户可通过 npx 安装 skill，并直接运行 CLI，无需克隆 Artifacta 仓库。"
                          : "External users can install the skill and run the CLI through npx without cloning the Artifacta repository."}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <CodeBlock code={buildCliInstallExample(siteUrl, lang)} />
                    </CardContent>
                  </Card>

                  <Card className="border-border bg-card">
                    <CardHeader>
                      <CardTitle className="text-lg">Agent 工作流示例</CardTitle>
                      <CardDescription>仓库内已经包含独立 CLI 发布包和零仓库接入文档，Claude Code / skill 可以直接复用这套命令面。</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <CodeBlock code={cliExample} />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="api">
                  <Card className="border-border bg-card">
                    <CardHeader>
                      <CardTitle className="text-lg">{lang === "zh" ? "上传项目 API" : "Project upload API"}</CardTitle>
                      <CardDescription>
                        {lang === "zh" ? `当前站点 API 地址为 ${siteUrl}/api/v1。` : `This site's API base is ${siteUrl}/api/v1.`}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <CodeBlock code={buildApiExample(siteUrl)} />
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </main>
      </div>
      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.api.key.delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.api.key.delete.desc_prefix")} &quot;{pendingDelete?.name}&quot; {t("settings.api.key.delete.desc_suffix")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={deletingKey} onClick={(event) => { event.preventDefault(); deleteKey() }}>
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="relative group">
      <pre className="bg-[#0d1117] text-[#c9d1d9] p-4 rounded-lg overflow-x-auto text-sm font-mono">
        <code>{code}</code>
      </pre>
      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <CopyButton value={code} />
      </div>
    </div>
  )
}

function CopyButton({ value }: { value: string }) {
  const { t } = useLanguage()
  const [copied, setCopied] = useState(false)
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 bg-white/10 hover:bg-white/20"
      aria-label={copied ? t("common.copied") : t("common.copy")}
      title={copied ? t("common.copied") : t("common.copy")}
      onClick={() => {
        navigator.clipboard.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 1600)
      }}
    >
      {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4 text-white/70" />}
    </Button>
  )
}
