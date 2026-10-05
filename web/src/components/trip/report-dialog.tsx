"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { inputClass } from "@/components/plan/fields"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"

import type { ReportTarget } from "./evidence"

const UNITS = [
  { value: "person", label: "per person" },
  { value: "item", label: "per item" },
  { value: "ride", label: "per ride" },
  { value: "night", label: "per night" },
  { value: "entry", label: "entry ticket" },
  { value: "total", label: "total" },
]

function defaultUnit(kind: string) {
  return kind === "stay" ? "night" : kind === "transport" ? "ride" : kind === "food" ? "item" : "person"
}

export function ReportDialog({ tripId, target, onClose }: { tripId: string; target: ReportTarget | null; onClose: () => void }) {
  return (
    <Dialog open={Boolean(target)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="rounded-3xl sm:max-w-md">
        {target && <ReportForm key={`${target.title}|${target.kind}`} tripId={tripId} target={target} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function ReportForm({ tripId, target, onClose }: { tripId: string; target: ReportTarget; onClose: () => void }) {
  const [item, setItem] = useState(target.title)
  const [price, setPrice] = useState("")
  const [unit, setUnit] = useState(() => defaultUnit(target.kind))
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)

  async function submit() {
    const value = Number(price)
    if (!item.trim() || !price || !Number.isFinite(value) || value < 0) {
      toast.error("Add what you bought and the price you paid.")
      return
    }
    setSaving(true)
    try {
      await api.report(tripId, { item_title: item.trim(), place_name: target.place, kind: target.kind, price_paid: value, unit, note: note.trim() })
      toast.success("Thank you! Your price will help the next traveller.")
      onClose()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">What did you pay?</DialogTitle>
          <DialogDescription>Real prices from real trips keep Wander Mind honest.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-ink">For</span>
            <input value={item} onChange={(e) => setItem(e.target.value)} className={inputClass} placeholder="e.g. egg benjo, dorm bed, auto ride" />
          </label>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold text-ink">Price (₹)</span>
              <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" className={inputClass} placeholder="60" autoFocus />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold text-ink">Unit</span>
              <select value={unit} onChange={(e) => setUnit(e.target.value)} className={cn(inputClass, "w-36")}>
                {UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-ink">Anything to add? (optional)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} placeholder="e.g. prices went up after 9 pm" />
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" className="rounded-full" onClick={onClose}>
            Cancel
          </Button>
          <Button className="rounded-full" onClick={submit} disabled={saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Share price
          </Button>
        </DialogFooter>
    </>
  )
}
