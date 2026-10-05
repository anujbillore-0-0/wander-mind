import type { LucideIcon } from "lucide-react"
import {
  Accessibility,
  Armchair,
  Baby,
  BedDouble,
  Bike,
  Briefcase,
  Bus,
  Camera,
  Car,
  Compass,
  Flower2,
  Footprints,
  Gem,
  Heart,
  HeartPulse,
  Landmark,
  Leaf,
  Mountain,
  Plane,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Tent,
  TrainFront,
  TreePine,
  User,
  Users,
  UtensilsCrossed,
  Wine,
} from "lucide-react"

import type { TripRequest } from "./types"

export interface Option<T extends string = string> {
  value: T
  label: string
  hint?: string
  icon?: LucideIcon
}

export const GROUP_TYPES: Option<TripRequest["group_type"]>[] = [
  { value: "solo", label: "Solo", hint: "Just me", icon: User },
  { value: "couple", label: "Couple", hint: "Two of us", icon: Heart },
  { value: "friends", label: "Friends", hint: "Squad trip", icon: Users },
  { value: "family", label: "Family", hint: "With kids or parents", icon: Baby },
  { value: "business", label: "Work trip", hint: "Free time around work", icon: Briefcase },
]

export const VIBES: Option[] = [
  { value: "food", label: "Food trail", icon: UtensilsCrossed },
  { value: "culture", label: "Heritage & culture", icon: Landmark },
  { value: "nature", label: "Nature", icon: TreePine },
  { value: "adventure", label: "Adventure", icon: Mountain },
  { value: "spiritual", label: "Spiritual", icon: Flower2 },
  { value: "offbeat", label: "Offbeat & hidden", icon: Compass },
  { value: "photography", label: "Photo spots", icon: Camera },
  { value: "shopping", label: "Shopping", icon: ShoppingBag },
  { value: "nightlife", label: "Nightlife & cafés", icon: Wine },
  { value: "romantic", label: "Romantic", icon: Heart },
  { value: "wellness", label: "Wellness", icon: HeartPulse },
]

export const PACES: Option<TripRequest["pace"]>[] = [
  { value: "relaxed", label: "Relaxed", hint: "2–3 things a day, long lunches" },
  { value: "balanced", label: "Balanced", hint: "4–5 things a day" },
  { value: "packed", label: "Packed", hint: "See everything" },
]

export const FITNESS: Option<TripRequest["fitness"]>[] = [
  { value: "easy", label: "Easy", hint: "Little walking" },
  { value: "moderate", label: "Moderate", hint: "Walks & stairs are fine" },
  { value: "challenging", label: "Up for it", hint: "Treks & long hikes" },
]

export const DAY_STARTS: Option<TripRequest["day_start"]>[] = [
  { value: "early", label: "Early bird", hint: "Out by 7" },
  { value: "normal", label: "Normal", hint: "Out by 9" },
  { value: "late", label: "Slow mornings", hint: "Out by 10:30" },
]

export const DIETS: Option<TripRequest["diet"]>[] = [
  { value: "no_preference", label: "Anything" },
  { value: "veg", label: "Vegetarian" },
  { value: "non_veg", label: "Non-veg lover" },
  { value: "jain", label: "Jain" },
  { value: "eggetarian", label: "Eggetarian" },
  { value: "vegan", label: "Vegan" },
]

export const STAY_TYPES: Option[] = [
  { value: "hostel", label: "Hostel", icon: Users },
  { value: "budget_hotel", label: "Budget hotel", icon: BedDouble },
  { value: "mid_hotel", label: "Mid-range hotel", icon: BedDouble },
  { value: "homestay", label: "Homestay", icon: Leaf },
  { value: "resort", label: "Resort", icon: Armchair },
  { value: "luxury", label: "Luxury", icon: Gem },
  { value: "camping", label: "Camping", icon: Tent },
]

export const LOCAL_TRANSPORT: Option[] = [
  { value: "ride_apps", label: "Ride apps", hint: "Rapido, Uber, Ola", icon: Smartphone },
  { value: "auto", label: "Autos", icon: Car },
  { value: "public", label: "Public transport", icon: Bus },
  { value: "rent_two_wheeler", label: "Rent a scooty", icon: Bike },
  { value: "private_cab", label: "Private cab", icon: Car },
  { value: "walk", label: "Walk a lot", icon: Footprints },
]

