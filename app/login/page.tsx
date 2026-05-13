"use client"

import { FormEvent, Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { BarChart3, LogIn, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const demoAccounts = [
  { email: "admin@datavision.local", name: "张三", label: "管理员" },
  { email: "lisi@datavision.local", name: "李四", label: "使用者" },
]

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-background grid place-items-center text-sm text-muted-foreground">加载登录页...</main>}>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState(demoAccounts[0].email)
  const [name, setName] = useState(demoAccounts[0].name)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")

  const login = async (event?: FormEvent) => {
    event?.preventDefault()
    setIsSubmitting(true)
    setError("")

    const response = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name }),
    })

    setIsSubmitting(false)

    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      setError(payload?.error?.message ?? "登录失败，请稍后重试。")
      return
    }

    router.replace(searchParams.get("next") || "/")
    router.refresh()
  }

  return (
    <main className="min-h-screen bg-background grid place-items-center p-6">
      <div className="w-full max-w-md space-y-5">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
            <BarChart3 className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">DataVision</h1>
            <p className="text-sm text-muted-foreground">企业级 BI 看板托管平台</p>
          </div>
        </div>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" />
              登录工作台
            </CardTitle>
            <CardDescription>本地开源版使用开发 SSO 流程，生产环境可替换为 SAML/OIDC。</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={login}>
              <div className="space-y-2">
                <Label htmlFor="email">邮箱</Label>
                <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">姓名</Label>
                <Input id="name" value={name} onChange={(event) => setName(event.target.value)} />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button className="w-full" type="submit" disabled={isSubmitting}>
                <LogIn className="size-4" />
                {isSubmitting ? "登录中" : "进入 DataVision"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-2">
          {demoAccounts.map((account) => (
            <Button
              key={account.email}
              variant="outline"
              className="justify-start h-auto py-3"
              onClick={() => {
                setEmail(account.email)
                setName(account.name)
              }}
            >
              <span className="text-left">
                <span className="block text-sm font-medium">{account.name}</span>
                <span className="block text-xs text-muted-foreground">{account.label}</span>
              </span>
            </Button>
          ))}
        </div>
      </div>
    </main>
  )
}
