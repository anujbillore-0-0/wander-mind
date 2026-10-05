"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Compass, Map, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("group inline-flex items-center gap-2", className)} aria-label="Wander Mind home">
      <svg viewBox="0 0 32 32" className="size-8 transition-transform duration-500 group-hover:rotate-[20deg]" aria-hidden>
        <circle cx="16" cy="16" r="14.5" fill="var(--teal-soft)" stroke="var(--teal)" strokeWidth="1.5" />
        <circle cx="16" cy="16" r="10" fill="none" stroke="var(--teal)" strokeOpacity=".25" strokeDasharray="2 2.5" />
        <path d="M16 5.5 19.2 16 16 26.5 12.8 16Z" fill="var(--teal)" />
        <path d="M16 5.5 19.2 16H12.8Z" fill="var(--coral)" />
        <circle cx="16" cy="16" r="1.8" fill="white" />
      </svg>
      <span className="font-display text-[1.35rem] leading-none font-semibold tracking-tight text-ink">
        wander<span className="text-teal">mind</span>
      </span>
    </Link>
  )
}

export function SiteHeader() {
  const path = usePathname()
  const onPlan = path?.startsWith("/plan")
  return (
    <header className="no-print sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-1 sm:gap-2">
          <Button asChild variant="ghost" size="lg" className="rounded-full px-3 text-[0.9rem]">
            <Link href="/trips">
              <Map className="size-4" />
              <span className="hidden sm:inline">My trips</span>
            </Link>
          </Button>
          {!onPlan && (
            <Button asChild size="lg" className="rounded-full px-4 text-[0.9rem] shadow-sm">
              <Link href="/plan">
                <Plus className="size-4" />
                Plan a trip
              </Link>
            </Button>
          )}
        </nav>
      </div>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="no-print mt-auto border-t border-border/60 bg-sand-deep/40">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:px-6">
        <div className="flex items-center gap-2">
          <Compass className="size-4 text-teal" />
          <span>Plans built on recent traveller evidence. Prices are ranges, so check locally.</span>
        </div>
        <span>Made for wanderers · Free forever</span>
      </div>
    </footer>
  )
}
