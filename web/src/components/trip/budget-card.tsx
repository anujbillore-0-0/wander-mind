import { CircleCheck, PiggyBank, Sparkles, TriangleAlert } from "lucide-react"

import { inr, inrRange } from "@/lib/format"
import type { Itinerary } from "@/lib/types"
import { cn } from "@/lib/utils"

const CAT_COLORS: Record<string, string> = {
  stay: "var(--teal)",
  food: "var(--coral)",
  activities: "var(--leaf)",
  local_transport: "var(--marigold)",
  intercity: "var(--teal-deep)",
  buffer: "oklch(0.8 0.02 80)",
}

const STATUS = {
  under: { label: "Fits your budget", icon: CircleCheck, tone: "bg-leaf-soft text-leaf" },
  near: { label: "Right at your limit", icon: TriangleAlert, tone: "bg-marigold-soft text-[oklch(0.5_0.11_70)]" },
  over: { label: "Over budget", icon: TriangleAlert, tone: "bg-coral-soft text-[oklch(0.5_0.14_35)]" },
} as const

export function BudgetCard({ itinerary }: { itinerary: Itinerary }) {
  const b = itinerary.budget
  const status = STATUS[b.status]
  const scale = Math.max(b.user_budget, b.total_max) * 1.04
  const budgetPos = Math.min((b.user_budget / scale) * 100, 100)
  const mid = (c: { min: number; max: number }) => (c.min + c.max) / 2

  return (
    <div className="card-soft p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="kicker">Budget check</p>
          <p className="mt-2 font-display text-[1.75rem] leading-tight font-semibold whitespace-nowrap text-ink tabular-nums sm:text-[2rem]">{inrRange(b.total_min, b.total_max)}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            estimated total, vs your <strong className="text-ink">{inr(b.user_budget)}</strong>
            {itinerary.travelers > 1 && <> · {inrRange(b.per_person_min, b.per_person_max)} per person</>}
          </p>
        </div>
        <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold", status.tone)}>
          <status.icon className="size-3.5" />
          {status.label}
        </span>
      </div>

      <div className="relative mt-6">
        <div className="flex h-4 w-full overflow-hidden rounded-full bg-muted">
          {b.categories.map((c) => (
            <div
              key={c.key}
              title={`${c.label}: ${inrRange(c.min, c.max)}`}
              style={{ width: `${(mid(c) / scale) * 100}%`, background: CAT_COLORS[c.key] || "var(--chart-5)" }}
              className="h-full border-r-2 border-card last:border-r-0"
            />
          ))}
        </div>
        <div className="absolute -top-1.5 -bottom-1.5 w-0.5 rounded-full bg-ink" style={{ left: `${budgetPos}%` }} aria-hidden />
        <div className="absolute -top-6 -translate-x-1/2 text-[0.65rem] font-bold whitespace-nowrap text-ink" style={{ left: `${budgetPos}%` }}>
          your budget
        </div>
      </div>

      <ul className="mt-5 divide-y divide-border/60">
        {b.categories.map((c) => (
          <li key={c.key} className="flex items-center gap-3 py-2.5">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: CAT_COLORS[c.key] || "var(--chart-5)" }} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">{c.label}</span>
              {c.note && <span className="block truncate text-xs text-muted-foreground">{c.note}</span>}
            </span>
            <span className="shrink-0 text-sm font-semibold text-ink tabular-nums">{inrRange(c.min, c.max, "₹0")}</span>
          </li>
        ))}
      </ul>

      {(b.saving_tips.length > 0 || b.upgrade_tips.length > 0) && (
        <div className="mt-4 space-y-2">
          {b.saving_tips.map((t) => (
            <p key={t} className="flex gap-2 rounded-xl bg-leaf-soft/70 px-3 py-2 text-sm text-ink/85">
              <PiggyBank className="mt-0.5 size-4 shrink-0 text-leaf" />
              {t}
            </p>
          ))}
          {b.upgrade_tips.map((t) => (
            <p key={t} className="flex gap-2 rounded-xl bg-marigold-soft/70 px-3 py-2 text-sm text-ink/85">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-[oklch(0.62_0.13_70)]" />
              {t}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
