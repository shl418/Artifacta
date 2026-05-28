"use client"

import { useEffect, useState } from "react"
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
import { AlertCircle, Check, Code2, Copy, Key, Plus, Terminal, Trash2 } from "lucide-react"

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
  { value: "projects:read", label: "读取项目" },
  { value: "projects:write", label: "写入项目" },
  { value: "datasets:read", label: "读取数据集" },
  { value: "datasets:write", label: "写入数据集" },
  { value: "sync:run", label: "触发同步" },
  { value: "team:read", label: "读取团队" },
  { value: "team:write", label: "管理团队" },
  { value: "admin:read", label: "运维只读" },
] as const

const cliInstallExample = `# 外部用户（推荐）
npx @artifacta/cli@latest projects list

# 或全局安装
npm install -g @artifacta/cli

# 仓库内开发者
pnpm cli -- projects list`

const cliExample = `# 创建项目（ZIP 内含 HTML 与数据；单 HTML 仅适合内联数据）
artifacta projects upload \
  --file ./dashboard.zip \
  --name "Q2 销售看板" \
  --visibility team

# 替换已有项目的 HTML
artifacta projects update-html \
  --project-id proj_123 \
  --file ./dashboard-v2.zip

# 手动触发项目同步脚本
artifacta sync-scripts trigger \
  --project-id proj_123 \
  --script-id sscript_456

# 或直接使用 API Key 列项目
ARTIFACTA_API_KEY=art_live_xxx artifacta projects list`

const apiExample = `curl -X POST http://localhost:3000/api/v1/upload-sessions \\
  -H "Authorization: Bearer $ARTIFACTA_API_KEY" \\
  -F "file=@./dashboard.zip"
# 使用返回的 session_id：
curl -X POST http://localhost:3000/api/v1/projects \\
  -H "Authorization: Bearer $ARTIFACTA_API_KEY" \\
  -F "name=Q2 销售看板" \\
  -F "visibility=team" \\
  -F "upload_session_id=<session_id>"`

export default function ApiDocsPage() {
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([])
  const [newKeyName, setNewKeyName] = useState("CI/CD Pipeline")
  const [selectedScopes, setSelectedScopes] = useState<string[]>([])
  const [latestSecret, setLatestSecret] = useState("")
  const [error, setError] = useState("")
  const [pendingDelete, setPendingDelete] = useState<ApiKeyRecord | null>(null)

  const loadKeys = async () => {
    const response = await fetch("/api/v1/api-keys")
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      setError(payload?.error?.message ?? "无法加载 API Key。")
      return
    }
    setError("")
    setApiKeys(payload.data)
  }

  useEffect(() => {
    loadKeys().catch(() => {
      setApiKeys([])
      setError("网络异常，无法加载 API Key。")
    })
  }, [])

  const createKey = async () => {
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
      setError(payload?.error?.message ?? "创建 API Key 失败。")
    }
  }

  const deleteKey = async () => {
    if (!pendingDelete) return
    const response = await fetch(`/api/v1/api-keys/${pendingDelete.id}`, { method: "DELETE" })
    setPendingDelete(null)
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      setError(payload?.error?.message ?? "删除 API Key 失败。")
      return
    }
    await loadKeys()
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 p-2 pl-0">
        <main className="flex-1 flex flex-col bg-card rounded-xl shadow-sm overflow-hidden">
          <Header title="API & CLI" />
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-4xl mx-auto space-y-6">
              <Card className="border-border bg-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Key className="h-5 w-5 text-primary" />
                    API Keys
                  </CardTitle>
                  <CardDescription>创建 Bearer Token，用于 Coding Agent、CI/CD 和未来 CLI 调用 REST API。</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col gap-3">
                    <div className="flex gap-2">
                      <Input value={newKeyName} onChange={(event) => setNewKeyName(event.target.value)} placeholder="Key 名称" />
                      <Button onClick={createKey} disabled={!newKeyName.trim()}>
                        <Plus className="h-4 w-4" />
                        创建
                      </Button>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">权限范围（留空表示全部权限）</Label>
                      <div className="flex flex-wrap gap-2">
                        {scopeOptions.map((scope) => {
                          const active = selectedScopes.includes(scope.value)
                          return (
                            <Button
                              key={scope.value}
                              type="button"
                              size="sm"
                              variant={active ? "default" : "outline"}
                              onClick={() =>
                                setSelectedScopes((current) =>
                                  active ? current.filter((item) => item !== scope.value) : [...current, scope.value],
                                )
                              }
                            >
                              {scope.label}
                            </Button>
                          )
                        })}
                      </div>
                    </div>
                  </div>

                  {error && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>API Key 操作失败</AlertTitle>
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  {latestSecret && (
                    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                      <Label className="text-xs text-muted-foreground">仅显示一次的新 Key</Label>
                      <div className="flex items-center gap-2 mt-2">
                        <Input readOnly value={latestSecret} className="font-mono text-sm bg-background" />
                        <CopyButton value={latestSecret} />
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    {apiKeys.length === 0 && (
                      <Empty className="border py-10">
                        <EmptyHeader>
                          <EmptyMedia variant="icon"><Key /></EmptyMedia>
                          <EmptyTitle>还没有 API Key</EmptyTitle>
                          <EmptyDescription>创建后可用于 CLI、CI、同步 Worker 和外部 agent。</EmptyDescription>
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
                            创建于 {new Date(apiKey.created_at).toLocaleDateString("zh-CN")}
                            {apiKey.expires_at ? ` · 到期 ${new Date(apiKey.expires_at).toLocaleDateString("zh-CN")}` : ""}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1">
                            {(apiKey.scopes ?? ["*"]).map((scope) => (
                              <Badge key={scope} variant="outline" className="text-[10px] font-mono">{scope}</Badge>
                            ))}
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setPendingDelete(apiKey)}>
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
                    CLI 命令行
                  </TabsTrigger>
                  <TabsTrigger value="api" className="gap-2">
                    <Code2 className="h-4 w-4" />
                    REST API
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="cli">
                  <Card className="border-border bg-card">
                    <CardHeader>
                      <CardTitle className="text-lg">安装方式</CardTitle>
                      <CardDescription>对外用户推荐 `npx @artifacta/cli@latest`；仓库内开发者可继续用 `pnpm cli -- ...`。</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <CodeBlock code={cliInstallExample} />
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
                      <CardTitle className="text-lg">上传项目 API</CardTitle>
                      <CardDescription>默认本地地址为 `http://localhost:3000/api/v1`。</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <CodeBlock code={apiExample} />
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
            <AlertDialogTitle>删除 API Key</AlertDialogTitle>
            <AlertDialogDescription>
              删除 “{pendingDelete?.name}” 后，使用这个 Bearer Token 的 CLI、CI 和 Worker 会立即失效。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={deleteKey}>
              删除
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
  const [copied, setCopied] = useState(false)
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 bg-white/10 hover:bg-white/20"
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
