"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  FileBarChart,
  Upload,
  Settings,
  ChevronDown,
  LogOut,
} from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Logo } from "@/components/logo"

const mainNavigation = [
  { name: "概览", href: "/", icon: LayoutDashboard },
  { name: "BI 看板", href: "/dashboards", icon: FileBarChart },
  { name: "创建项目", href: "/upload", icon: Upload },
]

const baseSettingsNavigation = [
  { name: "基本设置", href: "/settings" },
  { name: "团队成员", href: "/settings/team" },
  { name: "权限管理", href: "/settings/permissions" },
  { name: "API & CLI", href: "/settings/api" },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [settingsOpen, setSettingsOpen] = useState(pathname.startsWith("/settings"))
  const [user, setUser] = useState<{ name: string; role: string; initials: string } | null>(null)

  const isSettingsActive = pathname.startsWith("/settings")
  const settingsNavigation = user?.role === "admin"
    ? [...baseSettingsNavigation, { name: "运维", href: "/settings/operations" }]
    : baseSettingsNavigation

  useEffect(() => {
    fetch("/api/v1/auth/me")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => payload && setUser({ name: payload.name, role: payload.role, initials: payload.initials }))
      .catch(() => null)
  }, [])

  const logout = async () => {
    await fetch("/api/v1/auth/logout", { method: "POST" })
    router.replace("/login")
    router.refresh()
  }

  return (
    <TooltipProvider delayDuration={0}>
      {/* Sidebar Island */}
      <aside className="w-16 md:w-64 h-screen p-2 shrink-0">
        <div className="flex flex-col h-full bg-sidebar rounded-xl shadow-sm">
          {/* Logo */}
          <div className="flex items-center h-14 px-4">
            <div className="flex items-center gap-3">
              <Logo size={32} />
              <span className="hidden font-semibold text-sidebar-foreground md:inline">
                Artifacta
              </span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
            {/* Main Navigation */}
            {mainNavigation.map((item) => {
              const isActive = pathname === item.href
              const Icon = item.icon

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className="hidden md:inline">{item.name}</span>
                </Link>
              )
            })}

            {/* Settings with Sub-menu */}
            <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
              <CollapsibleTrigger asChild>
                <button
                  className={cn(
                    "flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    isSettingsActive
                      ? "bg-sidebar-accent text-sidebar-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Settings className="h-5 w-5 shrink-0" />
                    <span className="hidden md:inline">系统设置</span>
                  </div>
                  <ChevronDown className={cn(
                    "hidden md:block",
                    "h-4 w-4 transition-transform",
                    settingsOpen && "rotate-180"
                  )} />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="hidden pl-8 mt-1 space-y-0.5 md:block">
                {settingsNavigation.map((item) => {
                  const isActive = pathname === item.href
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
                        isActive
                          ? "bg-sidebar-primary text-sidebar-primary-foreground"
                          : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                      )}
                    >
                      {item.name}
                    </Link>
                  )
                })}
              </CollapsibleContent>
            </Collapsible>
          </nav>

          {/* User section */}
          <div className="p-3 mt-auto">
            <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-sidebar-accent transition-colors">
              <Avatar className="h-9 w-9 shrink-0">
                <AvatarImage src="/placeholder-user.jpg" alt="用户头像" />
                <AvatarFallback className="bg-primary/20 text-primary text-sm">
                  {user?.initials ?? "DV"}
                </AvatarFallback>
              </Avatar>
              <div className="hidden flex-1 min-w-0 md:block">
                <p className="text-sm font-medium text-sidebar-foreground truncate">
                  {user?.name ?? "Artifacta"}
                </p>
                <p className="text-xs text-sidebar-foreground/60 truncate">
                  {user?.role === "admin" ? "管理员" : "使用者"}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-sidebar-foreground/60 hover:text-sidebar-foreground"
                onClick={logout}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </aside>
    </TooltipProvider>
  )
}
