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
import { AlertCircle, Crown, Mail, Search, Shield, Trash2, User, UserPlus } from "lucide-react"

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
  const [members, setMembers] = useState<TeamMember[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState("member")
  const [error, setError] = useState("")
  const [pendingDisable, setPendingDisable] = useState<TeamMember | null>(null)

  const loadMembers = useCallback(async () => {
    const params = new URLSearchParams()
    if (searchQuery) params.set("search", searchQuery)
    const response = await fetch(`/api/v1/team/members?${params.toString()}`)
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      setError(payload?.error?.message ?? "无法加载团队成员。")
      return
    }
    setError("")
    setMembers(payload.data)
  }, [searchQuery])

  useEffect(() => {
    loadMembers().catch(() => {
      setMembers([])
      setError("网络异常，无法加载团队成员。")
    })
  }, [loadMembers])

  const counts = useMemo(() => ({
    admin: members.filter((member) => member.role === "admin").length,
    member: members.filter((member) => member.role === "member").length,
  }), [members])

  const invite = async () => {
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
      setError(payload?.error?.message ?? "邀请成员失败。")
    }
  }

  const updateRole = async (userId: string, role: "admin" | "member") => {
    const response = await fetch(`/api/v1/team/members/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      setError(payload?.error?.message ?? "更新角色失败。")
      return
    }
    await loadMembers()
  }

  const disableMember = async () => {
    if (!pendingDisable) return
    const response = await fetch(`/api/v1/team/members/${pendingDisable.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "disabled" }),
    })
    setPendingDisable(null)
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      setError(payload?.error?.message ?? "禁用成员失败。")
      return
    }
    await loadMembers()
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 p-2 pl-0">
        <main className="flex-1 flex flex-col bg-card rounded-xl shadow-sm overflow-hidden">
          <Header title="团队成员" />
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-5xl mx-auto space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <Metric label="总成员" value={members.length} icon={User} />
                <Metric label="管理员" value={counts.admin} icon={Crown} />
                <Metric label="使用者" value={counts.member} icon={User} />
              </div>

              <Card className="bg-card border-border">
                <CardHeader>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <CardTitle className="text-lg">成员列表</CardTitle>
                      <CardDescription>管理团队成员的角色和访问状态。</CardDescription>
                    </div>
                    <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
                      <DialogTrigger asChild>
                        <Button>
                          <UserPlus className="h-4 w-4" />
                          邀请成员
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="bg-card border-border">
                        <DialogHeader>
                          <DialogTitle>邀请新成员</DialogTitle>
                          <DialogDescription>本地开源版会直接创建可登录成员。</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 pt-4">
                          <div className="space-y-2">
                            <Label>邮箱地址</Label>
                            <Input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="name@company.com" />
                          </div>
                          <div className="space-y-2">
                            <Label>角色</Label>
                            <Select value={inviteRole} onValueChange={setInviteRole}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="admin">管理员</SelectItem>
                                <SelectItem value="member">使用者</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button variant="secondary" onClick={() => setInviteDialogOpen(false)}>取消</Button>
                            <Button onClick={invite} disabled={!inviteEmail}>
                              <Mail className="h-4 w-4" />
                              发送邀请
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
                    <Input placeholder="搜索成员..." value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} className="pl-9 bg-secondary/50" />
                  </div>

                  {error && (
                    <Alert variant="destructive" className="mb-4">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>团队操作失败</AlertTitle>
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-3">
                    {!error && members.length <= 1 && (
                      <Empty className="border py-10">
                        <EmptyHeader>
                          <EmptyMedia variant="icon"><UserPlus /></EmptyMedia>
                          <EmptyTitle>团队里还只有你</EmptyTitle>
                          <EmptyDescription>邀请成员后，可以在这里调整角色、查看项目数量并禁用访问。</EmptyDescription>
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
                            <p className="text-sm text-foreground">{member.projects_count} 个项目</p>
                            <p className="text-xs text-muted-foreground">加入于 {new Date(member.joined_at).toLocaleDateString("zh-CN")}</p>
                          </div>
                          <Select value={member.role} onValueChange={(value) => updateRole(member.id, value as "admin" | "member")}>
                            <SelectTrigger className="w-28 h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">管理员</SelectItem>
                              <SelectItem value="member">使用者</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" disabled={member.status === "disabled"} onClick={() => setPendingDisable(member)}>
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
            <AlertDialogTitle>禁用成员</AlertDialogTitle>
            <AlertDialogDescription>
              禁用 “{pendingDisable?.name}” 后，该成员不能继续登录或使用 API Key。已有项目和审计记录会保留。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={disableMember}>
              禁用
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
