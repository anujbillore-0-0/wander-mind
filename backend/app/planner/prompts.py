"""Prompt text for the planner. Kept compact: some free tiers cap context at ~8K tokens."""

from ..db import Destination
from ..schemas import TripRequest
from ..services.weather import MONTHS

DAY_START = {"early": "early (≈7:00)", "normal": "normal (≈9:00)", "late": "late (≈10:30)"}


def trip_brief(req: TripRequest, dests: list[Destination], weather_summary: str) -> str:
    days = req.resolved_days()
    start, end = req.resolved_start(), req.resolved_end()
    if start and end:
        when = f"{days} days, {start:%a %d %b %Y} to {end:%a %d %b %Y}"
    else:
        when = f"{days} days in {MONTHS[req.travel_month() - 1]} (dates not fixed)"
    people = [f"{req.adults} adult{'s' if req.adults > 1 else ''}"]
    if req.children:
        people.append(f"{req.children} child{'ren' if req.children > 1 else ''}")
    if req.seniors:
        people.append(f"{req.seniors} senior{'s' if req.seniors > 1 else ''}")
    who = ", ".join(people) + f" ({req.group_type})"
    if req.solo_female:
        who += ", solo woman traveller"
    if req.occasion and req.occasion != "none":
        who += f", occasion: {req.occasion}"

    lines = [
        "Destination(s): " + "; ".join(f"{d.name} ({', '.join(x for x in (d.region, d.country) if x)})" for d in dests),
        f"When: {when}; arrives {req.arrival_time.replace('_', ' ')}, leaves {req.departure_time.replace('_', ' ')}",
        f"Travellers: {who}",
        f"Budget: ₹{req.budget_total:,} total for the whole group"
        + (" including travel to/from" if req.budget_includes_intercity and req.origin else " for the trip itself"),
        f"Style: {', '.join(req.vibes) or 'classic sightseeing'}; pace {req.pace}; fitness {req.fitness}; "
        f"day starts {DAY_START[req.day_start]}; crowds: {'avoid' if req.crowd_tolerance == 'avoid' else 'fine'}",
        f"Food: {req.diet.replace('_', ' ')}; {'drinks ok' if req.alcohol_ok else 'no bars'}"
        + (f"; notes: {req.food_notes}" if req.food_notes else ""),
        "Stay: "
        + (f"ALREADY BOOKED at {req.stay_address or 'their own place'}" if req.stay_booked else (", ".join(req.stay_types) or "any type")),
        f"Getting around: {', '.join(req.local_transport) or 'anything sensible'}; can ride a scooter: {'yes' if req.can_ride_two_wheeler else 'no'}",
    ]
    if req.origin:
        lines.append(f"Coming from: {req.origin} (by {', '.join(req.intercity_modes) or 'any mode'})")
    if req.must_include:
        lines.append("MUST include: " + "; ".join(req.must_include))
    if req.avoid:
        lines.append("Avoid: " + "; ".join(req.avoid))
    if req.accessibility:
        lines.append("Accessibility: " + ", ".join(a.replace("_", " ") for a in req.accessibility))
    if req.notes:
        lines.append(f"Other notes: {req.notes}")
    if req.description:
        lines.append(f"In their words: {req.description}")
    if weather_summary:
        lines.append(f"Weather: {weather_summary}")
    return "\n".join(f"- {line}" for line in lines)


PLAN_SYSTEM = """You are Wander Mind, an evidence-based travel planner for India. Build a realistic day-by-day plan from the EVIDENCE (recent vlogs, YouTube comments, Reddit, blogs).
Rules:
- Prefer evidence entries and cite them with "ref" (e.g. "E12"). You may add a well-known place missing from the evidence with "ref": null and an honest cost estimate.
- Respect the traveller: budget, diet, pace, fitness, accessibility, must-include, avoid, crowd tolerance, season and weather.
- Keep each day geographically tight and order stops to avoid back-tracking. Leave time to travel between stops.
- Include breakfast, lunch and dinner (plus famous snacks) as food stops, picked from evidence where possible and matching the diet.
- Day 1 starts after arrival; the last day ends in time for departure.
- Pace: relaxed ≈ 3 sights a day, balanced ≈ 4-5, packed ≈ 6+ (food stops not counted).
- Costs are per person in INR (entry ticket, food bill, activity fee); 0 for free places. Without an evidence price,
  estimate conservatively at local-resident rates: temples, ghats, markets and parks are usually free; most heritage
  sites charge ₹10-50; a street-food stop is ₹50-200.
- Stops are places to visit or eat at. Never add a bus, auto, cab or other transport, or the hotel/hostel itself,
  as a stop - travel between stops and the stay are planned separately.
- "alts": up to 2 refs that could replace the stop (similar and nearby).
Reply with JSON only."""

