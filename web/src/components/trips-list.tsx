"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { CalendarDays, Compass, Loader2, MapPin, Plus, Trash, TriangleAlert, Wallet } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/lib/api"
import { ago, dayDate, inr } from "@/lib/format"
import type { TripSummary } from "@/lib/types"

function TripCard({ trip, onDelete }: { trip: TripSummary; onDelete: () => void }) {
  const [imgOk, setImgOk] = useState(true)
  const busy = trip.status === "queued" || trip.status === "working"
  return (
    <div className="group card-soft relative overflow-hidden transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
      <Link href={`/trip/${trip.id}`} className="block">
        <div className="relative h-40 bg-teal-deep">
          {trip.image_url && imgOk ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={trip.image_url} alt={trip.destination} onError={() => setImgOk(false)} className="size-full object-cover" />
          ) : (
            <div className="topo size-full opacity-60" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
          <p className="absolute bottom-3 left-4 flex items-center gap-1.5 text-sm font-semibold text-white">
            <MapPin className="size-4" />
            {trip.destination}
          </p>
          {busy && (
            <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-teal-deep">
              <Loader2 className="size-3 animate-spin" /> Planning…
            </span>
          )}
          {trip.status === "failed" && (
            <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-coral">
              <TriangleAlert className="size-3" /> Needs a retry
            </span>
          )}
        </div>
        <div className="p-4">
          <h2 className="line-clamp-1 text-xl font-semibold text-ink">{trip.title}</h2>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {(trip.start_date || trip.days) && (
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="size-3.5" />
                {trip.start_date ? dayDate(trip.start_date, "d MMM yyyy") : ""}
                {trip.days ? `${trip.start_date ? " · " : ""}${trip.days} days` : ""}
              </span>
            )}
            {trip.budget && (
              <span className="inline-flex items-center gap-1">
                <Wallet className="size-3.5" />
                {inr(trip.budget)}
              </span>
            )}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Created {ago(trip.created_at)}</p>
        </div>
      </Link>
      <button
        type="button"
        aria-label="Delete trip"
        onClick={onDelete}
        className="absolute top-3 right-3 flex size-8 items-center justify-center rounded-full bg-white/90 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:text-coral focus:opacity-100"
      >
        <Trash className="size-4" />
      </button>
    </div>
  )
}

export function TripsList() {
  const [trips, setTrips] = useState<TripSummary[] | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    api
      .trips()
      .then(setTrips)
      .catch((e) => setError(e.message))
  }, [])

  async function remove(id: string) {
    if (!window.confirm("Delete this trip? This can't be undone.")) return
    try {
      await api.deleteTrip(id)
      setTrips((t) => t?.filter((x) => x.id !== id) || null)
      toast.success("Trip deleted")
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  if (error) return <p className="rounded-2xl border border-coral/40 bg-coral-soft p-5 text-ink">{error}</p>
  if (!trips)
    return (
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-64 rounded-2xl" />
        ))}
      </div>
    )
  if (!trips.length)
    return (
      <div className="card-soft topo flex flex-col items-center px-6 py-16 text-center">
        <Compass className="size-10 text-teal" />
        <h2 className="mt-4 text-2xl font-semibold text-ink">No trips yet</h2>
        <p className="mt-2 max-w-sm text-muted-foreground">Your planned trips will live here, ready to open on the road.</p>
        <div className="mt-6 flex gap-2">
          <Button asChild className="rounded-full">
            <Link href="/plan">
              <Plus className="size-4" /> Plan a trip
            </Link>
          </Button>
          <Button asChild variant="outline" className="rounded-full">
            <Link href="/trip/sample">See a sample</Link>
          </Button>
        </div>
      </div>
    )
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {trips.map((t) => (
        <TripCard key={t.id} trip={t} onDelete={() => remove(t.id)} />
      ))}
    </div>
  )
}
