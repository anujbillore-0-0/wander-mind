"""Evidence storage and aggregation.

Claims are stored one per source. At planning time they are combined per entity into a price
range weighted towards recent sources, a few key facts and a source count, which becomes a
compact digest the planner can fit in a small prompt.
"""

import re
import threading
import unicodedata
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime

from rapidfuzz import fuzz
from sqlalchemy import select

from ..db import Claim, Destination, Entity, SessionLocal, Source, utcnow

_store_lock = threading.Lock()

GENERIC_NAMES = {
    "street food", "food", "hotel", "hotels", "restaurant", "restaurants", "market", "temple", "temples",
    "auto", "autos", "auto rickshaw", "cab", "cabs", "taxi", "bus", "train", "station", "railway station",
    "airport", "city", "local market", "dhaba", "cafe", "cafes", "hostel", "hostels", "homestay", "local food",
    "shops", "mall", "lake", "river", "beach", "fort", "palace", "museum", "park", "garden", "old city",
}

HALF_LIFE_DAYS = 180


def norm(name: str) -> str:
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    s = re.sub(r"\b(the|shri|shree|sri)\b", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def _compatible(a: str, b: str) -> bool:
    food_like = {"food", "nightlife"}
    return a == b or (a in food_like and b in food_like) or "general" in (a, b)


def _same_entity(n: str, etype: str, e: Entity) -> bool:
    if not _compatible(etype, e.type):
        return False
    if fuzz.ratio(n, e.norm_name) >= 88:
        return True
    short, long_ = sorted((n, e.norm_name), key=len)
    return (
        fuzz.token_set_ratio(n, e.norm_name) == 100
        and len(short.split()) >= 2
        and len(short) / max(len(long_), 1) >= 0.6
    )


def save_source_claims(destination: Destination, source_fields: dict, claims: list[dict]) -> int:
    """Store one source and its claims. Returns the number of claims saved."""
    dest_norm = norm(destination.name)
    with _store_lock, SessionLocal() as s:
        existing = s.scalar(
            select(Source).where(Source.kind == source_fields["kind"], Source.external_id == source_fields["external_id"])
        )
        if existing:
            return 0
        src = Source(destination_id=destination.id, **source_fields)
        s.add(src)
        s.flush()

        entities = list(s.scalars(select(Entity).where(Entity.destination_id == destination.id)))
        saved = 0
        for c in claims:
            entity = None
            if c["entity"]:
                n = norm(c["entity"])
                if len(n) >= 3 and n not in GENERIC_NAMES and n != dest_norm:
                    entity = next((e for e in entities if _same_entity(n, c["type"], e)), None)
                    if entity is None:
                        entity = Entity(
                            destination_id=destination.id,
                            name=c["entity"],
                            norm_name=n,
                            type=c["type"] if c["type"] != "general" else "attraction",
                            area=c["area"],
                        )
                        s.add(entity)
                        s.flush()
                        entities.append(entity)
                    entity.mention_count += 1
                    entity.last_seen = utcnow()
                    if not entity.area and c["area"]:
                        entity.area = c["area"]
            s.add(
                Claim(
                    destination_id=destination.id,
                    entity_id=entity.id if entity else None,
                    source_id=src.id,
                    claim_type=c["claim"],
                    item=c["item"],
                    price_min=c["price_min"],
                    price_max=c["price_max"],
                    unit=c["unit"],
                    text=c["text"],
                    quote=c["quote"],
                    t_seconds=c["t"],
                    published_at=source_fields.get("published_at"),
                )
            )
            saved += 1
        src.claim_count = saved
        s.commit()
        return saved


# ------------------------------------------------------------------ aggregation


@dataclass
class EntityAgg:
    ref: str
    id: int
    destination_id: int
    name: str
    type: str
    area: str
    lat: float | None
    lon: float | None
    image_url: str
    price_min: float | None = None
    price_max: float | None = None
    unit: str = ""
    price_kinds: set[str] = field(default_factory=set)  # source kinds behind the headline price
    price_sources: int = 0  # how many sources the headline price rests on
    items: list[tuple[str, float, float, str]] = field(default_factory=list)
    facts: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    quotes: list[dict] = field(default_factory=list)
    source_ids: list[int] = field(default_factory=list)
    latest: datetime | None = None
    score: float = 0.0


@dataclass
class TipAgg:
    ref: str
    type: str
    text: str
    source_ids: list[int]
    latest: datetime | None
    count: int


def _weight(when: datetime | None) -> float:
    if when is None:
        return 0.35
    age = max((utcnow() - when).days, 0)
    return 0.5 ** (age / HALF_LIFE_DAYS)


def _weighted_median(values: list[tuple[float, float]]) -> float:
    values = sorted(values)
    total = sum(w for _, w in values)
    acc = 0.0
    for v, w in values:
        acc += w
        if acc >= total / 2:
            return v
    return values[-1][0]


# Prices that aren't what a resident traveller pays to get in or eat.
EXTRA_FEE_RE = re.compile(r"foreign|camera|video|parking|locker|guide fee|penalty|fine\b|light and sound|laser show", re.I)
ENTRY_RE = re.compile(r"entry|ticket|admission|entrance", re.I)
# First-hand accounts beat listicles, which are often SEO filler.
SOURCE_TRUST = {"user": 1.5, "youtube": 1.0, "youtube_comments": 1.0, "reddit": 1.0, "web": 0.3}
UNIT_FAMILY = {"entry": "person", "person": "person", "plate": "item", "item": "item"}


def _headline_price(claims: list[Claim], sources: dict[int, Source], when) -> tuple[str, float, float, set[str], int]:
    """One vote per source (its own median), then a trust- and recency-weighted median across sources."""
    groups: dict[str, dict[int, list[Claim]]] = defaultdict(lambda: defaultdict(list))
    for c in claims:
        groups[UNIT_FAMILY.get(c.unit or "item", c.unit)][c.source_id].append(c)

    def source_weight(sid: int, cs: list[Claim]) -> float:
        kind = sources[sid].kind if sid in sources else "web"
        # Trust matters more than a few months of age: blend recency in at half strength.
        return SOURCE_TRUST.get(kind, 0.3) * (0.5 + 0.5 * max(_weight(when(c)) for c in cs))

    unit = max(groups, key=lambda u: sum(source_weight(sid, cs) for sid, cs in groups[u].items()))
    votes_min, votes_max, kinds = [], [], set()
    for sid, cs in groups[unit].items():
        w = source_weight(sid, cs)
        votes_min.append((sorted(c.price_min for c in cs)[len(cs) // 2], w))
        votes_max.append((sorted(c.price_max for c in cs)[len(cs) // 2], w))
        kinds.add(sources[sid].kind if sid in sources else "web")
    lo = _weighted_median(votes_min)
    return unit, lo, max(lo, _weighted_median(votes_max)), kinds, len(groups[unit])


def build_evidence(destination_ids: list[int]):
    """Return (entities by ref, general tips, sources by id) for the given destinations."""
    with SessionLocal() as s:
        entities = list(s.scalars(select(Entity).where(Entity.destination_id.in_(destination_ids))))
        claims = list(s.scalars(select(Claim).where(Claim.destination_id.in_(destination_ids))))
        sources = {src.id: src for src in s.scalars(select(Source).where(Source.destination_id.in_(destination_ids)))}

    by_entity: dict[int, list[Claim]] = defaultdict(list)
    general: list[Claim] = []
    for c in claims:
        (by_entity[c.entity_id] if c.entity_id else general).append(c)

    aggs: dict[str, EntityAgg] = {}
    for e in entities:
        cs = by_entity.get(e.id, [])
        if not cs:
            continue
        when = lambda c: c.published_at or c.created_at  # noqa: E731
        agg = EntityAgg(
            ref=f"E{e.id}", id=e.id, destination_id=e.destination_id, name=e.name, type=e.type,
            area=e.area, lat=e.lat, lon=e.lon, image_url=e.image_url if e.image_url != "-" else "",
        )
        src_ids = sorted({c.source_id for c in cs})
        agg.source_ids = src_ids
        agg.latest = max((when(c) for c in cs), default=None)
        agg.score = sum(_weight(max((when(c) for c in cs if c.source_id == sid), default=None)) for sid in src_ids)
        agg.score += 0.1 * e.mention_count

        priced = [c for c in cs if c.price_min is not None]
        is_extra = EXTRA_FEE_RE.search(e.name)  # e.g. the light-and-sound show is itself the attraction
        headline = [c for c in priced if is_extra or not EXTRA_FEE_RE.search(f"{c.item} {c.text}")]
        if e.type in ("attraction", "activity") and any(ENTRY_RE.search(c.item) for c in headline):
            headline = [c for c in headline if ENTRY_RE.search(c.item)]
        if headline:
            agg.unit, agg.price_min, agg.price_max, agg.price_kinds, agg.price_sources = _headline_price(headline, sources, when)
        if priced:
            per_item: dict[str, list[Claim]] = defaultdict(list)
            for c in priced:
                if c.item:
                    per_item[norm(c.item)].append(c)
            ranked = sorted(per_item.values(), key=lambda g: -len(g))[:3]
            agg.items = [
                (g[0].item, min(c.price_min for c in g), max(c.price_max for c in g), g[0].unit or "item") for g in ranked
            ]

        recent_first = sorted(cs, key=lambda c: when(c) or datetime.min, reverse=True)
        seen: list[str] = []
        for c in recent_first:
            if c.claim_type == "price" or not c.text:
                continue
            if any(fuzz.ratio(c.text.lower(), t.lower()) > 80 for t in seen):
                continue
            seen.append(c.text)
            (agg.warnings if c.claim_type in ("warning", "scam", "closure") else agg.facts).append(c.text)
        agg.facts, agg.warnings = agg.facts[:3], agg.warnings[:2]
        for c in recent_first[:6]:
            if c.quote or c.text:
                agg.quotes.append({"text": c.text, "quote": c.quote, "source_id": c.source_id, "t": c.t_seconds})
            if len(agg.quotes) >= 3:
                break
        aggs[agg.ref] = agg

    tips: list[TipAgg] = []
    for c in sorted(general, key=lambda c: c.published_at or c.created_at, reverse=True):
        if not c.text:
            continue
        dup = next((t for t in tips if fuzz.token_set_ratio(c.text.lower(), t.text.lower()) > 82), None)
        if dup:
            dup.count += 1
            if c.source_id not in dup.source_ids:
                dup.source_ids.append(c.source_id)
            continue
        tips.append(TipAgg(f"T{c.id}", c.claim_type, c.text, [c.source_id], c.published_at or c.created_at, 1))
    tips.sort(key=lambda t: (-t.count, -(t.latest.timestamp() if t.latest else 0)))
    return aggs, tips[:40], sources


def price_text(min_v: float | None, max_v: float | None, unit: str = "") -> str:
    if min_v is None:
        return ""
    lo, hi = int(round(min_v)), int(round(max_v or min_v))
    core = f"₹{lo}" if lo == hi else f"₹{lo}–{hi}"
    return f"{core}/{unit}" if unit and unit != "total" else core


TYPE_QUOTAS = {
    "attraction": 22, "food": 22, "stay": 10, "activity": 10, "transport": 8,
    "shopping": 6, "nightlife": 6, "area": 6, "event": 5,
}


def digest(aggs: dict[str, EntityAgg], tips: list[TipAgg], max_chars: int = 6500, tip_chars: int = 1600) -> tuple[str, str]:
    """Compact, ranked evidence lines for the planner prompt."""
    by_type: dict[str, list[EntityAgg]] = defaultdict(list)
    for a in aggs.values():
        by_type[a.type].append(a)
    lines: list[str] = []
    # Interleave types so a size cut never drops a whole category.
    queues = {t: sorted(v, key=lambda a: -a.score)[: TYPE_QUOTAS.get(t, 4)] for t, v in by_type.items()}
    while any(queues.values()):
        for t in list(queues):
            if queues[t]:
                a = queues[t].pop(0)
                parts = [a.ref, a.type, a.name + (f" ({a.area})" if a.area else "")]
                # A single listicle's entry fee is too shaky to show the planner; let it estimate instead.
                shaky = a.type in ("attraction", "activity") and a.price_kinds <= {"web"} and a.price_sources == 1
                pt = "" if shaky else price_text(a.price_min, a.price_max, a.unit)
                if a.items and not shaky:
                    pt += (" " if pt else "") + "; ".join(
                        f"{i[0]} {price_text(i[1], i[2])}" for i in a.items[:2]
                    )
                parts.append(pt or "no price seen")
                parts.append(f"{len(a.source_ids)} src{', ' + a.latest.strftime('%b %Y') if a.latest else ''}")
                notes = "; ".join((a.warnings[:1] + a.facts[:2]))
                if notes:
                    parts.append(notes[:160])
                lines.append(" | ".join(parts))
    text, used = [], 0
    for line in lines:
        if used + len(line) > max_chars:
            break
        text.append(line)
        used += len(line) + 1

    tip_lines, used = [], 0
    for t in tips:
        line = f"{t.ref} {t.type}: {t.text}"
        if used + len(line) > tip_chars:
            break
        tip_lines.append(line)
        used += len(line) + 1
    return "\n".join(text), "\n".join(tip_lines)
