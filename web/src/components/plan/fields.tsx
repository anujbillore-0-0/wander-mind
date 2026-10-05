"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { addMonths, format, parseISO } from "date-fns"
import type { DateRange } from "react-day-picker"
import { CalendarDays, Check, MapPin, Minus, Plus, X } from "lucide-react"

import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { api } from "@/lib/api"
import { compactInr, inr } from "@/lib/format"
import type { Option } from "@/lib/trip-options"
import type { PlaceSuggestion } from "@/lib/types"
import { cn } from "@/lib/utils"

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-2.5", className)}>
      <div>
        <p className="text-[0.95rem] font-semibold text-ink">{label}</p>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

export function ChipGroup({
  options,
  value,
  onChange,
  multiple = true,
  size = "md",
}: {
  options: Option[]
  value: string[]
  onChange: (next: string[]) => void
  multiple?: boolean
  size?: "md" | "sm"
}) {
  return (
    <div className="flex flex-wrap gap-2" role={multiple ? "group" : "radiogroup"}>
      {options.map((o) => {
        const on = value.includes(o.value)
        const Icon = o.icon
        return (
          <button
            key={o.value}
            type="button"
            role={multiple ? undefined : "radio"}
            aria-checked={multiple ? undefined : on}
            aria-pressed={multiple ? on : undefined}
            onClick={() => {
              if (multiple) onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value])
              else onChange([o.value])
            }}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border bg-card font-medium transition-all",
              size === "md" ? "px-3.5 py-2 text-[0.88rem]" : "px-3 py-1.5 text-[0.8rem]",
              on
                ? "border-teal bg-teal-soft text-teal-deep shadow-[0_0_0_3px_var(--teal-soft)]"
                : "border-border text-ink/80 hover:border-teal/40 hover:bg-sand"
            )}
          >
            {on ? <Check className="size-3.5" /> : Icon ? <Icon className="size-3.5 text-muted-foreground" /> : null}
            {o.label}
            {o.hint && size === "md" && <span className="hidden text-xs font-normal text-muted-foreground sm:inline">· {o.hint}</span>}
          </button>
        )
      })}
    </div>
  )
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  columns,
}: {
  options: Option<T>[]
  value: T
  onChange: (v: T) => void
  columns?: number
}) {
  return (
    <div
      role="radiogroup"
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${columns || options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const on = o.value === value
        const Icon = o.icon
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex flex-col items-start gap-0.5 rounded-xl border bg-card px-3 py-2.5 text-left transition-all",
              on ? "border-teal bg-teal-soft shadow-[0_0_0_3px_var(--teal-soft)]" : "border-border hover:border-teal/40 hover:bg-sand"
            )}
          >
            <span className={cn("flex items-center gap-1.5 text-sm font-semibold", on ? "text-teal-deep" : "text-ink")}>
              {Icon && <Icon className="size-4" />}
              {o.label}
            </span>
            {o.hint && <span className="text-xs leading-snug text-muted-foreground">{o.hint}</span>}
          </button>
        )
      })}
    </div>
  )
}

export function Counter({
  label,
  hint,
  value,
  min = 0,
  max = 20,
  onChange,
}: {
  label: string
  hint?: string
  value: number
  min?: number
  max?: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <div>
        <p className="text-sm font-semibold text-ink">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={`Fewer ${label.toLowerCase()}`}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
          className="flex size-8 items-center justify-center rounded-full border border-border text-ink transition hover:border-teal hover:text-teal disabled:opacity-30"
        >
          <Minus className="size-4" />
        </button>
        <span className="w-5 text-center font-display text-lg font-semibold tabular-nums">{value}</span>
        <button
          type="button"
          aria-label={`More ${label.toLowerCase()}`}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
          className="flex size-8 items-center justify-center rounded-full border border-border text-ink transition hover:border-teal hover:text-teal disabled:opacity-30"
        >
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  )
}

