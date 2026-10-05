"""Research run for one destination: pick stale topics, collect sources, extract claims, store them."""

import logging
import re
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Callable

from sqlalchemy import select

from ..config import settings
from ..db import Destination, SessionLocal, Source, utcnow
from ..llm import LLMUnavailable
from ..services.weather import MONTHS
from . import collect_reddit, collect_web, collect_youtube
from .extract import article_chunks, comment_chunks, extract_claims, transcript_chunks
from .store import norm, save_source_claims

log = logging.getLogger(__name__)

Emit = Callable[[str, str, int], None]

CORE_TOPICS = {
    "overview": ("{d} travel vlog {y}", "{d} itinerary places to visit", "trip itinerary"),
    "food": ("{d} street food prices {y}", "{d} famous food must try where to eat", "food"),
    "budget": ("{d} trip budget total cost {y}", "{d} budget trip cost breakdown", "budget"),
    "stay": ("{d} where to stay budget hotel hostel", "{d} best area to stay hotel price", "stay hotel"),
    "transport": ("{d} local transport auto rapido fare", "how to reach and get around {d} local transport", "transport"),
}
VIBE_TOPICS = {
    "adventure": "{d} adventure activities price",
    "nature": "{d} nature spots waterfalls viewpoints",
    "spiritual": "{d} temples darshan timings",
    "culture": "{d} heritage history places guide",
    "nightlife": "{d} nightlife cafes bars",
    "shopping": "{d} shopping markets what to buy",
    "offbeat": "{d} hidden gems offbeat places",
    "photography": "{d} best photo spots",
    "romantic": "{d} couple places romantic",
    "wellness": "{d} yoga wellness retreat price",
}


@dataclass
class Doc:
    kind: str
    external_id: str
    url: str
    title: str
    author: str
    published_at: datetime | None
    topic: str
    chunks: list[str] = field(default_factory=list)


GENERIC_WORDS = {"valley", "city", "district", "hills", "hill", "beach", "island", "state", "national", "park", "lake", "mount", "fort", "nagar", "town", "old", "new"}


def destination_needles(dest: Destination) -> list[str]:
    """Names a source may use for this place: official name, what travellers typed, distinctive words."""
    names = {norm(dest.name), *(norm(a) for a in (dest.aliases or []))}
    needles = {n for n in names if len(n) >= 3}
    for n in list(needles):
        needles.update(w for w in n.split() if len(w) >= 5 and w not in GENERIC_WORDS)
    return sorted(needles)


def mentions(text: str, needles: list[str]) -> bool:
    t = norm(text)
    return any(re.search(rf"\b{re.escape(n)}\b", t) for n in needles)


def plan_topics(dest: Destination, vibes: list[str], month: int) -> list[dict]:
    d, y = dest.name, utcnow().year
    topics = [
        {"key": key, "video": v.format(d=d, y=y), "web": w.format(d=d, y=y), "reddit": f"{d} {r}"}
        for key, (v, w, r) in CORE_TOPICS.items()
    ]
    m = MONTHS[month - 1]
    topics.append(
        {"key": f"season_{month}", "video": f"{d} in {m} travel", "web": f"{d} in {m} weather crowd what to expect", "reddit": f"{d} {m}"}
    )
    for v in [v for v in vibes if v in VIBE_TOPICS][:2]:
        q = VIBE_TOPICS[v].format(d=d)
        topics.append({"key": f"vibe_{v}", "video": q, "web": q, "reddit": f"{d} {v}"})

    fresh_after = utcnow() - timedelta(days=settings.research_refresh_days)
    done = dest.topics or {}
    return [t for t in topics if not done.get(t["key"]) or datetime.fromisoformat(done[t["key"]]) < fresh_after]


def _known_ids(dest_id: int) -> set[tuple[str, str]]:
    with SessionLocal() as s:
        return {(k, e) for k, e in s.execute(select(Source.kind, Source.external_id).where(Source.destination_id == dest_id))}


