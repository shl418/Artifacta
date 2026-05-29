"use client"

import { HelpCircle, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" />
              {t("nav.new")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem asChild>
              <Link href="/upload">{t("nav.new.dashboard")}</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/datasets">{t("nav.new.dataset")}</Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="ghost" size="icon" className="h-8 w-8">
          <HelpCircle className="h-4 w-4 text-muted-foreground" />
        </Button>
      </div>
    </header>
  )
}