export function ToggleRow({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId()
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border bg-card px-4 py-3">
      <span>
        <span className="block text-sm font-semibold text-ink">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </label>
  )
}

export const inputClass =
  "h-12 w-full rounded-xl border border-input bg-card px-4 text-[0.95rem] text-ink outline-none transition placeholder:text-muted-foreground/70 focus:border-teal focus:shadow-[0_0_0_3px_var(--teal-soft)]"

function usePlaceSuggestions(query: string) {
  const [results, setResults] = useState<PlaceSuggestion[]>([])
  const q = query.trim()
  useEffect(() => {
    if (q.length < 2) return
    let alive = true
    const t = setTimeout(() => {
      api
        .places(q)
        .then((r) => alive && setResults(r))
        .catch(() => alive && setResults([]))
    }, 220)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [q])
  return q.length < 2 ? [] : results
}

export function PlaceInput({
  value,
  onChange,
  onPick,
  placeholder,
  autoFocus,
  clearOnPick = false,
}: {
  value: string
  onChange: (v: string) => void
  onPick: (name: string) => void
  placeholder?: string
  autoFocus?: boolean
  clearOnPick?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const results = usePlaceSuggestions(open ? value : "")
  const listId = useId()

  function pick(name: string) {
    onPick(name)
    if (clearOnPick) onChange("")
    setOpen(false)
  }

  return (
    <div className="relative">
      <MapPin className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-teal" />
      <input
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
          setActive(0)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault()
            setActive((a) => Math.min(a + 1, results.length - 1))
          } else if (e.key === "ArrowUp") {
            e.preventDefault()
            setActive((a) => Math.max(a - 1, 0))
          } else if (e.key === "Enter") {
            e.preventDefault()
            if (results[active] && open) pick(results[active].name)
            else if (value.trim()) pick(value.trim())
          }
        }}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={listId}
        className={cn(inputClass, "pl-10")}
      />
      {open && results.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-[var(--shadow-lift)]"
        >
          {results.map((r, i) => (
            <li key={`${r.name}-${r.lat}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(r.name)}
                onMouseEnter={() => setActive(i)}
                className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left", i === active && "bg-teal-soft")}
              >
                <MapPin className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink">{r.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{[r.region, r.country].filter(Boolean).join(", ")}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function PlaceTags({ values, onChange, max = 3, placeholder }: { values: string[]; onChange: (v: string[]) => void; max?: number; placeholder?: string }) {
  const [draft, setDraft] = useState("")
  return (
    <div className="space-y-2.5">
      {values.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {values.map((v, i) => (
            <span key={v} className="inline-flex items-center gap-1.5 rounded-full bg-teal px-3 py-1.5 text-sm font-semibold text-white">
              {values.length > 1 && <span className="text-xs opacity-75">{i + 1}.</span>}
              {v}
              <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))} className="rounded-full p-0.5 hover:bg-white/20">
                <X className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
      {values.length < max && (
        <PlaceInput
          value={draft}
          onChange={setDraft}
          clearOnPick
          onPick={(name) => {
            if (!values.some((v) => v.toLowerCase() === name.toLowerCase())) onChange([...values, name])
          }}
          placeholder={values.length ? "Add another stop (optional)" : placeholder}
        />
      )}
    </div>
  )
}

export function TextTags({ values, onChange, placeholder }: { values: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState("")
  function add() {
    const v = draft.trim()
    if (v && !values.includes(v)) onChange([...values, v])
    setDraft("")
  }
  return (
    <div className="space-y-2.5">
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault()
              add()
            }
          }}
          placeholder={placeholder}
          className={inputClass}
        />
        <button type="button" onClick={add} className="shrink-0 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-teal hover:bg-teal-soft">
          Add
        </button>
      </div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {values.map((v) => (
            <span key={v} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-sand px-3 py-1 text-sm text-ink">
              {v}
              <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))}>
                <X className="size-3.5 text-muted-foreground" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function toIso(d: Date) {
  return format(d, "yyyy-MM-dd")
}

export function DateRangeField({
  start,
  end,
  onChange,
}: {
  start: string | null
  end: string | null
  onChange: (start: string | null, end: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const selected: DateRange | undefined = start ? { from: parseISO(start), to: end ? parseISO(end) : undefined } : undefined
  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])
  const label = start
    ? end && end !== start
      ? `${format(parseISO(start), "EEE d MMM")} → ${format(parseISO(end), "EEE d MMM")}`
      : `${format(parseISO(start), "EEE d MMM")} → pick an end date`
    : "Pick your dates"
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={cn(inputClass, "flex items-center gap-3 text-left", !start && "text-muted-foreground/80")}>
          <CalendarDays className="size-4 text-teal" />
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto rounded-2xl p-2" align="start">
        <Calendar
          mode="range"
          selected={selected}
          onSelect={(range) => {
            onChange(range?.from ? toIso(range.from) : null, range?.to ? toIso(range.to) : null)
            if (range?.from && range?.to && range.to.getTime() !== range.from.getTime()) setOpen(false)
          }}
          numberOfMonths={2}
          max={21}
          disabled={{ before: today }}
          defaultMonth={selected?.from || today}
        />
      </PopoverContent>
    </Popover>
  )
}

export function MonthPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const months = useMemo(() => {
    const now = new Date()
    return Array.from({ length: 12 }, (_, i) => addMonths(new Date(now.getFullYear(), now.getMonth(), 1), i))
  }, [])
  return (
    <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {months.map((m) => {
        const v = format(m, "yyyy-MM")
        const on = v === value
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={cn(
              "flex shrink-0 flex-col items-center rounded-xl border px-3.5 py-2 transition",
              on ? "border-teal bg-teal-soft text-teal-deep" : "border-border bg-card hover:border-teal/40"
            )}
          >
            <span className="text-sm font-semibold">{format(m, "MMM")}</span>
            <span className="text-[0.7rem] text-muted-foreground">{format(m, "yyyy")}</span>
          </button>
        )
      })}
    </div>
  )
}

const BUDGET_STEPS = [1000, 2000, 3000, 4000, 5000, 6000, 8000, 10000, 12000, 15000, 20000, 25000, 30000, 40000, 50000, 60000, 75000, 100000, 125000, 150000, 200000, 300000, 500000]

export function BudgetField({ value, onChange, perPersonDay }: { value: number; onChange: (v: number) => void; perPersonDay: number }) {
  const ref = useRef<HTMLInputElement>(null)
  const idx = BUDGET_STEPS.reduce((best, s, i) => (Math.abs(s - value) < Math.abs(BUDGET_STEPS[best] - value) ? i : best), 0)
  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex items-end justify-between gap-3">
        <label className="flex items-baseline gap-1">
          <span className="font-display text-3xl font-semibold text-muted-foreground">₹</span>
          <input
            ref={ref}
            inputMode="numeric"
            aria-label="Total budget in rupees"
            value={value ? new Intl.NumberFormat("en-IN").format(value) : ""}
            onChange={(e) => {
              const n = parseInt(e.target.value.replace(/[^0-9]/g, "") || "0", 10)
              onChange(Math.min(n, 10_000_000))
            }}
            className="w-44 bg-transparent font-display text-4xl font-semibold text-ink tabular-nums outline-none"
          />
        </label>
        <span className="pb-1.5 text-right text-sm text-muted-foreground">
          ≈ <strong className="text-ink">{inr(perPersonDay)}</strong> per person / day
        </span>
      </div>
      <Slider
        className="mt-5"
        min={0}
        max={BUDGET_STEPS.length - 1}
        step={1}
        value={[idx]}
        onValueChange={([i]) => onChange(BUDGET_STEPS[i])}
        aria-label="Budget slider"
      />
      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span>{compactInr(BUDGET_STEPS[0])}</span>
        <span>{compactInr(BUDGET_STEPS[BUDGET_STEPS.length - 1])}+</span>
      </div>
    </div>
  )
}
