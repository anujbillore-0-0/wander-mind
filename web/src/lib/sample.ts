import type { Evidence, Itinerary, Leg, PlanItem } from "./types"

/**
 * A hand-made sample plan so the UI can be explored without API keys.
 * Illustrative only: the page shows a banner saying so, and "sources" link to YouTube searches.
 */

const ev = (status: Evidence["status"], count: number, latest: string | null, ids: number[] = [], quote = ""): Evidence => ({
  status,
  source_count: count,
  latest,
  source_ids: ids,
  quotes: quote ? [{ text: quote, quote: "", source_id: ids[0] ?? 1, url: "https://www.youtube.com/results?search_query=indore+street+food+prices" }] : [],
})

const maps = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q + ", Indore")}`

function leg(mode: string, label: string, km: number, mins: number, lo: number, hi: number, note = ""): Leg {
  const options =
    mode === "walk"
      ? [{ mode, label, cost_min: 0, cost_max: 0, duration_min: mins, note: "Short walk." }]
      : [
          { mode, label, cost_min: lo, cost_max: hi, duration_min: mins, note },
          { mode: "auto", label: "Auto-rickshaw", cost_min: Math.round(lo * 1.6), cost_max: Math.round(hi * 1.7), duration_min: mins + 2, note: "Book on an app or agree the fare first." },
          { mode: "cab", label: "Cab (Uber / Ola / Rapido)", cost_min: Math.round(lo * 2.6), cost_max: Math.round(hi * 2.8), duration_min: mins, note: "Prices rise at peak hours." },
        ]
  return { mode, label, distance_km: km, duration_min: mins, cost_min: lo, cost_max: hi, note, approximate: false, options }
}

const bike = (km: number, mins: number, lo: number, hi: number) => leg("bike_taxi", "Bike taxi (Rapido / Uber Moto)", km, mins, lo, hi, "Book on Rapido, Uber Moto or Ola Bike. One rider per bike.")
const walk = (km: number, mins: number) => leg("walk", "Walk", km, mins, 0, 0)

function item(p: Partial<PlanItem> & Pick<PlanItem, "id" | "time" | "title" | "kind">): PlanItem {
  return {
    end_time: "",
    slot: "morning",
    description: "",
    place: { name: p.title, area: "", lat: null, lon: null, maps_url: maps(p.title) },
    duration_min: 60,
    cost: { min: 0, max: 0, per: "person", note: "estimate" },
    tips: [],
    booking_required: false,
    image_url: "",
    evidence: ev("estimate", 0, null),
    alternatives: [],
    leg_to_next: null,
    ...p,
  }
}

export const SAMPLE_ITINERARY: Itinerary = {
  title: "Poha mornings & Sarafa nights",
  summary:
    "Two unhurried days in India's cleanest city: Holkar palaces and glass temples by day, then Indore's legendary food streets by night. Every stop is clustered so you spend more time eating than travelling.",
  highlights: ["Midnight garadu at Sarafa Bazaar", "Mirror-work Kanch Mandir", "Egg benjo at 56 Dukan", "Patalpani waterfall at sunrise", "Poha-jalebi breakfast"],
  destination: {
    name: "Indore",
    region: "Madhya Pradesh",
    country: "India",
    lat: 22.7179,
    lon: 75.8333,
    description: "Indore is the largest city in Madhya Pradesh, famous for its street food and Holkar-era architecture.",
    image_url: "https://upload.wikimedia.org/wikipedia/commons/e/e1/Indore_Rajwada01.jpg",
    wiki_url: "https://en.wikipedia.org/wiki/Indore",
  },
  other_destinations: [],
  start_date: "2026-11-14",
  end_date: "2026-11-15",
  days_count: 2,
  nights: 1,
  travelers: 1,
  travelers_label: "Solo traveller",
  style_tags: ["food", "culture", "balanced pace"],
  season: {
    label: "Early winter, pleasant",
    crowd_level: "moderate",
    summary: "Cool mornings, warm afternoons and dry skies. Peak season for food walks.",
    notes: ["Sarafa is busiest after 10 pm on weekends.", "Carry a light layer for late nights."],
    events: [{ name: "Post-Diwali wedding season", when: "Nov–Dec", note: "Some banquet areas get traffic jams in the evening." }],
    weather_kind: "typical",
  },
  weather: [
    { date: "2026-11-14", t_min: 14, t_max: 29, precip_mm: 0, precip_prob: null, label: "Clear sky", icon: "sun" },
    { date: "2026-11-15", t_min: 15, t_max: 30, precip_mm: 0, precip_prob: null, label: "Mostly clear", icon: "sun" },
  ],
  budget: {
    currency: "INR",
    user_budget: 6000,
    total_min: 3180,
    total_max: 4720,
    per_person_min: 3180,
    per_person_max: 4720,
    status: "under",
    categories: [
      { key: "stay", label: "Stay", min: 549, max: 799, note: "1 night × 1 bed at Zostel-style hostel, Vijay Nagar" },
      { key: "food", label: "Food", min: 760, max: 1240, note: "Every meal is in the plan" },
      { key: "activities", label: "Sightseeing & activities", min: 70, max: 160, note: "Entry tickets, activities, shopping stops" },
      { key: "local_transport", label: "Getting around", min: 520, max: 820, note: "All rides between stops, from and back to your stay" },
      { key: "intercity", label: "Getting there & back", min: 1080, max: 1340, note: "Round trip by bus from Bhopal" },
      { key: "buffer", label: "Buffer", min: 200, max: 360, note: "Water, tips, small surprises" },
    ],
    saving_tips: ["Use bike taxis for solo hops; they're about half the price of autos.", "Skip bottled water: most eateries in 56 Dukan serve RO water."],
    upgrade_tips: [],
  },
  getting_there: {
    origin: "Bhopal",
    distance_km: 236,
    arrival_hub: "Indore Junction (INDB) or Sarwate bus stand",
    options: [
      { mode: "bus", title: "Bus (ordinary to AC sleeper)", duration_text: "≈ 5 h", cost_min: 270, cost_max: 540, per: "person, one way", details: "Frequent AC buses from Bhopal ISBT every 30 min.", booking_tip: "Morning departures fill up on Fridays.", recommended: true },
      { mode: "train", title: "Train (Sleeper to 3AC)", duration_text: "≈ 5 h", cost_min: 150, cost_max: 450, per: "person, one way", details: "Intercity Express is the most convenient daytime train.", booking_tip: "Book 1–2 weeks ahead for weekends.", recommended: false },
      { mode: "cab", title: "Outstation cab", duration_text: "≈ 5 h", cost_min: 2600, cost_max: 3540, per: "1 vehicle, one way", details: "", booking_tip: "", recommended: false },
    ],
    notes: ["The Bhopal–Indore highway is smooth. Buses are often faster than trains door to door."],
  },
  stay: {
    booked: false,
    booked_address: "",
    nights: 1,
    rooms: 1,
    areas: [
      { name: "Vijay Nagar", why: "Safe, lively, full of cafés, 15 min from the old city by bike taxi.", best_for: "Solo travellers, nightlife" },
      { name: "Rajwada / old city", why: "Walk to Sarafa and the palaces, but noisy and congested.", best_for: "Food-first trips" },
    ],
    options: [
      { id: "s1", name: "Backpacker hostel, Vijay Nagar", type: "Hostel", area: "Vijay Nagar", price_min: 549, price_max: 799, per: "bed / night", why: "Social common room, lockers, clean dorms.", best_for: "Solo", recommended: true, place: null, evidence: ev("verified", 3, "2026-08-02", [3], "Dorm beds around ₹550–800 a night.") },
      { id: "s2", name: "Budget hotel near Rajwada", type: "Budget hotel", area: "Rajwada", price_min: 1200, price_max: 1800, per: "room / night", why: "Walk to Sarafa at midnight.", best_for: "Couples", recommended: false, place: null, evidence: ev("reported", 1, "2026-06-11", [4]) },
    ],
    tips: [],
  },
  days: [
    {
      day: 1,
      date: "2026-11-14",
      title: "Palaces by day, Sarafa by night",
      summary: "Old-city heritage on foot, then the city's two famous food streets.",
      destination: "Indore",
      weather: { date: "2026-11-14", t_min: 14, t_max: 29, precip_mm: 0, precip_prob: null, label: "Clear sky", icon: "sun" },
      start_leg: bike(4.8, 17, 40, 60),
      end_leg: bike(7.2, 24, 55, 85),
      cost_min: 980,
      cost_max: 1540,
      distance_km: 21.4,
      items: [
        item({ id: "d1-1", time: "08:30", end_time: "09:10", slot: "morning", kind: "food", title: "Poha-jalebi breakfast", description: "Start the way Indore does: steaming poha with sev and hot jalebi.", place: { name: "Poha stall near Rajwada", area: "Rajwada", lat: 22.7176, lon: 75.8551, maps_url: maps("Poha Rajwada") }, duration_min: 40, cost: { min: 30, max: 60, per: "person", note: "from recent traveller reports" }, evidence: ev("verified", 5, "2026-09-03", [1, 2], "Poha jalebi combo for around ₹40."), leg_to_next: walk(0.3, 4) }),
        item({ id: "d1-2", time: "09:30", end_time: "10:45", slot: "morning", kind: "attraction", title: "Rajwada Palace", description: "Seven-storey Holkar palace at the heart of the old city.", image_url: "https://upload.wikimedia.org/wikipedia/commons/e/e1/Indore_Rajwada01.jpg", place: { name: "Rajwada Palace", area: "Rajwada", lat: 22.7186, lon: 75.8547, maps_url: maps("Rajwada Palace") }, duration_min: 75, cost: { min: 10, max: 25, per: "person", note: "from recent traveller reports" }, tips: ["Closed on Mondays.", "The light-and-sound show starts after sunset."], evidence: ev("verified", 4, "2026-08-20", [1]), leg_to_next: walk(0.4, 6), alternatives: [{ title: "Krishnapura Chhatris", note: "Quiet riverside cenotaphs, 5 min walk", cost_min: 0, cost_max: 0, evidence: ev("reported", 1, "2026-05-02") }] }),
        item({ id: "d1-3", time: "11:00", end_time: "11:40", slot: "morning", kind: "attraction", title: "Kanch Mandir", description: "A Jain temple covered floor to ceiling in mirror mosaic.", place: { name: "Kanch Mandir", area: "Itwaria Bazaar", lat: 22.7196, lon: 75.8569, maps_url: maps("Kanch Mandir") }, duration_min: 40, tips: ["Leather items aren't allowed inside."], evidence: ev("reported", 1, "2026-07-14", [2]), leg_to_next: bike(2.6, 12, 25, 40) }),
        item({ id: "d1-4", time: "12:15", end_time: "13:45", slot: "afternoon", kind: "attraction", title: "Lal Bagh Palace", description: "Grand Holkar residence with European interiors and gardens.", place: { name: "Lal Bagh Palace", area: "Lal Bagh", lat: 22.7046, lon: 75.8466, maps_url: maps("Lal Bagh Palace") }, duration_min: 90, cost: { min: 10, max: 50, per: "person", note: "estimate" }, booking_required: false, leg_to_next: bike(3.1, 13, 30, 45) }),
        item({ id: "d1-5", time: "14:00", end_time: "14:50", slot: "afternoon", kind: "food", title: "Dal bafla thali", description: "Malwa's answer to dal-baati, best eaten slowly.", place: { name: "Dal bafla thali", area: "Sapna Sangeeta", lat: 22.7025, lon: 75.8722, maps_url: maps("dal bafla") }, duration_min: 50, cost: { min: 150, max: 250, per: "person", note: "estimate" }, leg_to_next: bike(4.5, 16, 35, 55) }),
        item({ id: "d1-6", time: "18:30", end_time: "19:30", slot: "evening", kind: "food", title: "56 Dukan food street", description: "Sixty-odd shops in a row. Start with egg benjo, end with a shake.", place: { name: "56 Dukan", area: "New Palasia", lat: 22.7244, lon: 75.8839, maps_url: maps("56 Dukan") }, duration_min: 60, cost: { min: 120, max: 250, per: "person", note: "from recent traveller reports" }, tips: ["Go before 8 pm on weekends to beat the crowd."], evidence: ev("verified", 6, "2026-09-12", [1, 2, 5], "Egg benjo for ₹60–70, totally worth it."), leg_to_next: bike(3.9, 15, 35, 55), alternatives: [{ title: "Johny Hot Dog", note: "The famous egg benjo stall inside 56 Dukan", cost_min: 60, cost_max: 80, evidence: ev("verified", 4, "2026-09-12") }] }),
        item({ id: "d1-7", time: "21:30", end_time: "23:00", slot: "night", kind: "food", title: "Sarafa Bazaar night market", description: "A jewellery market by day that turns into a food street after 9 pm.", place: { name: "Sarafa Bazaar", area: "Rajwada", lat: 22.719, lon: 75.854, maps_url: maps("Sarafa Bazaar") }, duration_min: 90, cost: { min: 150, max: 300, per: "person", note: "from recent traveller reports" }, tips: ["Try garadu (winter only), bhutte ka kees and malpua."], evidence: ev("verified", 7, "2026-09-20", [1, 2, 5], "Garadu plate costs ₹50–80 in winter.") }),
      ],
    },
    {
      day: 2,
      date: "2026-11-15",
      title: "Waterfall sunrise & Khajrana",
      summary: "An early ride out to Patalpani, then a temple and a lazy lunch before you head home.",
      destination: "Indore",
      weather: { date: "2026-11-15", t_min: 15, t_max: 30, precip_mm: 0, precip_prob: null, label: "Mostly clear", icon: "sun" },
      start_leg: leg("cab", "Cab (Uber / Ola / Rapido)", 38.5, 62, 590, 870, "Book on Uber, Ola or Rapido Cab. Prices rise at peak hours."),
      end_leg: bike(3.5, 13, 35, 50),
      cost_min: 1200,
      cost_max: 1760,
      distance_km: 82.4,
      items: [
        item({ id: "d2-1", time: "07:00", end_time: "08:30", slot: "morning", kind: "attraction", title: "Patalpani Waterfall", description: "A 90 m drop into a forested gorge, at its best soon after the monsoon.", place: { name: "Patalpani Waterfall", area: "Mhow", lat: 22.5045, lon: 75.782, maps_url: maps("Patalpani Waterfall") }, duration_min: 90, tips: ["Don't go down to the water. The rocks are slippery."], evidence: ev("reported", 1, "2026-08-28", [5]), leg_to_next: leg("cab", "Cab (Uber / Ola / Rapido)", 37.2, 60, 570, 840) }),
        item({ id: "d2-2", time: "10:00", end_time: "10:45", slot: "morning", kind: "attraction", title: "Khajrana Ganesh Temple", description: "Indore's most loved temple, with laddoo prasad at the gate.", place: { name: "Khajrana Ganesh Temple", area: "Khajrana", lat: 22.7303, lon: 75.9067, maps_url: maps("Khajrana Ganesh Temple") }, duration_min: 45, tips: ["Wednesday mornings are very busy."], evidence: ev("verified", 3, "2026-07-30", [2]), leg_to_next: bike(4.1, 15, 35, 55) }),
        item({ id: "d2-3", time: "11:15", end_time: "12:15", slot: "afternoon", kind: "shopping", title: "Sarafa & Kapda market stroll", description: "Pick up namkeen and Maheshwari sarees to take home.", place: { name: "Kapda Market", area: "Rajwada", lat: 22.7181, lon: 75.8565, maps_url: maps("Kapda Market") }, duration_min: 60, cost: { min: 0, max: 0, per: "person", note: "estimate" }, leg_to_next: walk(0.6, 8) }),
        item({ id: "d2-4", time: "12:30", end_time: "13:30", slot: "afternoon", kind: "food", title: "Shikanji & kachori lunch", description: "Thick saffron shikanji with khasta kachori.", place: { name: "Kachori lunch", area: "Rajwada", lat: 22.7172, lon: 75.8575, maps_url: maps("kachori Rajwada") }, duration_min: 60, cost: { min: 80, max: 160, per: "person", note: "from recent traveller reports" }, evidence: ev("reported", 1, "2026-06-30", [4]) }),
      ],
    },
  ],
  food: {
    must_try: [
      { dish: "Poha-jalebi", where: "Any corner stall, 7–10 am", price_text: "₹30–50", note: "The city's official breakfast.", veg: true },
      { dish: "Egg benjo", where: "Johny Hot Dog, 56 Dukan", price_text: "₹60–80", note: "Not a hot dog. A spicy egg bun.", veg: false },
      { dish: "Garadu", where: "Sarafa Bazaar (winter)", price_text: "₹50–80", note: "Fried yam with masala.", veg: true },
      { dish: "Bhutte ka kees", where: "Sarafa, 56 Dukan", price_text: "₹50–90", note: "Grated corn cooked in milk and spices.", veg: true },
      { dish: "Dal bafla", where: "Thali restaurants", price_text: "₹150–250", note: "Malwa's dal-baati, soaked in ghee.", veg: true },
    ],
    places: [
      { name: "Sarafa Bazaar", area: "Rajwada", known_for: "garadu, malpua, kulfi", price_min: 150, price_max: 300, per: "person", best_time: "", in_plan: true, place: null, evidence: ev("verified", 7, "2026-09-20", [1, 2, 5]) },
      { name: "56 Dukan", area: "New Palasia", known_for: "egg benjo, shakes, chaat", price_min: 120, price_max: 250, per: "person", best_time: "", in_plan: true, place: null, evidence: ev("verified", 6, "2026-09-12", [1, 2]) },
      { name: "Johny Hot Dog", area: "56 Dukan", known_for: "egg benjo", price_min: 60, price_max: 80, per: "item", best_time: "", in_plan: false, place: null, evidence: ev("verified", 4, "2026-09-12", [1]) },
    ],
    tips: ["Most stalls take UPI, but keep some small change for Sarafa at midnight."],
  },
  transport: {
    summary: "Ride apps work well across Indore. Bike taxis are the cheapest way to hop between areas when you're travelling solo.",
    apps: [
      { name: "Rapido", status: "confirmed", note: "Bike taxis and autos everywhere, quick pickups." },
      { name: "Uber", status: "confirmed", note: "Cabs and Uber Moto available." },
      { name: "Ola", status: "likely", note: "Works, fewer drivers late at night." },
    ],
    modes: [
      { mode: "bike_taxi", label: "Bike taxi", typical_fare: "₹30–60 for 3–5 km", best_for: "Solo hops", note: "" },
      { mode: "auto", label: "Auto-rickshaw", typical_fare: "₹60–110 for 5 km", best_for: "2–3 people", note: "Use the app price as your bargaining anchor." },
      { mode: "bus", label: "AiCTSL city bus / BRTS", typical_fare: "₹10–30", best_for: "Vijay Nagar ↔ city centre", note: "" },
    ],
    fare_examples: [
      { distance_km: 3, label: "Bike taxi (Rapido / Uber Moto)", cost_min: 30, cost_max: 45 },
      { distance_km: 3, label: "Auto-rickshaw", cost_min: 60, cost_max: 90 },
      { distance_km: 3, label: "Cab (Uber / Ola / Rapido)", cost_min: 95, cost_max: 140 },
      { distance_km: 7, label: "Bike taxi (Rapido / Uber Moto)", cost_min: 55, cost_max: 85 },
      { distance_km: 7, label: "Auto-rickshaw", cost_min: 100, cost_max: 160 },
      { distance_km: 7, label: "Cab (Uber / Ola / Rapido)", cost_min: 145, cost_max: 225 },
    ],
    rental: "Scooty rentals around ₹400–600/day near the railway station (licence required).",
    tips: ["Autos at the railway station overcharge tourists. Walk 200 m out and book on an app."],
  },
  essentials: {
    packing: ["Light jacket for late nights", "Comfortable walking sandals", "Hand sanitiser for street food", "Power bank"],
    documents: ["Government ID for hostel check-in"],
    money: ["UPI works almost everywhere", "Keep ₹500 in small notes for night markets"],
    connectivity: ["Jio and Airtel 4G/5G work across the city"],
    etiquette: ["Remove shoes at temples", "Cover shoulders at Kanch Mandir"],
    safety: ["Sarafa is safe and crowded late at night. Keep your phone in a front pocket."],
    scams: ["Autos near the railway station quote 2–3× the app fare."],
    health: ["Stick to busy stalls with high turnover."],
    accessibility: [],
    emergency: [
      { label: "All emergencies (police, fire, ambulance)", number: "112" },
      { label: "Ambulance", number: "108" },
    ],
  },
  book_ahead: [{ item: "Bus or train from Bhopal", when: "1 week ahead", why: "Weekend departures fill up." }],
  rainy_day: [{ title: "Central Museum", note: "Parmar-era sculptures, indoors, near GPO." }],
  hidden_gems: [{ title: "Krishnapura Chhatris", note: "Riverside cenotaphs, quiet at golden hour." }],
  sources: [
    { id: 1, kind: "youtube", title: "Example: Sarafa Bazaar night food tour (search on YouTube)", url: "https://www.youtube.com/results?search_query=sarafa+bazaar+indore+food+tour", author: "Search results", published_at: null },
    { id: 2, kind: "youtube", title: "Example: 56 Dukan food walk (search on YouTube)", url: "https://www.youtube.com/results?search_query=56+dukan+indore+food", author: "Search results", published_at: null },
    { id: 3, kind: "web", title: "Example: hostels in Indore (web search)", url: "https://duckduckgo.com/?q=hostel+indore+vijay+nagar", author: "Search results", published_at: null },
    { id: 4, kind: "web", title: "Example: budget hotels near Rajwada (web search)", url: "https://duckduckgo.com/?q=budget+hotel+rajwada+indore", author: "Search results", published_at: null },
    { id: 5, kind: "youtube", title: "Example: Patalpani waterfall vlog (search on YouTube)", url: "https://www.youtube.com/results?search_query=patalpani+waterfall+indore", author: "Search results", published_at: null },
  ],
  data_gaps: ["This is a sample plan with illustrative prices. Create your own to get live research."],
  research: { videos: 14, comment_threads: 6, reddit_threads: 3, web_pages: 9, user_reports: 0, claims: 212, newest_source: "2026-09-20" },
  generated_at: "2026-10-04T10:00:00Z",
  version: 1,
}