export const INTERCITY: Option[] = [
  { value: "train", label: "Train", icon: TrainFront },
  { value: "bus", label: "Bus", icon: Bus },
  { value: "flight", label: "Flight", icon: Plane },
  { value: "self_drive", label: "Self drive", icon: Car },
]

export const TIMES: Option<TripRequest["arrival_time"]>[] = [
  { value: "early_morning", label: "Early morning" },
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
  { value: "night", label: "Night" },
]

export const OCCASIONS: Option[] = [
  { value: "none", label: "Just because" },
  { value: "honeymoon", label: "Honeymoon" },
  { value: "anniversary", label: "Anniversary" },
  { value: "birthday", label: "Birthday" },
  { value: "bachelor", label: "Bachelor(ette)" },
  { value: "reunion", label: "Reunion" },
  { value: "workation", label: "Workation" },
]

export const ACCESSIBILITY: Option[] = [
  { value: "elderly_friendly", label: "Elderly-friendly", icon: Accessibility },
  { value: "wheelchair", label: "Wheelchair access", icon: Accessibility },
  { value: "avoid_long_walks", label: "Avoid long walks", icon: Footprints },
  { value: "avoid_stairs", label: "Avoid stairs", icon: Mountain },
  { value: "infant", label: "Travelling with an infant", icon: Baby },
]

export const BUDGET_LEVELS = [
  { key: "shoestring", label: "Shoestring", perDay: 1200, hint: "Hostels, street food, buses", icon: Sparkles },
  { key: "comfort", label: "Comfort", perDay: 3000, hint: "Budget hotels, cafés, autos & cabs", icon: BedDouble },
  { key: "treat", label: "Treat yourself", perDay: 7000, hint: "Nice hotels, good restaurants", icon: Gem },
] as const

export function defaultRequest(): TripRequest {
  return {
    description: "",
    destinations: [],
    origin: "",
    start_date: null,
    end_date: null,
    flexible_month: "",
    num_days: 3,
    arrival_time: "morning",
    departure_time: "evening",
    group_type: "solo",
    adults: 1,
    children: 0,
    seniors: 0,
    solo_female: false,
    occasion: "none",
    budget_total: 9000,
    budget_includes_intercity: true,
    stay_types: [],
    stay_booked: false,
    stay_address: "",
    rooms: null,
    vibes: [],
    pace: "balanced",
    fitness: "moderate",
    day_start: "normal",
    crowd_tolerance: "ok",
    diet: "no_preference",
    food_notes: "",
    alcohol_ok: false,
    local_transport: [],
    can_ride_two_wheeler: false,
    intercity_modes: [],
    must_include: [],
    avoid: [],
    accessibility: [],
    notes: "",
  }
}

export function tripDays(req: TripRequest): number {
  if (req.start_date && req.end_date) {
    const ms = new Date(req.end_date).getTime() - new Date(req.start_date).getTime()
    return Math.max(1, Math.round(ms / 86400000) + 1)
  }
  return req.num_days || 2
}

export function travelers(req: TripRequest): number {
  return req.adults + req.children + req.seniors
}

const DRAFT_KEY = "wm-draft-v1"
const PROMPT_KEY = "wm-prompt"

export function loadDraft(): TripRequest | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    return raw ? { ...defaultRequest(), ...JSON.parse(raw) } : null
  } catch {
    return null
  }
}

export function saveDraft(req: TripRequest): void {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(req))
  } catch {}
}

export function clearDraft(): void {
  try {
    sessionStorage.removeItem(DRAFT_KEY)
  } catch {}
}

export function stashPrompt(text: string): void {
  try {
    sessionStorage.setItem(PROMPT_KEY, text)
  } catch {}
}

export function peekPrompt(): string {
  try {
    return sessionStorage.getItem(PROMPT_KEY) || ""
  } catch {
    return ""
  }
}

export function clearPrompt(): void {
  try {
    sessionStorage.removeItem(PROMPT_KEY)
  } catch {}
}
