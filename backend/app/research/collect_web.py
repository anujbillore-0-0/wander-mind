"""Blogs, forums and news via the self-hosted SearXNG metasearch, with text extracted by trafilatura."""

import logging
from datetime import datetime
from urllib.parse import urlparse

import httpx

from ..config import settings
from ..services.http import client, get_json, get_text

log = logging.getLogger(__name__)

# Social networks, booking sites and search pages: login walls or listings, not traveller writing.
SKIP_DOMAINS = (
    "youtube.com", "youtu.be", "reddit.com", "instagram.com", "facebook.com", "x.com", "twitter.com",
    "pinterest.", "tiktok.com", "linkedin.com", "quora.com", "booking.com", "agoda.", "makemytrip.com",
    "goibibo.com", "tripadvisor.", "airbnb.", "google.", "amazon.", "flipkart.", "justdial.com",
    "zomato.com", "swiggy.com", "magicpin.", "expedia.", "trivago.",
)


def searxng_available() -> bool:
    try:
        return client.get(f"{settings.searxng_url}/healthz", timeout=3).status_code == 200
    except httpx.HTTPError:
        return False


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def search_web(query: str, limit: int) -> list[dict] | None:
    """None means search is unavailable (SearXNG not running) rather than 'no results'."""
    results: list[dict] = []
    seen: set[str] = set()
    for time_range in ("year", ""):
        params = {"q": query, "format": "json", "language": "en", "safesearch": 1}
        if time_range:
            params["time_range"] = time_range
        try:
            data = get_json(f"{settings.searxng_url}/search", params, ttl_hours=72, timeout=30)
        except (httpx.HTTPError, ValueError) as e:
            log.warning("SearXNG unavailable: %s", e)
            return None
        for r in data.get("results", []):
            url = r.get("url", "")
            host = urlparse(url).netloc.lower()
            if not url or url in seen or any(d in host for d in SKIP_DOMAINS) or url.lower().endswith(".pdf"):
                continue
            seen.add(url)
            results.append(
                {
                    "url": url,
                    "title": r.get("title", ""),
                    "snippet": r.get("content", ""),
                    "published": _parse_dt(r.get("publishedDate")),
                }
            )
        if len(results) >= limit:
            break
    return results[:limit]


def fetch_page(url: str) -> dict | None:
    import trafilatura

    try:
        html = get_text(url, ttl_hours=24 * 14)
    except (httpx.HTTPError, ValueError) as e:
        log.info("page fetch failed %s: %s", url, e)
        return None
    text = trafilatura.extract(html, include_comments=True, include_tables=True, favor_recall=True) or ""
    if len(text) < 400:
        return None
    meta = trafilatura.extract_metadata(html)
    return {
        "text": text,
        "title": (meta.title if meta else "") or "",
        "author": (meta.author if meta else "") or (meta.sitename if meta else "") or urlparse(url).netloc,
        "published": _parse_dt(meta.date) if meta and meta.date else None,
    }
