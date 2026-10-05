"""Turn raw evidence (transcripts, comments, posts, pages) into structured claims.

Free LLM quotas are the bottleneck, so the useful parts are picked here first, with cheap
keyword scoring, and only those reach the model.
"""

import re

from ..llm import complete_json

KEY_RE = re.compile(
    r"(₹|\brs\.?\s?\d|\binr\b|rupee|rupay|rupaiy|रुपए|रुपये|रुपया|\bprice|\bcost|\bfare|\bcharg|\bticket|\bentry"
    r"|\bfee\b|\bper (?:night|person|day|plate|km|head)|\bhotel|\bhostel|\bhomestay|\bdorm|\broom|\bstay"
    r"|\bauto\b|rapido|\bola\b|\buber|\bcab\b|\btaxi|\bbus\b|\btrain|\bscooty|\bbike|\brent|\bopen|\bclose"
    r"|\btiming|\bcrowd|\bscam|\bavoid|must[ -]try|\bfamous|\bbest\b|\bdon'?t\b|\bwarning|\bpermit|\bbook"
    r"|\bqueue|\bline\b|\bwait|\bparking|\bsunrise|\bsunset|होटल|किराया|टिकट|ऑटो|खाना|कीमत|रेट|रूम|बस|ट्रेन)",
    re.I,
)
NUM_RE = re.compile(r"\d{2,}")

CHUNK_CHARS = 3500


def _score(text: str) -> float:
    return len(KEY_RE.findall(text)) + 0.5 * len(NUM_RE.findall(text))


def _split(text: str, size: int = CHUNK_CHARS) -> list[str]:
    parts, cur = [], ""
    for line in text.split("\n"):
        if len(cur) + len(line) > size and cur:
            parts.append(cur)
            cur = ""
        cur += line + "\n"
    if cur.strip():
        parts.append(cur)
    return parts


def transcript_chunks(snippets: list[tuple[float, str]], budget: int = 7000) -> list[str]:
    """Group captions into ~45s windows, keep the most informative ones in time order."""
    windows: list[tuple[float, str]] = []
    start, buf = None, []
    for t, text in snippets:
        if start is None:
            start = t
        buf.append(text.replace("\n", " "))
        if t - start >= 45:
            windows.append((start, " ".join(buf)))
            start, buf = None, []
    if buf:
        windows.append((start or 0, " ".join(buf)))

    ranked = sorted(range(len(windows)), key=lambda i: -_score(windows[i][1]))
    chosen, used = [], 0
    for i in ranked:
        size = len(windows[i][1]) + 10
        if used + size > budget:
            continue
        chosen.append(i)
        used += size
    lines = [f"[{int(windows[i][0])}s] {windows[i][1]}" for i in sorted(chosen)]
    return _split("\n".join(lines))


def comment_chunks(comments: list[dict], budget: int = 4500) -> list[str]:
    useful = [c for c in comments if len(c["text"]) > 50 or KEY_RE.search(c["text"])]
    useful.sort(key=lambda c: -(_score(c["text"]) * 2 + min(c.get("likes", c.get("score", 0)), 50) / 10))
    lines, used = [], 0
    for c in useful:
        line = "- " + c["text"].replace("\n", " ")[:600]
        if used + len(line) > budget:
            break
        lines.append(line)
        used += len(line)
    return _split("\n".join(lines)) if lines else []


def article_chunks(text: str, budget: int = 6000) -> list[str]:
    paras = [p.strip() for p in text.split("\n") if len(p.strip()) > 30]
    ranked = sorted(range(len(paras)), key=lambda i: -_score(paras[i]))
    chosen, used = [], 0
    for i in ranked:
        if used + len(paras[i]) > budget:
            continue
        chosen.append(i)
        used += len(paras[i])
    return _split("\n".join(paras[i] for i in sorted(chosen)))


ENTITY_TYPES = {"attraction", "food", "stay", "transport", "activity", "shopping", "nightlife", "area", "event", "general"}
CLAIM_TYPES = {
    "price", "tip", "warning", "scam", "hours", "best_time", "crowd", "availability",
    "permit", "closure", "recommendation", "description",
}
UNITS = {"item", "plate", "person", "night", "ride", "day", "hour", "entry", "km", "total"}

SYSTEM = """You extract travel evidence for an Indian trip planner. Read the source about {dest} and return JSON:
{{"claims":[{{"entity":str|null,"type":str,"area":str|null,"claim":str,"item":str|null,"price_min":number|null,"price_max":number|null,"unit":str|null,"text":str,"quote":str|null,"t":int|null}}]}}
- entity: proper name (English/Latin script) of ONE specific place, eatery, hotel, market, operator or transport service, e.g. "Johny Hot Dog", "Rajwada Palace", "Rapido". null for general advice.
- type: attraction | food | stay | transport | activity | shopping | nightlife | area | event | general
- claim: price | tip | warning | scam | hours | best_time | crowd | availability | permit | closure | recommendation | description
- price_min/price_max: rupees as numbers. Convert spoken amounts ("saath rupaye" = 60, "dedh sau" = 150, "2k" = 2000). null when no price is stated.
- unit: item | plate | person | night | ride | day | hour | entry | km | total
- item: what the price buys, e.g. "egg benjo", "dorm bed", "auto from railway station to Rajwada".
- text: one factual English sentence, max 25 words.
- quote: the speaker's original words, max 12 words.
- t: seconds from the nearest [123s] marker, if markers exist.
Rules: only facts about {dest} or travelling to/around it. Skip sponsorships, greetings and filler. Never guess or invent prices. Max 15 claims, prefer named places with real prices, timings and warnings. Return {{"claims": []}} if nothing is useful."""


def _num(v) -> float | None:
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return f if 0 < f <= 500_000 else None


def _clean(raw: dict) -> dict | None:
    text = str(raw.get("text") or "").strip()
    if not text:
        return None
    etype = str(raw.get("type") or "general").lower()
    ctype = str(raw.get("claim") or "tip").lower()
    pmin, pmax = _num(raw.get("price_min")), _num(raw.get("price_max"))
    if pmin is None and pmax is not None:
        pmin = pmax
    if pmax is None and pmin is not None:
        pmax = pmin
    if pmin is not None and pmax is not None and pmin > pmax:
        pmin, pmax = pmax, pmin
    unit = str(raw.get("unit") or "").lower()
    entity = raw.get("entity")
    try:
        t = int(raw["t"]) if raw.get("t") is not None else None
    except (TypeError, ValueError):
        t = None
    return {
        "entity": str(entity).strip()[:160] if entity else None,
        "type": etype if etype in ENTITY_TYPES else "general",
        "area": str(raw.get("area") or "").strip()[:120],
        "claim": "price" if pmin is not None else (ctype if ctype in CLAIM_TYPES else "tip"),
        "item": str(raw.get("item") or "").strip()[:160],
        "price_min": pmin,
        "price_max": pmax,
        "unit": unit if unit in UNITS else ("item" if pmin is not None else ""),
        "text": text[:300],
        "quote": str(raw.get("quote") or "").strip()[:200],
        "t": t,
    }


def extract_claims(chunk: str, destination: str, kind: str, title: str, published: str) -> list[dict]:
    user = f'Source: {kind} - "{title}" ({published or "date unknown"})\n---\n{chunk}'
    data = complete_json(
        "extract", SYSTEM.format(dest=destination), user, max_tokens=1800, temperature=0.1, effort="low"
    )
    claims = data.get("claims", []) if isinstance(data, dict) else []
    return [c for c in (_clean(r) for r in claims if isinstance(r, dict)) if c]
