"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { AlertCircle, Crown, Mail, Search, Shield, Trash2, User, UserPlus } from "lucide-react"
import { useLanguage } from "@/lib/i18n/context"

interface TeamMember {
  id: string
  name: string
  email: string
  initials: string
  role: "admin" | "member"
  status: "active" | "pending" | "disabled"
  projects_count: number
  joined_at: string
}

export default function TeamPage() {
  const { t } = useLanguage()
  const [members, setMembers] = useState<TeamMember[]>([])
  const [searchInput, setSearchInput] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState("member")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [inviting, setInviting] = useState(false)
  const [updatingRoleIds, setUpdatingRoleIds] = useState<Set<string>>(new Set())
  const [pendingDisable, setPendingDisable] = useState<TeamMember | null>(null)
  const [disabling, setDisabling] = useState(false)

  const loadMembers = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (searchQuery) params.set("search", searchQuery)
      const response = await fetch(`/api/v1/team/members?${params.toString()}`)
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        setError(payload?.error?.message ?? t("settings.team.load.error"))
        return
      }
      setError("")
      setMembers(payload.data)
    } finally {
      setIsLoading(false)
    }
  }, [searchQuery, t])

  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchInput), 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    loadMembers().catch(() => {
      setMembers([])
      setError(t("common.error.network"))
      setIsLoading(false)
    })
  }, [loadMembers, t])

  const counts = useMemo(() => ({
    admin: members.filter((member) => member.role === "admin").length,
    member: members.filter((member) => member.role === "member").length,
  }), [members])

  const invite = async () => {
    if (inviting) return
    setInviting(true)
    try {
      const response = await fetch("/api/v1/team/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      })
      if (response.ok) {
        setInviteEmail("")
        setInviteDialogOpen(false)
        await loadMembers()
      } else {
        const payload = await response.json().catch(() => null)
        setError(payload?.error?.message ?? t("settings.team.load.error"))
      }
    } finally {
      setInviting(false)
    }
  }

  const updateRole = async (userId: string, role: "admin" | "member") => {
    if (updatingRoleIds.has(userId)) return
    setUpdatingRoleIds((prev) => new Set([...prev, userId]))
    try {
      const response = await fetch(`/api/v1/team/members/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        setError(payload?.error?.message ?? t("settings.team.load.error"))
        return
      }
      await loadMembers()
    } finally {
      setUpdatingRoleIds((prev) => { const s = new Set(prev); s.delete(userId); return s })
    }
  }

  const disableMember = async () => {
    if (!pendingDisable || disabling) return
    setDisabling(true)
    try {
      const response = await fetch(`/api/v1/team/members/${pendingDisable.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "disabled" }),
      })
      setPendingDisable(null)
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        setError(payload?.error?.message ?? t("settings.team.load.error"))
        return
      }
      await loadMembers()
    } finally {
      setDisabling(false)
    }
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 p-2 pl-0">
        <main className="flex-1 flex flex-col bg-card rounded-xl shadow-sm overflow-hidden">
          <Header title={t("settings.team.title")} />
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-5xl mx-auto space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <Metric label={t("settings.team.all")} value={members.length} icon={User} />
                <Metric label={t("settings.team.metric.admin")} value={counts.admin} icon={Crown} />
                <Metric label={t("settings.team.metric.member")} value={counts.member} icon={User} />
              </div>

              <Card className="bg-card border-border">
                <CardHeader>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <CardTitle className="text-lg">{t("settings.team.list.title")}</CardTitle>
                      <CardDescription>{t("settings.team.list.desc")}</CardDescription>
                    </div>
                    <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
                      <DialogTrigger asChild>
                        <Button>
                          <UserPlus className="h-4 w-4" />
                          {t("settings.team.invite")}
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="bg-card border-border">
                        <DialogHeader>
                          <DialogTitle>{t("settings.team.invite.title")}</DialogTitle>
                          <DialogDescription>{t("settings.team.invite.desc")}</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 pt-4">
                          <div className="space-y-2">
                            <Label>{t("settings.team.invite.email")}</Label>
                            <Input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="name@company.com" />
                          </div>
                          <div className="space-y-2">
                            <Label>{t("settings.team.invite.role")}</Label>
                            <Select value={inviteRole} onValueChange={setInviteRole}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="admin">{t("common.role.admin")}</SelectItem>
                                <SelectItem value="member">{t("common.role.member")}</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button variant="secondary" onClick={() => setInviteDialogOpen(false)}>{t("common.cancel")}</Button>
                            <Button onClick={invite} disabled={!inviteEmail || inviting}>
                              <Mail className="h-4 w-4" />
                              {t("settings.team.invite.send")}
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder={t("settings.team.search.placeholder")} value={searchInput} onChange={(event) => setSearchInput(event.target.value)} className="pl-9 bg-secondary/50" />
                  </div>

                  {error && (
                    <Alert variant="destructive" className="mb-4">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>{t("settings.team.error.title")}</AlertTitle>
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-3">
                    {isLoading && (
                      <div className="flex flex-col items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                        <Spinner className="size-5" />
                        加载中…
                      </div>
                    )}
                    {!isLoading && !error && members.length <= 1 && (
                      <Empty className="border py-10">
                        <EmptyHeader>
                          <EmptyMedia variant="icon"><UserPlus /></EmptyMedia>
                          <EmptyTitle>{t("settings.team.only_you")}</EmptyTitle>
                          <EmptyDescription>{t("settings.team.only_you.desc")}</EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    )}
                    {members.map((member) => (
                      <div key={member.id} className="flex flex-col gap-4 p-4 bg-secondary/30 rounded-lg md:flex-row md:items-center md:justify-between">
                        <div className="flex items-center gap-4">
                          <Avatar className="h-10 w-10">
                            <AvatarFallback className={member.role === "admin" ? "bg-primary/20 text-primary" : "bg-accent/20 text-accent"}>{member.initials}</AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-foreground">{member.name}</p>
                              {member.status !== "active" && <Badge variant="secondary" className="text-xs">{member.status}</Badge>}
                            </div>
                            <p className="text-sm text-muted-foreground">{member.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right hidden md:block">
                            <p className="text-sm text-foreground">{member.projects_count} {t("settings.team.projects")}</p>
                            <p className="text-xs text-muted-foreground">{t("settings.team.joined")} {new Date(member.joined_at).toLocaleDateString()}</p>
                          </div>
                          <Select value={member.role} disabled={updatingRoleIds.has(member.id)} onValueChange={(value) => updateRole(member.id, value as "admin" | "member")}>
                            <SelectTrigger className="w-28 h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">{t("common.role.admin")}</SelectItem>
                              <SelectItem value="member">{t("common.role.member")}</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            aria-label={`${t("settings.team.disable")} ${member.name}`}
                            title={`${t("settings.team.disable")} ${member.name}`}
                            disabled={member.status === "disabled"}
                            onClick={() => setPendingDisable(member)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>
      <AlertDialog open={!!pendingDisable} onOpenChange={(open) => !open && setPendingDisable(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("settings.team.disable.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("settings.team.disable")} &quot;{pendingDisable?.name}&quot;
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={disabling} onClick={(event) => { event.preventDefault(); disableMember() }}>
              {t("common.disable")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Shield }) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold text-foreground">{value}</p>
          </div>
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