PLAN_FORMAT = """Return JSON:
{"title": "short, warm trip title",
 "stay": {"areas": [{"name": str, "why": str, "best_for": str}],
          "picks": [{"ref": "E5" or null, "name": str, "type": "hostel|budget_hotel|mid_hotel|homestay|resort|luxury|camping", "area": str, "price_min": int, "price_max": int, "why": str, "best_for": str}]},
 "days": [{"day": int, "title": str, "summary": str, "destination": str,
   "items": [{"ref": "E12" or null, "name": str, "area": str, "kind": "attraction|food|activity|shopping|nightlife|experience|rest", "time": "HH:MM", "mins": int, "why": str, "tip": str or null, "cost_min": int, "cost_max": int, "book": bool, "alts": ["E3"]}]}]}
Stay picks: 2-4 options, price per room per night (per bed for hostels), at least one that fits the budget."""

PLAN_FORMAT_DAYS_ONLY = """Return JSON with only the requested days (same stay as before):
{"days": [{"day": int, "title": str, "summary": str, "destination": str,
   "items": [{"ref": "E12" or null, "name": str, "area": str, "kind": "attraction|food|activity|shopping|nightlife|experience|rest", "time": "HH:MM", "mins": int, "why": str, "tip": str or null, "cost_min": int, "cost_max": int, "book": bool, "alts": ["E3"]}]}]}"""


OVERVIEW_SYSTEM = """You are Wander Mind's travel editor. Using the trip, plan outline and evidence tips, write the trip overview. Be specific to the place and season, practical, and honest; do not invent exact prices. Reply with JSON only."""

OVERVIEW_FORMAT = """Return JSON:
{"summary": "2-3 warm, specific sentences",
 "highlights": [5 short highlights],
 "season": {"label": "e.g. Post-monsoon, pleasant", "crowd_level": "low|moderate|high", "summary": str, "notes": [str], "events": [{"name": str, "when": str, "note": str}]},
 "getting_there": {"arrival_hub": "main station/airport/bus stand", "notes": [str], "modes": [{"mode": "train|bus|flight|cab|self_drive", "details": "routes, popular trains or operators, journey feel", "booking_tip": str}]},
 "book_ahead": [{"item": str, "when": "how far ahead", "why": str}],
 "rainy_day": [{"title": str, "note": str}],
 "hidden_gems": [{"title": str, "note": str}],
 "saving_tips": [str], "upgrade_tips": [str]}"""

LOCAL_SYSTEM = """You are Wander Mind's local guide. From the evidence, explain how to get around and what to eat. Mark ride apps honestly: "confirmed" only when evidence says so. Reply with JSON only."""

LOCAL_FORMAT = """Return JSON:
{"transport": {"summary": "2 sentences on getting around", "apps": [{"name": "Rapido|Uber|Ola|Namma Yatri|...", "status": "confirmed|likely|limited|unlikely", "note": str}],
   "modes": [{"mode": "walk|bike_taxi|auto|cab|local_taxi|shared|bus|scooty_rental|metro|boat|other", "label": str, "typical_fare": "e.g. ₹30-60 for 3 km", "best_for": str, "note": str}],
   "rental": "scooter/bike rental availability and typical day price, or empty", "tips": [str]},
 "food": {"must_try": [{"dish": str, "where": str, "price_text": str, "note": str, "veg": bool}], "tips": [str]}}"""

ESSENTIALS_SYSTEM = """You are Wander Mind's safety and logistics expert for India. Give short, practical, place-specific advice. Reply with JSON only."""

ESSENTIALS_FORMAT = """Return JSON (each list 3-7 short items, empty list if not relevant):
{"packing": [str], "documents": [str], "money": [str], "connectivity": [str], "etiquette": [str], "safety": [str], "scams": [str], "health": [str], "accessibility": [str], "emergency": [{"label": str, "number": str}]}"""
