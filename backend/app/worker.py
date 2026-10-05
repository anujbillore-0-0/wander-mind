"""Background refresher: keeps evidence fresh for seeded destinations and places people plan trips to.

It shares the LLM quota with live planning, so it is deliberately polite: it starts late, and it
pauses whenever a traveller's trip is being planned. Run with `python -m app.worker`.
"""

import logging
import time
from datetime import date, timedelta

from sqlalchemy import func, select

from .config import settings
from .db import SessionLocal, Trip, init_db, utcnow
from .llm import LLMUnavailable
from .planner.destinations import get_or_create_destination
from .research.pipeline import research

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("worker")


def travellers_planning() -> bool:
    with SessionLocal() as s:
        return bool(s.scalar(select(func.count(Trip.id)).where(Trip.status.in_(["queued", "working"]))))


def _polite_emit(stage: str, message: str, pct: int) -> None:
    log.info("%3d%% %s", pct, message)
    if travellers_planning():
        log.info("A traveller is planning a trip - pausing background research")
        while travellers_planning():
            time.sleep(10)
        log.info("Resuming background research")


def destinations_to_refresh() -> list[str]:
    names = [n.strip() for n in settings.seed_destinations.split(",") if n.strip()]
    since = utcnow() - timedelta(days=60)
    with SessionLocal() as s:
        for trip in s.scalars(select(Trip).where(Trip.created_at >= since)):
            names += (trip.request or {}).get("destinations", [])
    return list(dict.fromkeys(n.strip() for n in names if n.strip()))


def run_once() -> None:
    month = (date.today() + timedelta(days=30)).month  # get next month's season ready
    for name in destinations_to_refresh():
        try:
            _polite_emit("research", f"Checking {name}", 0)
            dest = get_or_create_destination(name)
            result = research(dest, [], month, _polite_emit)
            if result["new_sources"]:
                log.info("%s: %d new sources, %d new facts", dest.name, result["new_sources"], result["new_claims"])
        except LLMUnavailable as e:
            log.warning("LLM quota exhausted, stopping this round: %s", e)
            return
        except Exception:
            log.exception("refresh failed for %s", name)


def main() -> None:
    init_db()
    log.info("Worker started; first refresh in %.0f min", settings.worker_start_delay_minutes)
    time.sleep(settings.worker_start_delay_minutes * 60)
    while True:
        run_once()
        time.sleep(settings.worker_interval_hours * 3600)


if __name__ == "__main__":
    main()
