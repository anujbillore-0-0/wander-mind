"""Assemble the final, validated Itinerary from the costed plan, the guides and the evidence."""

import html
from collections import Counter
from datetime import timedelta

from ..db import Destination, Source, utcnow
from ..research.store import EntityAgg, TipAgg
from ..schemas import Itinerary, TripRequest
from ..services import fares
from ..services.geo import maps_url

RECENT_DAYS = 548  # evidence newer than ~18 months counts as current
PER_PERSON_UNITS = {"item", "plate", "person", "entry"}
STAY_LABELS = {
    "hostel": "Hostel", "budget_hotel": "Budget hotel", "mid_hotel": "Mid-range hotel", "homestay": "Homestay",
    "resort": "Resort", "luxury": "Luxury hotel", "camping": "Camp",
}


def _source_url(src: Source | None, t: int | None) -> str:
    if not src:
        return ""
    if src.kind in ("youtube",) and t:
        return f"{src.url}&t={int(t)}s"
    return src.url


def evidence_for(agg: EntityAgg | None, sources: dict[int, Source]) -> dict:
    if not agg:
        return {"status": "estimate"}
    n = len(agg.source_ids)
    recent = agg.latest is not None and (utcnow() - agg.latest).days <= RECENT_DAYS
    return {
        "status": "verified" if n >= 2 and recent else "reported",
        "source_count": n,
        "latest": agg.latest.date().isoformat() if agg.latest else None,
        "source_ids": agg.source_ids[:12],
        "quotes": [
            {"text": q["text"], "quote": q["quote"], "source_id": q["source_id"], "url": _source_url(sources.get(q["source_id"]), q["t"])}
            for q in agg.quotes
        ],
    }


def _travelers_label(req: TripRequest) -> str:
    if req.travelers == 1:
        return "Solo traveller"
    parts = [f"{req.adults} adult{'s' if req.adults > 1 else ''}"]
    if req.children:
        parts.append(f"{req.children} child{'ren' if req.children > 1 else ''}")
    if req.seniors:
        parts.append(f"{req.seniors} senior{'s' if req.seniors > 1 else ''}")
    return " · ".join(parts)


def _dest_info(d: Destination) -> dict:
    return {
        "name": d.name, "region": d.region, "country": d.country, "lat": d.lat, "lon": d.lon,
        "description": d.description, "image_url": d.image_url, "wiki_url": d.wiki_url,
    }


def _strs(v, limit: int = 8, size: int = 300) -> list[str]:
    return [str(x)[:size] for x in (v or []) if isinstance(x, (str, int, float)) and str(x).strip()][:limit]


def _dicts(v, limit: int = 8) -> list[dict]:
    return [x for x in (v or []) if isinstance(x, dict)][:limit]


