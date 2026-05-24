"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Sidebar } from "@/components/sidebar"
import { Header } from "@/components/header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Eye,
  FileBarChart,
  Folder,
  FolderInput,
  FolderPlus,
  Globe,
  Home,
  Lock,
  MoreHorizontal,
  RefreshCw,
  Search,
  Settings2,
  Trash2,
  Users,
  X,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

type Visibility = "private" | "team" | "public"

interface ProjectSummary {
  id: string
  name: string
  description: string
  visibility: Visibility
  folder_id: string | null
  owner: { name: string; initials: string } | null
  views_count: number
  updated_at: string
}

interface FolderSummary {
  id: string
  name: string
  project_count: number
}

interface ProjectsPayload {
  data: ProjectSummary[]
  folders: FolderSummary[]
  pagination: { page: number; per_page: number; total: number; total_pages: number }
}

const permissionConfig = {
  private: { label: "私有", icon: Lock, color: "text-amber-600 bg-amber-50 border-amber-200" },
  team: { label: "团队", icon: Users, color: "text-primary bg-primary/5 border-primary/20" },
  public: { label: "公开", icon: Globe, color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
}

export default function DashboardsPage() {
  const [payload, setPayload] = useState<ProjectsPayload | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [visibilityFilter, setVisibilityFilter] = useState<"all" | Visibility>("all")
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [createFolderOpen, setCreateFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")
  const [error, setError] = useState("")
  const [pendingDelete, setPendingDelete] = useState<ProjectSummary | null>(null)

  const currentFolder = useMemo(
    () => payload?.folders.find((folder) => folder.id === currentFolderId) ?? null,
    [payload?.folders, currentFolderId]
  )

  const loadProjects = useCallback(async () => {
    const params = new URLSearchParams({ page: String(currentPage), per_page: "10", folder_id: currentFolderId ?? "root" })
    if (searchQuery) params.set("search", searchQuery)
    if (visibilityFilter !== "all") params.set("visibility", visibilityFilter)
    const response = await fetch(`/api/v1/projects?${params.toString()}`)
    const nextPayload = await response.json().catch(() => null)
    if (!response.ok) {
      setError(nextPayload?.error?.message ?? "无法加载看板列表。")
      return
    }
    setError("")
    setPayload(nextPayload)
  }, [currentFolderId, currentPage, searchQuery, visibilityFilter])

  useEffect(() => {
    loadProjects().catch(() => {
      setPayload(null)
      setError("网络异常，无法加载看板列表。")
    })
  }, [loadProjects])

  const createFolder = async () => {
    if (!newFolderName.trim()) return
    const response = await fetch("/api/v1/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newFolderName }),
    })
    if (response.ok) {
      setNewFolderName("")
      setCreateFolderOpen(false)
      await loadProjects()
    } else {
      const payload = await response.json().catch(() => null)
      setError(payload?.error?.message ?? "创建文件夹失败。")
    }
  }

  const moveProject = async (projectId: string, folderId: string | null) => {
    const response = await fetch(`/api/v1/projects/${projectId}/folder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder_id: folderId }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      setError(payload?.error?.message ?? "移动项目失败。")
      return
    }
    await loadProjects()
  }

  const updateVisibility = async (projectId: string, visibility: Visibility) => {
    const response = await fetch(`/api/v1/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visibility }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      setError(payload?.error?.message ?? "更新可见性失败。")
      return
    }
    await loadProjects()
  }

  const deleteProject = async () => {
    if (!pendingDelete) return
    const response = await fetch(`/api/v1/projects/${pendingDelete.id}`, { method: "DELETE" })
    setPendingDelete(null)
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      setError(payload?.error?.message ?? "删除项目失败。")
      return
    }
    await loadProjects()
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 p-2 pl-0">
        <main className="flex-1 flex flex-col bg-card rounded-xl shadow-sm overflow-hidden">
          <Header title="BI 看板" />
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="flex flex-col gap-4 mb-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn("h-8 px-2 text-xs", currentFolderId === null && "font-medium text-primary")}
                  onClick={() => {
                    setCurrentFolderId(null)
                    setCurrentPage(1)
                  }}
                >
                  <Home className="h-3.5 w-3.5" />
                  全部
                </Button>
                {currentFolder && (
                  <>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">{currentFolder.name}</span>
                  </>
                )}

                <div className="relative w-64">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="搜索看板..."
                    value={searchQuery}
                    onChange={(event) => {
                      setSearchQuery(event.target.value)
                      setCurrentPage(1)
                    }}
                    className="h-8 pl-8 text-sm"
                  />
                  {searchQuery && (
                    <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5" onClick={() => setSearchQuery("")}>
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>

                <Select
                  value={visibilityFilter}
                  onValueChange={(value) => {
                    setVisibilityFilter(value as "all" | Visibility)
                    setCurrentPage(1)
                  }}
                >
                  <SelectTrigger className="w-28 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部权限</SelectItem>
                    <SelectItem value="private">私有</SelectItem>
                    <SelectItem value="team">团队</SelectItem>
                    <SelectItem value="public">公开</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button size="sm" className="h-8 gap-1.5" onClick={() => setCreateFolderOpen(true)}>
                <FolderPlus className="h-3.5 w-3.5" />
                新建文件夹
              </Button>
            </div>

            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>操作失败</AlertTitle>
                <AlertDescription>
                  <p>{error}</p>
                  <Button variant="outline" size="sm" className="mt-2" onClick={() => loadProjects()}>
                    <RefreshCw className="h-3.5 w-3.5" />
                    重试
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            <div className="rounded-lg border border-border bg-card overflow-hidden overflow-x-auto">
              <Table className="min-w-[720px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[40%]">名称</TableHead>
                    <TableHead>权限</TableHead>
                    <TableHead>创建者</TableHead>
                    <TableHead>更新时间</TableHead>
                    <TableHead className="text-right">浏览</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentFolderId === null && (payload?.folders ?? []).map((folder) => (
                    <TableRow key={folder.id} className="cursor-pointer hover:bg-secondary/50" onClick={() => setCurrentFolderId(folder.id)}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
                            <Folder className="h-4 w-4 text-amber-600" />
                          </div>
                          <div>
                            <div className="font-medium text-sm">{folder.name}</div>
                            <div className="text-xs text-muted-foreground">{folder.project_count} 个看板</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell colSpan={5} className="text-xs text-muted-foreground">文件夹</TableCell>
                    </TableRow>
                  ))}

                  {(payload?.data ?? []).map((project) => {
                    const PermIcon = permissionConfig[project.visibility].icon
                    return (
                      <TableRow key={project.id} className="hover:bg-secondary/50 group">
                        <TableCell>
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
                        <TableCell>
                          <Badge variant="outline" className={cn("gap-1 font-normal text-xs", permissionConfig[project.visibility].color)}>
                            <PermIcon className="h-3 w-3" />
                            {permissionConfig[project.visibility].label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-5 w-5">
                              <AvatarFallback className="text-[10px] bg-primary/10 text-primary">{project.owner?.initials ?? "U"}</AvatarFallback>
                            </Avatar>
                            <span className="text-xs text-muted-foreground">{project.owner?.name ?? "Unknown"}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDate(project.updated_at)}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" />{project.views_count}</span>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuSub>
                                <DropdownMenuSubTrigger>
                                  <FolderInput className="h-4 w-4 mr-2" />
                                  移动到
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent>
                                  <DropdownMenuItem onClick={() => moveProject(project.id, null)}>
                                    <Home className="h-4 w-4 mr-2" />
                                    根目录
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  {(payload?.folders ?? []).map((folder) => (
                                    <DropdownMenuItem key={folder.id} onClick={() => moveProject(project.id, folder.id)}>
                                      <Folder className="h-4 w-4 mr-2" />
                                      {folder.name}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuSubContent>
                              </DropdownMenuSub>
                              <DropdownMenuItem asChild>
                                <Link href={`/projects/${project.id}`}>
                                  <Settings2 className="h-4 w-4 mr-2" />
                                  管理项目
                                </Link>
                              </DropdownMenuItem>
                              <DropdownMenuSub>
                                <DropdownMenuSubTrigger>
                                  <Settings2 className="h-4 w-4 mr-2" />
                                  可见性
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent>
                                  <DropdownMenuItem onClick={() => updateVisibility(project.id, "private")}>私有</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => updateVisibility(project.id, "team")}>团队</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => updateVisibility(project.id, "public")}>公开</DropdownMenuItem>
                                </DropdownMenuSubContent>
                              </DropdownMenuSub>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive" onClick={() => setPendingDelete(project)}>
                                <Trash2 className="h-4 w-4 mr-2" />
                                删除
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>

              {!error && payload && payload.data.length === 0 && currentFolderId === null && payload.folders.length === 0 && (
                <Empty className="border-0 py-16">
                  <EmptyHeader>
                    <EmptyMedia variant="icon"><FileBarChart /></EmptyMedia>
                    <EmptyTitle>还没有看板</EmptyTitle>
                    <EmptyDescription>上传 HTML 或 ZIP 应用后，团队会在这里看到可预览、可分享的项目。</EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <Button asChild><Link href="/upload">创建第一个项目</Link></Button>
                  </EmptyContent>
                </Empty>
              )}

              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <div className="text-sm text-muted-foreground">共 {payload?.pagination.total ?? 0} 个看板</div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" className="h-8 w-8" disabled={currentPage <= 1} onClick={() => setCurrentPage((page) => page - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground">{payload?.pagination.page ?? 1} / {payload?.pagination.total_pages ?? 1}</span>
                  <Button variant="outline" size="icon" className="h-8 w-8" disabled={currentPage >= (payload?.pagination.total_pages ?? 1)} onClick={() => setCurrentPage((page) => page + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      <Dialog open={createFolderOpen} onOpenChange={setCreateFolderOpen}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle>新建文件夹</DialogTitle>
            <DialogDescription>创建一个文件夹来整理看板。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>文件夹名称</Label>
              <Input value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && createFolder()} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreateFolderOpen(false)}>取消</Button>
              <Button onClick={createFolder} disabled={!newFolderName.trim()}>创建</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除项目</AlertDialogTitle>
            <AlertDialogDescription>
              这会删除 “{pendingDelete?.name}” 及其数据集、权限和同步历史，操作完成后不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={deleteProject}>
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}
