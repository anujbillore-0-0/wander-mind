import logging
import uuid
from contextlib import asynccontextmanager
from datetime import date

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from . import jobs, llm
from .config import settings
from .db import Destination, SessionLocal, Trip, TripEvent, init_db, utcnow
from .research.collect_web import searxng_available
from .research.store import norm, save_source_claims
from .schemas import ParseRequest, PriceReportIn, TripRequest, TweakRequest
from .services.geo import search_places, wiki_summary

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    jobs.recover_interrupted()
    yield


app = FastAPI(title="Wander Mind API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=settings.cors_origin_list, allow_methods=["*"], allow_headers=["*"]
)


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "llm_providers": llm.configured_providers(),
        "searxng": searxng_available(),
        "youtube_api": bool(settings.youtube_api_key),
        "reddit_oauth": bool(settings.reddit_client_id and settings.reddit_client_secret),
        "database": "sqlite" if settings.database_url.startswith("sqlite") else "postgres",
        "llm_usage": dict(llm.usage),
    }


@app.get("/api/places")
def places(q: str = Query(min_length=2, max_length=80)):
    try:
        return search_places(q, 6)
    except Exception:
        return []


@app.get("/api/places/photo")
def place_photo(name: str = Query(min_length=2, max_length=80)):
    """Lead photo for a destination card (Wikipedia / Wikimedia Commons, cached)."""
    try:
        info = wiki_summary(name)
    except Exception:
        info = None
    return {"image": (info or {}).get("image", ""), "description": (info or {}).get("description", "")[:300]}


PARSE_SYSTEM = """Turn a traveller's message into trip-planner form fields. Today is {today}.
Return JSON with ONLY the fields the message states or clearly implies:
{{"destinations": [str], "origin": str, "start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD", "num_days": int,
 "flexible_month": "YYYY-MM", "group_type": "solo|couple|friends|family|business", "adults": int, "children": int,
 "seniors": int, "budget_total": int, "vibes": [str], "pace": "relaxed|balanced|packed",
 "diet": "veg|non_veg|jain|vegan|eggetarian", "stay_types": [str], "local_transport": [str], "intercity_modes": [str],
 "solo_female": bool, "occasion": str, "must_include": [str], "avoid": [str], "notes": str}}
- budget_total is INR for the whole group: "5k" = 5000; "3000 per person" for 2 people = 6000.
- vibes from: food, culture, adventure, nature, spiritual, nightlife, shopping, offbeat, photography, romantic, wellness
- stay_types from: hostel, budget_hotel, mid_hotel, homestay, resort, luxury, camping
- local_transport from: ride_apps, auto, public, rent_two_wheeler, private_cab, walk
- intercity_modes from: train, bus, flight, self_drive
- Resolve relative dates ("next weekend", "this Diwali") against today. Never guess unmentioned fields."""

PARSE_FIELDS = {
    "destinations": list, "origin": str, "start_date": str, "end_date": str, "num_days": int, "flexible_month": str,
    "group_type": str, "adults": int, "children": int, "seniors": int, "budget_total": int, "vibes": list,
    "pace": str, "diet": str, "stay_types": list, "local_transport": list, "intercity_modes": list,
    "solo_female": bool, "occasion": str, "must_include": list, "avoid": list, "notes": str,
}


@app.post("/api/parse")
def parse_trip(body: ParseRequest):
    try:
        data = llm.complete_json(
            "planner", PARSE_SYSTEM.format(today=date.today().isoformat()), body.text,
            max_tokens=1200, temperature=0.1, effort="low",
        )
    except llm.LLMUnavailable as e:
        raise HTTPException(503, str(e)) from e
    out = {}
    for key, typ in PARSE_FIELDS.items():
        value = data.get(key) if isinstance(data, dict) else None
        if value in (None, "", []):
            continue
        if typ is int:
            try:
                out[key] = int(value)
            except (TypeError, ValueError):
                continue
        elif typ is list:
            if isinstance(value, list):
                out[key] = [str(v) for v in value if v][:10]
        elif isinstance(value, typ):
            out[key] = value
    return out


def _trip_summary(t: Trip) -> dict:
    req = t.request or {}
    return {
        "id": t.id,
        "title": t.title,
        "status": t.status,
        "destination": t.destination_name,
        "image_url": t.image_url,
        "start_date": req.get("start_date"),
        "days": (t.itinerary or {}).get("days_count") or req.get("num_days"),
        "budget": req.get("budget_total"),
        "travelers_label": (t.itinerary or {}).get("travelers_label", ""),
        "created_at": t.created_at.isoformat() + "Z",
    }


