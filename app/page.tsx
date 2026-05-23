"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Sidebar } from "@/components/sidebar"
import { Header } from "@/components/header"
import { StatsCard } from "@/components/stats-card"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import {
  AlertCircle,
  ArrowRight,
  Clock,
  Database,
  Eye,
  FileBarChart,
  Globe,
  Lock,
  RefreshCw,
  TrendingUp,
  Upload,
  Users,
} from "lucide-react"

interface ProjectSummary {
  id: string
  name: string
  description: string
  visibility: "private" | "team" | "public"
  preview_url: string
  owner: { name: string; initials: string } | null
  views_count: number
  updated_at: string
}

interface OverviewPayload {
  stats: {
    projects: number
    datasets: number
    members: number
    views: number
  }
  recent_projects: ProjectSummary[]
  popular_projects: ProjectSummary[]
}

const permissionConfig = {
  private: { label: "私有", icon: Lock, color: "text-amber-600 bg-amber-100" },
  team: { label: "团队", icon: Users, color: "text-primary bg-primary/10" },
  public: { label: "公开", icon: Globe, color: "text-emerald-600 bg-emerald-100" },
}

export default function HomePage() {
  const [payload, setPayload] = useState<OverviewPayload | null>(null)
  const [activeTab, setActiveTab] = useState("recent")
  const [error, setError] = useState("")

  const loadOverview = useCallback(async () => {
    const response = await fetch("/api/v1/stats")
    const nextPayload = await response.json().catch(() => null)
    if (!response.ok) {
      setError(nextPayload?.error?.message ?? "无法加载概览数据。")
      setPayload(null)
      return
    }
    setError("")
    setPayload(nextPayload)
  }, [])

  useEffect(() => {
    loadOverview().catch(() => {
      setPayload(null)
      setError("网络异常，无法加载概览数据。")
    })
  }, [loadOverview])

  const projects = activeTab === "recent" ? payload?.recent_projects ?? [] : payload?.popular_projects ?? []
  const stats = [
    { title: "看板总数", value: payload?.stats.projects ?? 0, change: { value: 0, label: "当前" }, icon: FileBarChart },
    { title: "数据集", value: payload?.stats.datasets ?? 0, change: { value: 0, label: "当前" }, icon: Database },
    { title: "团队成员", value: payload?.stats.members ?? 0, change: { value: 0, label: "当前" }, icon: Users },
    { title: "累计浏览", value: payload?.stats.views ?? 0, change: { value: 0, label: "当前" }, icon: Eye },
  ]

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 p-2 pl-0">
        <main className="flex-1 flex flex-col bg-card rounded-xl shadow-sm overflow-hidden">
          <Header title="概览" />
          <div className="flex-1 overflow-y-auto p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {stats.map((stat) => (
                <StatsCard key={stat.title} {...stat} />
              ))}
            </div>

            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>概览加载失败</AlertTitle>
                <AlertDescription>
                  <p>{error}</p>
                  <Button variant="outline" size="sm" className="mt-2" onClick={loadOverview}>
                    <RefreshCw className="h-3.5 w-3.5" />
                    重试
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <TabsList className="bg-secondary/50">
                  <TabsTrigger value="recent" className="gap-2">
                    <Clock className="h-4 w-4" />
                    最近更新
                  </TabsTrigger>
                  <TabsTrigger value="popular" className="gap-2">
                    <TrendingUp className="h-4 w-4" />
                    热门看板
                  </TabsTrigger>
                </TabsList>
                <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                  <Link href="/dashboards">
                    查看全部
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Link>
                </Button>
              </div>

              <TabsContent value={activeTab} className="mt-3">
                {!error && projects.length === 0 && (
                  <Empty className="border py-16">
                    <EmptyHeader>
                      <EmptyMedia variant="icon"><FileBarChart /></EmptyMedia>
                      <EmptyTitle>还没有看板</EmptyTitle>
                      <EmptyDescription>上传第一个 HTML 或 ZIP 看板后，这里会显示最近更新和热门项目。</EmptyDescription>
                    </EmptyHeader>
                    <Button asChild className="mt-4">
                      <Link href="/upload"><Upload className="h-4 w-4" />创建项目</Link>
                    </Button>
                  </Empty>
                )}
                {projects.length > 0 && (
                <Card className="border-border bg-card p-0 overflow-hidden">
                  <div className="overflow-x-auto">
                  <Table className="table-fixed min-w-[520px]">
                    <TableBody>
                      {projects.map((project) => {
                        const PermIcon = permissionConfig[project.visibility].icon
                        return (
                          <TableRow key={project.id} className="cursor-pointer hover:bg-secondary/50">
                            <TableCell className="w-[62%] max-w-0 pr-4">
                              <Link href={`/view/${project.id}`} className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                  <FileBarChart className="h-4 w-4 text-primary" />
                                </div>
                                <div className="min-w-0">
                                  <div className="font-medium text-foreground truncate text-sm">{project.name}</div>
                                  <div className="text-xs text-muted-foreground truncate">{project.description}</div>
                                </div>
                              </Link>
                            </TableCell>
                            <TableCell className="hidden w-[92px] sm:table-cell">
                              <Badge variant="secondary" className={cn("gap-1 font-normal text-xs", permissionConfig[project.visibility].color)}>
                                <PermIcon className="h-3 w-3" />
                                {permissionConfig[project.visibility].label}
                              </Badge>
                            </TableCell>
                            <TableCell className="hidden w-[104px] md:table-cell">
                              <div className="flex items-center gap-2">
                                <Avatar className="h-5 w-5">
                                  <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                                    {project.owner?.initials ?? "U"}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-xs text-muted-foreground">{project.owner?.name ?? "Unknown"}</span>
                              </div>
                            </TableCell>
                            <TableCell className="w-[64px] text-right">
                              <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                                <Eye className="h-3 w-3" />
                                {project.views_count}
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                  </div>
                </Card>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </div>
  )
}
