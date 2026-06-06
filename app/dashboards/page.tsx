"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
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
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Eye,
  FileBarChart,
  FileSpreadsheet,
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

interface DatasetRecord {
  id: string
  project_id: string
  name: string
  description: string
  file_name: string
  file_type: string
  size: number
  rows: number | null
  columns: number | null
  version: number
  updated_at: string
}

interface DatasetPreviewPayload {
  parsed: boolean
  message?: string
  schema: Array<{ name: string; type: string }>
  rows: Array<Record<string, unknown>>
}

interface DatasetVersionPayload {
  data: Array<{
    id: string
    version: number
    file_name: string
    file_type: string
    rows: number | null
    columns: number | null
    created_at: string
  }>
}

const permissionConfig = {
  private: { label: "私有", icon: Lock, color: "text-amber-600 bg-amber-50 border-amber-200" },
  team: { label: "团队", icon: Users, color: "text-primary bg-primary/5 border-primary/20" },
  public: { label: "公开", icon: Globe, color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
}

export default function DashboardsPage() {
  const [payload, setPayload] = useState<ProjectsPayload | null>(null)
  const [searchInput, setSearchInput] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [visibilityFilter, setVisibilityFilter] = useState<"all" | Visibility>("all")
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [createFolderOpen, setCreateFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [pendingDelete, setPendingDelete] = useState<ProjectSummary | null>(null)

  const [creatingFolder, setCreatingFolder] = useState(false)
  const [movingProjectIds, setMovingProjectIds] = useState<Set<string>>(new Set())
  const [updatingVisibilityIds, setUpdatingVisibilityIds] = useState<Set<string>>(new Set())
  const [deletingProject, setDeletingProject] = useState(false)
  const [deletingDataset, setDeletingDataset] = useState(false)

  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(new Set())
  const [projectDatasets, setProjectDatasets] = useState<Record<string, DatasetRecord[]>>({})
  const [loadingDatasetIds, setLoadingDatasetIds] = useState<Set<string>>(new Set())
  const [selectedDataset, setSelectedDataset] = useState<{ dataset: DatasetRecord; projectName: string } | null>(null)
  const [pendingDeleteDataset, setPendingDeleteDataset] = useState<DatasetRecord | null>(null)

  const currentFolder = useMemo(
    () => payload?.folders.find((folder) => folder.id === currentFolderId) ?? null,
    [payload?.folders, currentFolderId]
  )

  const loadProjects = useCallback(async () => {
    try {
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
    } finally {
      setIsLoading(false)
    }
  }, [currentFolderId, currentPage, searchQuery, visibilityFilter])

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput)
      setCurrentPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    loadProjects().catch(() => {
      setPayload(null)
      setError("网络异常，无法加载看板列表。")
      setIsLoading(false)
    })
  }, [loadProjects])

  const toggleProjectExpand = useCallback(async (projectId: string) => {
    if (expandedProjectIds.has(projectId)) {
      setExpandedProjectIds((prev) => { const s = new Set(prev); s.delete(projectId); return s })
      return
    }
    setExpandedProjectIds((prev) => new Set([...prev, projectId]))
    if (!projectDatasets[projectId]) {
      setLoadingDatasetIds((prev) => new Set([...prev, projectId]))
      try {
        const response = await fetch(`/api/v1/projects/${projectId}/datasets`)
        const data = await response.json().catch(() => null)
        if (response.ok) setProjectDatasets((prev) => ({ ...prev, [projectId]: data.data ?? [] }))
      } finally {
        setLoadingDatasetIds((prev) => { const s = new Set(prev); s.delete(projectId); return s })
      }
    }
  }, [expandedProjectIds, projectDatasets])

  const createFolder = async () => {
    if (!newFolderName.trim() || creatingFolder) return
    setCreatingFolder(true)
    try {
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
        const data = await response.json().catch(() => null)
        setError(data?.error?.message ?? "创建文件夹失败。")
      }
    } finally {
      setCreatingFolder(false)
    }
  }

  const moveProject = async (projectId: string, folderId: string | null) => {
    if (movingProjectIds.has(projectId)) return
    setMovingProjectIds((prev) => new Set([...prev, projectId]))
    try {
      const response = await fetch(`/api/v1/projects/${projectId}/folder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder_id: folderId }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        setError(data?.error?.message ?? "移动项目失败。")
        return
      }
      await loadProjects()
    } finally {
      setMovingProjectIds((prev) => { const s = new Set(prev); s.delete(projectId); return s })
    }
  }

  const updateVisibility = async (projectId: string, visibility: Visibility) => {
    if (updatingVisibilityIds.has(projectId)) return
    setUpdatingVisibilityIds((prev) => new Set([...prev, projectId]))
    try {
      const response = await fetch(`/api/v1/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        setError(data?.error?.message ?? "更新可见性失败。")
        return
      }
      await loadProjects()
    } finally {
      setUpdatingVisibilityIds((prev) => { const s = new Set(prev); s.delete(projectId); return s })
    }
  }

  const deleteProject = async () => {
    if (!pendingDelete || deletingProject) return
    setDeletingProject(true)
    try {
      const response = await fetch(`/api/v1/projects/${pendingDelete.id}`, { method: "DELETE" })
      setPendingDelete(null)
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        setError(data?.error?.message ?? "删除项目失败。")
        return
      }
      await loadProjects()
    } finally {
      setDeletingProject(false)
    }
  }

  const deleteDataset = async () => {
    if (!pendingDeleteDataset || deletingDataset) return
    setDeletingDataset(true)
    try {
      const { id, project_id } = pendingDeleteDataset
      const response = await fetch(`/api/v1/projects/${project_id}/datasets/${id}`, { method: "DELETE" })
      setPendingDeleteDataset(null)
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        setError(data?.error?.message ?? "删除数据集失败。")
        return
      }
      setProjectDatasets((prev) => ({
        ...prev,
        [project_id]: (prev[project_id] ?? []).filter((ds) => ds.id !== id),
      }))
    } finally {
      setDeletingDataset(false)
    }
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
                  onClick={() => { setCurrentFolderId(null); setCurrentPage(1) }}
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
                    value={searchInput}
                    onChange={(event) => setSearchInput(event.target.value)}
                    className="h-8 pl-8 text-sm"
                  />
                  {searchInput && (
                    <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5" onClick={() => setSearchInput("")}>
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>

                <Select value={visibilityFilter} onValueChange={(value) => { setVisibilityFilter(value as "all" | Visibility); setCurrentPage(1) }}>
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

            {isLoading && !payload ? (
              <div className="rounded-lg border border-border bg-card flex flex-col items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
                <Spinner className="size-5" />
                加载中…
              </div>
            ) : (
            <div className="rounded-lg border border-border bg-card">
              <div className="overflow-x-auto">
                <Table className="min-w-[720px]">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[38%]">名称</TableHead>
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
                      const isExpanded = expandedProjectIds.has(project.id)
                      const isLoadingDs = loadingDatasetIds.has(project.id)
                      const datasets = projectDatasets[project.id]
                      const isMoving = movingProjectIds.has(project.id)
                      const isUpdatingVisibility = updatingVisibilityIds.has(project.id)
                      return (
                        <React.Fragment key={project.id}>
                          <TableRow className="hover:bg-secondary/50 group">
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 shrink-0 text-muted-foreground"
                                  onClick={() => toggleProjectExpand(project.id)}
                                >
                                  <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", isExpanded && "rotate-90")} />
                                </Button>
                                <Link href={`/view/${project.id}`} className="flex items-center gap-2 min-w-0">
                                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                    <FileBarChart className="h-4 w-4 text-primary" />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="font-medium text-foreground truncate text-sm">{project.name}</div>
                                    <div className="text-xs text-muted-foreground truncate">{project.description}</div>
                                  </div>
                                </Link>
                              </div>
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
                                      <DropdownMenuItem disabled={isMoving} onClick={() => moveProject(project.id, null)}>
                                        <Home className="h-4 w-4 mr-2" />
                                        根目录
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      {(payload?.folders ?? []).map((folder) => (
                                        <DropdownMenuItem key={folder.id} disabled={isMoving} onClick={() => moveProject(project.id, folder.id)}>
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
                                      <DropdownMenuItem disabled={isUpdatingVisibility} onClick={() => updateVisibility(project.id, "private")}>私有</DropdownMenuItem>
                                      <DropdownMenuItem disabled={isUpdatingVisibility} onClick={() => updateVisibility(project.id, "team")}>团队</DropdownMenuItem>
                                      <DropdownMenuItem disabled={isUpdatingVisibility} onClick={() => updateVisibility(project.id, "public")}>公开</DropdownMenuItem>
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

                          {isExpanded && (
                            <TableRow key={`${project.id}-datasets`} className="hover:bg-transparent">
                              <TableCell colSpan={6} className="p-0 border-t-0">
                                <ProjectDatasetsPanel
                                  projectId={project.id}
                                  projectName={project.name}
                                  datasets={datasets}
                                  isLoading={isLoadingDs}
                                  onConfigure={(dataset) => setSelectedDataset({ dataset, projectName: project.name })}
                                  onDelete={(dataset) => setPendingDeleteDataset(dataset)}
                                />
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>

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
            )}
          </div>
        </main>
      </div>

      <DatasetConfigDialog
        dataset={selectedDataset?.dataset ?? null}
        projectName={selectedDataset?.projectName ?? ""}
        open={!!selectedDataset}
        onOpenChange={(open) => !open && setSelectedDataset(null)}
      />

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除项目</AlertDialogTitle>
            <AlertDialogDescription>
              这会删除 &quot;{pendingDelete?.name}&quot; 及其数据集、权限和同步历史，操作完成后不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={deletingProject} onClick={(event) => { event.preventDefault(); deleteProject() }}>
              {deletingProject ? "删除中…" : "删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pendingDeleteDataset} onOpenChange={(open) => !open && setPendingDeleteDataset(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除数据集</AlertDialogTitle>
            <AlertDialogDescription>
              这会删除 &quot;{pendingDeleteDataset?.name}&quot; 的文件、同步历史和版本记录，看板中引用它的代码不会自动修改。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={deletingDataset} onClick={(event) => { event.preventDefault(); deleteDataset() }}>
              {deletingDataset ? "删除中…" : "删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
              <Button onClick={createFolder} disabled={!newFolderName.trim() || creatingFolder}>
                {creatingFolder ? "创建中…" : "创建"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ProjectDatasetsPanel({
  projectId,
  projectName,
  datasets,
  isLoading,
  onConfigure,
  onDelete,
}: {
  projectId: string
  projectName: string
  datasets: DatasetRecord[] | undefined
  isLoading: boolean
  onConfigure: (dataset: DatasetRecord) => void
  onDelete: (dataset: DatasetRecord) => void
}) {
  void projectId
  void projectName
  if (isLoading || datasets === undefined) {
    return (
      <div className="px-12 py-3 bg-secondary/20 text-xs text-muted-foreground">
        加载数据集中…
      </div>
    )
  }
  if (datasets.length === 0) {
    return (
      <div className="px-12 py-3 bg-secondary/20 text-xs text-muted-foreground">
        该看板暂无数据集。
      </div>
    )
  }
  return (
    <div className="bg-secondary/10 border-t border-border/50">
      <div className="px-4 py-2 flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
        <FileSpreadsheet className="h-3.5 w-3.5" />
        数据集 ({datasets.length})
      </div>
      <div className="pb-2 space-y-px">
        {datasets.map((dataset) => (
          <div key={dataset.id} className="mx-4 flex items-center gap-3 px-3 py-2 rounded-md hover:bg-secondary/50 transition-colors">
            <FileSpreadsheet className="h-4 w-4 text-emerald-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium truncate">{dataset.name}</span>
                <Badge variant="outline" className="text-xs shrink-0">{dataset.file_type}</Badge>
                <span className="text-xs text-muted-foreground shrink-0">{formatSize(dataset.size)}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {dataset.rows ?? "?"} 行 · {dataset.columns ?? "?"} 列 · v{dataset.version} · {formatDate(dataset.updated_at)}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onConfigure(dataset)}>
                <Settings2 className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => onDelete(dataset)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function DatasetConfigDialog({
  dataset,
  projectName,
  open,
  onOpenChange,
}: {
  dataset: DatasetRecord | null
  projectName: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [dialogError, setDialogError] = useState("")
  const [preview, setPreview] = useState<DatasetPreviewPayload | null>(null)
  const [versions, setVersions] = useState<DatasetVersionPayload["data"]>([])
  const [versionsFailed, setVersionsFailed] = useState(false)
  const [syncHistory, setSyncHistory] = useState<Array<{
    sync_id: string
    status: string
    started_at: string
    completed_at: string | null
    rows_synced: number
    error: string | null
  }>>([])
  const [syncHistoryFailed, setSyncHistoryFailed] = useState(false)

  useEffect(() => {
    if (!dataset) return
    setDialogError("")
    setPreview(null)
    setVersions([])
    setVersionsFailed(false)
    setSyncHistory([])
    setSyncHistoryFailed(false)
    const readJson = async (response: Response) => ({ ok: response.ok, body: await response.json().catch(() => null) })
    Promise.all([
      fetch(`/api/v1/projects/${dataset.project_id}/datasets/${dataset.id}/preview`).then(readJson),
      fetch(`/api/v1/projects/${dataset.project_id}/datasets/${dataset.id}/versions`).then(readJson),
      fetch(`/api/v1/projects/${dataset.project_id}/datasets/${dataset.id}/sync/history?per_page=10`).then(readJson),
    ])
      .then(([previewResult, versionResult, historyResult]) => {
        if (!previewResult.ok || previewResult.body?.error) {
          setDialogError(previewResult.body?.error?.message ?? "无法加载数据集预览。")
        } else {
          setPreview(previewResult.body)
        }
        if (!versionResult.ok) setVersionsFailed(true)
        else setVersions(versionResult.body?.data ?? [])
        if (!historyResult.ok) setSyncHistoryFailed(true)
        else setSyncHistory(historyResult.body?.data ?? [])
      })
      .catch(() => setDialogError("无法加载数据集详情。"))
  }, [dataset])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{dataset?.name ?? "数据集详情"}</DialogTitle>
          {projectName && <DialogDescription>所属看板：{projectName}</DialogDescription>}
        </DialogHeader>
        {dialogError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>加载失败</AlertTitle>
            <AlertDescription>{dialogError}</AlertDescription>
          </Alert>
        )}
        <Tabs defaultValue="preview" className="py-4">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="preview">预览</TabsTrigger>
            <TabsTrigger value="history">版本</TabsTrigger>
            <TabsTrigger value="runs">同步记录</TabsTrigger>
            <TabsTrigger value="sync">数据更新</TabsTrigger>
          </TabsList>
          <TabsContent value="preview" className="pt-4">
            {preview?.parsed === false && <p className="text-sm text-muted-foreground">{preview.message}</p>}
            {preview?.schema?.length ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {preview.schema.map((col) => (
                    <Badge key={col.name} variant="outline">{col.name}: {col.type}</Badge>
                  ))}
                </div>
                <div className="max-h-64 overflow-auto rounded-lg border">
                  <pre className="p-3 text-xs">{JSON.stringify(preview.rows, null, 2)}</pre>
                </div>
              </div>
            ) : (
              !dialogError && <p className="text-sm text-muted-foreground">暂无可结构化预览的字段。</p>
            )}
          </TabsContent>
          <TabsContent value="history" className="pt-4">
            <div className="space-y-2">
              {versionsFailed ? (
                <p className="text-sm text-destructive">无法加载版本记录，请稍后重试。</p>
              ) : versions.length === 0 && <p className="text-sm text-muted-foreground">暂无版本记录。</p>}
              {versions.map((version) => (
                <div key={version.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <div>
                    <p className="font-medium">v{version.version} · {version.file_name}</p>
                    <p className="text-xs text-muted-foreground">{version.rows ?? "?"} 行 · {version.columns ?? "?"} 列 · {version.file_type}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{new Date(version.created_at).toLocaleString("zh-CN")}</p>
                </div>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="runs" className="pt-4 space-y-2">
            {syncHistoryFailed ? (
              <p className="text-sm text-destructive">无法加载同步运行记录，请稍后重试。</p>
            ) : syncHistory.length === 0 && <p className="text-sm text-muted-foreground">还没有同步运行记录。</p>}
            {syncHistory.map((run) => (
              <div key={run.sync_id} className="rounded-lg border p-3 text-sm space-y-1">
                <div className="flex items-center justify-between">
                  <Badge variant={run.status === "success" ? "secondary" : run.status === "failed" ? "destructive" : "outline"}>{run.status}</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(run.started_at).toLocaleString("zh-CN")}</span>
                </div>
                <p className="text-xs text-muted-foreground">同步 {run.rows_synced} 行</p>
                {run.error && <p className="text-xs text-destructive">{run.error}</p>}
              </div>
            ))}
          </TabsContent>
          <TabsContent value="sync" className="space-y-4 pt-4">
            <div className="rounded-lg border bg-secondary/20 p-3 text-xs text-muted-foreground">
              当前数据集为静态数据。数据更新已统一为&quot;项目同步脚本 + 手动触发&quot;，请到项目详情页的&quot;同步脚本&quot;中配置脚本输出并执行更新。
            </div>
            {dataset && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/projects/${dataset.project_id}`}>前往项目管理页 →</Link>
              </Button>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

function formatSize(size: number) {
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}
