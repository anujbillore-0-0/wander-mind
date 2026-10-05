"""Places, coordinates, distances and photos - all from free OpenStreetMap / Open-Meteo / Wikipedia APIs."""

import logging
import re
from math import asin, cos, radians, sin, sqrt
from urllib.parse import quote, quote_plus

import httpx

from .http import RateLimiter, get_json

log = logging.getLogger(__name__)

_nominatim = RateLimiter(1.1)
_photon = RateLimiter(0.25)


def haversine_km(a_lat: float, a_lon: float, b_lat: float, b_lon: float) -> float:
    d_lat, d_lon = radians(b_lat - a_lat), radians(b_lon - a_lon)
    h = sin(d_lat / 2) ** 2 + cos(radians(a_lat)) * cos(radians(b_lat)) * sin(d_lon / 2) ** 2
    return 2 * 6371 * asin(sqrt(h))


def maps_url(*parts: str) -> str:
    query = ", ".join(p for p in parts if p)
    return "https://www.google.com/maps/search/?api=1&query=" + quote_plus(query)


def search_places(query: str, count: int = 6) -> list[dict]:
    """City/town search for autocomplete and destination lookup (Open-Meteo geocoding)."""
    if len(query.strip()) < 2:
        return []
    data = get_json(
        "https://geocoding-api.open-meteo.com/v1/search",
        {"name": query.strip(), "count": count, "language": "en", "format": "json"},
        ttl_hours=24 * 30,
    )
    return [
        {
            "name": r["name"],
            "region": r.get("admin1", ""),
            "country": r.get("country", ""),
            "country_code": r.get("country_code", ""),
            "lat": r["latitude"],
            "lon": r["longitude"],
            "population": r.get("population"),
            "elevation": r.get("elevation"),
            "timezone": r.get("timezone", ""),
        }
        for r in data.get("results") or []
    ]


_nominatim_blocked = False


def nominatim_search(query: str, *, viewbox: tuple[float, float, float, float] | None = None, limit: int = 1) -> list[dict]:
    global _nominatim_blocked
    if _nominatim_blocked:
        return []
    params = {"q": query, "format": "jsonv2", "limit": limit, "addressdetails": 1, "extratags": 1}
    if viewbox:
        params["viewbox"] = ",".join(str(v) for v in viewbox)  # left,top,right,bottom
        params["bounded"] = 1
    try:
        return get_json("https://nominatim.openstreetmap.org/search", params, ttl_hours=24 * 90, limiter=_nominatim)
    except httpx.HTTPError as e:
        if isinstance(e, httpx.HTTPStatusError) and e.response.status_code == 403:
            _nominatim_blocked = True  # usage policy block: stop asking for the rest of this run
            log.warning("Nominatim refused requests (403); falling back to Photon only")
        else:
            log.warning("nominatim failed for %r: %s", query, e)
        return []


# How likely each OSM place kind is to be the destination someone means.
PLACE_WEIGHT = {
    "city": 5.0, "town": 4.5, "state": 4.0, "province": 4.0, "region": 3.8, "county": 3.6, "administrative": 3.6,
    "island": 3.5, "archipelago": 3.5, "district": 3.0, "municipality": 3.0, "valley": 3.0, "national_park": 2.6,
    "nature_reserve": 2.2, "village": 2.0, "locality": 1.8, "suburb": 1.2, "neighbourhood": 1.0, "hamlet": 0.6,
}
# Rough population when the geocoder doesn't say - only used to guess ride-app coverage.
NATURAL = {"national_park", "nature_reserve", "valley", "island", "archipelago"}
POPULATION_GUESS = {"city": 500_000, "town": 60_000, "village": 5_000, "hamlet": 1_000, **{k: 10_000 for k in NATURAL}}


