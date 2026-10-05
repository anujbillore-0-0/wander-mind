"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { motion } from "motion/react"
import { ArrowUpRight } from "lucide-react"

import { api } from "@/lib/api"

const IDEAS = [
  { name: "Indore", tag: "Street-food capital", tint: "from-coral/70" },
  { name: "Udaipur", tag: "Lakes & palaces", tint: "from-teal/70" },
  { name: "Rishikesh", tag: "Rafting & ghats", tint: "from-leaf/70" },
  { name: "Varanasi", tag: "Sunrise on the Ganga", tint: "from-marigold/80" },
  { name: "Gokarna", tag: "Quiet beaches", tint: "from-teal/70" },
  { name: "Darjeeling", tag: "Tea & toy trains", tint: "from-leaf/70" },
]

function IdeaCard({ name, tag, tint, index }: (typeof IDEAS)[number] & { index: number }) {
  const [image, setImage] = useState<string>("")
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    api
      .placePhoto(name)
      .then((p) => alive && setImage(p.image))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [name])

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ delay: index * 0.06 }}
    >
      <Link
        href={`/plan?destination=${encodeURIComponent(name)}`}
        className="group relative block aspect-[4/5] overflow-hidden rounded-2xl bg-sand-deep shadow-[var(--shadow-soft)]"
      >
        {image && !failed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt={name}
            loading="lazy"
            onError={() => setFailed(true)}
            className="absolute inset-0 size-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        ) : (
          <div className="topo absolute inset-0" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
        <div className={`absolute inset-0 bg-gradient-to-t ${tint} to-transparent to-60% opacity-60 mix-blend-multiply`} />
        <div className="absolute inset-x-0 bottom-0 p-4 text-white">
          <p className="text-[0.7rem] font-semibold tracking-[0.16em] uppercase opacity-90 drop-shadow">{tag}</p>
          <p className="font-display text-2xl font-semibold drop-shadow-md">{name}</p>
        </div>
        <span className="absolute top-3 right-3 flex size-8 items-center justify-center rounded-full bg-white/85 text-ink opacity-0 transition group-hover:opacity-100">
          <ArrowUpRight className="size-4" />
        </span>
      </Link>
    </motion.div>
  )
}

export function DestinationIdeas() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-6">
      {IDEAS.map((idea, i) => (
        <IdeaCard key={idea.name} {...idea} index={i} />
      ))}
    </div>
  )
}
