"use client"

import { motion } from "motion/react"
import { BedDouble, Bike, Play, UtensilsCrossed } from "lucide-react"

const ROWS = [
  { icon: UtensilsCrossed, title: "Egg benjo at a 56 Dukan stall", sub: "Food stop · 18:30", price: "₹60–70", stamp: "6 sources · Aug", tone: "stamp-verified" },
  { icon: Bike, title: "Bike taxi: Rajwada → Vijay Nagar", sub: "5.4 km · 18 min", price: "₹45–60", stamp: "fare model", tone: "stamp-estimate" },
  { icon: BedDouble, title: "Dorm bed near Vijay Nagar", sub: "Hostel · per night", price: "₹499–699", stamp: "3 sources · Jul", tone: "stamp-reported" },
]

/** Illustration of what a plan looks like. Example content, not live data. */
export function EvidencePostcard() {
  return (
    <div className="relative mx-auto w-full max-w-md">
      <motion.div
        initial={{ opacity: 0, y: 20, rotate: 2 }}
        animate={{ opacity: 1, y: 0, rotate: 1.5 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="card-soft relative z-10 p-5"
      >
        <div className="flex items-center justify-between">
          <span className="kicker">Example plan · Indore</span>
          <span className="rounded-full bg-teal-soft px-2 py-0.5 text-[0.7rem] font-semibold text-teal-deep">Day 1</span>
        </div>
        <ol className="mt-4 space-y-3">
          {ROWS.map((r, i) => (
            <motion.li
              key={r.title}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.35 + i * 0.18 }}
              className="flex items-center gap-3 rounded-xl border border-border/70 bg-sand/60 p-3"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-card text-teal shadow-sm">
                <r.icon className="size-4.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{r.title}</p>
                <p className="text-xs text-muted-foreground">{r.sub}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-sm font-bold text-ink">{r.price}</span>
                <span className={`stamp ${r.tone}`}>{r.stamp}</span>
              </div>
            </motion.li>
          ))}
        </ol>
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-coral-soft px-3 py-2 text-xs text-[oklch(0.45_0.12_35)]">
          <Play className="size-3.5 shrink-0 fill-current" />
          <span>Every price links back to the vlog moment or post it came from.</span>
        </div>
      </motion.div>
      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="ticket absolute -right-4 -bottom-12 z-20 hidden w-52 rotate-[4deg] rounded-xl border border-marigold/40 bg-marigold-soft p-4 shadow-[var(--shadow-soft)] sm:block"
      >
        <p className="kicker text-[oklch(0.55_0.12_70)]">Budget check</p>
        <p className="mt-1 font-display text-2xl font-semibold text-ink">₹3,640</p>
        <p className="text-xs text-muted-foreground">of your ₹4,000 · fits ✓</p>
      </motion.div>
    </div>
  )
}
