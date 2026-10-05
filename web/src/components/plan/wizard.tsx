"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { ArrowLeft, ArrowRight, ListChecks, Loader2, MapPin, Quote, Sparkles, Users, UtensilsCrossed, Wallet } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"
import { inr } from "@/lib/format"
import {
  ACCESSIBILITY,
  BUDGET_LEVELS,
  DAY_STARTS,
  DIETS,
  FITNESS,
  GROUP_TYPES,
  INTERCITY,
  LOCAL_TRANSPORT,
  OCCASIONS,
  PACES,
  STAY_TYPES,
  TIMES,
  VIBES,
  clearDraft,
  clearPrompt,
  defaultRequest,
  loadDraft,
  peekPrompt,
  saveDraft,
  travelers,
  tripDays,
} from "@/lib/trip-options"
import type { TripRequest } from "@/lib/types"
import { cn } from "@/lib/utils"

import { BoardingPass } from "./boarding-pass"
import {
  BudgetField,
  ChipGroup,
  Counter,
  DateRangeField,
  Field,
  MonthPicker,
  PlaceInput,
  PlaceTags,
  Segmented,
  TextTags,
  ToggleRow,
  inputClass,
} from "./fields"

type Patch = (p: Partial<TripRequest>) => void

const GROUP_DEFAULTS: Record<TripRequest["group_type"], Partial<TripRequest>> = {
  solo: { adults: 1, children: 0, seniors: 0 },
  couple: { adults: 2, children: 0, seniors: 0, solo_female: false },
  friends: { adults: 4, children: 0, seniors: 0, solo_female: false },
  family: { adults: 2, children: 1, seniors: 0, solo_female: false },
  business: { adults: 1, children: 0, seniors: 0 },
}

