"""Reddit threads via app-only OAuth (REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET).

Reddit redirects anonymous JSON requests to a login page, so without credentials Reddit is skipped.
"""

import logging
import threading
import time
from datetime import datetime, timezone

import httpx

from ..config import settings
from ..services.http import RateLimiter, client, get_json

log = logging.getLogger(__name__)

_limiter = RateLimiter(1.0)
_token_lock = threading.Lock()
_token: dict = {"value": "", "expires": 0.0}


def enabled() -> bool:
    return bool(settings.reddit_client_id and settings.reddit_client_secret)


def _auth() -> tuple[str, dict]:
    with _token_lock:
        if time.time() > _token["expires"] - 60:
            resp = client.post(
                "https://www.reddit.com/api/v1/access_token",
                auth=(settings.reddit_client_id, settings.reddit_client_secret),
                data={"grant_type": "client_credentials"},
            )
            resp.raise_for_status()
            body = resp.json()
            _token.update(value=body["access_token"], expires=time.time() + body.get("expires_in", 3600))
        return "https://oauth.reddit.com", {"Authorization": f"Bearer {_token['value']}"}


def _ts(value) -> datetime | None:
    try:
        return datetime.fromtimestamp(float(value), tz=timezone.utc).replace(tzinfo=None)
    except (TypeError, ValueError):
        return None


def search_threads(query: str, needles: list[str], limit: int) -> list[dict]:
    if not enabled():
        return []
    try:
        base, headers = _auth()
        results: list[dict] = []
        for window in ("year", "all"):
            data = get_json(
                f"{base}/search",
                {"q": query, "sort": "relevance", "t": window, "limit": 25, "type": "link", "raw_json": 1},
                headers=headers,
                ttl_hours=72,
                limiter=_limiter,
            )
            posts = [c["data"] for c in data.get("data", {}).get("children", [])]
            for p in posts:
                text = f"{p.get('title', '')} {p.get('selftext', '')}".lower()
                if any(n in text for n in needles) and p.get("num_comments", 0) >= 3 and p.get("permalink"):
                    results.append(
                        {
                            "id": p["id"],
                            "title": p.get("title", ""),
                            "permalink": p["permalink"],
                            "url": "https://www.reddit.com" + p["permalink"],
                            "subreddit": p.get("subreddit", ""),
                            "author": p.get("author", ""),
                            "created": _ts(p.get("created_utc")),
                            "score": p.get("score", 0) + 2 * p.get("num_comments", 0),
                        }
                    )
            if len(results) >= limit:
                break
        seen, unique = set(), []
        for r in sorted(results, key=lambda r: -r["score"]):
            if r["id"] not in seen:
                seen.add(r["id"])
                unique.append(r)
        return unique[:limit]
    except (httpx.HTTPError, KeyError, ValueError) as e:
        log.warning("Reddit search failed for %r: %s", query, e)
        return []


def fetch_thread(permalink: str) -> dict | None:
    if not enabled():
        return None
    try:
        base, headers = _auth()
        path = permalink.rstrip("/")
        data = get_json(
            f"{base}{path}",
            {"limit": 100, "sort": "top", "depth": 3, "raw_json": 1},
            headers=headers,
            ttl_hours=24 * 7,
            limiter=_limiter,
        )
    except (httpx.HTTPError, ValueError) as e:
        log.warning("Reddit thread failed %s: %s", permalink, e)
        return None

    post = data[0]["data"]["children"][0]["data"]
    comments: list[dict] = []

    def walk(children, depth=0):
        for c in children:
            if c.get("kind") != "t1":
                continue
            d = c["data"]
            body = d.get("body", "")
            if body and body not in ("[deleted]", "[removed]"):
                comments.append({"text": body, "score": d.get("score", 0), "created": _ts(d.get("created_utc"))})
            replies = d.get("replies")
            if depth < 2 and isinstance(replies, dict):
                walk(replies["data"]["children"], depth + 1)

    walk(data[1]["data"]["children"])
    comments.sort(key=lambda c: -c["score"])
    return {"title": post.get("title", ""), "text": post.get("selftext", ""), "comments": comments[:50]}
