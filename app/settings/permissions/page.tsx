"use client"

import { Sidebar } from "@/components/sidebar"
import { Header } from "@/components/header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Shield,
  Users,
  FileBarChart,
  Database,
  Settings,
  Crown,
  User,
} from "lucide-react"
import { useLanguage } from "@/lib/i18n/context"
import type { TranslationKey } from "@/lib/i18n/translations"

const roles: Array<{
  id: string
  nameKey: TranslationKey
  descKey: TranslationKey
  icon: typeof Crown
  color: string
}> = [
  {
    id: "admin",
    nameKey: "settings.permissions.role.admin.name",
    descKey: "settings.permissions.role.admin.desc",
    icon: Crown,
    color: "bg-primary/10 text-primary border-primary/20",
  },
  {
    id: "user",
    nameKey: "settings.permissions.role.user.name",
    descKey: "settings.permissions.role.user.desc",
    icon: User,
    color: "bg-accent/10 text-accent border-accent/20",
  },
]

const permissionGroups: Array<{
  categoryKey: TranslationKey
  icon: typeof FileBarChart
  items: Array<{ nameKey: TranslationKey; admin: boolean; user: boolean }>
}> = [
  {
    categoryKey: "settings.permissions.cat.projects",
    icon: FileBarChart,
    items: [
      { nameKey: "settings.permissions.item.create_project", admin: true, user: true },
      { nameKey: "settings.permissions.item.view_all_projects", admin: true, user: false },
      { nameKey: "settings.permissions.item.edit_own_projects", admin: true, user: true },
      { nameKey: "settings.permissions.item.delete_own_projects", admin: true, user: true },
      { nameKey: "settings.permissions.item.manage_project_members", admin: true, user: true },
      { nameKey: "settings.permissions.item.edit_others_projects", admin: true, user: false },
    ],
  },
  {
    categoryKey: "settings.permissions.cat.datasets",
    icon: Database,
    items: [
      { nameKey: "settings.permissions.item.upload_datasets", admin: true, user: true },
      { nameKey: "settings.permissions.item.view_all_datasets", admin: true, user: false },
      { nameKey: "settings.permissions.item.manage_own_datasets", admin: true, user: true },
      { nameKey: "settings.permissions.item.delete_others_datasets", admin: true, user: false },
    ],
  },
  {
    categoryKey: "settings.permissions.cat.team",
    icon: Users,
    items: [
      { nameKey: "settings.permissions.item.view_team", admin: true, user: true },
      { nameKey: "settings.permissions.item.invite_members", admin: true, user: false },
      { nameKey: "settings.permissions.item.remove_members", admin: true, user: false },
      { nameKey: "settings.permissions.item.change_roles", admin: true, user: false },
    ],
  },
  {
    categoryKey: "settings.permissions.cat.system",
    icon: Settings,
    items: [
      { nameKey: "settings.permissions.item.view_settings", admin: true, user: false },
      { nameKey: "settings.permissions.item.edit_settings", admin: true, user: false },
      { nameKey: "settings.permissions.item.view_audit", admin: true, user: false },
      { nameKey: "settings.permissions.item.manage_api_keys", admin: true, user: true },
    ],
  },
]

export default function PermissionsPage() {
  const { t } = useLanguage()

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 p-2 pl-0">
        <main className="flex-1 flex flex-col bg-card rounded-xl shadow-sm overflow-hidden">
          <Header title={t("settings.permissions.title")} />
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-5xl mx-auto space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                {roles.map((role) => {
                  const Icon = role.icon
                  return (
                    <Card key={role.id} className={`bg-card border-2 ${role.color}`}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${role.id === "admin" ? "bg-primary/20" : "bg-accent/20"}`}>
                            <Icon className={`h-5 w-5 ${role.id === "admin" ? "text-primary" : "text-accent"}`} />
                          </div>
                          <div>
                            <CardTitle className="text-lg">{t(role.nameKey)}</CardTitle>
                            <CardDescription className="mt-1">{t(role.descKey)}</CardDescription>
                          </div>
                        </div>
                      </CardHeader>
                    </Card>
                  )
                })}
              </div>

              <Card className="bg-secondary/30 border-border">
                <CardContent className="py-4">
                  <div className="flex items-start gap-3">
                    <Shield className="h-5 w-5 text-primary mt-0.5" />
                    <div className="text-sm text-muted-foreground">
                      <p className="font-medium text-foreground mb-1">{t("settings.permissions.info.title")}</p>
                      <p>{t("settings.permissions.info.body")}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-lg">{t("settings.permissions.matrix.title")}</CardTitle>
                  <CardDescription>{t("settings.permissions.matrix.desc")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {permissionGroups.map((group) => {
                    const Icon = group.icon
                    return (
                      <div key={group.categoryKey}>
                        <div className="flex items-center gap-2 mb-3">
                          <Icon className="h-4 w-4 text-primary" />
                          <span className="font-medium text-foreground">{t(group.categoryKey)}</span>
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow className="border-border hover:bg-transparent">
                              <TableHead className="text-muted-foreground w-[60%]">{t("settings.permissions.col.perm")}</TableHead>
                              <TableHead className="text-center text-muted-foreground">
                                <div className="flex items-center justify-center gap-1">
                                  <Crown className="h-3 w-3" />
                                  {t("settings.permissions.role.admin.name")}
                                </div>
                              </TableHead>
                              <TableHead className="text-center text-muted-foreground">
                                <div className="flex items-center justify-center gap-1">
                                  <User className="h-3 w-3" />
                                  {t("settings.permissions.role.user.name")}
                                </div>
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {group.items.map((item) => (
                              <TableRow key={item.nameKey} className="border-border">
                                <TableCell className="text-foreground text-sm">{t(item.nameKey)}</TableCell>
                                <TableCell className="text-center">
                                  <div className="flex justify-center">
                                    <Switch checked={item.admin} disabled className="data-[state=checked]:bg-primary" />
                                  </div>
                                </TableCell>
                                <TableCell className="text-center">
                                  <div className="flex justify-center">
                                    <Switch checked={item.user} disabled className="data-[state=checked]:bg-accent" />
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
