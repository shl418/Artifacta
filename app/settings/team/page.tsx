"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Crown, Mail, Search, Shield, Trash2, User, UserPlus } from "lucide-react"

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

  const loadMembers = useCallback(async () => {
    const params = new URLSearchParams()
    if (searchQuery) params.set("search", searchQuery)
    const response = await fetch(`/api/v1/team/members?${params.toString()}`)
    if (response.ok) {
      const payload = await response.json()
      setMembers(payload.data)
    }
  }, [searchQuery])

  useEffect(() => {
    loadMembers().catch(() => setMembers([]))
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
    }
  }

  const updateRole = async (userId: string, role: "admin" | "member") => {
    await fetch(`/api/v1/team/members/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    })
    await loadMembers()
  }

  const removeMember = async (userId: string) => {
    await fetch(`/api/v1/team/members/${userId}`, { method: "DELETE" })
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

                  <div className="space-y-3">
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
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeMember(member.id)}>
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
