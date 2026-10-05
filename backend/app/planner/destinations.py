from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from ..db import Destination, SessionLocal
from ..research.store import norm
from ..services.geo import resolve_destination, wiki_summary


class UnknownPlace(ValueError):
    pass


def _find(key: str) -> Destination | None:
    with SessionLocal() as s:
        return s.scalar(select(Destination).where(Destination.key == key))


def _remember_alias(row: Destination, typed: str) -> Destination:
    """Keep the name the traveller used ("Bangalore") so research also matches sources that use it."""
    typed = typed.split(",")[0].strip()
    if not typed or norm(typed) == row.key or norm(typed) in {norm(a) for a in (row.aliases or [])}:
        return row
    with SessionLocal() as s:
        fresh = s.get(Destination, row.id)
        fresh.aliases = [*(fresh.aliases or []), typed]
        s.commit()
        return fresh


def get_or_create_destination(name: str) -> Destination:
    if row := _find(norm(name)):
        return row
    info = resolve_destination(name)
    if not info:
        raise UnknownPlace(f"Couldn't find a place called “{name}”. Try the nearest town or city.")
    key = norm(info["name"])
    if row := _find(key):
        return _remember_alias(row, name)

    wiki = wiki_summary(info["name"], must_mention=info["region"] or info["country"]) or wiki_summary(
        f"{info['name']}, {info['region']}"
    )
    typed = name.split(",")[0].strip()
    row = Destination(
        key=key,
        name=info["name"],
        region=info["region"],
        country=info["country"],
        country_code=info["country_code"],
        lat=info["lat"],
        lon=info["lon"],
        population=info["population"],
        elevation=info["elevation"],
        timezone=info["timezone"],
        description=(wiki or {}).get("description", "")[:1500],
        image_url=(wiki or {}).get("image", ""),
        wiki_url=(wiki or {}).get("url", ""),
        aliases=[typed] if norm(typed) != key else [],
        topics={},
    )
    with SessionLocal() as s:
        try:
            s.add(row)
            s.commit()
        except IntegrityError:  # created concurrently by another trip
            s.rollback()
            return _remember_alias(_find(key), name)
    return row