def _simple(s: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", "", s.lower()).strip()


def rank_photon(features: list[dict], query: str) -> dict | None:
    """Pick the most plausible destination from Photon results: big places, exact names, India first."""
    q = _simple(query.split(",")[0])
    best, best_score = None, 0.0
    for i, f in enumerate(features):
        p = f.get("properties", {})
        kind = p.get("osm_value") or p.get("type") or ""
        if p.get("type") in ("house", "street") and kind not in NATURAL:
            continue
        weight = PLACE_WEIGHT.get(kind, 0.0)
        if not weight:
            continue
        name = _simple(p.get("name", ""))
        score = weight + (1.0 if name == q else 0.4 if q in name or name in q else 0.0)
        score += 0.8 if p.get("countrycode") == "IN" else 0.0
        score -= 0.15 * i  # Photon's own ranking breaks ties
        if score > best_score:
            best, best_score = f, score
    return best


def _photon_destination(query: str) -> dict | None:
    data = get_json("https://photon.komoot.io/api/", {"q": query, "limit": 8, "lang": "en"}, ttl_hours=24 * 30, limiter=_photon)
    f = rank_photon(data.get("features", []), query)
    if not f:
        return None
    p = f["properties"]
    lon, lat = f["geometry"]["coordinates"][:2]
    kind = p.get("osm_value") or p.get("type") or ""
    # For parks and natural features, keep the name the traveller used ("Spiti Valley", not "Pin Valley National Park").
    name = query.split(",")[0].strip().title() if kind in NATURAL and _simple(query) not in _simple(p.get("name", "")) else p.get("name", query)
    return {
        "name": name,
        "region": p.get("state", "") if p.get("state") != p.get("name") else "",
        "country": p.get("country", ""),
        "country_code": (p.get("countrycode") or "").upper(),
        "lat": float(lat),
        "lon": float(lon),
        "kind": kind,
        "population": None,
        "elevation": None,
        "timezone": "",
    }


def _elevation(lat: float, lon: float) -> float | None:
    try:
        data = get_json("https://api.open-meteo.com/v1/elevation", {"latitude": round(lat, 4), "longitude": round(lon, 4)}, ttl_hours=24 * 365)
        return float((data.get("elevation") or [None])[0])
    except (httpx.HTTPError, TypeError, ValueError):
        return None


def resolve_destination(name: str) -> dict | None:
    """Best match for a destination name. Handles renamed cities ("Bangalore"), states, regions and islands."""
    try:
        place = _photon_destination(name)
    except httpx.HTTPError as e:
        log.warning("photon failed for %r: %s", name, e)
        place = None

    try:
        cities = search_places(place["name"] if place else name, 8)
    except httpx.HTTPError:
        cities = []

    if place is None:
        if not cities:
            return None
        exact = [c for c in cities if _simple(c["name"]) == _simple(name)] or cities
        return max(exact, key=lambda c: c["population"] or 0)

    # Borrow population/elevation/timezone from the matching city record, if there is one nearby.
    near = [c for c in cities if haversine_km(place["lat"], place["lon"], c["lat"], c["lon"]) < 40]
    if near:
        c = max(near, key=lambda c: c["population"] or 0)
        place.update(population=c["population"], elevation=c["elevation"], timezone=c["timezone"])
    if place["population"] is None:
        place["population"] = POPULATION_GUESS.get(place["kind"], 150_000)
    if place["elevation"] is None:
        place["elevation"] = _elevation(place["lat"], place["lon"])
    place.pop("kind")
    return place


def geocode_poi(name: str, area: str, city: str, lat: float, lon: float, radius_km: float = 45) -> tuple[float, float] | None:
    """Find a point of interest near a destination. Photon first (location-biased), Nominatim as fallback."""
    queries = [q for q in (f"{name}, {area}, {city}" if area else "", f"{name}, {city}", name) if q]
    for q in queries:
        try:
            data = get_json(
                "https://photon.komoot.io/api/",
                {"q": q, "lat": lat, "lon": lon, "limit": 3, "lang": "en"},
                ttl_hours=24 * 90,
                limiter=_photon,
            )
        except httpx.HTTPError:
            break
        for feat in data.get("features", []):
            f_lon, f_lat = feat["geometry"]["coordinates"][:2]
            if haversine_km(lat, lon, f_lat, f_lon) <= radius_km:
                return f_lat, f_lon

    box = (lon - 0.45, lat + 0.45, lon + 0.45, lat - 0.45)
    for q in queries[:2]:
        hits = nominatim_search(q, viewbox=box)
        if hits:
            return float(hits[0]["lat"]), float(hits[0]["lon"])
    return None


def _sized_image(summary: dict, width: int = 1280) -> str:
    original = summary.get("originalimage") or {}
    if original.get("source") and original.get("width", 99999) <= 2400:
        return original["source"]
    thumb = (summary.get("thumbnail") or {}).get("source", "")
    return re.sub(r"/\d+px-", f"/{width}px-", thumb) if thumb else ""


def wiki_summary(title: str, must_mention: str = "") -> dict | None:
    """Wikipedia summary + lead image. `must_mention` guards against same-name pages elsewhere."""
    url = "https://en.wikipedia.org/api/rest_v1/page/summary/" + quote(title.replace(" ", "_"), safe="")
    try:
        data = get_json(url, ttl_hours=24 * 30)
    except httpx.HTTPError:
        return None
    if data.get("type") == "disambiguation":
        return None
    extract = data.get("extract", "")
    if must_mention and must_mention.lower() not in (extract + data.get("description", "")).lower():
        return None
    return {
        "description": extract,
        "image": _sized_image(data),
        "url": ((data.get("content_urls") or {}).get("desktop") or {}).get("page", ""),
    }
