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
import type { ProjectVisibility } from "@/lib/types"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/lib/i18n/context"
import type { TranslationKey } from "@/lib/i18n/translations"

interface ProjectSummary {
  id: string
  name: string
  description: string
  visibility: ProjectVisibility
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
  private: { icon: Lock, color: "text-amber-600 bg-amber-50 border-amber-200" },
  team: { icon: Users, color: "text-primary bg-primary/5 border-primary/20" },
  public: { icon: Globe, color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
}

const visibilityKey: Record<string, TranslationKey> = {
  private: "common.visibility.private",
  team: "common.visibility.team",
  public: "common.visibility.public",
}

export default function DashboardsPage() {
  const { t } = useLanguage()
  const [payload, setPayload] = useState<ProjectsPayload | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [visibilityFilter, setProjectVisibilityFilter] = useState<"all" | ProjectVisibility>("all")
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [createFolderOpen, setCreateFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState("")
  const [error, setError] = useState("")
  const [pendingDelete, setPendingDelete] = useState<ProjectSummary | null>(null)

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
    const params = new URLSearchParams({ page: String(currentPage), per_page: "10", folder_id: currentFolderId ?? "root" })
    if (searchQuery) params.set("search", searchQuery)
    if (visibilityFilter !== "all") params.set("visibility", visibilityFilter)
    const response = await fetch(`/api/v1/projects?${params.toString()}`)
    const nextPayload = await response.json().catch(() => null)
    if (!response.ok) {
      setError(nextPayload?.error?.message ?? t("dashboards.error"))
      return
    }
    setError("")
    setPayload(nextPayload)
  }, [currentFolderId, currentPage, searchQuery, visibilityFilter, t])