function StepWhere({ req, set, dateMode, setDateMode }: { req: TripRequest; set: Patch; dateMode: "exact" | "flexible"; setDateMode: (m: "exact" | "flexible") => void }) {
  return (
    <div className="space-y-7">
      <Field label="Where do you want to go?" hint="Add up to 3 places for a multi-stop trip.">
        <PlaceTags values={req.destinations} onChange={(v) => set({ destinations: v })} placeholder="Indore, Udaipur, Rishikesh…" />
      </Field>
      <Field label="Starting from" hint="Optional. We'll add trains, buses or flights there and back.">
        <PlaceInput value={req.origin} onChange={(v) => set({ origin: v })} onPick={(v) => set({ origin: v })} placeholder="Your home city" />
      </Field>
      <Field label="When?">
        <Segmented
          options={[
            { value: "exact", label: "I know my dates" },
            { value: "flexible", label: "I'm flexible" },
          ]}
          value={dateMode}
          onChange={(m) => {
            setDateMode(m)
            if (m === "flexible") set({ start_date: null, end_date: null })
            else set({ flexible_month: "" })
          }}
        />
        {dateMode === "exact" ? (
          <DateRangeField start={req.start_date} end={req.end_date} onChange={(s, e) => set({ start_date: s, end_date: e })} />
        ) : (
          <div className="space-y-3">
            <MonthPicker value={req.flexible_month} onChange={(v) => set({ flexible_month: v })} />
            <Counter label="Number of days" value={req.num_days || 2} min={1} max={14} onChange={(v) => set({ num_days: v })} />
          </div>
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Arriving">
          <select value={req.arrival_time} onChange={(e) => set({ arrival_time: e.target.value as TripRequest["arrival_time"] })} className={inputClass}>
            {TIMES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Leaving">
          <select value={req.departure_time} onChange={(e) => set({ departure_time: e.target.value as TripRequest["departure_time"] })} className={inputClass}>
            {TIMES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </div>
  )
}

function StepWho({ req, set }: { req: TripRequest; set: Patch }) {
  return (
    <div className="space-y-7">
      <Field label="Who's travelling?">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {GROUP_TYPES.map((g) => {
            const on = req.group_type === g.value
            const Icon = g.icon!
            return (
              <button
                key={g.value}
                type="button"
                onClick={() => set({ group_type: g.value, ...GROUP_DEFAULTS[g.value] })}
                className={cn(
                  "flex flex-col items-start gap-2 rounded-2xl border bg-card p-4 text-left transition-all",
                  on ? "border-teal bg-teal-soft shadow-[0_0_0_3px_var(--teal-soft)]" : "border-border hover:border-teal/40"
                )}
              >
                <span className={cn("flex size-9 items-center justify-center rounded-xl", on ? "bg-teal text-white" : "bg-sand text-teal")}>
                  <Icon className="size-4.5" />
                </span>
                <span>
                  <span className="block font-semibold text-ink">{g.label}</span>
                  <span className="block text-xs text-muted-foreground">{g.hint}</span>
                </span>
              </button>
            )
          })}
        </div>
      </Field>
      <div className="grid gap-2 sm:grid-cols-3">
        <Counter label="Adults" value={req.adults} min={1} max={20} onChange={(v) => set({ adults: v })} />
        <Counter label="Children" hint="Under 12" value={req.children} max={10} onChange={(v) => set({ children: v })} />
        <Counter label="Seniors" hint="60+" value={req.seniors} max={10} onChange={(v) => set({ seniors: v })} />
      </div>
      {req.group_type === "solo" && (
        <ToggleRow
          label="I'm a woman travelling solo"
          hint="We'll favour well-reviewed areas and add specific safety notes."
          checked={req.solo_female}
          onChange={(v) => set({ solo_female: v })}
        />
      )}
      <Field label="Any occasion?">
        <ChipGroup options={OCCASIONS} value={[req.occasion]} onChange={(v) => set({ occasion: v[0] })} multiple={false} size="sm" />
      </Field>
    </div>
  )
}

function StepBudget({ req, set }: { req: TripRequest; set: Patch }) {
  const days = tripDays(req)
  const people = travelers(req)
  const perDay = Math.round(req.budget_total / Math.max(people, 1) / Math.max(days, 1))
  return (
    <div className="space-y-7">
      <Field label="Total budget for everyone" hint={`For ${people} traveller${people > 1 ? "s" : ""} over ${days} day${days > 1 ? "s" : ""}. We'll keep the plan inside it.`}>
        <BudgetField value={req.budget_total} onChange={(v) => set({ budget_total: v })} perPersonDay={perDay} />
        <div className="grid gap-2 sm:grid-cols-3">
          {BUDGET_LEVELS.map((l) => {
            const total = Math.round((l.perDay * days * people) / 500) * 500
            const on = Math.abs(total - req.budget_total) < 1
            return (
              <button
                key={l.key}
                type="button"
                onClick={() => set({ budget_total: total })}
                className={cn(
                  "rounded-xl border bg-card p-3 text-left transition",
                  on ? "border-teal bg-teal-soft" : "border-border hover:border-teal/40"
                )}
              >
                <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                  <l.icon className="size-4 text-marigold" />
                  {l.label}
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{l.hint}</span>
                <span className="mt-1.5 block text-sm font-bold text-teal-deep">{inr(total)}</span>
              </button>
            )
          })}
        </div>
      </Field>
      {req.origin && (
        <ToggleRow
          label="Budget includes getting there & back"
          hint={`Train, bus or flight from ${req.origin} and back.`}
          checked={req.budget_includes_intercity}
          onChange={(v) => set({ budget_includes_intercity: v })}
        />
      )}
      <ToggleRow label="I've already booked my stay" checked={req.stay_booked} onChange={(v) => set({ stay_booked: v })} />
      {req.stay_booked ? (
        <Field label="Where are you staying?" hint="We'll plan your days around it.">
          <input value={req.stay_address} onChange={(e) => set({ stay_address: e.target.value })} placeholder="Hotel name or area" className={inputClass} />
        </Field>
      ) : (
        <Field label="What kind of stay?" hint="Pick any that you'd be happy with.">
          <ChipGroup options={STAY_TYPES} value={req.stay_types} onChange={(v) => set({ stay_types: v })} />
        </Field>
      )}
    </div>
  )
}

function StepVibe({ req, set }: { req: TripRequest; set: Patch }) {
  return (
    <div className="space-y-7">
      <Field label="What's the trip about?" hint="Pick a few. This shapes what we research.">
        <ChipGroup options={VIBES} value={req.vibes} onChange={(v) => set({ vibes: v })} />
      </Field>
      <Field label="Pace">
        <Segmented options={PACES} value={req.pace} onChange={(v) => set({ pace: v })} />
      </Field>
      <Field label="Fitness">
        <Segmented options={FITNESS} value={req.fitness} onChange={(v) => set({ fitness: v })} />
      </Field>
      <Field label="Mornings">
        <Segmented options={DAY_STARTS} value={req.day_start} onChange={(v) => set({ day_start: v })} />
      </Field>
      <Field label="Crowds">
        <Segmented
          options={[
            { value: "avoid", label: "Avoid crowds", hint: "Go early, skip peak hours" },
            { value: "ok", label: "Don't mind", hint: "Buzz is part of the fun" },
          ]}
          value={req.crowd_tolerance}
          onChange={(v) => set({ crowd_tolerance: v })}
        />
      </Field>
    </div>
  )
}

function StepFood({ req, set }: { req: TripRequest; set: Patch }) {
  return (
    <div className="space-y-7">
      <Field label="Food preference">
        <ChipGroup options={DIETS} value={[req.diet]} onChange={(v) => set({ diet: v[0] as TripRequest["diet"] })} multiple={false} />
      </Field>
      <Field label="Allergies or must-try dishes" hint="Optional">
        <input value={req.food_notes} onChange={(e) => set({ food_notes: e.target.value })} placeholder="e.g. nut allergy, must try poha-jalebi" className={inputClass} />
      </Field>
      <ToggleRow label="Include bars and drinks" checked={req.alcohol_ok} onChange={(v) => set({ alcohol_ok: v })} />
      <Field label="Getting around town" hint="We'll price every ride between stops.">
        <ChipGroup options={LOCAL_TRANSPORT} value={req.local_transport} onChange={(v) => set({ local_transport: v })} />
      </Field>
      <ToggleRow
        label="I can ride a scooty / bike"
        hint="Unlocks rentals, often the cheapest option in hill towns and beach towns."
        checked={req.can_ride_two_wheeler}
        onChange={(v) => set({ can_ride_two_wheeler: v })}
      />
      {req.origin ? (
        <Field label={`Getting there from ${req.origin}`}>
          <ChipGroup options={INTERCITY} value={req.intercity_modes} onChange={(v) => set({ intercity_modes: v })} />
        </Field>
      ) : null}
    </div>
  )
}

function StepExtras({ req, set }: { req: TripRequest; set: Patch }) {
  return (
    <div className="space-y-7">
      <Field label="Must include" hint="Places, food or experiences you don't want to miss.">
        <TextTags values={req.must_include} onChange={(v) => set({ must_include: v })} placeholder="e.g. Sarafa Bazaar, a sunset point" />
      </Field>
      <Field label="Avoid" hint="Things you'd rather skip.">
        <TextTags values={req.avoid} onChange={(v) => set({ avoid: v })} placeholder="e.g. malls, long drives" />
      </Field>
      <Field label="Accessibility">
        <ChipGroup options={ACCESSIBILITY} value={req.accessibility} onChange={(v) => set({ accessibility: v })} size="sm" />
      </Field>
      <Field label="Anything else?" hint="Write it like you'd tell a friend.">
        <textarea
          value={req.notes}
          onChange={(e) => set({ notes: e.target.value })}
          rows={3}
          placeholder="I love old bookstores, want one sunset spot every day, and hate early alarms."
          className={cn(inputClass, "h-auto py-3 leading-relaxed")}
        />
      </Field>
    </div>
  )
}

const STEPS = [
  { key: "where", title: "Where & when", subtitle: "The basics of your trip.", icon: MapPin },
  { key: "who", title: "Who's going", subtitle: "So we size rooms, rides and meals right.", icon: Users },
  { key: "budget", title: "Budget & stay", subtitle: "Every rupee gets accounted for.", icon: Wallet },
  { key: "vibe", title: "Your vibe", subtitle: "What makes a day great for you.", icon: Sparkles },
  { key: "food", title: "Food & getting around", subtitle: "The two things that make or break a trip.", icon: UtensilsCrossed },
  { key: "extras", title: "Final touches", subtitle: "Must-dos, no-gos and anything else.", icon: ListChecks },
] as const

function initialState(params: URLSearchParams) {
  // This component renders client-side only (useSearchParams under Suspense), so sessionStorage is safe here.
  const req = loadDraft() || defaultRequest()
  const destination = params.get("destination")
  if (destination && !req.destinations.includes(destination)) req.destinations = [destination, ...req.destinations].slice(0, 3)
  const prompt = params.get("from") === "prompt" ? peekPrompt() : ""
  if (prompt) req.description = prompt
  return { req, prompt, dateMode: (req.start_date ? "exact" : "flexible") as "exact" | "flexible" }
}

export function PlanWizard() {
  const router = useRouter()
  const params = useSearchParams()
  const [init] = useState(() => initialState(params))
  const [req, setReq] = useState<TripRequest>(init.req)
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)
  const [dateMode, setDateMode] = useState<"exact" | "flexible">(init.dateMode)
  const [parsing, setParsing] = useState(Boolean(init.prompt))
  const [submitting, setSubmitting] = useState(false)
  const parseStarted = useRef(false)

  const set: Patch = (p) => setReq((r) => ({ ...r, ...p }))

  useEffect(() => {
    const prompt = init.prompt
    if (!prompt || parseStarted.current) return
    parseStarted.current = true
    api
      .parse(prompt)
      .then((parsed) => {
        setReq((r) => {
          const next = { ...r, ...parsed, description: prompt } as TripRequest
          if (parsed.group_type && !parsed.adults) Object.assign(next, GROUP_DEFAULTS[parsed.group_type])
          return next
        })
        if (parsed.start_date) setDateMode("exact")
        toast.success("Got it! We filled in what we understood. Check it and add anything else.")
      })
      .catch((e) => toast.error(e.message || "Couldn't read that. Fill the form instead."))
      .finally(() => {
        clearPrompt()
        setParsing(false)
      })
  }, [init.prompt])

  useEffect(() => {
    saveDraft(req)
  }, [req])

  const ready = req.destinations.length > 0 && req.budget_total >= 500 && (dateMode === "flexible" || Boolean(req.start_date && req.end_date))
  const stepValid = useMemo(() => {
    if (step === 0) return req.destinations.length > 0 && (dateMode === "flexible" || Boolean(req.start_date && req.end_date))
    if (step === 2) return req.budget_total >= 500
    return true
  }, [step, req, dateMode])

  function go(to: number) {
    setDir(to > step ? 1 : -1)
    setStep(to)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  async function submit() {
    if (!ready) {
      toast.error(req.destinations.length ? "Pick your dates or switch to flexible." : "Where are you going? Add a destination first.")
      go(0)
      return
    }
    setSubmitting(true)
    const payload: TripRequest = {
      ...req,
      num_days: dateMode === "flexible" ? req.num_days || 2 : null,
      flexible_month: dateMode === "flexible" ? req.flexible_month : "",
    }
    try {
      const { id } = await api.createTrip(payload)
      clearDraft()
      router.push(`/trip/${id}`)
    } catch (e) {
      toast.error((e as Error).message)
      setSubmitting(false)
    }
  }

  const S = STEPS[step]
  const content = [
    <StepWhere key="where" req={req} set={set} dateMode={dateMode} setDateMode={setDateMode} />,
    <StepWho key="who" req={req} set={set} />,
    <StepBudget key="budget" req={req} set={set} />,
    <StepVibe key="vibe" req={req} set={set} />,
    <StepFood key="food" req={req} set={set} />,
    <StepExtras key="extras" req={req} set={set} />,
  ][step]

  return (
    <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-8 px-4 pt-6 pb-28 sm:px-6 lg:grid-cols-[1fr_340px] lg:pt-10 lg:pb-16">
      <div className="min-w-0">
        {/* progress */}
        <div className="flex items-center gap-1.5" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
          {STEPS.map((s, i) => (
            <button
              key={s.key}
              type="button"
              onClick={() => go(i)}
              aria-label={s.title}
              className={cn("h-1.5 flex-1 rounded-full transition-all", i < step ? "bg-teal" : i === step ? "bg-teal/60" : "bg-border")}
            />
          ))}
        </div>

        {req.description && (
          <div className="mt-6 flex gap-3 rounded-2xl border border-marigold/40 bg-marigold-soft px-4 py-3">
            <Quote className="mt-0.5 size-4 shrink-0 text-[oklch(0.6_0.13_70)]" />
            <div className="min-w-0 text-sm">
              <p className="text-ink italic">{req.description}</p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                {parsing ? (
                  <>
                    <Loader2 className="size-3 animate-spin" /> Reading your trip…
                  </>
                ) : (
                  "We pre-filled the form from this. Change anything you like."
                )}
              </p>
            </div>
          </div>
        )}

        <div className="mt-8 flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-teal text-white shadow-sm">
            <S.icon className="size-5" />
          </span>
          <div>
            <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
              Step {step + 1} of {STEPS.length}
            </p>
            <h1 className="text-2xl font-semibold text-ink sm:text-3xl">{S.title}</h1>
          </div>
        </div>
        <p className="mt-2 text-muted-foreground">{S.subtitle}</p>

        <div className="relative mt-7">
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <motion.div
              key={S.key}
              custom={dir}
              initial={{ opacity: 0, x: dir * 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: dir * -24 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className={cn(parsing && "pointer-events-none opacity-60")}
            >
              {content}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/90 px-4 py-3 backdrop-blur-md lg:static lg:mt-10 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <Button variant="ghost" size="lg" className="rounded-full" onClick={() => go(step - 1)} disabled={step === 0}>
              <ArrowLeft className="size-4" />
              Back
            </Button>
            <div className="flex items-center gap-2">
              {step < STEPS.length - 1 && step >= 1 && (
                <Button variant="ghost" size="lg" className="rounded-full text-muted-foreground" onClick={submit} disabled={!ready || submitting}>
                  <span className="sm:hidden">Plan now</span>
                  <span className="hidden sm:inline">Skip the rest & plan</span>
                </Button>
              )}
              {step < STEPS.length - 1 ? (
                <Button size="lg" className="h-11 rounded-full px-6" onClick={() => go(step + 1)} disabled={!stepValid}>
                  Next
                  <ArrowRight className="size-4" />
                </Button>
              ) : (
                <Button size="lg" className="h-11 rounded-full px-6 lg:hidden" onClick={submit} disabled={!ready || submitting}>
                  {submitting && <Loader2 className="size-4 animate-spin" />}
                  Plan my trip
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <aside className="hidden lg:block">
        <div className="sticky top-24">
          <BoardingPass req={req} ready={ready} submitting={submitting} onSubmit={submit} />
        </div>
      </aside>
    </div>
  )
}
