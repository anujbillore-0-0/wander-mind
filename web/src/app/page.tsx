import Link from "next/link"
import {
  ArrowRight,
  BedDouble,
  Calculator,
  CalendarCheck,
  CloudSun,
  Map,
  MessagesSquare,
  Play,
  Route,
  ShieldCheck,
  Smartphone,
  Stamp,
  TrainFront,
  UtensilsCrossed,
  Wallet,
} from "lucide-react"

import { DestinationIdeas } from "@/components/home/destination-ideas"
import { EvidencePostcard } from "@/components/home/evidence-postcard"
import { HeroSearch } from "@/components/home/hero-search"
import { Button } from "@/components/ui/button"

const STEPS = [
  {
    icon: Play,
    title: "We watch and read",
    body: "Recent travel vlogs, their comment sections, traveller forums and blogs about your destination, from the last few months and not the last decade.",
  },
  {
    icon: Calculator,
    title: "We check the maths",
    body: "Prices are cross-checked across sources. Rides are priced by distance for Rapido, autos and cabs, or local taxis where apps don't work.",
  },
  {
    icon: Stamp,
    title: "You get receipts",
    body: "Every stop carries a stamp: verified by several recent sources, reported by one, or an honest estimate. Tap it to see where it came from.",
  },
]

const INCLUDED = [
  { icon: Route, label: "Day-by-day route on a map" },
  { icon: Wallet, label: "Budget broken down to the rupee" },
  { icon: UtensilsCrossed, label: "What to eat and where, with prices" },
  { icon: BedDouble, label: "Where to stay, by area and budget" },
  { icon: Smartphone, label: "Rapido, auto and cab fares between stops" },
  { icon: TrainFront, label: "Getting there and back" },
  { icon: CloudSun, label: "Weather, season and crowds" },
  { icon: CalendarCheck, label: "What to book ahead" },
  { icon: ShieldCheck, label: "Safety, scams and local etiquette" },
  { icon: MessagesSquare, label: "Tweak anything by just asking" },
]

export default function Home() {
  return (
    <>
      <section className="topo relative overflow-hidden">
        <div className="pointer-events-none absolute -top-40 -right-40 size-[520px] rounded-full bg-sky blur-3xl" />
        <div className="pointer-events-none absolute -bottom-48 -left-32 size-[420px] rounded-full bg-marigold-soft blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-4 pt-12 pb-20 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:pt-20">
          <div>
            <p className="kicker">Evidence-based trip planning</p>
            <h1 className="mt-3 text-[2.6rem] leading-[1.05] font-semibold text-ink sm:text-6xl">
              Plan trips on what travellers saw <em className="text-teal not-italic">last month</em>.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Wander Mind reads recent vlogs, comments and travel blogs, then builds your itinerary with real local prices
              for street food, rides and stays, all inside your budget.
            </p>
            <div className="mt-8">
              <HeroSearch />
            </div>
          </div>
          <EvidencePostcard />
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="kicker">Need a nudge?</p>
            <h2 className="mt-2 text-3xl font-semibold text-ink sm:text-4xl">Where to next?</h2>
          </div>
          <Button asChild variant="outline" className="rounded-full">
            <Link href="/trip/sample">
              <Map className="size-4" />
              See a sample plan
            </Link>
          </Button>
        </div>
        <div className="mt-8">
          <DestinationIdeas />
        </div>
      </section>

      <section className="border-y border-border/60 bg-card/60">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.title}>
              <div className="flex items-center gap-3">
                <span className="flex size-11 items-center justify-center rounded-xl bg-teal text-white shadow-sm">
                  <s.icon className="size-5" />
                </span>
                <span className="font-display text-sm font-semibold tracking-[0.2em] text-muted-foreground">STEP 0{i + 1}</span>
              </div>
              <h3 className="mt-4 text-xl font-semibold text-ink">{s.title}</h3>
              <p className="mt-2 leading-relaxed text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_1.4fr] lg:items-center">
          <div>
            <p className="kicker">Everything in one plan</p>
            <h2 className="mt-2 text-3xl font-semibold text-ink sm:text-4xl">The whole trip, not just a list of places.</h2>
            <p className="mt-4 leading-relaxed text-muted-foreground">
              Tell us as little or as much as you like: dates, budget, who&apos;s coming, food habits, how you like to move
              around. We fill the gaps with sensible defaults and tell you what we couldn&apos;t verify.
            </p>
            <Button asChild size="lg" className="mt-6 h-11 rounded-full px-5">
              <Link href="/plan">
                Start planning
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {INCLUDED.map((f) => (
              <li key={f.label} className="flex items-center gap-3 rounded-xl border border-border/70 bg-card px-4 py-3">
                <f.icon className="size-5 shrink-0 text-teal" />
                <span className="text-[0.95rem] font-medium text-ink">{f.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  )
}
