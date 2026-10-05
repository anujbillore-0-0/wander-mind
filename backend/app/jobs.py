"""Runs planning in background threads and records progress events the UI polls."""

import logging
import uuid
from concurrent.futures import ThreadPoolExecutor

from sqlalchemy import select

from .db import SessionLocal, Trip, TripEvent
from .llm import LLMUnavailable
from .planner.destinations import UnknownPlace
from .planner.graph import run_planner

log = logging.getLogger(__name__)

_pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="planner")


def new_trip_id() -> str:
    return uuid.uuid4().hex[:12]


def emit(trip_id: str, stage: str, message: str, pct: int) -> None:
    with SessionLocal() as s:
        s.add(TripEvent(trip_id=trip_id, stage=stage, message=message[:500], pct=max(0, min(pct, 100))))
        s.commit()
    log.info("[%s] %3d%% %-9s %s", trip_id, pct, stage, message)


def submit(trip_id: str, tweak: str | None = None) -> None:
    _pool.submit(_run, trip_id, tweak)


def _run(trip_id: str, tweak: str | None) -> None:
    with SessionLocal() as s:
        trip = s.get(Trip, trip_id)
        if not trip:
            return
        request, previous, version = trip.request, trip.state, trip.version
        trip.status, trip.error = "working", ""
        s.commit()

    try:
        itinerary, state = run_planner(
            trip_id, request, lambda stage, msg, pct: emit(trip_id, stage, msg, pct),
            tweak=tweak, previous=previous, version=version + 1,
        )
    except (LLMUnavailable, UnknownPlace) as e:
        _fail(trip_id, str(e), tweak)
        return
    except Exception as e:  # keep the worker alive and tell the user something useful
        log.exception("planning failed for %s", trip_id)
        _fail(trip_id, f"Something went wrong while planning ({type(e).__name__}). Please try again.", tweak)
        return

    with SessionLocal() as s:
        trip = s.get(Trip, trip_id)
        trip.itinerary, trip.state = itinerary, state
        trip.version = version + 1
        trip.status = "ready"
        trip.title = itinerary["title"]
        trip.destination_name = itinerary["destination"]["name"]
        trip.image_url = itinerary["destination"]["image_url"]
        s.commit()
    emit(trip_id, "done", "Your plan is ready", 100)


def _fail(trip_id: str, message: str, tweak: str | None) -> None:
    with SessionLocal() as s:
        trip = s.get(Trip, trip_id)
        trip.error = message
        # A failed tweak keeps the previous plan visible.
        trip.status = "ready" if tweak and trip.itinerary else "failed"
        s.commit()
    emit(trip_id, "error", message, 100)


def recover_interrupted() -> None:
    with SessionLocal() as s:
        for trip in s.scalars(select(Trip).where(Trip.status.in_(["queued", "working"]))):
            trip.status = "ready" if trip.itinerary else "failed"
            trip.error = "The server restarted while planning. Please try again."
        s.commit()
