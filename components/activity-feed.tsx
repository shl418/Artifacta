"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { FileBarChart, Database, Users, Upload, Shield } from "lucide-react"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/lib/i18n/context"

interface Activity {
  id: string
  type: "dashboard" | "dataset" | "team" | "upload" | "permission"
  user: {
    name: string
    avatar?: string
  }
  action: string
  target: string
  timestamp: string
}

const activityIcons = {
  dashboard: FileBarChart,
  dataset: Database,
  team: Users,
  upload: Upload,
  permission: Shield,
}

const activityColors = {
  dashboard: "bg-primary/10 text-primary",
  dataset: "bg-accent/10 text-accent",
  team: "bg-chart-2/10 text-chart-2",
  upload: "bg-chart-4/10 text-chart-4",
  permission: "bg-chart-5/10 text-chart-5",
}

interface ActivityFeedProps {
  activities: Activity[]
}

export function ActivityFeed({ activities }: ActivityFeedProps) {
  const { t } = useLanguage()

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-gradient-to-b from-card to-secondary/10 shadow-sm">
      <div className="border-b border-border/80 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-medium text-foreground">{t("activity.title")}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{t("activity.subtitle")}</p>
          </div>
          <div className="rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
            {activities.length} {t("activity.count")}
          </div>
        </div>
      </div>
      <div className="space-y-3 p-4">
        {activities.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-background/70 px-4 py-6 text-center text-sm text-muted-foreground">
            {t("activity.empty")}
          </div>
        ) : activities.map((activity) => {
          const Icon = activityIcons[activity.type]
          return (
            <div
              key={activity.id}
              className="rounded-xl border border-border/70 bg-background/80 p-4 shadow-sm transition-colors hover:border-primary/20 hover:bg-background"
            >
              <div className="flex items-start gap-3">
                <Avatar className="mt-0.5 h-9 w-9 shrink-0 border border-border/70 bg-background">
                  <AvatarImage src={activity.user.avatar} alt={activity.user.name} />
                  <AvatarFallback className="text-xs font-medium bg-primary/15 text-primary">
                    {activity.user.name.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm leading-6 text-foreground">
                        <span className="font-semibold">{activity.user.name}</span>
                        <span className="text-muted-foreground"> {activity.action}</span>
                      </p>
                      <p className="mt-1 truncate text-sm font-medium text-primary">{activity.target}</p>
                    </div>
                    <div
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-transparent",
                        activityColors[activity.type]
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {activity.timestamp}
                  </p>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
