"""Turn the model's draft into numbers: places on the map, legs between stops, costs and a budget check.

All of this is plain code. The model chooses stops; code does the arithmetic.
"""

import logging
import re
from concurrent.futures import ThreadPoolExecutor

from rapidfuzz import fuzz

from ..db import Destination, Entity, SessionLocal
from ..research.store import EntityAgg, norm
from ..schemas import TripRequest
from ..services import fares
from ..services.geo import geocode_poi, haversine_km, resolve_destination, wiki_summary

log = logging.getLogger(__name__)

PER_PERSON_UNITS = {"item", "plate", "person", "entry"}
KINDS = {"attraction", "food", "activity", "shopping", "nightlife", "experience", "rest"}
SIGHT_KINDS = {"attraction", "activity", "experience", "shopping", "nightlife"}
PACE_LIMIT = {"relaxed": 4, "balanced": 6, "packed": 8}
DAY_START = {"early": "07:00", "normal": "09:00", "late": "10:30"}
TIME_RE = re.compile(r"^([01]?\d|2[0-3]):([0-5]\d)$")
TRANSPORT_STOP_RE = re.compile(r"(local |city |shared )?(bus|auto|auto rickshaw|cab|taxi|rapido|uber|ola|metro|train)( ride| back| to .*)?")


def _int(v, default: int = 0) -> int:
    try:
        return max(0, int(round(float(v))))
    except (TypeError, ValueError):
        return default


def _add_minutes(hhmm: str, mins: int) -> str:
    h, m = map(int, hhmm.split(":"))
    total = min(h * 60 + m + mins, 23 * 60 + 59)
    return f"{total // 60:02d}:{total % 60:02d}"


def _slot(hhmm: str) -> str:
    h = int(hhmm[:2])
    return "morning" if h < 12 else "afternoon" if h < 17 else "evening" if h < 20 else "night"


def _expected_meals(day_index: int, n_days: int, arrival: str, departure: str) -> int:
    meals = 3
    if day_index == 1:
        meals = {"early_morning": 3, "morning": 3, "afternoon": 2, "evening": 1, "night": 0}.get(arrival, 3)
    if day_index == n_days:
        meals = min(meals, {"early_morning": 0, "morning": 1, "afternoon": 2, "evening": 3, "night": 3}.get(departure, 3))
    return meals


def _persist_entity_geo(jobs: list[dict]) -> None:
    with SessionLocal() as s:
        for j in jobs:
            if j.get("entity_id"):
                e = s.get(Entity, j["entity_id"])
                if e:
                    e.geocoded = True
                    if j.get("coords"):
                        e.lat, e.lon = j["coords"]
        s.commit()


def _geocode_all(jobs: list[dict]) -> None:
    def work(j: dict) -> None:
        try:
            d = j["dest"]
            j["coords"] = geocode_poi(j["name"], j["area"], d.name, d.lat, d.lon)
        except Exception as e:
            log.warning("geocode failed for %s: %s", j["name"], e)
            j["coords"] = None

    with ThreadPoolExecutor(4) as pool:
        list(pool.map(work, jobs))
    _persist_entity_geo(jobs)


def _attach_images(items: list[dict], dests_by_id: dict[int, Destination], limit: int = 12) -> None:
    wanted = [it for it in items if it["kind"] in SIGHT_KINDS and not it["image_url"]][:limit]

    def work(it: dict) -> None:
        d = dests_by_id.get(it["dest_id"])
        info = wiki_summary(it["title"], must_mention=d.name if d else "")
        it["image_url"] = (info or {}).get("image", "")

    with ThreadPoolExecutor(4) as pool:
        list(pool.map(work, wanted))
    with SessionLocal() as s:
        for it in wanted:
            if it.get("entity_id"):
                e = s.get(Entity, it["entity_id"])
                if e:
                    e.image_url = it["image_url"] or "-"
        s.commit()


