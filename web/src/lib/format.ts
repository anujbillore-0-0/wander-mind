import { format, parseISO } from "date-fns"

const inrFmt = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 })

export function inr(n: number): string {
  return `₹${inrFmt.format(Math.round(n))}`
}

/** "₹60–112", "₹60", or "Free". */
export function inrRange(min: number | null | undefined, max: number | null | undefined, free = "Free"): string {
  const lo = min ?? 0
  const hi = max ?? lo
  if (lo === 0 && hi === 0) return free
  if (lo === hi) return inr(lo)
  return `${inr(lo)}–${inrFmt.format(Math.round(hi))}`
}

export function compactInr(n: number): string {
  if (n >= 100000) return `₹${(n / 100000).toFixed(n % 100000 === 0 ? 0 : 1)}L`
  if (n >= 1000) return `₹${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
  return inr(n)
}

export function duration(mins: number): string {
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

export function dayDate(iso: string | null | undefined, pattern = "EEE d MMM"): string {
  if (!iso) return ""
  try {
    return format(parseISO(iso), pattern)
  } catch {
    return ""
  }
}

export function monthYear(iso: string | null | undefined): string {
  return dayDate(iso, "MMM yyyy")
}

export function dateRangeLabel(start: string | null, end: string | null): string {
  if (!start) return ""
  if (!end || end === start) return dayDate(start, "EEE d MMM yyyy")
  const s = parseISO(start)
  const e = parseISO(end)
  if (s.getMonth() === e.getMonth()) return `${format(s, "d")}–${format(e, "d MMM yyyy")}`
  return `${format(s, "d MMM")} – ${format(e, "d MMM yyyy")}`
}

export function plural(n: number, word: string, many?: string): string {
  return `${n} ${n === 1 ? word : many || `${word}s`}`
}

export function ago(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} h ago`
  const days = Math.round(hrs / 24)
  return days < 30 ? `${days} days ago` : dayDate(iso, "d MMM yyyy")
}
