"use client"

import { FormEvent, Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { LogIn, ShieldCheck } from "lucide-react"
import { Logo } from "@/components/logo"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useLanguage } from "@/lib/i18n/context"

const demoAccounts = [
  { email: "admin@artifacta.local", name: "张三", label: "管理员", labelEn: "Admin" },
  { email: "lisi@artifacta.local", name: "李四", label: "使用者", labelEn: "Member" },
]

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm />
    </Suspense>
  )
}

function LoginFallback() {
  const { t } = useLanguage()
  return (
    <main className="min-h-screen bg-background grid place-items-center text-sm text-muted-foreground">
      {t("login.loading")}
    </main>
  )
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { t, lang } = useLanguage()
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
      setError(payload?.error?.message ?? t("login.error"))
      return
    }

    router.replace(searchParams.get("next") || "/")
    router.refresh()
  }

  return (
    <main className="min-h-screen bg-background grid place-items-center p-6">
      <div className="w-full max-w-md space-y-5">
        <div className="flex items-center gap-3">
          <Logo size={40} />
          <div>
            <h1 className="text-xl font-semibold text-foreground">Artifacta</h1>
            <p className="text-sm text-muted-foreground">{t("login.subtitle")}</p>
          </div>
        </div>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" />
              {t("login.title")}
            </CardTitle>
            <CardDescription>{t("login.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={login}>
              <div className="space-y-2">
                <Label htmlFor="email">{t("login.email")}</Label>
                <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">{t("login.name")}</Label>
                <Input id="name" value={name} onChange={(event) => setName(event.target.value)} />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button className="w-full" type="submit" disabled={isSubmitting}>
                <LogIn className="size-4" />
                {isSubmitting ? t("login.submitting") : t("login.submit")}
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
                <span className="block text-xs text-muted-foreground">
                  {lang === "zh" ? account.label : account.labelEn}
                </span>
              </span>
            </Button>
          ))}
        </div>
      </div>
    </main>
  )
}
