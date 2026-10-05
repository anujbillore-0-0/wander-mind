import type { Metadata } from "next"
import { Suspense } from "react"

import { PlanWizard } from "@/components/plan/wizard"

export const metadata: Metadata = { title: "Plan a trip" }

export default function PlanPage() {
  return (
    <div className="topo flex-1">
      <Suspense fallback={<div className="mx-auto h-96 max-w-6xl" />}>
        <PlanWizard />
      </Suspense>
    </div>
  )
}
