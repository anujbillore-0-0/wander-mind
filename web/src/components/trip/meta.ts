import { createElement } from "react"
import type { LucideIcon, LucideProps } from "lucide-react"
import {
  BedDouble,
  Bike,
  Bus,
  BusFront,
  Car,
  CarTaxiFront,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Coffee,
  Footprints,
  Landmark,
  Mountain,
  Plane,
  Ship,
  ShoppingBag,
  Sparkles,
  Sun,
  TrainFront,
  UtensilsCrossed,
  Wine,
} from "lucide-react"

export const KIND_META: Record<string, { label: string; icon: LucideIcon; color: string; soft: string }> = {
  attraction: { label: "Sight", icon: Landmark, color: "var(--teal)", soft: "var(--teal-soft)" },
  food: { label: "Food", icon: UtensilsCrossed, color: "var(--coral)", soft: "var(--coral-soft)" },
  activity: { label: "Activity", icon: Mountain, color: "var(--leaf)", soft: "var(--leaf-soft)" },
  experience: { label: "Experience", icon: Sparkles, color: "var(--teal-deep)", soft: "var(--teal-soft)" },
  shopping: { label: "Shopping", icon: ShoppingBag, color: "oklch(0.62 0.13 70)", soft: "var(--marigold-soft)" },
  nightlife: { label: "Nightlife", icon: Wine, color: "oklch(0.52 0.12 300)", soft: "oklch(0.96 0.02 300)" },
  rest: { label: "Downtime", icon: Coffee, color: "oklch(0.55 0.02 255)", soft: "var(--muted)" },
  stay: { label: "Stay", icon: BedDouble, color: "var(--ink)", soft: "var(--muted)" },
}

export function kindMeta(kind: string) {
  return KIND_META[kind] || KIND_META.attraction
}

export const MODE_ICONS: Record<string, LucideIcon> = {
  walk: Footprints,
  bike_taxi: Bike,
  auto: CarTaxiFront,
  cab: Car,
  local_taxi: CarTaxiFront,
  shared: BusFront,
  bus: Bus,
  train: TrainFront,
  metro: TrainFront,
  flight: Plane,
  self_drive: Car,
  scooty_rental: Bike,
  boat: Ship,
}

export function ModeIcon({ mode, ...props }: { mode: string } & LucideProps) {
  return createElement(MODE_ICONS[mode] || Car, props)
}

export const WEATHER_ICONS: Record<string, LucideIcon> = {
  sun: Sun,
  "cloud-sun": CloudSun,
  cloud: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning,
}

export function WeatherIcon({ icon, ...props }: { icon: string } & LucideProps) {
  return createElement(WEATHER_ICONS[icon] || Sun, props)
}

export function KindIcon({ kind, ...props }: { kind: string } & LucideProps) {
  return createElement(kindMeta(kind).icon, props)
}