def compose(
    req: TripRequest,
    dests: list[Destination],
    draft: dict,
    computed: dict,
    guides: dict,
    aggs: dict[str, EntityAgg],
    tips: list[TipAgg],
    sources: dict[int, Source],
    weather: dict,
    gaps: list[str],
    claim_count: int,
    version: int,
) -> dict:
    primary = dests[0]
    start = req.resolved_start()
    used_sources: set[int] = set()

    def ev(agg: EntityAgg | None) -> dict:
        e = evidence_for(agg, sources)
        used_sources.update(e.get("source_ids", []))
        return e

    weather_days = weather.get("days", [])

    # ---- days
    days_out, estimates, total_items = [], 0, 0
    for day in computed["days"]:
        items_out = []
        for it in day["items"]:
            agg = aggs.get(it["ref"]) if it["ref"] else None
            total_items += 1
            estimates += 0 if agg else 1
            alternatives = []
            for ref in it["alts"]:
                a = aggs[ref]
                priced = a.price_min is not None and a.unit in PER_PERSON_UNITS
                alternatives.append(
                    {
                        "title": a.name,
                        "note": (a.facts[:1] or [a.area])[0] if (a.facts or a.area) else "",
                        "cost_min": int(a.price_min) if priced else None,
                        "cost_max": int(a.price_max) if priced else None,
                        "evidence": ev(a),
                    }
                )
            dest_name = next((d.name for d in dests if d.id == it["dest_id"]), primary.name)
            tips_list = list(it["tips"])
            if agg:
                tips_list += [w for w in agg.warnings if w not in tips_list][:1]
            items_out.append(
                {
                    "id": it["id"],
                    "time": it["time"],
                    "end_time": it["end_time"],
                    "slot": it["slot"],
                    "kind": it["kind"],
                    "title": it["title"],
                    "description": it["description"],
                    "place": {
                        "name": it["title"],
                        "area": it["area"],
                        "lat": it["lat"],
                        "lon": it["lon"],
                        "maps_url": maps_url(it["title"], it["area"], dest_name),
                    },
                    "duration_min": it["duration_min"],
                    "cost": {
                        "min": it["cost_min"],
                        "max": it["cost_max"],
                        "per": "person",
                        "note": "from recent traveller reports" if it["price_from_evidence"] else "estimate",
                    },
                    "tips": tips_list[:3],
                    "booking_required": it["booking_required"],
                    "image_url": it["image_url"] if it["image_url"] != "-" else "",
                    "evidence": ev(agg),
                    "alternatives": alternatives,
                    "leg_to_next": it["leg_to_next"],
                }
            )
        i = day["day"] - 1
        w = weather_days[i] if i < len(weather_days) else None
        days_out.append(
            {
                "day": day["day"],
                "date": (start + timedelta(days=i)).isoformat() if start else None,
                "title": day["title"],
                "summary": day["summary"],
                "destination": day["destination"],
                "weather": w,
                "start_leg": day["start_leg"],
                "end_leg": day["end_leg"],
                "items": items_out,
                "cost_min": day["cost_min"],
                "cost_max": day["cost_max"],
                "distance_km": day["distance_km"],
            }
        )

    overview = guides.get("overview") or {}
    local = guides.get("local") or {}
    essentials = guides.get("essentials") or {}

    # ---- budget
    b = computed["budget"]
    budget = {
        **b,
        "currency": "INR",
        "saving_tips": _strs(overview.get("saving_tips"), 5),
        "upgrade_tips": _strs(overview.get("upgrade_tips"), 4) if b["total_max"] < 0.75 * b["user_budget"] else [],
    }

    # ---- getting there
    gt_guide = overview.get("getting_there") or {}
    mode_notes = {str(m.get("mode")): m for m in _dicts(gt_guide.get("modes"))}
    getting_there = {
        "origin": computed["intercity"]["origin"] or req.origin,
        "distance_km": computed["intercity"]["distance_km"],
        "arrival_hub": str(gt_guide.get("arrival_hub") or "")[:200],
        "notes": _strs(gt_guide.get("notes"), 5),
        "options": [
            {
                "mode": o["mode"],
                "title": o["title"],
                "duration_text": o["duration_text"],
                "cost_min": o["cost_min"],
                "cost_max": o["cost_max"],
                "per": o["per"],
                "details": str(mode_notes.get(o["mode"], {}).get("details") or "")[:400],
                "booking_tip": str(mode_notes.get(o["mode"], {}).get("booking_tip") or "")[:300],
                "recommended": o["recommended"],
            }
            for o in computed["intercity"]["options"]
        ],
    }

    # ---- stay
    stay_draft = draft.get("stay") or {}
    stay = {
        "booked": req.stay_booked,
        "booked_address": req.stay_address,
        "nights": computed["nights"],
        "rooms": computed["rooms"],
        "areas": [
            {"name": str(a.get("name"))[:120], "why": str(a.get("why") or "")[:300], "best_for": str(a.get("best_for") or "")[:120]}
            for a in _dicts(stay_draft.get("areas"), 3)
            if a.get("name")
        ],
        "options": [
            {
                "id": s["id"],
                "name": s["name"],
                "type": STAY_LABELS.get(s["type"], s["type"].replace("_", " ").title()),
                "area": s["area"],
                "price_min": s["price_min"],
                "price_max": s["price_max"],
                "per": "bed / night" if s["type"] in ("hostel", "camping") else "room / night",
                "why": s["why"],
                "best_for": s["best_for"],
                "recommended": s["recommended"],
                "place": {
                    "name": s["name"], "area": s["area"], "lat": s.get("lat"), "lon": s.get("lon"),
                    "maps_url": maps_url(s["name"], s["area"], primary.name),
                },
                "evidence": ev(aggs.get(s["ref"]) if s["ref"] else None),
            }
            for s in computed["stays"]
        ],
        "tips": [],
    }

    # ---- food guide: places in the plan first, then the best other evidence-backed spots
    in_plan_refs = {it["ref"] for d in computed["days"] for it in d["items"] if it["ref"] and it["kind"] == "food"}
    food_aggs = sorted((a for a in aggs.values() if a.type in ("food", "nightlife")), key=lambda a: (a.ref not in in_plan_refs, -a.score))
    places = []
    for a in food_aggs[:12]:
        priced = a.price_min is not None and a.unit in PER_PERSON_UNITS
        known_for = ", ".join(i[0] for i in a.items[:2]) or (a.facts[0] if a.facts else "")
        places.append(
            {
                "name": a.name,
                "area": a.area,
                "known_for": known_for[:200],
                "price_min": int(a.price_min) if priced else None,
                "price_max": int(a.price_max) if priced else None,
                "per": a.unit if priced else "person",
                "best_time": "",
                "in_plan": a.ref in in_plan_refs,
                "place": {"name": a.name, "area": a.area, "lat": a.lat, "lon": a.lon, "maps_url": maps_url(a.name, a.area, primary.name)},
                "evidence": ev(a),
            }
        )
    food_guide = local.get("food") or {}
    food = {
        "must_try": [
            {
                "dish": str(x.get("dish"))[:120],
                "where": str(x.get("where") or "")[:160],
                "price_text": str(x.get("price_text") or "")[:60],
                "note": str(x.get("note") or "")[:200],
                "veg": x.get("veg") if isinstance(x.get("veg"), bool) else None,
            }
            for x in _dicts(food_guide.get("must_try"), 10)
            if x.get("dish")
        ],
        "places": places,
        "tips": _strs(food_guide.get("tips"), 6),
    }

    # ---- transport guide
    tg = local.get("transport") or {}
    apps = [
        {"name": str(a.get("name"))[:40], "status": a.get("status") if a.get("status") in ("confirmed", "likely", "limited", "unlikely") else "likely", "note": str(a.get("note") or "")[:200]}
        for a in _dicts(tg.get("apps"), 6)
        if a.get("name")
    ]
    if not apps:
        guess = computed["apps"]
        apps = [{"name": n, "status": guess, "note": "Estimated from city size; check the app before you go."} for n in ("Rapido", "Uber", "Ola")]
    transport = {
        "summary": str(tg.get("summary") or "")[:500],
        "apps": apps,
        "modes": [
            {
                "mode": str(m.get("mode") or "other")[:30],
                "label": str(m.get("label") or m.get("mode") or "")[:80],
                "typical_fare": str(m.get("typical_fare") or "")[:80],
                "best_for": str(m.get("best_for") or "")[:160],
                "note": str(m.get("note") or "")[:200],
            }
            for m in _dicts(tg.get("modes"), 8)
        ],
        "fare_examples": fares.fare_examples(computed["apps"], req.travelers, computed["hilly"]),
        "rental": str(tg.get("rental") or "")[:300],
        "tips": _strs(tg.get("tips"), 6),
    }

    # ---- essentials
    emergency = [
        {"label": str(e.get("label"))[:60], "number": str(e.get("number"))[:30]}
        for e in _dicts(essentials.get("emergency"), 8)
        if e.get("label") and e.get("number")
    ]
    if primary.country_code == "IN" and not any(e["number"].strip() == "112" for e in emergency):
        emergency.insert(0, {"label": "All emergencies (police, fire, ambulance)", "number": "112"})
    essentials_out = {k: _strs(essentials.get(k), 7) for k in ("packing", "documents", "money", "connectivity", "etiquette", "safety", "scams", "health", "accessibility")}
    essentials_out["emergency"] = emergency
    # Scam and safety warnings found in evidence go first: they are the most valuable.
    ev_scams = [t.text for t in tips if t.type == "scam"][:3]
    essentials_out["scams"] = (ev_scams + [s for s in essentials_out["scams"] if s not in ev_scams])[:7]

    # ---- season
    season_g = overview.get("season") or {}
    season = {
        "label": str(season_g.get("label") or "")[:80],
        "crowd_level": season_g.get("crowd_level") if season_g.get("crowd_level") in ("low", "moderate", "high") else "moderate",
        "summary": str(season_g.get("summary") or weather.get("summary") or "")[:500],
        "notes": _strs(season_g.get("notes"), 5),
        "events": [
            {"name": str(e.get("name"))[:120], "when": str(e.get("when") or "")[:80], "note": str(e.get("note") or "")[:200]}
            for e in _dicts(season_g.get("events"), 5)
            if e.get("name")
        ],
        "weather_kind": weather.get("kind", "typical"),
    }

    # ---- sources & research stats
    dest_ids = {d.id for d in dests}
    relevant = [s for s in sources.values() if s.destination_id in dest_ids]
    kinds = Counter(s.kind for s in relevant)
    newest = max((s.published_at for s in relevant if s.published_at), default=None)
    source_refs = sorted(
        (sources[i] for i in used_sources if i in sources),
        key=lambda s: s.published_at or utcnow().replace(year=2000),
        reverse=True,
    )
    sources_out = [
        {
            "id": s.id,
            "kind": s.kind,
            "title": html.unescape(s.title or s.url),
            "url": s.url,
            "author": s.author,
            "published_at": s.published_at.date().isoformat() if s.published_at else None,
        }
        for s in source_refs[:80]
    ]

    data_gaps = list(dict.fromkeys(gaps))
    if estimates:
        data_gaps.append(f"{estimates} of {total_items} stops have no recent online evidence yet and are marked as AI estimates.")
    if not req.origin:
        data_gaps.append("Add your starting city to include travel there and back.")
    for key, label in (("overview", "season & booking notes"), ("local", "food & transport guide"), ("essentials", "packing & safety notes")):
        if not guides.get(key):
            data_gaps.append(f"The {label} couldn't be written this time (LLM quota busy). Try regenerating later.")

    n_days = req.resolved_days()
    itinerary = {
        "title": str(draft.get("title") or f"{n_days} days in {primary.name}")[:120],
        "summary": str(overview.get("summary") or "")[:800],
        "highlights": _strs(overview.get("highlights"), 6, 160),
        "destination": _dest_info(primary),
        "other_destinations": [_dest_info(d) for d in dests[1:]],
        "start_date": start.isoformat() if start else None,
        "end_date": req.resolved_end().isoformat() if req.resolved_end() else None,
        "days_count": n_days,
        "nights": computed["nights"],
        "travelers": req.travelers,
        "travelers_label": _travelers_label(req),
        "style_tags": [v for v in req.vibes][:6] + [f"{req.pace} pace"],
        "season": season,
        "weather": weather_days,
        "budget": budget,
        "getting_there": getting_there,
        "stay": stay,
        "days": days_out,
        "food": food,
        "transport": transport,
        "essentials": essentials_out,
        "book_ahead": [
            {"item": str(x.get("item"))[:160], "when": str(x.get("when") or "")[:80], "why": str(x.get("why") or "")[:200]}
            for x in _dicts(overview.get("book_ahead"), 8)
            if x.get("item")
        ],
        "rainy_day": [{"title": str(x.get("title"))[:120], "note": str(x.get("note") or "")[:200]} for x in _dicts(overview.get("rainy_day"), 5) if x.get("title")],
        "hidden_gems": [{"title": str(x.get("title"))[:120], "note": str(x.get("note") or "")[:200]} for x in _dicts(overview.get("hidden_gems"), 5) if x.get("title")],
        "sources": sources_out,
        "data_gaps": data_gaps,
        "research": {
            "videos": kinds.get("youtube", 0),
            "comment_threads": kinds.get("youtube_comments", 0),
            "reddit_threads": kinds.get("reddit", 0),
            "web_pages": kinds.get("web", 0),
            "user_reports": kinds.get("user", 0),
            "claims": claim_count,
            "newest_source": newest.date().isoformat() if newest else None,
        },
        "generated_at": utcnow().isoformat() + "Z",
        "version": version,
    }
    # Validate against the contract so the UI never receives a malformed plan.
    return Itinerary.model_validate(itinerary).model_dump(mode="json")
