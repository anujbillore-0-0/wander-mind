"use client"

import { useState } from "react"
import { BadgeCheck, CalendarDays, Link2, MapPin, Printer, Users, Wallet } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { dateRangeLabel, inr, monthYear } from "@/lib/format"
import type { Itinerary } from "@/lib/types"

export function TripHero({ itinerary }: { itinerary: Itinerary }) {
  const [imgOk, setImgOk] = useState(true)
  const d = itinerary.destination
  const r = itinerary.research
  const places = [d.name, ...itinerary.other_destinations.map((o) => o.name)].join(" → ")
  const sources = r.videos + r.comment_threads + r.reddit_threads + r.web_pages + r.user_reports

  return (
    <section className="relative isolate overflow-hidden bg-teal-deep">
      {d.image_url && imgOk ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={d.image_url} alt={d.name} onError={() => setImgOk(false)} className="absolute inset-0 -z-10 size-full object-cover" />
      ) : (
        <div className="topo absolute inset-0 -z-10 opacity-60" />
      )}
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-[oklch(0.22_0.04_230/0.92)] via-[oklch(0.25_0.04_230/0.45)] to-[oklch(0.25_0.04_230/0.15)]" />

      <div className="mx-auto flex min-h-[360px] max-w-6xl flex-col justify-end px-4 pt-20 pb-8 sm:min-h-[440px] sm:px-6">
        <div className="no-print absolute top-5 right-4 flex gap-2 sm:right-6">
          <Button
            size="sm"
            variant="secondary"
            className="rounded-full bg-white/85 backdrop-blur hover:bg-white"
            onClick={() => {
              navigator.clipboard?.writeText(window.location.href)
              toast.success("Link copied. Share it with your travel buddies.")
            }}
          >
            <Link2 className="size-3.5" /> Share
          </Button>
          <Button size="sm" variant="secondary" className="rounded-full bg-white/85 backdrop-blur hover:bg-white" onClick={() => window.print()}>
            <Printer className="size-3.5" /> Print
          </Button>
        </div>

        <p className="text-[0.72rem] font-semibold tracking-[0.2em] text-marigold uppercase">Your {itinerary.days_count}-day plan</p>
        <h1 className="mt-2 max-w-3xl text-4xl leading-[1.05] font-semibold text-white sm:text-6xl">{itinerary.title}</h1>

        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[0.95rem] text-white/90">
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="size-4 text-marigold" />
            <span>
              {places}
              {d.region && <span className="text-white/60">{`, ${d.region}`}</span>}
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="size-4 text-marigold" />
            {itinerary.start_date ? dateRangeLabel(itinerary.start_date, itinerary.end_date) : `${itinerary.days_count} days, flexible dates`}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Users className="size-4 text-marigold" />
            {itinerary.travelers_label}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Wallet className="size-4 text-marigold" />
            {inr(itinerary.budget.user_budget)} budget
          </span>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {sources > 0 && (
            <a href="#sources" className="inline-flex items-center gap-2 rounded-full bg-white/95 px-3.5 py-1.5 text-sm font-medium text-ink shadow-sm transition hover:bg-white">
              <BadgeCheck className="size-4 text-leaf" />
              Built from {r.videos} vlogs, {r.comment_threads + r.reddit_threads} threads & {r.web_pages} articles
              {r.newest_source ? <span className="text-muted-foreground">· freshest {monthYear(r.newest_source)}</span> : null}
            </a>
          )}
          {itinerary.style_tags.map((t) => (
            <span key={t} className="rounded-full border border-white/30 bg-white/10 px-3 py-1 text-sm text-white capitalize backdrop-blur">
              {t}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
