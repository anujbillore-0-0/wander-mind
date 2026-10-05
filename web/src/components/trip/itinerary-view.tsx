"use client"

import Link from "next/link"
import { useCallback, useMemo, useState } from "react"
import { FlaskConical, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { Itinerary, TripEvent } from "@/lib/types"

import { BudgetCard } from "./budget-card"
import { DayPlans } from "./day-plan"
import { EvidenceProvider, type ReportTarget } from "./evidence"
import { TripHero } from "./hero"
import { ReportDialog } from "./report-dialog"
import { SectionNav } from "./section-nav"
import { EssentialsSection, FoodSection, GettingThereSection, Overview, SectionHeading, SourcesSection, StaySection, TransportSection } from "./sections"
import { TweakBar } from "./tweak-bar"

export function ItineraryView({
  itinerary,
  tripId,
  busy = false,
  latest,
  onTweak,
}: {
  itinerary: Itinerary
  tripId: string | null
  busy?: boolean
  latest?: TripEvent
  onTweak?: (text: string) => Promise<void>
}) {
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null)
  const report = useCallback((t: ReportTarget) => setReportTarget(t), [])
  const sample = tripId === null

  const nav = useMemo(
    () => [
      { id: "overview", label: "Overview" },
      { id: "plan", label: "Day by day" },
      { id: "stay", label: "Stay" },
      { id: "food", label: "Food" },
      { id: "getting-around", label: "Getting around" },
      { id: "getting-there", label: "Getting there" },
      { id: "before-you-go", label: "Before you go" },
      { id: "sources", label: "Sources" },
    ],
    []
  )

  return (
    <EvidenceProvider sources={itinerary.sources} report={sample ? undefined : report}>
      <TripHero itinerary={itinerary} />
      {sample && (
        <div className="border-b border-marigold/40 bg-marigold-soft">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm sm:px-6">
            <p className="flex items-center gap-2 text-ink">
              <FlaskConical className="size-4 shrink-0 text-[oklch(0.6_0.13_70)]" />
              <span>
                <strong>Sample plan.</strong> Prices and sources are illustrative. Plan your own trip to get live research.
              </span>
            </p>
            <Button asChild size="sm" className="rounded-full">
              <Link href="/plan">Plan my trip</Link>
            </Button>
          </div>
        </div>
      )}
      {busy && (
        <div className="border-b border-teal/20 bg-teal-soft">
          <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2.5 text-sm text-teal-deep sm:px-6">
            <Loader2 className="size-4 animate-spin" />
            {latest?.message || "Reworking your plan…"}
          </div>
        </div>
      )}
      <SectionNav items={nav} />

      <div className={busy ? "pointer-events-none opacity-60 transition-opacity" : "transition-opacity"}>
        <div className="mx-auto max-w-6xl space-y-16 px-4 pt-10 pb-36 sm:px-6">
          <section className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
            <div className="space-y-5">
              <SectionHeading id="overview" kicker="The big picture" title="Trip overview" />
              <Overview itinerary={itinerary} />
            </div>
            <div className="lg:pt-[4.25rem]">
              <BudgetCard itinerary={itinerary} />
            </div>
          </section>

          <section className="space-y-5">
            <SectionHeading id="plan" kicker="Your route" title="Day by day" />
            <DayPlans itinerary={itinerary} canReport={!sample} />
          </section>

          <section className="space-y-5">
            <SectionHeading id="stay" kicker="Where to sleep" title="Stay" />
            <StaySection itinerary={itinerary} />
          </section>

          <section className="space-y-5">
            <SectionHeading id="food" kicker="Eat like a local" title="Food guide" />
            <FoodSection itinerary={itinerary} />
          </section>

          <section className="space-y-5">
            <SectionHeading id="getting-around" kicker="Rapido, autos & more" title="Getting around" />
            <TransportSection itinerary={itinerary} />
          </section>

          <section className="space-y-5">
            <SectionHeading id="getting-there" kicker="Arrive & leave" title="Getting there" />
            <GettingThereSection itinerary={itinerary} />
          </section>

          <section className="space-y-5">
            <SectionHeading id="before-you-go" kicker="Pack smart, travel safe" title="Before you go" />
            <EssentialsSection itinerary={itinerary} />
          </section>

          <section className="space-y-5">
            <SectionHeading id="sources" kicker="Receipts" title="Where this plan comes from" />
            <SourcesSection itinerary={itinerary} />
          </section>
        </div>
      </div>

      {!sample && onTweak && <TweakBar busy={busy} status={latest?.message} onTweak={onTweak} />}
      {!sample && tripId && <ReportDialog tripId={tripId} target={reportTarget} onClose={() => setReportTarget(null)} />}
    </EvidenceProvider>
  )
}
