"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { ArrowUp, Loader2, WandSparkles } from "lucide-react"

import { cn } from "@/lib/utils"

const SUGGESTIONS = ["Make it cheaper", "More street food", "Slower mornings", "Add a sunset spot", "Swap day 2 for a day trip"]

export function TweakBar({ busy, status, onTweak }: { busy: boolean; status?: string; onTweak: (text: string) => Promise<void> }) {
  const [text, setText] = useState("")
  const [focused, setFocused] = useState(false)

  async function submit(value: string) {
    const v = value.trim()
    if (v.length < 3 || busy) return
    await onTweak(v)
    setText("")
  }

  return (
    <div className="no-print pointer-events-none fixed inset-x-0 bottom-4 z-40 px-4">
      <div className="pointer-events-auto mx-auto max-w-2xl">
        <AnimatePresence>
          {focused && !busy && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="mb-2 flex flex-wrap justify-center gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => submit(s)}
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-ink shadow-sm hover:border-teal/40 hover:bg-teal-soft"
                >
                  {s}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit(text)
          }}
          className={cn(
            "flex items-center gap-2 rounded-full border border-border bg-card/95 py-1.5 pr-1.5 pl-4 shadow-[var(--shadow-lift)] backdrop-blur transition",
            focused && "border-teal/50"
          )}
        >
          {busy ? <Loader2 className="size-5 shrink-0 animate-spin text-teal" /> : <WandSparkles className="size-5 shrink-0 text-marigold" />}
          <input
            value={busy ? "" : text}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            disabled={busy}
            placeholder={busy ? status || "Reworking your plan…" : "Change anything: “cheaper stays”, “more cafés on day 2”…"}
            aria-label="Tweak this plan"
            className="h-10 min-w-0 flex-1 bg-transparent text-[0.95rem] text-ink outline-none placeholder:text-muted-foreground/80 disabled:placeholder:text-teal-deep"
          />
          <button
            type="submit"
            disabled={busy || text.trim().length < 3}
            aria-label="Apply change"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-teal text-white transition hover:bg-teal-deep disabled:opacity-40"
          >
            <ArrowUp className="size-4.5" />
          </button>
        </form>
      </div>
    </div>
  )
}
