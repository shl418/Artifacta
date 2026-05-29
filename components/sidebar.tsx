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
  Languages,
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
import { useLanguage } from "@/lib/i18n/context"
import type { TranslationKey } from "@/lib/i18n/translations"

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { t, lang, setLang } = useLanguage()
  const [settingsOpen, setSettingsOpen] = useState(pathname.startsWith("/settings"))
  const [user, setUser] = useState<{ name: string; role: string; initials: string } | null>(null)

  const mainNavigation: Array<{ nameKey: TranslationKey; href: string; icon: typeof LayoutDashboard }> = [
    { nameKey: "nav.overview", href: "/", icon: LayoutDashboard },
    { nameKey: "nav.dashboards", href: "/dashboards", icon: FileBarChart },
    { nameKey: "nav.upload", href: "/upload", icon: Upload },
  ]

  const baseSettingsNavigation: Array<{ nameKey: TranslationKey; href: string }> = [
    { nameKey: "nav.settings.basic", href: "/settings" },
    { nameKey: "nav.settings.team", href: "/settings/team" },
    { nameKey: "nav.settings.permissions", href: "/settings/permissions" },
    { nameKey: "nav.settings.api", href: "/settings/api" },
  ]

  const isSettingsActive = pathname.startsWith("/settings")
  const settingsNavigation = user?.role === "admin"
    ? [...baseSettingsNavigation, { nameKey: "nav.settings.operations" as TranslationKey, href: "/settings/operations" }]
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
            {mainNavigation.map((item) => {
              const isActive = pathname === item.href
              const Icon = item.icon

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className="hidden md:inline">{t(item.nameKey)}</span>
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
                    <span className="hidden md:inline">{t("nav.settings")}</span>
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
                      {t(item.nameKey)}
                    </Link>
                  )
                })}
              </CollapsibleContent>
            </Collapsible>
          </nav>

          {/* Language toggle + User section */}
          <div className="p-3 mt-auto space-y-1">
            {/* Language switcher */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setLang(lang === "zh" ? "en" : "zh")}
                  className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
                >
                  <Languages className="h-4 w-4 shrink-0" />
                  <span className="hidden md:inline">{lang === "zh" ? "English" : "中文"}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                {lang === "zh" ? "Switch to English" : "切换为中文"}
              </TooltipContent>
            </Tooltip>

            {/* User */}
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
                  {user?.role === "admin" ? t("nav.admin") : t("nav.member")}
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
