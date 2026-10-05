"""Shared HTTP client with a database-backed response cache and polite rate limiting."""

import hashlib
import json
import threading
import time
from datetime import timedelta

import httpx
from sqlalchemy.exc import IntegrityError

from ..config import settings
from ..db import HttpCache, SessionLocal, utcnow

client = httpx.Client(
    timeout=httpx.Timeout(20.0, connect=10.0),
    headers={"User-Agent": settings.user_agent, "Accept-Language": "en-IN,en;q=0.9,hi;q=0.8"},
    follow_redirects=True,
)


class RateLimiter:
    """At most one request per `interval` seconds (Nominatim's policy is 1/s)."""

    def __init__(self, interval: float):
        self.interval = interval
        self._lock = threading.Lock()
        self._last = 0.0

    def wait(self) -> None:
        with self._lock:
            delay = self._last + self.interval - time.monotonic()
            if delay > 0:
                time.sleep(delay)
            self._last = time.monotonic()


def cache_key(*parts) -> str:
    return hashlib.sha1(json.dumps(parts, sort_keys=True, default=str).encode()).hexdigest()


def cache_get(key: str) -> str | None:
    with SessionLocal() as s:
        row = s.get(HttpCache, key)
        if row and row.expires_at > utcnow():
            return row.value
    return None


def cache_put(key: str, value: str, ttl_hours: float) -> None:
    value = value.replace("\x00", "")  # Postgres text columns reject NUL bytes
    with SessionLocal() as s:
        try:
            s.merge(HttpCache(key=key, value=value, expires_at=utcnow() + timedelta(hours=ttl_hours)))
            s.commit()
        except IntegrityError:  # another thread cached it first
            s.rollback()


def get_json(
    url: str,
    params: dict | None = None,
    *,
    ttl_hours: float = 24,
    headers: dict | None = None,
    timeout: float | None = None,
    limiter: RateLimiter | None = None,
):
    key = cache_key(url, params or {})
    if ttl_hours > 0 and (cached := cache_get(key)) is not None:
        return json.loads(cached)
    if limiter:
        limiter.wait()
    resp = client.get(url, params=params, headers=headers, timeout=timeout or client.timeout)
    resp.raise_for_status()
    data = resp.json()
    if ttl_hours > 0:
        cache_put(key, json.dumps(data), ttl_hours)
    return data


def get_text(url: str, *, ttl_hours: float = 24, headers: dict | None = None, max_bytes: int = 4_000_000) -> str:
    key = cache_key("text", url)
    if ttl_hours > 0 and (cached := cache_get(key)) is not None:
        return cached
    resp = client.get(url, headers=headers)
    resp.raise_for_status()
    ctype = resp.headers.get("content-type", "")
    if "html" not in ctype and "text" not in ctype:
        raise ValueError(f"not a text page ({ctype})")
    text = resp.text[:max_bytes].replace("\x00", "")
    if ttl_hours > 0:
        cache_put(key, text, ttl_hours)
    return text
