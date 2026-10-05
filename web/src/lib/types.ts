// Mirrors backend/app/schemas.py - keep in sync.

export type TimeOfDay = "early_morning" | "morning" | "afternoon" | "evening" | "night" | "unknown"
export type GroupType = "solo" | "couple" | "friends" | "family" | "business"
export type Pace = "relaxed" | "balanced" | "packed"
export type Fitness = "easy" | "moderate" | "challenging"
export type Diet = "no_preference" | "veg" | "non_veg" | "jain" | "vegan" | "eggetarian"
export type EvidenceStatus = "verified" | "reported" | "estimate"

export interface TripRequest {
  description: string
  destinations: string[]
  origin: string
  start_date: string | null
  end_date: string | null
  flexible_month: string
  num_days: number | null
  arrival_time: TimeOfDay
  departure_time: TimeOfDay
  group_type: GroupType
  adults: number
  children: number
  seniors: number
  solo_female: boolean
  occasion: string
  budget_total: number
  budget_includes_intercity: boolean
  stay_types: string[]
  stay_booked: boolean
  stay_address: string
  rooms: number | null
  vibes: string[]
  pace: Pace
  fitness: Fitness
  day_start: "early" | "normal" | "late"
  crowd_tolerance: "avoid" | "ok"
  diet: Diet
  food_notes: string
  alcohol_ok: boolean
  local_transport: string[]
  can_ride_two_wheeler: boolean
  intercity_modes: string[]
  must_include: string[]
  avoid: string[]
  accessibility: string[]
  notes: string
}

export interface Quote {
  text: string
  quote: string
  source_id: number
  url: string
}

export interface Evidence {
  status: EvidenceStatus
  source_count: number
  latest: string | null
  source_ids: number[]
  quotes: Quote[]
}

export interface Place {
  name: string
  area: string
  lat: number | null
  lon: number | null
  maps_url: string
}

export interface Money {
  min: number
  max: number
  per: string
  note: string
}

export interface TransportOption {
  mode: string
  label: string
  cost_min: number
  cost_max: number
  duration_min: number
  note: string
}

export interface Leg {
  mode: string
  label: string
  distance_km: number
  duration_min: number
  cost_min: number
  cost_max: number
  note: string
  approximate: boolean
  options: TransportOption[]
}

export interface Alternative {
  title: string
  note: string
  cost_min: number | null
  cost_max: number | null
  evidence: Evidence
}

export interface PlanItem {
  id: string
  time: string
  end_time: string
  slot: string
  kind: string
  title: string
  description: string
  place: Place
  duration_min: number
  cost: Money
  tips: string[]
  booking_required: boolean
  image_url: string
  evidence: Evidence
  alternatives: Alternative[]
  leg_to_next: Leg | null
}

export interface DayWeather {
  date: string | null
  t_min: number | null
  t_max: number | null
  precip_mm: number | null
  precip_prob: number | null
  label: string
  icon: string
}

export interface DayPlan {
  day: number
  date: string | null
  title: string
  summary: string
  destination: string
  weather: DayWeather | null
  start_leg: Leg | null
  end_leg: Leg | null
  items: PlanItem[]
  cost_min: number
  cost_max: number
  distance_km: number
}

export interface Itinerary {
  title: string
  summary: string
  highlights: string[]
  destination: DestinationInfo
  other_destinations: DestinationInfo[]
  start_date: string | null
  end_date: string | null
  days_count: number
  nights: number
  travelers: number
  travelers_label: string
  style_tags: string[]
  season: {
    label: string
    crowd_level: "low" | "moderate" | "high" | string
    summary: string
    notes: string[]
    events: { name: string; when: string; note: string }[]
    weather_kind: "forecast" | "typical" | string
  }
  weather: DayWeather[]
  budget: {
    currency: string
    user_budget: number
    total_min: number
    total_max: number
    per_person_min: number
    per_person_max: number
    status: "under" | "near" | "over"
    categories: { key: string; label: string; min: number; max: number; note: string }[]
    saving_tips: string[]
    upgrade_tips: string[]
  }
  getting_there: {
    origin: string
    distance_km: number | null
    arrival_hub: string
    options: {
      mode: string
      title: string
      duration_text: string
      cost_min: number
      cost_max: number
      per: string
      details: string
      booking_tip: string
      recommended: boolean
    }[]
    notes: string[]
  }
  stay: {
    booked: boolean
    booked_address: string
    nights: number
    rooms: number
    areas: { name: string; why: string; best_for: string }[]
    options: {
      id: string
      name: string
      type: string
      area: string
      price_min: number
      price_max: number
      per: string
      why: string
      best_for: string
      recommended: boolean
      place: Place | null
      evidence: Evidence
    }[]
    tips: string[]
  }
  days: DayPlan[]
  food: {
    must_try: { dish: string; where: string; price_text: string; note: string; veg: boolean | null }[]
    places: {
      name: string
      area: string
      known_for: string
      price_min: number | null
      price_max: number | null
      per: string
      best_time: string
      in_plan: boolean
      place: Place | null
      evidence: Evidence
    }[]
    tips: string[]
  }
  transport: {
    summary: string
    apps: { name: string; status: "confirmed" | "likely" | "limited" | "unlikely"; note: string }[]
    modes: { mode: string; label: string; typical_fare: string; best_for: string; note: string }[]
    fare_examples: { distance_km: number; label: string; cost_min: number; cost_max: number }[]
    rental: string
    tips: string[]
  }
  essentials: {
    packing: string[]
    documents: string[]
    money: string[]
    connectivity: string[]
    etiquette: string[]
    safety: string[]
    scams: string[]
    health: string[]
    accessibility: string[]
    emergency: { label: string; number: string }[]
  }
  book_ahead: { item: string; when: string; why: string }[]
  rainy_day: { title: string; note: string }[]
  hidden_gems: { title: string; note: string }[]
  sources: Source[]
  data_gaps: string[]
  research: {
    videos: number
    comment_threads: number
    reddit_threads: number
    web_pages: number
    user_reports: number
    claims: number
    newest_source: string | null
  }
  generated_at: string
  version: number
}

export interface DestinationInfo {
  name: string
  region: string
  country: string
  lat: number
  lon: number
  description: string
  image_url: string
  wiki_url: string
}

export interface Source {
  id: number
  kind: "youtube" | "youtube_comments" | "reddit" | "web" | "user" | string
  title: string
  url: string
  author: string
  published_at: string | null
}

export interface TripEvent {
  stage: string
  message: string
  pct: number
  at: string
}

export type TripStatus = "queued" | "working" | "ready" | "failed"

export interface TripSummary {
  id: string
  title: string
  status: TripStatus
  destination: string
  image_url: string
  start_date: string | null
  days: number | null
  budget: number | null
  travelers_label: string
  created_at: string
}

export interface TripDetail extends TripSummary {
  error: string
  request: TripRequest
  itinerary: Itinerary | null
  version: number
  events: TripEvent[]
}

export interface PlaceSuggestion {
  name: string
  region: string
  country: string
  country_code: string
  lat: number
  lon: number
  population: number | null
}
