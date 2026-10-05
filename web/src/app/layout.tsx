import type { Metadata, Viewport } from "next"
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google"

import { SiteFooter, SiteHeader } from "@/components/site-chrome"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"

import "./globals.css"

const display = Fraunces({
  subsets: ["latin"],
  axes: ["SOFT", "opsz"],
  variable: "--font-display",
  display: "swap",
})

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
})

export const metadata: Metadata = {
  title: { default: "Wander Mind: evidence-based trip planner", template: "%s · Wander Mind" },
  description:
    "Itineraries built from what travellers saw last month: recent vlogs, comments and blogs, with real local prices for food, rides and stays.",
}

export const viewport: Viewport = {
  themeColor: "#FBF8F3",
  colorScheme: "light",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} h-full`} data-scroll-behavior="smooth">
      <body className="flex min-h-full flex-col">
        <TooltipProvider delayDuration={200}>
          <SiteHeader />
          <main className="flex flex-1 flex-col">{children}</main>
          <SiteFooter />
          <Toaster theme="light" position="top-center" richColors />
        </TooltipProvider>
      </body>
    </html>
  )
}