def research(dest: Destination, vibes: list[str], month: int, emit: Emit, pct: tuple[int, int] = (10, 60)) -> dict:
    topics = plan_topics(dest, vibes, month)
    gaps: list[str] = []
    if not topics:
        emit("research", f"Using recent evidence already collected for {dest.name}", pct[1])
        return {"new_sources": 0, "new_claims": 0, "gaps": gaps}

    lo, hi = pct
    emit("research", f"Looking for recent vlogs, threads and blogs about {dest.name}", lo)
    known = _known_ids(dest.id)
    needles = destination_needles(dest)

    def about_destination(*texts: str) -> bool:
        # Search engines happily return generic results ("how to book Rapido"); keep only ones about this place.
        return mentions(" ".join(t or "" for t in texts), needles)

    # 1. Search every source for every topic, in parallel.
    videos: dict[str, tuple[dict, str]] = {}
    pages: dict[str, tuple[dict, str]] = {}
    threads: dict[str, tuple[dict, str]] = {}
    web_down = False
    with ThreadPoolExecutor(6) as pool:
        futures = {}
        for t in topics:
            futures[pool.submit(collect_youtube.search_videos, t["video"], settings.research_videos_per_topic)] = ("yt", t["key"])
            futures[pool.submit(collect_web.search_web, t["web"], settings.research_pages_per_topic)] = ("web", t["key"])
            if collect_reddit.enabled():
                futures[pool.submit(collect_reddit.search_threads, t["reddit"], needles, settings.research_threads_per_topic)] = ("reddit", t["key"])
        for f in as_completed(futures):
            kind, topic = futures[f]
            try:
                res = f.result()
            except Exception as e:
                log.warning("search failed (%s): %s", kind, e)
                continue
            if kind == "yt":
                for v in res:
                    if ("youtube", v["video_id"]) not in known and about_destination(v["title"]):
                        videos.setdefault(v["video_id"], (v, topic))
            elif kind == "web":
                if res is None:
                    web_down = True
                    continue
                for p in res:
                    if ("web", p["url"][:300]) not in known and about_destination(p["title"], p["snippet"]):
                        pages.setdefault(p["url"], (p, topic))
            else:
                for r in res:
                    if ("reddit", r["id"]) not in known:
                        threads.setdefault(r["id"], (r, topic))

    if web_down:
        gaps.append("Web search (SearXNG) wasn't reachable, so blogs and forums were skipped.")
    if not settings.youtube_api_key:
        gaps.append("YouTube comments were skipped (add a free YOUTUBE_API_KEY to include them).")
    if not collect_reddit.enabled():
        gaps.append("Reddit was skipped: Reddit only allows API access to approved projects.")
    emit(
        "research",
        f"Found {len(videos)} recent vlogs, {len(threads)} Reddit threads and {len(pages)} articles",
        lo + 5,
    )

    # 2. Fetch transcripts, comments, pages and threads.
    def load_video(v: dict, topic: str) -> list[Doc]:
        docs = []
        snippets = collect_youtube.fetch_transcript(v["video_id"])
        if snippets:
            docs.append(Doc("youtube", v["video_id"], v["url"], v["title"], v["channel"], v["published_at"], topic, transcript_chunks(snippets)))
        else:
            # No transcript (none uploaded, or YouTube is blocking us): the creator's description still often lists
            # stays, prices and routes. Stored under its own id so the transcript can still be read later.
            description = collect_youtube.fetch_description(v["video_id"])
            if len(description) > 150:
                docs.append(
                    Doc("youtube", f"{v['video_id']}#description", v["url"], v["title"], v["channel"], v["published_at"], topic, article_chunks(description, budget=3500))
                )
        comments = collect_youtube.fetch_comments(v["video_id"])
        if comments:
            newest = max((c["published_at"] for c in comments if c["published_at"]), default=v["published_at"])
            docs.append(
                Doc("youtube_comments", v["video_id"], v["url"], f"Comments on: {v['title']}", "YouTube viewers", newest, topic, comment_chunks(comments))
            )
        return docs

    def load_page(p: dict, topic: str) -> list[Doc]:
        page = collect_web.fetch_page(p["url"])
        if not page:
            return []
        return [Doc("web", p["url"][:300], p["url"], page["title"] or p["title"], page["author"], page["published"] or p["published"], topic, article_chunks(page["text"]))]

    def load_thread(r: dict, topic: str) -> list[Doc]:
        th = collect_reddit.fetch_thread(r["permalink"])
        if not th:
            return []
        head = f"POST: {th['title']}\n{th['text'][:1500]}\nCOMMENTS:"
        chunks = comment_chunks(th["comments"], budget=5000)
        if chunks:
            chunks[0] = head + "\n" + chunks[0]
        elif th["text"]:
            chunks = [head]
        return [Doc("reddit", r["id"], r["url"], r["title"], f"r/{r['subreddit']}", r["created"], topic, chunks)]

    docs: list[Doc] = []
    total = len(videos) + len(pages) + len(threads)
    with ThreadPoolExecutor(5) as pool:
        futures = {}
        for v, topic in videos.values():
            futures[pool.submit(load_video, v, topic)] = f"“{v['title'][:70]}”" + (f" by {v['channel']}" if v["channel"] else "")
        for p, topic in pages.values():
            futures[pool.submit(load_page, p, topic)] = f"Reading “{p['title'][:70]}”"
        for r, topic in threads.values():
            futures[pool.submit(load_thread, r, topic)] = f"Reading Reddit: “{r['title'][:70]}”"
        for n, f in enumerate(as_completed(futures), 1):
            try:
                loaded = [d for d in f.result() if d.chunks]
            except Exception as e:
                log.warning("load failed: %s", e)
                continue
            docs.extend(loaded)
            if loaded:
                label = futures[f]
                if label.startswith("“"):  # a video: say what we could actually read
                    watched = any(d.kind == "youtube" and not d.external_id.endswith("#description") for d in loaded)
                    label = ("Watching " if watched else "Reading the description and comments of ") + label
                emit("research", label, lo + 5 + int(15 * n / max(total, 1)))

    if collect_youtube.transcripts_blocked():
        gaps.append(
            "YouTube is temporarily blocking transcript requests from this network, so vlogs were read "
            "from their descriptions and comments only. This usually clears within a few hours."
        )
    if not docs:
        gaps.append(f"No recent online sources could be read for {dest.name}; the plan leans on general knowledge.")
        return {"new_sources": 0, "new_claims": 0, "gaps": gaps}

    # 3. Spread the LLM budget evenly: first chunk of every doc, then second chunks, and so on.
    jobs: list[tuple[Doc, str]] = []
    depth = 0
    while len(jobs) < settings.research_max_llm_chunks and any(depth < len(d.chunks) for d in docs):
        for d in docs:
            if depth < len(d.chunks) and len(jobs) < settings.research_max_llm_chunks:
                jobs.append((d, d.chunks[depth]))
        depth += 1

    # 4. Extract claims in parallel.
    results: dict[int, list[dict]] = defaultdict(list)
    processed: set[int] = set()
    failures, last_error = 0, None
    kind_label = {"youtube": "YouTube vlog transcript", "youtube_comments": "YouTube comments", "reddit": "Reddit thread", "web": "travel article"}
    emit("research", f"Pulling prices, timings and tips out of {len(docs)} sources", lo + 22)
    with ThreadPoolExecutor(settings.research_parallelism) as pool:
        futures = {
            pool.submit(
                extract_claims, chunk, dest.name,
                "YouTube video description" if d.external_id.endswith("#description") else kind_label[d.kind], d.title,
                d.published_at.strftime("%b %Y") if d.published_at else "",
            ): d
            for d, chunk in jobs
        }
        for n, f in enumerate(as_completed(futures), 1):
            d = futures[f]
            try:
                results[id(d)].extend(f.result())
                processed.add(id(d))
            except LLMUnavailable as e:
                failures, last_error = failures + 1, e
            except Exception as e:
                failures += 1
                log.warning("extraction failed: %s", e)
            if n % 3 == 0 or n == len(jobs):
                found = sum(len(v) for v in results.values())
                emit("research", f"Read {n} of {len(jobs)} passages, {found} facts so far", lo + 22 + int((hi - lo - 25) * n / len(jobs)))
    if jobs and failures == len(jobs) and last_error:
        raise LLMUnavailable(str(last_error))

    # 5. Store. Docs whose chunks never reached the model stay unsaved so a later run picks them up.
    new_claims = 0
    for d in docs:
        if id(d) not in processed:
            continue
        new_claims += save_source_claims(
            dest,
            {
                "kind": d.kind,
                "external_id": d.external_id,
                "url": d.url,
                "title": d.title[:500],
                "author": (d.author or "")[:200],
                "published_at": d.published_at,
                "topic": d.topic,
            },
            results[id(d)],
        )

    # 6. Mark topics as researched.
    with SessionLocal() as s:
        row = s.get(Destination, dest.id)
        done = dict(row.topics or {})
        for t in topics:
            done[t["key"]] = utcnow().isoformat()
        row.topics = done
        s.commit()

    emit("research", f"Collected {new_claims} fresh facts from {len(processed)} sources", hi)
    return {"new_sources": len(processed), "new_claims": new_claims, "gaps": gaps}