  useEffect(() => {
    loadProjects().catch(() => {
      setPayload(null)
      setError(t("common.error.network"))
    })
  }, [loadProjects, t])

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
      const data = await response.json().catch(() => null)
      setError(data?.error?.message ?? t("dashboards.error"))
    }
  }

  const moveProject = async (projectId: string, folderId: string | null) => {
    const response = await fetch(`/api/v1/projects/${projectId}/folder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folder_id: folderId }),
    })
    if (!response.ok) {
      const data = await response.json().catch(() => null)
      setError(data?.error?.message ?? t("dashboards.error"))
      return
    }
    await loadProjects()
  }

  const updateProjectVisibility = async (projectId: string, visibility: ProjectVisibility) => {
    const response = await fetch(`/api/v1/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visibility }),
    })
    if (!response.ok) {
      const data = await response.json().catch(() => null)
      setError(data?.error?.message ?? t("dashboards.error"))
      return
    }
    await loadProjects()
  }

  const deleteProject = async () => {
    if (!pendingDelete) return
    const response = await fetch(`/api/v1/projects/${pendingDelete.id}`, { method: "DELETE" })
    setPendingDelete(null)
    if (!response.ok) {
      const data = await response.json().catch(() => null)
      setError(data?.error?.message ?? t("dashboards.error"))
      return
    }
    await loadProjects()
  }

  const deleteDataset = async () => {
    if (!pendingDeleteDataset) return
    const { id, project_id } = pendingDeleteDataset
    const response = await fetch(`/api/v1/projects/${project_id}/datasets/${id}`, { method: "DELETE" })
    setPendingDeleteDataset(null)
    if (!response.ok) {
      const data = await response.json().catch(() => null)
      setError(data?.error?.message ?? t("dashboards.error"))
      return
    }
    setProjectDatasets((prev) => ({
      ...prev,
      [project_id]: (prev[project_id] ?? []).filter((ds) => ds.id !== id),
    }))
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 p-2 pl-0">
        <main className="flex-1 flex flex-col bg-card rounded-xl shadow-sm overflow-hidden">
          <Header title={t("dashboards.title")} />
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
                  {t("dashboards.filter.all")}
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
                    placeholder={t("dashboards.search.placeholder")}
                    value={searchQuery}
                    onChange={(event) => { setSearchQuery(event.target.value); setCurrentPage(1) }}
                    className="h-8 pl-8 text-sm"
                  />
                  {searchQuery && (
                    <Button variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-5 w-5" onClick={() => setSearchQuery("")}>
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>

                <Select value={visibilityFilter} onValueChange={(value) => { setProjectVisibilityFilter(value as "all" | ProjectVisibility); setCurrentPage(1) }}>
                  <SelectTrigger className="w-28 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("dashboards.filter.perm")}</SelectItem>
                    <SelectItem value="private">{t("common.visibility.private")}</SelectItem>
                    <SelectItem value="team">{t("common.visibility.team")}</SelectItem>
                    <SelectItem value="public">{t("common.visibility.public")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button size="sm" className="h-8 gap-1.5" onClick={() => setCreateFolderOpen(true)}>
                <FolderPlus className="h-3.5 w-3.5" />
                {t("dashboards.folder.new")}
              </Button>
            </div>

            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>{t("dashboards.error.title")}</AlertTitle>
                <AlertDescription>
                  <p>{error}</p>
                  <Button variant="outline" size="sm" className="mt-2" onClick={() => loadProjects()}>
                    <RefreshCw className="h-3.5 w-3.5" />
                    {t("common.retry")}
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            <div className="rounded-lg border border-border bg-card">
              <div className="overflow-x-auto">
                <Table className="min-w-[720px]">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[38%]">{t("dashboards.col.name")}</TableHead>
                      <TableHead>{t("dashboards.col.perm")}</TableHead>
                      <TableHead>{t("dashboards.col.owner")}</TableHead>
                      <TableHead>{t("dashboards.col.updated")}</TableHead>
                      <TableHead className="text-right">{t("dashboards.col.views")}</TableHead>
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
                              <div className="text-xs text-muted-foreground">{folder.project_count} {t("dashboards.count")}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell colSpan={5} className="text-xs text-muted-foreground">{t("dashboards.folder.type")}</TableCell>
                      </TableRow>
                    ))}

                    {(payload?.data ?? []).map((project) => {
                      const PermIcon = permissionConfig[project.visibility].icon
                      const isExpanded = expandedProjectIds.has(project.id)
                      const isLoadingDs = loadingDatasetIds.has(project.id)
                      const datasets = projectDatasets[project.id]
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
                                {t(visibilityKey[project.visibility] ?? "common.visibility.private")}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Avatar className="h-5 w-5">
                                  <AvatarFallback className="text-[10px] bg-primary/10 text-primary">{project.owner?.initials ?? "U"}</AvatarFallback>
                                </Avatar>
                                <span className="text-xs text-muted-foreground">{project.owner?.name ?? t("common.unknown")}</span>
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
                                      {t("dashboards.move_to")}
                                    </DropdownMenuSubTrigger>
                                    <DropdownMenuSubContent>
                                      <DropdownMenuItem onClick={() => moveProject(project.id, null)}>
                                        <Home className="h-4 w-4 mr-2" />
                                        {t("dashboards.folder.root")}
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
                                      {t("dashboards.manage")}
                                    </Link>
                                  </DropdownMenuItem>
                                  <DropdownMenuSub>
                                    <DropdownMenuSubTrigger>
                                      <Settings2 className="h-4 w-4 mr-2" />
                                      {t("dashboards.visibility.change")}
                                    </DropdownMenuSubTrigger>
                                    <DropdownMenuSubContent>
                                      <DropdownMenuItem onClick={() => updateProjectVisibility(project.id, "private")}>{t("common.visibility.private")}</DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => updateProjectVisibility(project.id, "team")}>{t("common.visibility.team")}</DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => updateProjectVisibility(project.id, "public")}>{t("common.visibility.public")}</DropdownMenuItem>
                                    </DropdownMenuSubContent>
                                  </DropdownMenuSub>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem className="text-destructive" onClick={() => setPendingDelete(project)}>
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    {t("common.delete")}
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
                    <EmptyTitle>{t("dashboards.empty.title")}</EmptyTitle>
                    <EmptyDescription>{t("dashboards.empty.desc")}</EmptyDescription>
                  </EmptyHeader>
                  <EmptyContent>
                    <Button asChild><Link href="/upload">{t("dashboards.empty.action")}</Link></Button>
                  </EmptyContent>
                </Empty>
              )}

              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <div className="text-sm text-muted-foreground">{payload?.pagination.total ?? 0} {t("dashboards.count")}</div>
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

      <DatasetConfigDialog
        dataset={selectedDataset?.dataset ?? null}
        projectName={selectedDataset?.projectName ?? ""}
        open={!!selectedDataset}
        onOpenChange={(open) => !open && setSelectedDataset(null)}
      />

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("dashboards.delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("dashboards.delete.desc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={deleteProject}>
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pendingDeleteDataset} onOpenChange={(open) => !open && setPendingDeleteDataset(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("datasets.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("dashboards.delete.desc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={deleteDataset}>
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={createFolderOpen} onOpenChange={setCreateFolderOpen}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("dashboards.folder.new")}</DialogTitle>
            <DialogDescription>{t("dashboards.folder.create.desc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>{t("dashboards.folder.new.name")}</Label>
              <Input value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && createFolder()} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreateFolderOpen(false)}>{t("common.cancel")}</Button>
              <Button onClick={createFolder} disabled={!newFolderName.trim()}>{t("common.create")}</Button>
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
  const { t } = useLanguage()
  void projectId
  void projectName
  if (isLoading || datasets === undefined) {
    return (
      <div className="px-12 py-3 bg-secondary/20 text-xs text-muted-foreground">
        {t("dashboards.ds.loading")}
      </div>
    )
  }
  if (datasets.length === 0) {
    return (
      <div className="px-12 py-3 bg-secondary/20 text-xs text-muted-foreground">
        {t("dashboards.ds.empty")}
      </div>
    )
  }
  return (
    <div className="bg-secondary/10 border-t border-border/50">
      <div className="px-4 py-2 flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
        <FileSpreadsheet className="h-3.5 w-3.5" />
        {t("dashboards.ds.count")} ({datasets.length})
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
                {dataset.rows ?? "?"} {t("common.rows")} · {dataset.columns ?? "?"} {t("common.cols")} · v{dataset.version} · {formatDate(dataset.updated_at)}
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
  const { t } = useLanguage()
  const [dialogError, setDialogError] = useState("")
  const [preview, setPreview] = useState<DatasetPreviewPayload | null>(null)
  const [versions, setVersions] = useState<DatasetVersionPayload["data"]>([])
  const [syncHistory, setSyncHistory] = useState<Array<{
    sync_id: string
    status: string
    started_at: string
    completed_at: string | null
    rows_synced: number
    error: string | null
  }>>([])

  useEffect(() => {
    if (!dataset) return
    setDialogError("")
    setPreview(null)
    setVersions([])
    setSyncHistory([])
    Promise.all([
      fetch(`/api/v1/projects/${dataset.project_id}/datasets/${dataset.id}/preview`).then((r) => r.json()),
      fetch(`/api/v1/projects/${dataset.project_id}/datasets/${dataset.id}/versions`).then((r) => r.json()),
      fetch(`/api/v1/projects/${dataset.project_id}/datasets/${dataset.id}/sync/history?per_page=10`).then((r) => r.json()),
    ])
      .then(([previewPayload, versionPayload, historyPayload]) => {
        if (previewPayload?.error) setDialogError(previewPayload.error.message)
        else setPreview(previewPayload)
        if (versionPayload?.data) setVersions(versionPayload.data)
        setSyncHistory(historyPayload?.data ?? [])
      })
      .catch(() => setDialogError(t("dashboards.ds.error")))
  }, [dataset, t])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{dataset?.name ?? t("dashboards.ds.count")}</DialogTitle>
          {projectName && <DialogDescription>{t("dashboards.ds.owner")}{projectName}</DialogDescription>}
        </DialogHeader>
        {dialogError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{t("dashboards.ds.error.title")}</AlertTitle>
            <AlertDescription>{dialogError}</AlertDescription>
          </Alert>
        )}
        <Tabs defaultValue="preview" className="py-4">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="preview">{t("dashboards.ds.tab.preview")}</TabsTrigger>
            <TabsTrigger value="history">{t("dashboards.ds.tab.history")}</TabsTrigger>
            <TabsTrigger value="runs">{t("dashboards.ds.tab.runs")}</TabsTrigger>
            <TabsTrigger value="sync">{t("dashboards.ds.tab.sync")}</TabsTrigger>
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
              !dialogError && <p className="text-sm text-muted-foreground">{t("dashboards.ds.preview.empty")}</p>
            )}
          </TabsContent>
          <TabsContent value="history" className="pt-4">
            <div className="space-y-2">
              {versions.length === 0 && <p className="text-sm text-muted-foreground">{t("dashboards.ds.history.empty")}</p>}
              {versions.map((version) => (
                <div key={version.id} className="flex items-center justify-between rounded-lg border p-3 text-sm">
                  <div>
                    <p className="font-medium">v{version.version} · {version.file_name}</p>
                    <p className="text-xs text-muted-foreground">{version.rows ?? "?"} {t("common.rows")} · {version.columns ?? "?"} {t("common.cols")} · {version.file_type}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">{new Date(version.created_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </TabsContent>
          <TabsContent value="runs" className="pt-4 space-y-2">
            {syncHistory.length === 0 && <p className="text-sm text-muted-foreground">{t("dashboards.ds.runs.empty")}</p>}
            {syncHistory.map((run) => (
              <div key={run.sync_id} className="rounded-lg border p-3 text-sm space-y-1">
                <div className="flex items-center justify-between">
                  <Badge variant={run.status === "success" ? "secondary" : run.status === "failed" ? "destructive" : "outline"}>{run.status}</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(run.started_at).toLocaleString()}</span>
                </div>
                <p className="text-xs text-muted-foreground">{t("dashboards.ds.synced_rows")} {run.rows_synced} {t("common.rows")}</p>
                {run.error && <p className="text-xs text-destructive">{run.error}</p>}
              </div>
            ))}
          </TabsContent>
          <TabsContent value="sync" className="space-y-4 pt-4">
            <div className="rounded-lg border bg-secondary/20 p-3 text-xs text-muted-foreground">
              {t("project.datasets.empty")}
            </div>
            {dataset && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/projects/${dataset.project_id}`}>{t("dashboards.ds.goto_project")}</Link>
              </Button>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
}

function formatSize(size: number) {
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}
