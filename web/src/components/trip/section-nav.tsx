"use client"

import { useEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

export interface NavItem {
  id: string
  label: string
}

const OFFSET = 170 // header + this bar

export function SectionNav({ items }: { items: NavItem[] }) {
  const [active, setActive] = useState(items[0]?.id)
  const bar = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      // The active section is the last one whose heading has scrolled past the sticky bars.
      let current = items[0]?.id
      for (const item of items) {
        const el = document.getElementById(item.id)
        if (el && el.getBoundingClientRect().top <= OFFSET) current = item.id
      }
      setActive(current)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll)
      cancelAnimationFrame(frame)
    }
  }, [items])

  useEffect(() => {
    const el = bar.current?.querySelector<HTMLElement>(`[data-id="${active}"]`)
    if (el && bar.current) bar.current.scrollTo({ left: el.offsetLeft - bar.current.clientWidth / 2 + el.clientWidth / 2, behavior: "smooth" })
  }, [active])

  return (
    <div className="no-print sticky top-16 z-30 border-b border-border/60 bg-background/85 backdrop-blur-md">
      <div ref={bar} className="no-scrollbar mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 py-2 sm:px-6">
        {items.map((i) => (
          <a
            key={i.id}
            data-id={i.id}
            href={`#${i.id}`}
            onClick={(e) => {
              e.preventDefault()
              document.getElementById(i.id)?.scrollIntoView({ behavior: "smooth", block: "start" })
            }}
            className={cn(
              "shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition",
              active === i.id ? "bg-ink text-white" : "text-muted-foreground hover:bg-card hover:text-ink"
            )}
          >
            {i.label}
          </a>
        ))}
      </div>
    </div>
  )
}
