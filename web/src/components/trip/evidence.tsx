"use client"

import { createContext, useCallback, useContext, useMemo, useState } from "react"
import { BadgeCheck, ExternalLink, Globe, MessagesSquare, Play, ReceiptIndianRupee, Sparkles, Stamp, UserRound } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { monthYear } from "@/lib/format"
import type { Evidence, Source } from "@/lib/types"
import { cn } from "@/lib/utils"

export interface ReportTarget {
  title: string
  place: string
  kind: string
}

interface Ctx {
  sources: Map<number, Source>
  open: (title: string, evidence: Evidence, report?: ReportTarget) => void
  report?: (target: ReportTarget) => void
}

const EvidenceContext = createContext<Ctx | null>(null)

export function useEvidence() {
  const ctx = useContext(EvidenceContext)
  if (!ctx) throw new Error("useEvidence outside provider")
  return ctx
}

const SOURCE_META: Record<string, { icon: typeof Play; label: string; cta: string }> = {
  youtube: { icon: Play, label: "Vlog", cta: "Watch" },
  youtube_comments: { icon: MessagesSquare, label: "Vlog comments", cta: "Open" },
  reddit: { icon: MessagesSquare, label: "Reddit", cta: "Read" },
  web: { icon: Globe, label: "Article", cta: "Read" },
  user: { icon: UserRound, label: "Traveller report", cta: "" },
}

export function sourceMeta(kind: string) {
  return SOURCE_META[kind] || SOURCE_META.web
}

export function stampLabel(e: Evidence): string {
  if (e.status === "estimate") return "AI estimate"
  const when = e.latest ? ` · ${monthYear(e.latest).split(" ")[0]}` : ""
  return `${e.source_count} source${e.source_count === 1 ? "" : "s"}${when}`
}

export function EvidenceStamp({ evidence, title, report, className }: { evidence: Evidence; title: string; report?: ReportTarget; className?: string }) {
  const { open } = useEvidence()
  const Icon = evidence.status === "verified" ? BadgeCheck : evidence.status === "reported" ? Stamp : Sparkles
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        open(title, evidence, report)
      }}
      title="Where does this come from?"
      className={cn("stamp transition hover:rotate-0", `stamp-${evidence.status}`, className)}
    >
      <Icon className="size-3" />
      {stampLabel(evidence)}
    </button>
  )
}

const STATUS_COPY = {
  verified: {
    title: "Verified by recent travellers",
    body: (e: Evidence) => `Seen in ${e.source_count} independent sources${e.latest ? `, the newest from ${monthYear(e.latest)}` : ""}.`,
    tone: "bg-leaf-soft text-leaf border-leaf/30",
  },
  reported: {
    title: "Reported by a recent traveller",
    body: (e: Evidence) => `Mentioned in ${e.source_count === 1 ? "one source" : `${e.source_count} sources`}${e.latest ? ` from ${monthYear(e.latest)}` : ""}. Worth a quick check.`,
    tone: "bg-marigold-soft text-[oklch(0.5_0.11_70)] border-marigold/50",
  },
  estimate: {
    title: "AI estimate",
    body: () => "We didn't find recent traveller evidence for this yet, so it comes from general knowledge. Treat the price as a rough guide.",
    tone: "bg-muted text-muted-foreground border-border",
  },
} as const

export function EvidenceProvider({ sources, report, children }: { sources: Source[]; report?: (t: ReportTarget) => void; children: React.ReactNode }) {
  const map = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources])
  const [state, setState] = useState<{ title: string; evidence: Evidence; report?: ReportTarget } | null>(null)
  const open = useCallback((title: string, evidence: Evidence, r?: ReportTarget) => setState({ title, evidence, report: r }), [])
  const value = useMemo(() => ({ sources: map, open, report }), [map, open, report])

  const e = state?.evidence
  const copy = e ? STATUS_COPY[e.status] : null
  const listed = e ? e.source_ids.map((id) => map.get(id)).filter(Boolean) as Source[] : []

  return (
    <EvidenceContext.Provider value={value}>
      {children}
      <Sheet open={Boolean(state)} onOpenChange={(o) => !o && setState(null)}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto bg-background sm:max-w-md">
          {state && e && copy && (
            <>
              <SheetHeader className="border-b border-border/70 pb-4">
                <p className="kicker">Why we suggest this</p>
                <SheetTitle className="font-display text-2xl font-semibold text-ink">{state.title}</SheetTitle>
                <SheetDescription className="sr-only">Evidence behind this recommendation</SheetDescription>
              </SheetHeader>
              <div className="space-y-6 p-4">
                <div className={cn("rounded-2xl border p-4", copy.tone)}>
                  <p className="font-semibold">{copy.title}</p>
                  <p className="mt-1 text-sm opacity-90">{copy.body(e)}</p>
                </div>

                {e.quotes.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-ink">What travellers said</p>
                    {e.quotes.map((q, i) => {
                      const src = map.get(q.source_id)
                      const meta = sourceMeta(src?.kind || "web")
                      return (
                        <figure key={i} className="rounded-2xl border border-border bg-card p-4">
                          <blockquote className="font-display text-[1.05rem] leading-snug text-ink">“{q.text}”</blockquote>
                          {q.quote && q.quote !== q.text && <p className="mt-1.5 text-sm text-muted-foreground italic">Original: “{q.quote}”</p>}
                          <figcaption className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                            <span className="flex min-w-0 items-center gap-1.5">
                              <meta.icon className="size-3.5 shrink-0" />
                              <span className="truncate">{src?.title || meta.label}</span>
                            </span>
                            {q.url && (
                              <a href={q.url} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 font-semibold text-teal hover:underline">
                                {src?.kind === "youtube" && q.url.includes("&t=") ? "Watch the moment" : meta.cta || "Open"}
                                <ExternalLink className="size-3" />
                              </a>
                            )}
                          </figcaption>
                        </figure>
                      )
                    })}
                  </div>
                )}

                {listed.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold text-ink">Sources</p>
                    <ul className="divide-y divide-border/70 rounded-2xl border border-border bg-card">
                      {listed.map((s) => {
                        const meta = sourceMeta(s.kind)
                        return (
                          <li key={s.id} className="flex items-center gap-3 p-3">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sand text-teal">
                              <meta.icon className="size-4" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-ink">{s.title}</p>
                              <p className="text-xs text-muted-foreground">
                                {meta.label}
                                {s.author ? ` · ${s.author}` : ""}
                                {s.published_at ? ` · ${monthYear(s.published_at)}` : ""}
                              </p>
                            </div>
                            {s.url && (
                              <a href={s.url} target="_blank" rel="noreferrer" aria-label="Open source" className="text-muted-foreground hover:text-teal">
                                <ExternalLink className="size-4" />
                              </a>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                )}

                {report && state.report && (
                  <div className="rounded-2xl border border-dashed border-teal/40 bg-teal-soft/60 p-4">
                    <p className="font-semibold text-ink">Been here recently?</p>
                    <p className="mt-1 text-sm text-muted-foreground">Tell us what you paid. Your report becomes evidence for the next traveller.</p>
                    <Button
                      className="mt-3 rounded-full"
                      onClick={() => {
                        const target = state.report!
                        setState(null)
                        report(target)
                      }}
                    >
                      <ReceiptIndianRupee className="size-4" />
                      What did you pay?
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </EvidenceContext.Provider>
  )
}
