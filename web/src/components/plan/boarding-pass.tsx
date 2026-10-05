"use client"

import { format, parseISO } from "date-fns"
import { ArrowRight, Loader2, Plane } from "lucide-react"

import { Button } from "@/components/ui/button"
import { inr } from "@/lib/format"
import { GROUP_TYPES, VIBES, travelers, tripDays } from "@/lib/trip-options"
import type { TripRequest } from "@/lib/types"
import { cn } from "@/lib/utils"

function code(name: string) {
  return name.replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase() || "···"
}

function whenLabel(req: TripRequest) {
  if (req.start_date && req.end_date) return `${format(parseISO(req.start_date), "d MMM")} – ${format(parseISO(req.end_date), "d MMM")}`
  if (req.flexible_month) return `${format(parseISO(`${req.flexible_month}-01`), "MMMM")} · flexible`
  return "Dates flexible"
}

export function BoardingPass({
  req,
  ready,
  submitting,
  onSubmit,
  className,
}: {
  req: TripRequest
  ready: boolean
  submitting: boolean
  onSubmit: () => void
  className?: string
}) {
  const days = tripDays(req)
  const people = travelers(req)
  const group = GROUP_TYPES.find((g) => g.value === req.group_type)
  const dest = req.destinations[0] || ""
  const vibes = VIBES.filter((v) => req.vibes.includes(v.value)).map((v) => v.label)

  return (
    <div className={cn("overflow-hidden rounded-3xl bg-card shadow-[var(--shadow-lift)]", className)}>
      <div className="relative bg-teal px-5 pt-5 pb-6 text-white">
        <div className="flex items-center justify-between text-[0.65rem] font-semibold tracking-[0.2em] uppercase opacity-80">
          <span>Boarding pass</span>
          <span>Wander Mind</span>
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-display text-4xl font-semibold">{req.origin ? code(req.origin) : "YOU"}</p>
            <p className="truncate text-xs opacity-80">{req.origin || "Your city"}</p>
          </div>
          <div className="flex flex-1 items-center gap-1 px-2 opacity-80">
            <span className="h-px flex-1 border-t border-dashed border-white/60" />
            <Plane className="size-4" />
            <span className="h-px flex-1 border-t border-dashed border-white/60" />
          </div>
          <div className="min-w-0 text-right">
            <p className="font-display text-4xl font-semibold">{dest ? code(dest) : "???"}</p>
            <p className="truncate text-xs opacity-80">{req.destinations.join(" → ") || "Where to?"}</p>
          </div>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 py-4 text-sm">
        <div>
          <dt className="text-[0.65rem] font-semibold tracking-[0.16em] text-muted-foreground uppercase">When</dt>
          <dd className="font-semibold text-ink">{whenLabel(req)}</dd>
        </div>
        <div>
          <dt className="text-[0.65rem] font-semibold tracking-[0.16em] text-muted-foreground uppercase">Length</dt>
          <dd className="font-semibold text-ink">
            {days} day{days > 1 ? "s" : ""}
          </dd>
        </div>
        <div>
          <dt className="text-[0.65rem] font-semibold tracking-[0.16em] text-muted-foreground uppercase">Travellers</dt>
          <dd className="font-semibold text-ink">
            {people} · {group?.label}
          </dd>
        </div>
        <div>
          <dt className="text-[0.65rem] font-semibold tracking-[0.16em] text-muted-foreground uppercase">Budget</dt>
          <dd className="font-semibold text-ink">{req.budget_total ? inr(req.budget_total) : "-"}</dd>
        </div>
        {vibes.length > 0 && (
          <div className="col-span-2">
            <dt className="text-[0.65rem] font-semibold tracking-[0.16em] text-muted-foreground uppercase">Vibe</dt>
            <dd className="mt-1 flex flex-wrap gap-1">
              {vibes.map((v) => (
                <span key={v} className="rounded-full bg-marigold-soft px-2 py-0.5 text-xs font-medium text-ink">
                  {v}
                </span>
              ))}
            </dd>
          </div>
        )}
      </dl>

      <div className="relative px-5">
        <div className="absolute top-1/2 -left-3 size-6 -translate-y-1/2 rounded-full bg-background" />
        <div className="absolute top-1/2 -right-3 size-6 -translate-y-1/2 rounded-full bg-background" />
        <div className="border-t-2 border-dashed border-border" />
      </div>

      <div className="space-y-2 px-5 pt-4 pb-5">
        <Button onClick={onSubmit} disabled={!ready || submitting} size="lg" className="h-12 w-full rounded-full text-base shadow-sm">
          {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
          {submitting ? "Starting your planner…" : "Plan my trip"}
          {!submitting && <ArrowRight className="size-4" />}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          {ready ? "Takes 1–3 minutes: we read recent vlogs and posts first." : "Add a destination and budget to continue."}
        </p>
      </div>
    </div>
  )
}
