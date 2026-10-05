"use client"

import dynamic from "next/dynamic"
import { useMemo, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import {
  ArrowLeftRight,
  BedDouble,
  CalendarCheck,
  ChevronDown,
  Clock,
  Lightbulb,
  Map as MapIcon,
  MapPin,
  Navigation,
  ReceiptIndianRupee,
  Route,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { dayDate, duration, inrRange } from "@/lib/format"
import { useMediaQuery } from "@/lib/use-media"
import type { DayPlan, Itinerary, Leg, PlanItem } from "@/lib/types"
import { cn } from "@/lib/utils"

import { EvidenceStamp, useEvidence } from "./evidence"
import { KindIcon, ModeIcon, WeatherIcon, kindMeta } from "./meta"
import type { MapPoint } from "./trip-map"

const TripMap = dynamic(() => import("./trip-map"), {
  ssr: false,
  loading: () => <Skeleton className="size-full rounded-none" />,
})

function km(d: number) {
  return d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(d < 10 ? 1 : 0)} km`
}

export function LegTicket({ leg, label }: { leg: Leg; label?: string }) {
  const [open, setOpen] = useState(false)
  const free = leg.cost_max === 0
  return (
    <div className="my-1 ml-[3.25rem] sm:ml-[4.75rem]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="ticket flex w-full items-center gap-3 rounded-xl bg-teal-soft/80 px-4 py-2 text-left text-sm transition hover:bg-teal-soft"
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-card text-teal shadow-sm">
          <ModeIcon mode={leg.mode} className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          {label && <span className="block text-[0.65rem] font-semibold tracking-[0.14em] text-teal-deep/70 uppercase">{label}</span>}
          <span className="block truncate font-medium text-teal-deep">
            {leg.label}
            <span className="font-normal text-teal-deep/70">
              {" "}
              · {km(leg.distance_km)} · {duration(leg.duration_min)}
              {leg.approximate ? " · approx." : ""}
            </span>
          </span>
        </span>
        <span className="shrink-0 font-bold text-teal-deep">{free ? "Free" : inrRange(leg.cost_min, leg.cost_max)}</span>
        {leg.options.length > 1 && <ChevronDown className={cn("size-4 shrink-0 text-teal-deep/60 transition", open && "rotate-180")} />}
      </button>
      <AnimatePresence initial={false}>
        {open && leg.options.length > 1 && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-1 space-y-1 rounded-xl border border-border/70 bg-card p-2">
              {leg.options.map((o) => {
                return (
                  <li key={o.mode} className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm">
                    <ModeIcon mode={o.mode} className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink">{o.label}</span>
                      {o.note && <span className="block truncate text-xs text-muted-foreground">{o.note}</span>}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{duration(o.duration_min)}</span>
                    <span className="w-20 shrink-0 text-right font-semibold text-ink">{o.cost_max === 0 ? "Free" : inrRange(o.cost_min, o.cost_max)}</span>
                  </li>
                )
              })}
              <p className="px-2 pt-1 text-[0.7rem] text-muted-foreground">Fare estimates from distance. Check the app for the live price.</p>
            </div>
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}

function Alternatives({ item }: { item: PlanItem }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="rounded-full text-muted-foreground">
          <ArrowLeftRight className="size-3.5" />
          Swap ({item.alternatives.length})
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 rounded-2xl p-2">
        <p className="px-2 pt-1 pb-2 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">Instead, try</p>
        <ul className="space-y-1">
          {item.alternatives.map((a) => (
            <li key={a.title} className="rounded-xl p-2 hover:bg-sand">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{a.title}</p>
                  {a.note && <p className="text-xs text-muted-foreground">{a.note}</p>}
                </div>
                {a.cost_min !== null && <span className="shrink-0 text-sm font-semibold">{inrRange(a.cost_min, a.cost_max)}</span>}
              </div>
              <EvidenceStamp evidence={a.evidence} title={a.title} className="mt-2" />
            </li>
          ))}
        </ul>
        <p className="px-2 pt-2 pb-1 text-[0.7rem] text-muted-foreground">Want one of these? Ask in the tweak bar below.</p>
      </PopoverContent>
    </Popover>
  )
}

function StopCard({ item, index, active, onHover, canReport }: { item: PlanItem; index: number; active: boolean; onHover: (id: string | null) => void; canReport: boolean }) {
  const meta = kindMeta(item.kind)
  const { report } = useEvidence()
  const [imgOk, setImgOk] = useState(true)
  const reportTarget = { title: item.title, place: item.place.name, kind: item.kind }
  const priced = item.cost.max > 0
  return (
    <div id={`stop-${item.id}`} className="flex gap-3 sm:gap-4" onMouseEnter={() => onHover(item.id)} onMouseLeave={() => onHover(null)}>
      <div className="w-10 shrink-0 pt-4 text-right sm:w-16">
        <p className="font-display text-base leading-none font-semibold text-ink sm:text-lg">{item.time}</p>
        <p className="mt-1 hidden text-[0.7rem] text-muted-foreground capitalize sm:block">{item.slot}</p>
      </div>
      <div className="relative flex flex-col items-center pt-4">
        <span
          className="z-10 flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-white font-display text-xs font-bold text-white shadow"
          style={{ background: meta.color }}
        >
          {index + 1}
        </span>
      </div>
      <motion.article
        layout
        className={cn(
          "card-soft min-w-0 flex-1 overflow-hidden transition-all duration-300",
          active && "shadow-[var(--shadow-lift)] ring-2 ring-teal/30"
        )}
      >
        <div className="flex gap-4 p-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.7rem] font-semibold" style={{ background: meta.soft, color: meta.color }}>
                <KindIcon kind={item.kind} className="size-3" />
                {meta.label}
              </span>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="size-3" />
                {duration(item.duration_min)}
              </span>
              {item.booking_required && (
                <span className="inline-flex items-center gap-1 rounded-full bg-coral-soft px-2 py-0.5 text-[0.7rem] font-semibold text-[oklch(0.5_0.13_35)]">
                  <CalendarCheck className="size-3" />
                  Book ahead
                </span>
              )}
            </div>
            <h4 className="mt-2 text-xl leading-snug font-semibold text-ink">{item.title}</h4>
            {item.place.area && (
              <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="size-3.5" />
                {item.place.area}
              </p>
            )}
            {item.description && <p className="mt-2 text-[0.95rem] leading-relaxed text-ink/80">{item.description}</p>}
          </div>
          {item.image_url && imgOk && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.image_url}
              alt={item.title}
              loading="lazy"
              onError={() => setImgOk(false)}
              className="hidden size-24 shrink-0 rounded-xl object-cover sm:block md:size-28"
            />
          )}
        </div>
        {item.tips.length > 0 && (
          <ul className="mx-4 mb-3 space-y-1 rounded-xl bg-marigold-soft/70 px-3 py-2">
            {item.tips.map((t) => (
              <li key={t} className="flex gap-2 text-sm text-ink/85">
                <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-[oklch(0.62_0.13_70)]" />
                {t}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border/60 bg-sand/50 px-4 py-2.5">
          <span className="text-sm">
            <span className="font-bold text-ink">
              {priced && item.cost.note === "estimate" && "≈"}
              {priced ? inrRange(item.cost.min, item.cost.max) : "Free"}
            </span>
            {priced && <span className="text-muted-foreground"> / {item.cost.per}</span>}
            {priced && item.cost.note === "estimate" && (
              <span className="ml-1 text-xs text-muted-foreground" title="No traveller has reported this price yet; it's an estimate.">
                est.
              </span>
            )}
          </span>
          <EvidenceStamp evidence={item.evidence} title={item.title} report={canReport ? reportTarget : undefined} />
          <span className="flex-1" />
          {item.alternatives.length > 0 && <Alternatives item={item} />}
          {canReport && report && (
            <Button variant="ghost" size="sm" className="hidden rounded-full text-muted-foreground sm:inline-flex" onClick={() => report(reportTarget)}>
              <ReceiptIndianRupee className="size-3.5" />
              I paid…
            </Button>
          )}
          <Button asChild variant="ghost" size="sm" className="rounded-full text-teal">
            <a href={item.place.maps_url} target="_blank" rel="noreferrer">
              <Navigation className="size-3.5" />
              Directions
            </a>
          </Button>
        </div>
      </motion.article>
    </div>
  )
}

function DayHeader({ day }: { day: DayPlan }) {
  return (
    <div className="card-soft topo overflow-hidden p-5">
      <p className="kicker">
        Day {day.day}
        {day.date ? ` · ${dayDate(day.date, "EEEE d MMMM")}` : ""}
      </p>
      <h3 className="mt-1 text-2xl font-semibold text-ink sm:text-3xl">{day.title}</h3>
      {day.summary && <p className="mt-2 max-w-2xl leading-relaxed text-muted-foreground">{day.summary}</p>}
      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        {day.weather && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 font-medium text-ink shadow-sm">
            <WeatherIcon icon={day.weather.icon} className="size-4 text-marigold" />
            {day.weather.t_min !== null && day.weather.t_max !== null ? `${Math.round(day.weather.t_min)}–${Math.round(day.weather.t_max)}°C` : ""}
            <span className="text-muted-foreground">{day.weather.label}</span>
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 font-medium text-ink shadow-sm">
          <ReceiptIndianRupee className="size-4 text-teal" />
          {inrRange(day.cost_min, day.cost_max)}
          <span className="text-muted-foreground">today</span>
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 font-medium text-ink shadow-sm">
          <Route className="size-4 text-teal" />
          {km(day.distance_km)}
          <span className="text-muted-foreground">· {day.items.length} stops</span>
        </span>
        {day.destination && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 font-medium text-ink shadow-sm">
            <MapPin className="size-4 text-coral" />
            {day.destination}
          </span>
        )}
      </div>
    </div>
  )
}

export function DayPlans({ itinerary, canReport }: { itinerary: Itinerary; canReport: boolean }) {
  const [dayIndex, setDayIndex] = useState(0)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [mapOpen, setMapOpen] = useState(false)
  const isDesktop = useMediaQuery("(min-width: 1024px)")
  const day = itinerary.days[Math.min(dayIndex, itinerary.days.length - 1)]

  const points: MapPoint[] = useMemo(
    () =>
      (day?.items || [])
        .map((it, i) => ({ id: it.id, lat: it.place.lat, lon: it.place.lon, label: String(i + 1), kind: it.kind, title: it.title }))
        .filter((p): p is MapPoint => p.lat !== null && p.lon !== null),
    [day]
  )
  const stayOption = itinerary.stay.options.find((s) => s.recommended) || itinerary.stay.options[0]
  const stay = stayOption?.place?.lat != null && stayOption.place.lon != null ? { lat: stayOption.place.lat, lon: stayOption.place.lon, name: stayOption.name } : null
  const center = { lat: itinerary.destination.lat, lon: itinerary.destination.lon }

  function select(id: string) {
    setActiveId(id)
    setMapOpen(false)
    document.getElementById(`stop-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
  }

  if (!day) return null

  const map = <TripMap points={points} stay={stay} center={center} activeId={activeId} onSelect={select} />

  return (
    <div>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0" role="tablist">
        {itinerary.days.map((d, i) => {
          const on = i === dayIndex
          return (
            <button
              key={d.day}
              role="tab"
              aria-selected={on}
              onClick={() => {
                setDayIndex(i)
                setActiveId(null)
              }}
              className={cn(
                "flex shrink-0 items-center gap-2.5 rounded-2xl border px-4 py-2.5 text-left transition",
                on ? "border-teal bg-teal text-white shadow-md" : "border-border bg-card text-ink hover:border-teal/40"
              )}
            >
              <span>
                <span className="block font-display text-lg leading-none font-semibold">Day {d.day}</span>
                <span className={cn("mt-1 block text-xs", on ? "text-white/80" : "text-muted-foreground")}>
                  {d.date ? dayDate(d.date) : d.destination}
                </span>
              </span>
              {d.weather && <WeatherIcon icon={d.weather.icon} className="size-5 text-marigold" />}
            </button>
          )
        })}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_440px]">
        <AnimatePresence mode="wait">
          <motion.div key={day.day} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }} className="min-w-0 space-y-3">
            <DayHeader day={day} />
            {day.start_leg && <LegTicket leg={day.start_leg} label="From your stay" />}
            {day.items.map((it, i) => (
              <div key={it.id} className="space-y-3">
                <StopCard item={it} index={i} active={activeId === it.id} onHover={setActiveId} canReport={canReport} />
                {it.leg_to_next && <LegTicket leg={it.leg_to_next} />}
              </div>
            ))}
            {day.end_leg && <LegTicket leg={day.end_leg} label="Back to your stay" />}
            {day.items.length > 0 && (
              <div className="ml-[3.25rem] flex items-center gap-2 py-2 text-sm text-muted-foreground sm:ml-[4.75rem]">
                <BedDouble className="size-4" />
                End of day {day.day}. Rest up.
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="no-print hidden lg:block">
          <div className="sticky top-32 h-[calc(100vh-10rem)] overflow-hidden rounded-3xl border border-border/70 shadow-[var(--shadow-soft)]">{isDesktop && map}</div>
        </div>
      </div>

      <div className="no-print fixed right-4 bottom-24 z-30 lg:hidden">
        <Button size="lg" className="h-12 rounded-full px-5 shadow-[var(--shadow-lift)]" onClick={() => setMapOpen(true)}>
          <MapIcon className="size-4" />
          Map
        </Button>
      </div>
      <Drawer open={mapOpen} onOpenChange={setMapOpen}>
        <DrawerContent className="h-[80vh]">
          <DrawerHeader className="pb-2">
            <DrawerTitle className="font-display text-xl">
              Day {day.day} · {day.title}
            </DrawerTitle>
          </DrawerHeader>
          <div className="min-h-0 flex-1 overflow-hidden rounded-t-2xl">{mapOpen && !isDesktop && map}</div>
        </DrawerContent>
      </Drawer>
    </div>
  )
}
