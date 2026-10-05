"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { CloudOff, RefreshCw, TriangleAlert } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { api, ApiError } from "@/lib/api"
import { SAMPLE_ITINERARY } from "@/lib/sample"
import { saveDraft } from "@/lib/trip-options"
import type { TripDetail } from "@/lib/types"

import { ItineraryView } from "./itinerary-view"
import { PlanningProgress } from "./planning-progress"

const POLL_MS = 1500

export function TripPage({ id }: { id: string }) {
  const router = useRouter()
  const [trip, setTrip] = useState<TripDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0) // bump to fetch again
  const lastError = useRef("")

  useEffect(() => {
    if (id === "sample") return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    api
      .trip(id)
      .then((t) => {
        if (cancelled) return
        setTrip(t)
        setError(null)
        if (t.status === "queued" || t.status === "working") {
          timer = setTimeout(() => setTick((n) => n + 1), POLL_MS)
        } else if (t.error && t.itinerary && t.error !== lastError.current) {
          lastError.current = t.error
          toast.error(t.error)
        }
      })
      .catch((e) => {
        if (cancelled) return
        const missing = e instanceof ApiError && e.status === 404
        setError(missing ? "We couldn't find this trip." : (e as Error).message)
        if (!missing) timer = setTimeout(() => setTick((n) => n + 1), POLL_MS * 3)
      })
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [id, tick])

  if (id === "sample") return <ItineraryView itinerary={SAMPLE_ITINERARY} tripId={null} />

  async function tweak(text: string) {
    try {
      await api.tweak(id, text)
      toast("Reworking your plan…", { description: text })
      setTrip((t) => (t ? { ...t, status: "queued" } : t))
      setTick((n) => n + 1)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function retry() {
    try {
      await api.retry(id)
      setTrip((t) => (t ? { ...t, status: "queued", error: "", events: [] } : t))
      setTick((n) => n + 1)
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  if (error && !trip) {
    return (
      <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center px-4 py-24 text-center">
        <CloudOff className="size-10 text-muted-foreground" />
        <h1 className="mt-4 text-2xl font-semibold text-ink">{error}</h1>
        <Button asChild className="mt-6 rounded-full">
          <Link href="/plan">Plan a new trip</Link>
        </Button>
      </div>
    )
  }

  if (!trip) {
    return (
      <div>
        <Skeleton className="h-[380px] w-full rounded-none" />
        <div className="mx-auto max-w-6xl space-y-4 px-4 pt-10 sm:px-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      </div>
    )
  }

  const busy = trip.status === "queued" || trip.status === "working"
  const latest = trip.events[trip.events.length - 1]

  if (trip.itinerary) {
    return <ItineraryView itinerary={trip.itinerary} tripId={trip.id} busy={busy} latest={latest} onTweak={tweak} />
  }

  if (trip.status === "failed") {
    return (
      <div className="topo flex flex-1 items-center justify-center px-4 py-24">
        <div className="card-soft max-w-md p-8 text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-coral-soft text-coral">
            <TriangleAlert className="size-6" />
          </span>
          <h1 className="mt-4 text-2xl font-semibold text-ink">We hit a bump planning {trip.destination}</h1>
          <p className="mt-2 text-muted-foreground">{trip.error || "Something went wrong."}</p>
          <div className="mt-6 flex justify-center gap-2">
            <Button onClick={retry} className="rounded-full">
              <RefreshCw className="size-4" /> Try again
            </Button>
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => {
                saveDraft(trip.request)
                router.push("/plan")
              }}
            >
              Edit trip
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return <PlanningProgress destination={trip.destination} events={trip.events} />
}
