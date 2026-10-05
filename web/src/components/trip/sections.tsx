"use client"

import { useState } from "react"
import {
  Backpack,
  BadgeCheck,
  Banknote,
  BedDouble,
  Bike,
  CalendarCheck,
  Check,
  Circle,
  CircleCheck,
  CircleDashed,
  CircleX,
  CloudRain,
  Compass,
  ExternalLink,
  FileText,
  Gem,
  Globe,
  HeartPulse,
  Accessibility as AccessibilityIcon,
  Info,
  Lightbulb,
  MapPin,
  MessagesSquare,
  Navigation,
  Phone,
  Play,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  UserRound,
  UtensilsCrossed,
  Wifi,
} from "lucide-react"

import { dayDate, inrRange, monthYear } from "@/lib/format"
import type { Itinerary } from "@/lib/types"
import { cn } from "@/lib/utils"

import { EvidenceStamp, sourceMeta } from "./evidence"
import { ModeIcon, WeatherIcon } from "./meta"

export function SectionHeading({ id, kicker, title, children }: { id: string; kicker: string; title: string; children?: React.ReactNode }) {
  return (
    <div id={id} className="scroll-mt-32">
      <p className="kicker">{kicker}</p>
      <div className="mt-1.5 flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-3xl font-semibold text-ink sm:text-[2.1rem]">{title}</h2>
        {children}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ overview */

const CROWD = { low: 1, moderate: 2, high: 3 } as Record<string, number>

export function Overview({ itinerary }: { itinerary: Itinerary }) {
  const s = itinerary.season
  const crowd = CROWD[s.crowd_level] || 2
  return (
    <div className="space-y-5">
      {itinerary.summary && <p className="font-display text-xl leading-relaxed text-ink sm:text-[1.4rem]">{itinerary.summary}</p>}
      {itinerary.highlights.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {itinerary.highlights.map((h) => (
            <span key={h} className="inline-flex items-center gap-1.5 rounded-full border border-marigold/40 bg-marigold-soft px-3 py-1.5 text-sm font-medium text-ink">
              <Star className="size-3.5 fill-marigold text-marigold" />
              {h}
            </span>
          ))}
        </div>
      )}
      <div className="card-soft p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">Season</p>
            <p className="mt-1 font-display text-xl font-semibold text-ink">{s.label || "Your travel window"}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">Crowds</p>
            <div className="mt-1.5 flex items-center justify-end gap-1">
              {[1, 2, 3].map((n) => (
                <Users key={n} className={cn("size-4", n <= crowd ? "text-coral" : "text-border")} />
              ))}
              <span className="ml-1 text-sm font-medium capitalize text-ink">{s.crowd_level}</span>
            </div>
          </div>
        </div>
        {s.summary && <p className="mt-3 text-[0.95rem] leading-relaxed text-ink/80">{s.summary}</p>}
        {itinerary.weather.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs text-muted-foreground">{s.weather_kind === "forecast" ? "Forecast for your dates" : "Typical weather (same dates last year)"}</p>
            <div className="no-scrollbar flex gap-2 overflow-x-auto">
              {itinerary.weather.map((w, i) => {
                return (
                  <div key={i} className="min-w-28 shrink-0 rounded-xl bg-sky/70 px-3 py-2.5">
                    <p className="text-xs font-semibold text-teal-deep">{w.date ? dayDate(w.date, "EEE d") : `Day ${i + 1}`}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <WeatherIcon icon={w.icon} className="size-5 text-marigold" />
                      <span className="font-display text-lg font-semibold text-ink">
                        {w.t_max !== null ? `${Math.round(w.t_max)}°` : "-"}
                        <span className="text-sm font-normal text-muted-foreground"> {w.t_min !== null ? `${Math.round(w.t_min)}°` : ""}</span>
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[0.7rem] text-muted-foreground">
                      {w.label}
                      {w.precip_prob ? ` · ${w.precip_prob}% rain` : ""}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        {(s.notes.length > 0 || s.events.length > 0) && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {s.notes.length > 0 && (
              <ul className="space-y-1.5">
                {s.notes.map((n) => (
                  <li key={n} className="flex gap-2 text-sm text-ink/80">
                    <Info className="mt-0.5 size-4 shrink-0 text-teal" />
                    {n}
                  </li>
                ))}
              </ul>
            )}
            {s.events.length > 0 && (
              <ul className="space-y-2">
                {s.events.map((e) => (
                  <li key={e.name} className="rounded-xl bg-coral-soft/70 px-3 py-2 text-sm">
                    <p className="font-semibold text-ink">
                      {e.name} {e.when && <span className="font-normal text-muted-foreground">· {e.when}</span>}
                    </p>
                    {e.note && <p className="text-ink/75">{e.note}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ stay */

export function StaySection({ itinerary }: { itinerary: Itinerary }) {
  const st = itinerary.stay
  return (
    <div className="space-y-5">
      {st.booked ? (
        <div className="card-soft flex items-center gap-4 p-5">
          <span className="flex size-11 items-center justify-center rounded-xl bg-teal text-white">
            <BedDouble className="size-5" />
          </span>
          <div>
            <p className="font-semibold text-ink">You&apos;re already booked</p>
            <p className="text-sm text-muted-foreground">{st.booked_address || "Your own stay"}. Days are planned around it.</p>
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground">
          {st.nights} night{st.nights === 1 ? "" : "s"} · prices are per {st.options.some((o) => o.per.startsWith("bed")) ? "bed or room" : "room"} per night, from recent traveller mentions where available.
        </p>
      )}
      {st.areas.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {st.areas.map((a, i) => (
            <div key={a.name} className={cn("rounded-2xl border p-4", i === 0 ? "border-teal/30 bg-teal-soft/60" : "border-border bg-card")}>
              <p className="flex items-center gap-2 font-semibold text-ink">
                <MapPin className="size-4 text-teal" />
                {a.name}
                {i === 0 && <span className="rounded-full bg-teal px-2 py-0.5 text-[0.65rem] font-bold tracking-wide text-white uppercase">Best area</span>}
              </p>
              {a.why && <p className="mt-1.5 text-sm leading-relaxed text-ink/80">{a.why}</p>}
              {a.best_for && <p className="mt-2 text-xs text-muted-foreground">Best for: {a.best_for}</p>}
            </div>
          ))}
        </div>
      )}
      {!st.booked && st.options.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {st.options.map((o) => (
            <div key={o.id} className={cn("card-soft relative flex flex-col p-5", o.recommended && "ring-2 ring-teal/40")}>
              {o.recommended && (
                <span className="absolute -top-3 left-5 inline-flex items-center gap-1 rounded-full bg-teal px-3 py-1 text-xs font-bold text-white shadow">
                  <Sparkles className="size-3" />
                  Our pick for your budget
                </span>
              )}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">{o.type}</p>
                  <h4 className="mt-1 text-xl font-semibold text-ink">{o.name}</h4>
                  {o.area && (
                    <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin className="size-3.5" />
                      {o.area}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-display text-xl font-semibold text-ink">{inrRange(o.price_min, o.price_max)}</p>
                  <p className="text-xs text-muted-foreground">{o.per}</p>
                </div>
              </div>
              {o.why && <p className="mt-3 text-sm leading-relaxed text-ink/80">{o.why}</p>}
              <div className="mt-auto flex flex-wrap items-center gap-3 pt-4">
                <EvidenceStamp evidence={o.evidence} title={o.name} report={{ title: o.name, place: o.name, kind: "stay" }} />
                {o.best_for && <span className="text-xs text-muted-foreground">Best for: {o.best_for}</span>}
                <span className="flex-1" />
                {o.place?.maps_url && (
                  <a href={o.place.maps_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-teal hover:underline">
                    <Navigation className="size-3.5" />
                    Maps
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ food */

function DietDot({ veg }: { veg: boolean | null }) {
  if (veg === null) return <UtensilsCrossed className="size-3.5 text-muted-foreground" />
  return <span className={veg ? "veg-dot" : "nonveg-dot"} title={veg ? "Vegetarian" : "Non-vegetarian"} />
}

export function FoodSection({ itinerary }: { itinerary: Itinerary }) {
  const f = itinerary.food
  return (
    <div className="space-y-6">
      {f.must_try.length > 0 && (
        <div>
          <p className="mb-3 text-sm font-semibold text-ink">Must-try dishes</p>
          <div className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3">
            {f.must_try.map((d) => (
              <div key={d.dish} className="card-soft w-64 shrink-0 snap-start p-4 sm:w-auto">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
                    <DietDot veg={d.veg} />
                    {d.dish}
                  </p>
                  {d.price_text && <span className="shrink-0 rounded-full bg-coral-soft px-2 py-0.5 text-xs font-bold text-[oklch(0.5_0.13_35)]">{d.price_text}</span>}
                </div>
                {d.where && <p className="mt-1.5 text-sm text-muted-foreground">{d.where}</p>}
                {d.note && <p className="mt-1 text-sm text-ink/80">{d.note}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
      {f.places.length > 0 && (
        <div>
          <p className="mb-3 text-sm font-semibold text-ink">Where locals and vloggers actually eat</p>
          <ul className="card-soft divide-y divide-border/60">
            {f.places.map((p) => (
              <li key={p.name} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-ink">
                    {p.name}
                    {p.in_plan && <span className="rounded-full bg-teal-soft px-2 py-0.5 text-[0.65rem] font-bold tracking-wide text-teal-deep uppercase">In your plan</span>}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {[p.area, p.known_for].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {p.price_min !== null && (
                  <span className="text-sm font-semibold text-ink">
                    {inrRange(p.price_min, p.price_max)} <span className="font-normal text-muted-foreground">/ {p.per}</span>
                  </span>
                )}
                <EvidenceStamp evidence={p.evidence} title={p.name} report={{ title: p.name, place: p.name, kind: "food" }} />
                {p.place?.maps_url && (
                  <a href={p.place.maps_url} target="_blank" rel="noreferrer" aria-label={`${p.name} on Maps`} className="text-teal">
                    <Navigation className="size-4" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <Tips tips={f.tips} />
    </div>
  )
}

function Tips({ tips, icon: Icon = Lightbulb }: { tips: string[]; icon?: typeof Lightbulb }) {
  if (!tips.length) return null
  return (
    <ul className="space-y-2">
      {tips.map((t) => (
        <li key={t} className="flex gap-2.5 rounded-xl bg-marigold-soft/70 px-4 py-2.5 text-sm text-ink/85">
          <Icon className="mt-0.5 size-4 shrink-0 text-[oklch(0.62_0.13_70)]" />
          {t}
        </li>
      ))}
    </ul>
  )
}

/* ------------------------------------------------------------------ transport */

const APP_STATUS = {
  confirmed: { icon: CircleCheck, label: "Works well", tone: "border-leaf/40 bg-leaf-soft text-leaf" },
  likely: { icon: Circle, label: "Should work", tone: "border-teal/30 bg-teal-soft text-teal-deep" },
  limited: { icon: CircleDashed, label: "Patchy", tone: "border-marigold/50 bg-marigold-soft text-[oklch(0.5_0.11_70)]" },
  unlikely: { icon: CircleX, label: "Not really", tone: "border-border bg-muted text-muted-foreground" },
} as const

export function TransportSection({ itinerary }: { itinerary: Itinerary }) {
  const t = itinerary.transport
  const distances = [...new Set(t.fare_examples.map((f) => f.distance_km))]
  const labels = [...new Set(t.fare_examples.map((f) => f.label))]
  return (
    <div className="space-y-6">
      {t.summary && <p className="max-w-3xl text-[1.05rem] leading-relaxed text-ink/85">{t.summary}</p>}
      <div className="flex flex-wrap gap-2">
        {t.apps.map((a) => {
          const s = APP_STATUS[a.status] || APP_STATUS.likely
          return (
            <div key={a.name} className={cn("flex items-start gap-2 rounded-2xl border px-3.5 py-2.5", s.tone)} title={a.note}>
              <s.icon className="mt-0.5 size-4 shrink-0" />
              <div>
                <p className="text-sm font-semibold">
                  {a.name} <span className="font-normal opacity-80">· {s.label}</span>
                </p>
                {a.note && <p className="max-w-60 text-xs opacity-80">{a.note}</p>}
              </div>
            </div>
          )
        })}
      </div>

      {t.fare_examples.length > 0 && (
        <div className="card-soft overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-border/70 text-left text-xs tracking-[0.12em] text-muted-foreground uppercase">
                <th className="px-4 py-3 font-semibold">Typical fare</th>
                {distances.map((d) => (
                  <th key={d} className="px-4 py-3 text-right font-semibold">
                    {d} km
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {labels.map((l) => (
                <tr key={l} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-3 font-medium text-ink">{l}</td>
                  {distances.map((d) => {
                    const f = t.fare_examples.find((x) => x.label === l && x.distance_km === d)
                    return (
                      <td key={d} className="px-4 py-3 text-right font-semibold text-ink tabular-nums">
                        {f ? inrRange(f.cost_min, f.cost_max) : "-"}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-border/60 bg-sand/50 px-4 py-2 text-xs text-muted-foreground">Estimates by distance, for comparing modes. Live app prices vary with demand.</p>
        </div>
      )}

      {t.modes.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {t.modes.map((m) => {
            return (
              <div key={m.label} className="rounded-2xl border border-border bg-card p-4">
                <p className="flex items-center gap-2 font-semibold text-ink">
                  <ModeIcon mode={m.mode} className="size-4 text-teal" />
                  {m.label}
                </p>
                {m.typical_fare && <p className="mt-1 text-sm font-semibold text-teal-deep">{m.typical_fare}</p>}
                {m.best_for && <p className="mt-1 text-sm text-muted-foreground">Best for: {m.best_for}</p>}
                {m.note && <p className="mt-1 text-sm text-ink/75">{m.note}</p>}
              </div>
            )
          })}
        </div>
      )}
      {t.rental && (
        <div className="flex gap-3 rounded-2xl border border-border bg-card p-4">
          <Bike className="mt-0.5 size-5 shrink-0 text-teal" />
          <p className="text-sm text-ink/85">{t.rental}</p>
        </div>
      )}
      <Tips tips={t.tips} />
    </div>
  )
}

/* ------------------------------------------------------------------ getting there */

export function GettingThereSection({ itinerary }: { itinerary: Itinerary }) {
  const g = itinerary.getting_there
  if (!g.options.length) {
    return (
      <div className="card-soft flex items-start gap-4 p-5">
        <Compass className="mt-0.5 size-5 shrink-0 text-teal" />
        <div>
          <p className="font-semibold text-ink">Where are you coming from?</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ask in the tweak bar (e.g. <em>&ldquo;I&apos;m coming from Mumbai by train&rdquo;</em>) and we&apos;ll add trains, buses or flights with prices.
          </p>
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground">
        From <strong className="text-ink">{g.origin}</strong>
        {g.distance_km ? ` · about ${g.distance_km} km by road` : ""}
        {g.arrival_hub ? ` · arrive at ${g.arrival_hub}` : ""}
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {g.options.map((o) => {
          return (
            <div key={o.mode} className={cn("card-soft p-5", o.recommended && "ring-2 ring-teal/40")}>
              <div className="flex items-start justify-between gap-3">
                <p className="flex items-center gap-2.5 font-semibold text-ink">
                  <span className={cn("flex size-9 items-center justify-center rounded-xl", o.recommended ? "bg-teal text-white" : "bg-sand text-teal")}>
                    <ModeIcon mode={o.mode} className="size-4" />
                  </span>
                  <span>
                    {o.title}
                    <span className="block text-xs font-normal text-muted-foreground">{o.duration_text}</span>
                  </span>
                </p>
                <div className="text-right">
                  <p className="font-display text-lg font-semibold text-ink">{inrRange(o.cost_min, o.cost_max)}</p>
                  <p className="text-xs text-muted-foreground">{o.per}</p>
                </div>
              </div>
              {o.recommended && <p className="mt-3 inline-flex items-center gap-1 rounded-full bg-teal-soft px-2 py-0.5 text-xs font-semibold text-teal-deep"><Check className="size-3" /> Recommended for you</p>}
              {o.details && <p className="mt-2 text-sm leading-relaxed text-ink/80">{o.details}</p>}
              {o.booking_tip && (
                <p className="mt-2 flex gap-2 text-sm text-muted-foreground">
                  <CalendarCheck className="mt-0.5 size-4 shrink-0 text-coral" />
                  {o.booking_tip}
                </p>
              )}
            </div>
          )
        })}
      </div>
      <Tips tips={g.notes} icon={Info} />
    </div>
  )
}

/* ------------------------------------------------------------------ essentials */

function PackingList({ items }: { items: string[] }) {
  const [done, setDone] = useState<Set<string>>(new Set())
  return (
    <ul className="space-y-1.5">
      {items.map((it) => {
        const on = done.has(it)
        return (
          <li key={it}>
            <button
              type="button"
              onClick={() => setDone((d) => {
                const n = new Set(d)
                if (n.has(it)) n.delete(it)
                else n.add(it)
                return n
              })}
              className="flex w-full items-start gap-2.5 text-left text-sm"
            >
              <span className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border", on ? "border-teal bg-teal text-white" : "border-input bg-card")}>
                {on && <Check className="size-3" />}
              </span>
              <span className={cn("text-ink/85", on && "text-muted-foreground line-through")}>{it}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

const ESSENTIAL_CARDS = [
  { key: "documents", title: "Documents & permits", icon: FileText },
  { key: "money", title: "Money & payments", icon: Banknote },
  { key: "connectivity", title: "Phone & internet", icon: Wifi },
  { key: "etiquette", title: "Local etiquette", icon: Users },
  { key: "safety", title: "Staying safe", icon: ShieldCheck },
  { key: "health", title: "Health", icon: HeartPulse },
  { key: "accessibility", title: "Accessibility", icon: AccessibilityIcon },
] as const

export function EssentialsSection({ itinerary }: { itinerary: Itinerary }) {
  const e = itinerary.essentials
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {e.packing.length > 0 && (
          <div className="card-soft p-5 md:row-span-2">
            <p className="flex items-center gap-2 font-semibold text-ink">
              <Backpack className="size-4 text-teal" /> Packing list
            </p>
            <div className="mt-3">
              <PackingList items={e.packing} />
            </div>
          </div>
        )}
        {e.scams.length > 0 && (
          <div className="rounded-2xl border border-coral/40 bg-coral-soft p-5">
            <p className="flex items-center gap-2 font-semibold text-[oklch(0.45_0.13_35)]">
              <ShieldAlert className="size-4" /> Scams to watch for
            </p>
            <ul className="mt-3 space-y-2 text-sm text-ink/85">
              {e.scams.map((s) => (
                <li key={s} className="flex gap-2">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-coral" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}
        {ESSENTIAL_CARDS.map(({ key, title, icon: Icon }) =>
          e[key].length ? (
            <div key={key} className="card-soft p-5">
              <p className="flex items-center gap-2 font-semibold text-ink">
                <Icon className="size-4 text-teal" /> {title}
              </p>
              <ul className="mt-3 space-y-2 text-sm text-ink/85">
                {e[key].map((s) => (
                  <li key={s} className="flex gap-2">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-teal/50" />
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          ) : null
        )}
      </div>

      {e.emergency.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {e.emergency.map((c) => (
            <a key={c.label + c.number} href={`tel:${c.number.replace(/[^0-9+]/g, "")}`} className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm shadow-sm hover:border-coral/50">
              <Phone className="size-4 text-coral" />
              <span className="font-bold text-ink">{c.number}</span>
              <span className="text-muted-foreground">{c.label}</span>
            </a>
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {itinerary.book_ahead.length > 0 && (
          <div className="card-soft p-5">
            <p className="flex items-center gap-2 font-semibold text-ink">
              <CalendarCheck className="size-4 text-coral" /> Book ahead
            </p>
            <ul className="mt-3 space-y-3">
              {itinerary.book_ahead.map((b) => (
                <li key={b.item} className="text-sm">
                  <p className="font-semibold text-ink">
                    {b.item} {b.when && <span className="font-normal text-coral">· {b.when}</span>}
                  </p>
                  {b.why && <p className="text-muted-foreground">{b.why}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {itinerary.rainy_day.length > 0 && (
          <div className="card-soft p-5">
            <p className="flex items-center gap-2 font-semibold text-ink">
              <CloudRain className="size-4 text-teal" /> If it rains
            </p>
            <ul className="mt-3 space-y-3">
              {itinerary.rainy_day.map((r) => (
                <li key={r.title} className="text-sm">
                  <p className="font-semibold text-ink">{r.title}</p>
                  {r.note && <p className="text-muted-foreground">{r.note}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {itinerary.hidden_gems.length > 0 && (
          <div className="card-soft p-5">
            <p className="flex items-center gap-2 font-semibold text-ink">
              <Gem className="size-4 text-[oklch(0.52_0.12_300)]" /> Hidden gems
            </p>
            <ul className="mt-3 space-y-3">
              {itinerary.hidden_gems.map((r) => (
                <li key={r.title} className="text-sm">
                  <p className="font-semibold text-ink">{r.title}</p>
                  {r.note && <p className="text-muted-foreground">{r.note}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ sources */

const KIND_ORDER = ["youtube", "youtube_comments", "reddit", "web", "user"]

export function SourcesSection({ itinerary }: { itinerary: Itinerary }) {
  const r = itinerary.research
  const stats = [
    { icon: Play, n: r.videos, label: "vlogs" },
    { icon: MessagesSquare, n: r.comment_threads + r.reddit_threads, label: "comment threads" },
    { icon: Globe, n: r.web_pages, label: "articles" },
    { icon: UserRound, n: r.user_reports, label: "traveller reports" },
    { icon: BadgeCheck, n: r.claims, label: "facts extracted" },
  ]
  const grouped = KIND_ORDER.map((k) => ({ kind: k, items: itinerary.sources.filter((s) => s.kind === k) })).filter((g) => g.items.length)
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-border bg-card p-4">
            <s.icon className="size-4 text-teal" />
            <p className="mt-2 font-display text-2xl font-semibold text-ink tabular-nums">{s.n}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>
      {r.newest_source && <p className="text-sm text-muted-foreground">Freshest evidence: {monthYear(r.newest_source)}.</p>}

      {itinerary.data_gaps.length > 0 && (
        <div className="rounded-2xl border border-marigold/50 bg-marigold-soft/70 p-5">
          <p className="flex items-center gap-2 font-semibold text-ink">
            <Info className="size-4 text-[oklch(0.62_0.13_70)]" /> What we couldn&apos;t verify
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-ink/80">
            {itinerary.data_gaps.map((g) => (
              <li key={g} className="flex gap-2">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-marigold" />
                {g}
              </li>
            ))}
          </ul>
        </div>
      )}

      {grouped.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {grouped.map((g) => {
            const meta = sourceMeta(g.kind)
            return (
              <div key={g.kind} className="card-soft p-5">
                <p className="flex items-center gap-2 font-semibold text-ink">
                  <meta.icon className="size-4 text-teal" /> {meta.label}s
                </p>
                <ul className="mt-3 space-y-2.5">
                  {g.items.map((s) => (
                    <li key={s.id} className="flex items-start gap-2 text-sm">
                      <div className="min-w-0 flex-1">
                        {s.url ? (
                          <a href={s.url} target="_blank" rel="noreferrer" className="line-clamp-2 font-medium text-ink hover:text-teal">
                            {s.title}
                          </a>
                        ) : (
                          <p className="font-medium text-ink">{s.title}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {[s.author, s.published_at ? monthYear(s.published_at) : ""].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      {s.url && <ExternalLink className="mt-1 size-3.5 shrink-0 text-muted-foreground" />}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