def compute(req: TripRequest, dests: list[Destination], draft: dict, aggs: dict[str, EntityAgg]) -> dict:
    travelers = req.travelers
    primary = dests[0]
    dests_by_id = {d.id: d for d in dests}
    hilly = fares.is_hilly(primary.elevation)
    apps = fares.app_status(primary.population, primary.elevation)
    vulnerable = bool(req.children or req.seniors or req.accessibility)
    n_days = req.resolved_days()
    nights = max(n_days - 1, 0)

    def dest_for(name: str | None, agg: EntityAgg | None) -> Destination:
        if agg and agg.destination_id in dests_by_id:
            return dests_by_id[agg.destination_id]
        if name:
            n = norm(name)
            for d in dests:
                dn = norm(d.name)
                if dn and (dn in n or n in dn):
                    return d
        return primary

    # ---- days and stops
    geo_jobs: list[dict] = []
    days: list[dict] = []
    raw_days = sorted((d for d in draft.get("days", []) if isinstance(d, dict)), key=lambda d: _int(d.get("day")))
    for idx, d in enumerate(raw_days[:n_days], 1):
        day_dest = dest_for(d.get("destination"), None)
        clock = DAY_START[req.day_start]
        items: list[dict] = []
        for it in (x for x in d.get("items", []) if isinstance(x, dict)):
            ref = it.get("ref") if isinstance(it.get("ref"), str) else None
            agg = aggs.get(ref) if ref else None
            if ref and not agg:
                ref = None  # the model cited a ref that doesn't exist
            name = (agg.name if agg else str(it.get("name") or "")).strip()
            if not name or (agg and agg.type in ("transport", "stay")) or TRANSPORT_STOP_RE.fullmatch(norm(name)):
                continue  # rides are legs between stops and the hotel is the Stay section - neither is a stop
            t = str(it.get("time") or "").strip()
            m = TIME_RE.match(t)
            t = f"{int(m.group(1)):02d}:{m.group(2)}" if m else clock
            mins = min(max(_int(it.get("mins"), 60), 15), 600)
            kind = str(it.get("kind") or "attraction").lower()
            kind = kind if kind in KINDS else "attraction"

            c_min, c_max = _int(it.get("cost_min")), _int(it.get("cost_max"))
            c_max = max(c_max, c_min)
            if kind == "rest":
                c_min = c_max = 0  # downtime / check-in; the room itself is budgeted under Stay
            from_evidence = False
            if agg and agg.price_min is not None and agg.unit in PER_PERSON_UNITS:
                # A lone listicle claiming far more than a careful estimate is more likely wrong than right.
                implausible = agg.price_kinds <= {"web"} and agg.price_min > 3 * max(c_max, 30)
                if not implausible:
                    c_min = int(round(agg.price_min))
                    bump = 1.6 if kind == "food" and agg.unit in ("item", "plate") else 1.0
                    c_max = max(c_min, int(round(agg.price_max * bump)))
                    from_evidence = True

            item_dest = dest_for(d.get("destination"), agg) if agg else day_dest
            item = {
                "id": f"d{idx}-{len(items) + 1}",
                "time": t,
                "end_time": _add_minutes(t, mins),
                "slot": _slot(t),
                "kind": kind,
                "title": name[:160],
                "description": str(it.get("why") or "")[:400],
                "area": str(it.get("area") or (agg.area if agg else ""))[:120],
                "lat": agg.lat if agg else None,
                "lon": agg.lon if agg else None,
                "dest_id": item_dest.id,
                "duration_min": mins,
                "cost_min": c_min,
                "cost_max": c_max,
                "price_from_evidence": from_evidence,
                "tips": [str(it["tip"])[:300]] if it.get("tip") else [],
                "booking_required": bool(it.get("book")),
                "image_url": agg.image_url if agg else "",
                "ref": ref,
                "entity_id": agg.id if agg else None,
                "alts": [a for a in (it.get("alts") or []) if isinstance(a, str) and a in aggs and a != ref][:2],
                "leg_to_next": None,
            }
            items.append(item)
            if item["lat"] is None:
                geo_jobs.append({"target": item, "name": name, "area": item["area"], "dest": item_dest, "entity_id": item["entity_id"]})
            clock = _add_minutes(t, mins + 20)
        items.sort(key=lambda x: x["time"])
        for k, it in enumerate(items, 1):
            it["id"] = f"d{idx}-{k}"
        days.append(
            {
                "day": idx,
                "title": str(d.get("title") or f"Day {idx}")[:120],
                "summary": str(d.get("summary") or "")[:500],
                "destination": day_dest.name,
                "dest_id": day_dest.id,
                "items": items,
            }
        )

    # ---- stay options
    stays: list[dict] = []
    for k, p in enumerate(((draft.get("stay") or {}).get("picks") or [])[:4]):
        if not isinstance(p, dict):
            continue
        ref = p.get("ref") if isinstance(p.get("ref"), str) and p.get("ref") in aggs else None
        agg = aggs.get(ref) if ref else None
        name = (agg.name if agg else str(p.get("name") or "")).strip()
        if not name:
            continue
        pmin, pmax = _int(p.get("price_min")), _int(p.get("price_max"))
        pmax = max(pmin, pmax)
        from_evidence = False
        if agg and agg.price_min is not None and agg.unit == "night":
            pmin, pmax, from_evidence = int(round(agg.price_min)), int(round(agg.price_max)), True
        sdest = dest_for(p.get("area"), agg)
        stay = {
            "id": f"s{k + 1}",
            "name": name[:160],
            "type": str(p.get("type") or "budget_hotel"),
            "area": str(p.get("area") or (agg.area if agg else ""))[:120],
            "price_min": pmin,
            "price_max": pmax,
            "price_from_evidence": from_evidence,
            "why": str(p.get("why") or "")[:300],
            "best_for": str(p.get("best_for") or "")[:120],
            "ref": ref,
            "entity_id": agg.id if agg else None,
            "lat": agg.lat if agg else None,
            "lon": agg.lon if agg else None,
            "dest_id": sdest.id,
        }
        stays.append(stay)
        if stay["lat"] is None:
            geo_jobs.append({"target": stay, "name": name, "area": stay["area"], "dest": sdest, "entity_id": stay["entity_id"]})

    booked_point = None
    if req.stay_booked and req.stay_address:
        job = {"target": {}, "name": req.stay_address, "area": "", "dest": primary, "entity_id": None}
        geo_jobs.append(job)
    else:
        job = None

    _geocode_all(geo_jobs)
    for j in geo_jobs:
        if j.get("coords"):
            j["target"]["lat"], j["target"]["lon"] = j["coords"]
    if job and job.get("coords"):
        booked_point = job["coords"]

    _attach_images([it for d in days for it in d["items"]], dests_by_id)

    # ---- getting there & back
    intercity: dict = {"origin": req.origin, "distance_km": None, "options": []}
    if req.origin:
        try:
            o = resolve_destination(req.origin)
        except Exception:
            o = None
        if o:
            dist = haversine_km(o["lat"], o["lon"], primary.lat, primary.lon)
            if dist > 25:
                intercity = {
                    "origin": o["name"],
                    "distance_km": round(dist * 1.25),
                    "options": fares.intercity_options(
                        dist, travelers, req.intercity_modes, req.budget_total / max(travelers, 1) / max(n_days, 1)
                    ),
                }
    rec_ic = next((o for o in intercity["options"] if o["recommended"]), None)
    ic_min = ic_max = 0
    if rec_ic:
        mult = 1 if rec_ic["group_cost"] else travelers
        ic_min, ic_max = rec_ic["cost_min"] * mult * 2, rec_ic["cost_max"] * mult * 2
    include_ic = bool(rec_ic) and req.budget_includes_intercity

    # ---- pick the recommended stay: the best option that fits ~40% of the remaining budget
    def units_for(stype: str) -> int:
        return travelers if stype in ("hostel", "camping") else req.default_rooms()

    rec_stay = None
    if stays and not req.stay_booked:
        spendable = req.budget_total - ((ic_min + ic_max) // 2 if include_ic else 0)
        target = max(spendable, 0) * 0.4 / max(nights, 1)
        fitting = [s for s in stays if s["price_max"] * units_for(s["type"]) <= target]
        rec_stay = max(fitting, key=lambda s: s["price_max"]) if fitting else min(stays, key=lambda s: s["price_min"])
    for s in stays:
        s["recommended"] = s is rec_stay

    def stay_point(dest_id: int):
        if booked_point and dest_id == primary.id:
            return booked_point
        candidates = ([rec_stay] if rec_stay else []) + stays
        for s in candidates:
            if s and s["dest_id"] == dest_id and s.get("lat") is not None:
                return (s["lat"], s["lon"])
        d = dests_by_id.get(dest_id, primary)
        return (d.lat, d.lon)

    # ---- legs
    def make_leg(a, b) -> dict:
        if a and b and a[0] is not None and b[0] is not None:
            km, approx = haversine_km(a[0], a[1], b[0], b[1]), False
        else:
            km, approx = 3.0, True
        return fares.leg(km, travelers, req.local_transport, req.accessibility, vulnerable, apps, hilly, approx)

    prev_stay = None
    for day in days:
        items = day["items"]
        here = stay_point(day["dest_id"])
        legs = []
        for i, it in enumerate(items[:-1]):
            nxt = items[i + 1]
            it["leg_to_next"] = make_leg((it["lat"], it["lon"]), (nxt["lat"], nxt["lon"]))
            legs.append(it["leg_to_next"])
        start_from = prev_stay if prev_stay and prev_stay != here else here
        day["start_leg"] = make_leg(start_from, (items[0]["lat"], items[0]["lon"])) if items else None
        day["end_leg"] = make_leg((items[-1]["lat"], items[-1]["lon"]), here) if items else None
        legs += [x for x in (day["start_leg"], day["end_leg"]) if x]
        prev_stay = here
        day["transport_min"] = sum(x["cost_min"] for x in legs)
        day["transport_max"] = sum(x["cost_max"] for x in legs)
        day["distance_km"] = round(sum(x["distance_km"] for x in legs), 1)

    # ---- money
    per_person_day = req.budget_total / max(travelers, 1) / max(n_days, 1)
    meal_lo, meal_hi = (200, 500) if per_person_day > 4000 else (80, 220)
    food_min = food_max = sights_min = sights_max = transport_min = transport_max = 0
    allowance_meals = 0
    for day in days:
        f_lo = sum(i["cost_min"] for i in day["items"] if i["kind"] == "food")
        f_hi = sum(i["cost_max"] for i in day["items"] if i["kind"] == "food")
        s_lo = sum(i["cost_min"] for i in day["items"] if i["kind"] != "food")
        s_hi = sum(i["cost_max"] for i in day["items"] if i["kind"] != "food")
        planned_meals = sum(1 for i in day["items"] if i["kind"] == "food")
        missing = max(0, _expected_meals(day["day"], n_days, req.arrival_time, req.departure_time) - planned_meals)
        allowance_meals += missing
        f_lo += missing * meal_lo
        f_hi += missing * meal_hi
        day["cost_min"] = (f_lo + s_lo) * travelers + day["transport_min"]
        day["cost_max"] = (f_hi + s_hi) * travelers + day["transport_max"]
        food_min += f_lo * travelers
        food_max += f_hi * travelers
        sights_min += s_lo * travelers
        sights_max += s_hi * travelers
        transport_min += day["transport_min"]
        transport_max += day["transport_max"]

    categories = []
    if req.stay_booked:
        categories.append({"key": "stay", "label": "Stay", "min": 0, "max": 0, "note": "Already booked, not counted"})
    elif rec_stay and nights:
        units = units_for(rec_stay["type"])
        unit_word = "bed" if rec_stay["type"] in ("hostel", "camping") else "room"
        categories.append(
            {
                "key": "stay",
                "label": "Stay",
                "min": rec_stay["price_min"] * units * nights,
                "max": rec_stay["price_max"] * units * nights,
                "note": f"{nights} night{'s' if nights > 1 else ''} × {units} {unit_word}{'s' if units > 1 else ''} at {rec_stay['name']}",
            }
        )
    food_note = f"Includes {allowance_meals} meal{'s' if allowance_meals != 1 else ''} not pinned in the plan" if allowance_meals else "Every meal is in the plan"
    categories.append({"key": "food", "label": "Food", "min": food_min, "max": food_max, "note": food_note})
    categories.append({"key": "activities", "label": "Sightseeing & activities", "min": sights_min, "max": sights_max, "note": "Entry tickets, activities, shopping stops"})
    categories.append({"key": "local_transport", "label": "Getting around", "min": transport_min, "max": transport_max, "note": "All rides between stops, from and back to your stay"})
    if include_ic:
        categories.append({"key": "intercity", "label": "Getting there & back", "min": ic_min, "max": ic_max, "note": f"Round trip by {rec_ic['title'].split(' (')[0].lower()} from {intercity['origin']}"})
    subtotal_min = sum(c["min"] for c in categories)
    subtotal_max = sum(c["max"] for c in categories)
    buffer_min, buffer_max = int(subtotal_min * 0.07), int(subtotal_max * 0.10)
    categories.append({"key": "buffer", "label": "Buffer", "min": buffer_min, "max": buffer_max, "note": "Water, tips, small surprises"})
    total_min, total_max = subtotal_min + buffer_min, subtotal_max + buffer_max
    budget = req.budget_total
    status = "under" if total_max <= budget else "near" if total_min <= budget else "over"

    # ---- critic: problems worth another drafting round
    issues: list[str] = []
    if total_min > budget:
        biggest = sorted((c for c in categories if c["key"] != "buffer"), key=lambda c: -c["max"])[:2]
        issues.append(
            f"Over budget: estimate ₹{total_min:,}-{total_max:,} vs budget ₹{budget:,}. Biggest costs: "
            + ", ".join(f"{c['label']} ₹{c['min']:,}-{c['max']:,}" for c in biggest)
            + ". Choose cheaper stay picks, cheaper food stops and fewer paid activities."
        )
    if len(days) < n_days:
        issues.append(f"The plan has {len(days)} of {n_days} days. Return all {n_days} days.")
    used_refs: dict[str, int] = {}
    for day in days:
        if not day["items"]:
            issues.append(f"Day {day['day']} has no stops.")
        sights = sum(1 for i in day["items"] if i["kind"] in SIGHT_KINDS)
        if sights > PACE_LIMIT[req.pace]:
            issues.append(f"Day {day['day']} has {sights} sights, too many for a {req.pace} pace.")
        if len(dests) == 1 and not hilly and day["distance_km"] > 70:
            issues.append(f"Day {day['day']} covers ~{int(day['distance_km'])} km. Keep stops closer together.")
        for i in day["items"]:
            if i["ref"] and i["kind"] != "food":
                used_refs[i["ref"]] = used_refs.get(i["ref"], 0) + 1
    for ref, count in used_refs.items():
        if count > 1:
            issues.append(f"{aggs[ref].name} ({ref}) appears {count} times. Use it once.")
    titles = [norm(i["title"]) for d in days for i in d["items"]]
    for must in req.must_include:
        if not any(fuzz.partial_ratio(norm(must), t) >= 85 for t in titles):
            issues.append(f"Must-include '{must}' is missing.")

    return {
        "days": days,
        "stays": stays,
        "nights": nights,
        "rooms": req.default_rooms(),
        "intercity": intercity,
        "include_intercity": include_ic,
        "apps": apps,
        "hilly": hilly,
        "budget": {
            "user_budget": budget,
            "total_min": total_min,
            "total_max": total_max,
            "per_person_min": total_min // max(travelers, 1),
            "per_person_max": total_max // max(travelers, 1),
            "status": status,
            "categories": categories,
        },
        "issues": issues,
    }
