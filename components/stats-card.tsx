import { cn } from "@/lib/utils"
import { LucideIcon } from "lucide-react"

interface StatsCardProps {
  title: string
  value: string | number
  change?: {
    value: number
    label: string
  }
  icon: LucideIcon
  iconColor?: string
}

export function StatsCard({
  title,
  value,
  change,
  icon: Icon,
  iconColor = "text-primary",
}: StatsCardProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 hover:border-primary/30 transition-colors">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-3xl font-semibold text-foreground">{value}</p>
          {change && (
            <p
              className={cn(
                "text-xs flex items-center gap-1",
                change.value >= 0 ? "text-success" : "text-destructive"
              )}
            >
              <span>
                {change.value >= 0 ? "+" : ""}
                {change.value}%
              </span>
              <span className="text-muted-foreground">{change.label}</span>
            </p>
          )}
        </div>
        <div
          className={cn(
            "p-3 rounded-lg bg-secondary",
            iconColor
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  )
}