@app.post("/api/trips", status_code=201)
def create_trip(req: TripRequest):
    if not llm.configured_providers():
        raise HTTPException(503, "No LLM API key is configured on the server. Add one to .env and restart.")
    trip = Trip(
        id=jobs.new_trip_id(),
        status="queued",
        title=f"Trip to {req.destinations[0]}",
        destination_name=req.destinations[0],
        request=req.model_dump(mode="json"),
    )
    with SessionLocal() as s:
        s.add(trip)
        s.commit()
    jobs.emit(trip.id, "queued", "Packing our bags. Your planner is starting", 1)
    jobs.submit(trip.id)
    return {"id": trip.id}


@app.get("/api/trips")
def list_trips(limit: int = Query(30, ge=1, le=100)):
    with SessionLocal() as s:
        trips = s.scalars(select(Trip).order_by(Trip.created_at.desc()).limit(limit))
        return [_trip_summary(t) for t in trips]


@app.get("/api/trips/{trip_id}")
def get_trip(trip_id: str):
    with SessionLocal() as s:
        trip = s.get(Trip, trip_id)
        if not trip:
            raise HTTPException(404, "Trip not found")
        events = list(
            s.scalars(select(TripEvent).where(TripEvent.trip_id == trip_id).order_by(TripEvent.id.desc()).limit(60))
        )
        return {
            **_trip_summary(trip),
            "error": trip.error,
            "request": trip.request,
            "itinerary": trip.itinerary,
            "version": trip.version,
            "events": [
                {"stage": e.stage, "message": e.message, "pct": e.pct, "at": e.created_at.isoformat() + "Z"}
                for e in reversed(events)
            ],
        }


def _requeue(trip_id: str, need_itinerary: bool) -> Trip:
    with SessionLocal() as s:
        trip = s.get(Trip, trip_id)
        if not trip:
            raise HTTPException(404, "Trip not found")
        if trip.status in ("queued", "working"):
            raise HTTPException(409, "This trip is already being planned")
        if need_itinerary and not trip.itinerary:
            raise HTTPException(409, "This trip has no plan to change yet")
        trip.status, trip.error = "queued", ""
        s.commit()
        return trip


@app.post("/api/trips/{trip_id}/tweak")
def tweak_trip(trip_id: str, body: TweakRequest):
    _requeue(trip_id, need_itinerary=True)
    jobs.emit(trip_id, "queued", f"Got it: “{body.instruction[:100]}”", 1)
    jobs.submit(trip_id, tweak=body.instruction)
    return {"id": trip_id}


@app.post("/api/trips/{trip_id}/retry")
def retry_trip(trip_id: str):
    _requeue(trip_id, need_itinerary=False)
    jobs.emit(trip_id, "queued", "Trying again", 1)
    jobs.submit(trip_id)
    return {"id": trip_id}


@app.delete("/api/trips/{trip_id}", status_code=204)
def delete_trip(trip_id: str):
    with SessionLocal() as s:
        trip = s.get(Trip, trip_id)
        if trip:
            s.delete(trip)
            s.commit()


@app.post("/api/trips/{trip_id}/reports", status_code=201)
def report_price(trip_id: str, body: PriceReportIn):
    """'What did you pay?' Each report becomes first-hand evidence for future plans."""
    with SessionLocal() as s:
        trip = s.get(Trip, trip_id)
        if not trip or not trip.itinerary:
            raise HTTPException(404, "Trip not found")
        dest = s.scalar(select(Destination).where(Destination.key == norm(trip.itinerary["destination"]["name"])))
    if not dest:
        raise HTTPException(404, "Destination not found")
    unit = body.unit if body.unit in ("person", "item", "plate", "night", "ride", "entry", "day", "total") else "person"
    claim = {
        "entity": body.place_name or body.item_title,
        "type": body.kind if body.kind in ("attraction", "food", "stay", "transport", "activity", "shopping", "nightlife") else "general",
        "area": "",
        "claim": "price",
        "item": body.item_title,
        "price_min": body.price_paid,
        "price_max": body.price_paid,
        "unit": unit,
        "text": f"A traveller paid ₹{body.price_paid:g} ({unit}) for {body.item_title}." + (f" {body.note}" if body.note else ""),
        "quote": body.note[:200],
        "t": None,
    }
    save_source_claims(
        dest,
        {
            "kind": "user",
            "external_id": uuid.uuid4().hex,
            "url": "",
            "title": f"Traveller report: {body.item_title}",
            "author": "Wander Mind traveller",
            "published_at": utcnow(),
            "topic": "user_report",
        },
        [claim],
    )
    return {"ok": True}
