"""Recent travel vlogs: search, transcripts and (with an API key) top comments."""

import html
import json
import logging
import re
import time
from datetime import datetime, timedelta

import httpx

from ..config import settings
from ..db import utcnow
from ..services.http import RateLimiter, cache_get, cache_key, cache_put, client, get_json

log = logging.getLogger(__name__)

API = "https://www.googleapis.com/youtube/v3"
MAX_AGE_DAYS = 540  # ignore vlogs older than ~18 months

# YouTube blocks IPs that pull many transcripts quickly. Space requests out, and when it does block us,
# stop asking for a while instead of hammering it (which extends the block).
_transcript_limiter = RateLimiter(3.0)
_blocked_until = 0.0
BLOCK_PAUSE_SECONDS = 3600
BLOCK_ERRORS = {"IpBlocked", "RequestBlocked", "TooManyRequests", "YouTubeRequestFailed"}


def transcripts_blocked() -> bool:
    return time.time() < _blocked_until


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def search_videos(query: str, limit: int) -> list[dict]:
    videos: list[dict] = []
    if settings.youtube_api_key:
        try:
            videos = _search_api(query, limit)
        except Exception as e:  # usually the daily quota (search costs 100 of 10,000 units)
            log.warning("YouTube API search failed for %r, using keyless search: %s", query, e)
    if not videos:
        try:
            videos = _search_ytdlp(query, limit)
        except Exception as e:  # network errors or yt-dlp changes - research continues without vlogs
            log.warning("YouTube search failed for %r: %s", query, e)
    return videos[:limit]


def _search_api(query: str, limit: int) -> list[dict]:
    after = (utcnow() - timedelta(days=MAX_AGE_DAYS)).strftime("%Y-%m-%dT%H:%M:%SZ")
    data = get_json(
        f"{API}/search",
        {
            "part": "snippet",
            "q": query,
            "type": "video",
            "maxResults": min(15, limit * 4),
            "order": "relevance",
            "publishedAfter": after,
            "regionCode": "IN",
            "videoDuration": "medium",
            "key": settings.youtube_api_key,
        },
        ttl_hours=72,
    )
    out = []
    for item in data.get("items", []):
        vid = item["id"].get("videoId")
        sn = item.get("snippet", {})
        if vid:
            out.append(
                {
                    "video_id": vid,
                    "title": html.unescape(sn.get("title", "")),  # the API returns HTML-escaped text
                    "channel": html.unescape(sn.get("channelTitle", "")),
                    "published_at": _parse_dt(sn.get("publishedAt")),
                    "url": f"https://www.youtube.com/watch?v={vid}",
                }
            )
    return out


def _search_ytdlp(query: str, limit: int) -> list[dict]:
    key = cache_key("ytsearch", query, limit)
    cached = cache_get(key)
    if cached:
        rows = json.loads(cached)
        for r in rows:
            r["published_at"] = _parse_dt(r["published_at"])
        return rows

    import yt_dlp  # imported lazily: heavy module

    opts = {"quiet": True, "no_warnings": True, "skip_download": True, "extract_flat": True}
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(f"ytsearch{limit * 4}:{query}", download=False)

    out = []
    cutoff = utcnow() - timedelta(days=MAX_AGE_DAYS)
    for e in info.get("entries") or []:
        duration = e.get("duration") or 0
        if not e.get("id") or not (180 <= duration <= 3600):  # skip shorts and live streams
            continue
        published = _upload_date(e["id"])
        if published and published < cutoff:
            continue
        out.append(
            {
                "video_id": e["id"],
                "title": e.get("title", ""),
                "channel": e.get("channel") or e.get("uploader") or "",
                "published_at": published,
                "url": f"https://www.youtube.com/watch?v={e['id']}",
            }
        )
        if len(out) >= limit:
            break
    cache_put(key, json.dumps(out, default=lambda d: d.isoformat() if isinstance(d, datetime) else str(d)), 72)
    return out


def _upload_date(video_id: str) -> datetime | None:
    try:
        html = client.get(f"https://www.youtube.com/watch?v={video_id}", headers={"Accept-Language": "en"}).text
    except httpx.HTTPError:
        return None
    m = re.search(r'"(?:uploadDate|publishDate)":"(\d{4}-\d{2}-\d{2})', html) or re.search(
        r'itemprop="(?:uploadDate|datePublished)" content="(\d{4}-\d{2}-\d{2})', html
    )
    return _parse_dt(m.group(1)) if m else None


def fetch_transcript(video_id: str) -> list[tuple[float, str]] | None:
    """Captions as (start_seconds, text). Prefers English, falls back to Hindi or any language."""
    key = cache_key("transcript", video_id)
    cached = cache_get(key)
    if cached:
        return [tuple(x) for x in json.loads(cached)]

    global _blocked_until
    if transcripts_blocked():
        return None

    from youtube_transcript_api import YouTubeTranscriptApi

    api = YouTubeTranscriptApi()
    snippets = None
    try:
        _transcript_limiter.wait()
        fetched = api.fetch(video_id, languages=["en", "en-IN", "hi", "en-US", "en-GB"])
        snippets = [(s.start, s.text) for s in fetched]
    except Exception as first:
        if type(first).__name__ in BLOCK_ERRORS:
            _blocked_until = time.time() + BLOCK_PAUSE_SECONDS
            log.warning("YouTube is blocking transcript requests (%s); pausing transcripts for an hour", type(first).__name__)
            return None
        try:
            _transcript_limiter.wait()
            for transcript in api.list(video_id):  # no English/Hindi track: take whatever exists
                snippets = [(s.start, s.text) for s in transcript.fetch()]
                break
        except Exception as e:
            log.info("no transcript for %s: %s", video_id, type(e).__name__)
            return None
    if snippets:
        cache_put(key, json.dumps(snippets), 24 * 60)
    return snippets


def fetch_description(video_id: str) -> str:
    """The creator's video description - often lists hotels, prices and routes. Works when transcripts are blocked."""
    if settings.youtube_api_key:
        try:
            data = get_json(f"{API}/videos", {"part": "snippet", "id": video_id, "key": settings.youtube_api_key}, ttl_hours=24 * 30)
            items = data.get("items") or []
            return (items[0]["snippet"].get("description") or "") if items else ""
        except httpx.HTTPError:
            pass
    try:
        html = client.get(f"https://www.youtube.com/watch?v={video_id}", headers={"Accept-Language": "en"}).text
    except httpx.HTTPError:
        return ""
    m = re.search(r'"shortDescription":"((?:[^"\\]|\\.)*)"', html)
    if not m:
        return ""
    try:
        return json.loads(f'"{m.group(1)}"')
    except json.JSONDecodeError:
        return ""


def fetch_comments(video_id: str, max_results: int = 80) -> list[dict]:
    """Top comments. Needs YOUTUBE_API_KEY (1 quota unit per call)."""
    if not settings.youtube_api_key:
        return []
    try:
        data = get_json(
            f"{API}/commentThreads",
            {
                "part": "snippet",
                "videoId": video_id,
                "maxResults": min(100, max_results),
                "order": "relevance",
                "textFormat": "plainText",
                "key": settings.youtube_api_key,
            },
            ttl_hours=24 * 7,
        )
    except httpx.HTTPError:  # comments disabled or quota exhausted
        return []
    out = []
    for item in data.get("items", []):
        sn = item["snippet"]["topLevelComment"]["snippet"]
        out.append(
            {
                "text": sn.get("textDisplay", ""),
                "likes": sn.get("likeCount", 0),
                "published_at": _parse_dt(sn.get("publishedAt")),
            }
        )
    return out
