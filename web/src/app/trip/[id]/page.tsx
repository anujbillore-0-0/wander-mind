import type { Metadata } from "next"

import { TripPage } from "@/components/trip/trip-page"

export const metadata: Metadata = { title: "Your trip" }

export default async function Page({ params }: PageProps<"/trip/[id]">) {
  const { id } = await params
  return <TripPage id={id} />
}
