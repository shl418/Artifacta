"use client"

import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { BookOpen, CheckCircle2, KeyRound, PackageOpen, Terminal } from "lucide-react"
import { Header } from "@/components/header"
import { Sidebar } from "@/components/sidebar"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useLanguage } from "@/lib/i18n/context"

const content = {
  zh: {
    title: "帮助与发布指南",
    intro: "从安装 skill、创建 API Key 到发布第一个看板，按下面四步即可完成。",
    keyTitle: "API Key 在哪里配置？",
    keyBody: "进入“系统设置 → API & CLI”创建 Key。Key 只显示一次，请立即复制并保存在环境变量中。",
    keyAction: "打开 API & CLI",
    step1: "1. 安装 Artifacta Publisher skill",
    step1Desc: "支持 Codex、Claude Code、Cursor 等兼容 skills CLI 的 AI 编程助手。",
    step2: "2. 配置站点与 API Key",
    step2Desc: "ARTIFACTA_URL 填当前 Artifacta 站点地址；不要把 API Key 写进仓库、看板或 prompt。",
    step3: "3. 检查连接",
    step3Desc: "doctor 会检查 Node、站点地址、API Key 与服务连通性。",
    step4: "4. 发布看板",
    step4Desc: "单文件 HTML 适合内联数据；包含 CSV、JSON、CSS、JS 或图片时请上传 ZIP。",
    uploadAction: "打开网页上传",
    noteTitle: "动态数据的当前边界",
    noteBody: "动态更新使用 ZIP 中 artifacta.json 声明的 sync_scripts，并从项目页或 CLI 手动触发。当前版本不提供 cron、URL、COS 或 Presto 自动同步。",
  },
  en: {
    title: "Help & publishing guide",
    intro: "Install the skill, create an API key, and publish your first dashboard in four steps.",
    keyTitle: "Where do I configure API keys?",
    keyBody: "Open Settings → API & CLI and create a key. It is shown once, so copy it immediately and keep it in environment variables.",
    keyAction: "Open API & CLI",
    step1: "1. Install the Artifacta Publisher skill",
    step1Desc: "Works with Codex, Claude Code, Cursor, and other agents supported by the skills CLI.",
    step2: "2. Configure the site and API key",
    step2Desc: "Set ARTIFACTA_URL to this Artifacta site. Never put an API key in a repository, dashboard, or prompt.",
    step3: "3. Check the connection",
    step3Desc: "doctor checks Node, the site URL, the API key, and service connectivity.",
    step4: "4. Publish a dashboard",
    step4Desc: "Use one HTML file for inlined data. Upload a ZIP when the app includes CSV, JSON, CSS, JS, or images.",
    uploadAction: "Open web upload",
    noteTitle: "Current dynamic-data boundary",
    noteBody: "Dynamic updates use sync_scripts declared in the ZIP's artifacta.json and are triggered manually from the project page or CLI. This release does not provide cron, URL, COS, or Presto auto-sync.",
  },
} as const

export default function HelpPage() {
  const { lang, t } = useLanguage()
  const copy = content[lang]
  const [siteUrl, setSiteUrl] = useState("https://artifacta.example.com")

  useEffect(() => {
    setSiteUrl(window.location.origin)
  }, [])

  const envCommand = `export ARTIFACTA_URL=${siteUrl}
export ARTIFACTA_API_KEY=art_...`

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col p-2 pl-0">
        <main className="flex flex-1 flex-col overflow-hidden rounded-xl bg-card shadow-sm">
          <Header title={t("help.title")} />
          <div className="flex-1 overflow-y-auto p-6">
            <div className="mx-auto max-w-4xl space-y-6">
              <div>
                <h2 className="text-2xl font-semibold text-foreground">{copy.title}</h2>
                <p className="mt-2 text-muted-foreground">{copy.intro}</p>
              </div>

              <Alert>
                <KeyRound className="h-4 w-4" />
                <AlertTitle>{copy.keyTitle}</AlertTitle>
                <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <span>{copy.keyBody}</span>
                  <Button size="sm" asChild>
                    <Link href="/settings/api">{copy.keyAction}</Link>
                  </Button>
                </AlertDescription>
              </Alert>

              <div className="grid gap-4 md:grid-cols-2">
                <GuideCard icon={PackageOpen} title={copy.step1} description={copy.step1Desc}>
                  <CodeBlock code="npx -y skills@latest add github:shl418/Artifacta --skill artifacta-publisher" />
                </GuideCard>
                <GuideCard icon={KeyRound} title={copy.step2} description={copy.step2Desc}>
                  <CodeBlock code={envCommand} />
                </GuideCard>
                <GuideCard icon={CheckCircle2} title={copy.step3} description={copy.step3Desc}>
                  <CodeBlock code="npx -y @artifacta/cli@latest doctor" />
                </GuideCard>
                <GuideCard icon={Terminal} title={copy.step4} description={copy.step4Desc}>
                  <CodeBlock code={'npx -y @artifacta/cli@latest projects upload \\\n  --file ./dashboard.zip \\\n  --name "Sales Dashboard" \\\n  --visibility team'} />
                  <Button variant="outline" size="sm" className="mt-3" asChild>
                    <Link href="/upload">{copy.uploadAction}</Link>
                  </Button>
                </GuideCard>
              </div>

              <Alert>
                <BookOpen className="h-4 w-4" />
                <AlertTitle>{copy.noteTitle}</AlertTitle>
                <AlertDescription>{copy.noteBody}</AlertDescription>
              </Alert>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

function GuideCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Terminal
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Icon className="h-5 w-5 text-primary" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-[#0d1117] p-4 font-mono text-sm text-[#c9d1d9]">
      <code>{code}</code>
    </pre>
  )
}
