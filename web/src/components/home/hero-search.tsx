"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { motion } from "motion/react"
import { ArrowRight, Sparkles, SlidersHorizontal } from "lucide-react"

import { Button } from "@/components/ui/button"
import { stashPrompt } from "@/lib/trip-options"

const EXAMPLES = [
  "2 days in Indore, street food crawl, solo, under ₹4,000",
  "Rishikesh with friends for 3 days, rafting + cafés, ₹8k each",
  "Udaipur with my parents in December, relaxed pace, ₹40,000",
  "Spiti in June, adventure, coming from Delhi by bus",
  "Varanasi for a long weekend, vegetarian, ghats at sunrise",
]

export function HeroSearch() {
  const router = useRouter()
  const [text, setText] = useState("")
  const [example, setExample] = useState(0)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const id = setInterval(() => setExample((i) => (i + 1) % EXAMPLES.length), 3600)
    return () => clearInterval(id)
  }, [])

  function go(value: string) {
    const v = value.trim()
    if (v.length < 3) {
      ref.current?.focus()
      return
    }
    stashPrompt(v)
    router.push("/plan?from=prompt")
  }

  return (
    <div className="w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          go(text)
        }}
        className="card-soft relative overflow-hidden p-2 transition-shadow focus-within:shadow-[var(--shadow-lift)]"
      >
        <div className="flex items-start gap-3 px-3 pt-3">
          <Sparkles className="mt-1 size-5 shrink-0 text-marigold" />
          <div className="relative w-full">
            <textarea
              ref={ref}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  go(text)
                }
              }}
              rows={2}
              aria-label="Describe your trip"
              className="peer w-full resize-none bg-transparent text-lg leading-relaxed text-ink outline-none placeholder:text-transparent sm:text-xl"
              placeholder="Describe your trip"
            />
            {!text && (
              <motion.span
                key={example}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="pointer-events-none absolute inset-x-0 top-0 text-lg leading-relaxed text-muted-foreground/70 sm:text-xl"
              >
                {EXAMPLES[example]}
              </motion.span>
            )}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-2 pt-2">
          <Button asChild variant="ghost" size="lg" className="rounded-full text-muted-foreground">
            <Link href="/plan">
              <SlidersHorizontal className="size-4" />
              <span className="sm:hidden">Use the form</span>
              <span className="hidden sm:inline">Step-by-step instead</span>
            </Link>
          </Button>
          <Button type="submit" size="lg" className="h-11 rounded-full px-5 text-[0.95rem] shadow-sm">
            Plan my trip
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </form>
      <div className="mt-4 flex flex-wrap gap-2">
        {EXAMPLES.slice(0, 3).map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => {
              setText(ex)
              ref.current?.focus()
            }}
            className="rounded-full border border-border bg-card/70 px-3 py-1.5 text-left text-[0.8rem] text-muted-foreground transition hover:border-teal/40 hover:bg-teal-soft hover:text-teal-deep"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  )
}
