import type { Metadata } from "next"

import { TripsList } from "@/components/trips-list"

export const metadata: Metadata = { title: "My trips" }

export default function TripsPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-10 pb-20 sm:px-6">
      <p className="kicker">Your journeys</p>
      <h1 className="mt-2 text-4xl font-semibold text-ink">My trips</h1>
      <div className="mt-8">
        <TripsList />
      </div>
    </div>
  )
}
