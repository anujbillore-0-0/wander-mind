"use client"

import { AnimatePresence, motion } from "motion/react"
import { Check, CloudSun, Globe, Map, MapPin, PenLine, Play, Search, Wallet } from "lucide-react"

import { Progress } from "@/components/ui/progress"
import type { TripEvent } from "@/lib/types"
import { cn } from "@/lib/utils"

const STAGE_ICONS: Record<string, typeof Play> = {
  queued: MapPin,
  resolve: Map,
  research: Search,
  weather: CloudSun,
  evidence: Globe,
  draft: PenLine,
  cost: Wallet,
  guides: PenLine,
  compose: Check,
  done: Check,
}

function iconFor(e: TripEvent) {
  if (e.stage === "research" && e.message.startsWith("Watching")) return Play
  return STAGE_ICONS[e.stage] || Search
}

const MILESTONES = [
  { key: "research", label: "Reading recent vlogs & posts" },
  { key: "evidence", label: "Weighing the evidence" },
  { key: "draft", label: "Drafting your days" },
  { key: "cost", label: "Pricing rides & checking budget" },
  { key: "guides", label: "Writing food, transport & safety notes" },
]

export function PlanningProgress({ destination, events }: { destination: string; events: TripEvent[] }) {
  const latest = events[events.length - 1]
  const pct = latest?.pct ?? 2
  const stagesSeen = new Set(events.map((e) => e.stage))
  const finished = stagesSeen.has("compose") || stagesSeen.has("done")
  const currentIdx = finished ? MILESTONES.length : Math.max(-1, ...MILESTONES.map((m, i) => (stagesSeen.has(m.key) ? i : -1)))
  const log = events.slice(-7).reverse()

  return (
    <div className="topo flex-1">
      <div className="mx-auto max-w-2xl px-4 pt-12 pb-24 sm:pt-20">
        <div className="relative mx-auto h-36 w-full max-w-md">
          <svg viewBox="0 0 400 140" className="absolute inset-0 size-full" aria-hidden>
            <path d="M30 110 C 110 10, 220 140, 370 40" fill="none" stroke="var(--border)" strokeWidth="3" strokeDasharray="2 10" strokeLinecap="round" />
            <path
              d="M30 110 C 110 10, 220 140, 370 40"
              fill="none"
              stroke="var(--teal)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray="240"
              className="animate-draw"
            />
            <circle cx="30" cy="110" r="7" fill="var(--teal)" />
            <circle cx="30" cy="110" r="13" fill="var(--teal)" fillOpacity=".15" />
          </svg>
          <div className="absolute top-2 right-4 flex animate-float flex-col items-center" aria-hidden>
            <MapPin className="size-10 fill-coral text-white drop-shadow-md" />
          </div>
        </div>

        <p className="kicker mt-6 text-center">Planning in progress</p>
        <h1 className="mt-2 text-center text-3xl font-semibold text-ink sm:text-4xl">Getting to know {destination || "your destination"}…</h1>
        <p className="mx-auto mt-3 max-w-lg text-center text-muted-foreground">
          We&apos;re reading what travellers posted recently, so the prices and tips are current. This takes a minute or two. Feel free to grab a chai.
        </p>

        <div className="card-soft mt-8 p-5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-ink">{pct}%</span>
            <span className="text-muted-foreground">{latest ? "Working…" : "Starting…"}</span>
          </div>
          <Progress value={pct} className="mt-2 h-2" />

          <ol className="mt-5 grid gap-2 sm:grid-cols-2">
            {MILESTONES.map((m, i) => {
              const done = i < currentIdx
              const current = i === currentIdx
              return (
                <li key={m.key} className={cn("flex items-center gap-2 text-sm", done || current ? "text-ink" : "text-muted-foreground/70")}>
                  <span
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full border",
                      done ? "border-leaf bg-leaf text-white" : current ? "border-teal bg-teal-soft" : "border-border"
                    )}
                  >
                    {done && <Check className="size-3" />}
                    {current && <span className="size-2 animate-pulse rounded-full bg-teal" />}
                  </span>
                  {m.label}
                </li>
              )
            })}
          </ol>
        </div>

        <ul className="mt-6 space-y-2">
          <AnimatePresence initial={false}>
            {log.map((e, i) => {
              const Icon = iconFor(e)
              return (
                <motion.li
                  key={e.at + e.message}
                  layout
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: i === 0 ? 1 : Math.max(0.35, 1 - i * 0.14), y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-start gap-3 rounded-xl bg-card/80 px-4 py-2.5 text-sm shadow-sm"
                >
                  <Icon className={cn("mt-0.5 size-4 shrink-0", i === 0 ? "text-teal" : "text-muted-foreground")} />
                  <span className={cn(i === 0 ? "font-medium text-ink" : "text-muted-foreground")}>{e.message}</span>
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ul>
      </div>
    </div>
  )
}
