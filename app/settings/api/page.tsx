"use client"

import { useEffect, useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Check, Code2, Copy, Key, Plus, Terminal, Trash2 } from "lucide-react"

interface ApiKeyRecord {
  id: string
  name: string
  prefix: string
  last4: string
  created_at: string
  expires_at: string | null
  last_used_at: string | null
}

const cliInstallExample = `# 仓库内开发者
pnpm cli -- projects list

# 独立发布包发布后，外部用户可直接使用
npx @artifacta/cli@latest projects list

# 或全局安装
npm install -g @artifacta/cli`

const cliExample = `# 创建项目并上传 HTML + 数据文件
artifacta projects upload \
  --file ./dashboard.html \
  --data-file ./sales.csv \
  --name "Q2 销售看板" \
  --visibility team

# 替换已有项目的 HTML
artifacta projects update-html \
  --project-id proj_123 \
  --file ./dashboard-v2.zip

# 给数据集提交同步配置 JSON
artifacta datasets sync set \
  --project-id proj_123 \
  --dataset-id ds_456 \
  --source-type presto \
  --config-file ./sync.json

# 或直接使用 API Key 列项目
ARTIFACTA_API_KEY=art_live_xxx artifacta projects list`

const apiExample = `curl -X POST http://localhost:3000/api/v1/projects \
  -H "Authorization: Bearer $ARTIFACTA_API_KEY" \
  -F "name=Q2 销售看板" \
  -F "visibility=team" \
  -F "html_file=@./dashboard.html" \
  -F "data_files=@./sales.csv"`

export default function ApiDocsPage() {
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([])
  const [newKeyName, setNewKeyName] = useState("CI/CD Pipeline")
  const [latestSecret, setLatestSecret] = useState("")

  const loadKeys = async () => {
    const response = await fetch("/api/v1/api-keys")
    if (response.ok) {
      const payload = await response.json()
      setApiKeys(payload.data)
    }
  }

  useEffect(() => {
    loadKeys().catch(() => setApiKeys([]))
  }, [])

  const createKey = async () => {
    const response = await fetch("/api/v1/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newKeyName }),
    })
    if (response.ok) {
      const payload = await response.json()
      setLatestSecret(payload.key)
      await loadKeys()
    }
  }

  const deleteKey = async (keyId: string) => {
    await fetch(`/api/v1/api-keys/${keyId}`, { method: "DELETE" })
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
                  <div className="flex gap-2">
                    <Input value={newKeyName} onChange={(event) => setNewKeyName(event.target.value)} placeholder="Key 名称" />
                    <Button onClick={createKey} disabled={!newKeyName.trim()}>
                      <Plus className="h-4 w-4" />
                      创建
                    </Button>
                  </div>

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
                    {apiKeys.map((apiKey) => (
                      <div key={apiKey.id} className="flex items-center justify-between rounded-lg bg-secondary/30 p-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-foreground">{apiKey.name}</p>
                            <Badge variant="secondary" className="font-mono text-xs">{apiKey.prefix}...{apiKey.last4}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">创建于 {new Date(apiKey.created_at).toLocaleDateString("zh-CN")}</p>
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => deleteKey(apiKey.id)}>
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
                      <CardDescription>仓库内可以继续用 `pnpm cli -- ...`，对外用户走独立发布包 `@artifacta/cli`。</CardDescription>
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
