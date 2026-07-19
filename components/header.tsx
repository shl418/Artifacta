"use client"

import { HelpCircle, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { useLanguage } from "@/lib/i18n/context"

interface HeaderProps {
  title: string
}

export function Header({ title }: HeaderProps) {
  const { t } = useLanguage()

  return (
    <header className="flex items-center justify-between h-14 px-6 shrink-0 border-b border-border/50">
      <h1 className="text-lg font-semibold text-foreground">{title}</h1>

      <div className="flex items-center gap-2">
        <Button size="sm" className="gap-1.5" asChild>
          <Link href="/upload">
              <Plus className="h-4 w-4" />
              {t("nav.new")}
          </Link>
        </Button>

        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
          <Link href="/help" aria-label={t("nav.help")} title={t("nav.help")}>
            <HelpCircle className="h-4 w-4 text-muted-foreground" />
          </Link>
        </Button>
      </div>
    </header>
  )
}
