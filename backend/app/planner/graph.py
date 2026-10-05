"""The planner as a LangGraph state machine.

resolve -> research -> weather -> evidence -> draft -> cost --(problems?)--> draft (max 2 drafts)
                                                            \\-> guides -> compose
"""

import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable, TypedDict

from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, StateGraph
from sqlalchemy import func, select

from ..db import Claim, SessionLocal
from ..llm import LLMUnavailable, complete_json
from ..research.pipeline import research
from ..research.store import EntityAgg, build_evidence, digest, price_text
from ..schemas import TripRequest
from ..services import fares
from ..services.weather import get_weather
from . import prompts
from .compose import compose
from .costing import compute
from .destinations import get_or_create_destination

log = logging.getLogger(__name__)

MAX_DRAFTS = 2

Emit = Callable[[str, str, int], None]


class PlanState(TypedDict, total=False):
    trip_id: str
    request: dict
    tweak: str | None
    previous: dict | None  # draft + guides from the last run, used for tweaks
    version: int
    dests: list
    gaps: list[str]
    weather: dict
    evidence: Any  # (aggs, tips, sources)
    digest: str
    tips_text: str
    draft: dict
    computed: dict
    issues: list[str]
    attempts: int
    guides: dict
    itinerary: dict


def _emit(config: RunnableConfig) -> Emit:
    return config["configurable"]["emit"]


def _req(state: PlanState) -> TripRequest:
    return TripRequest.model_validate(state["request"])


def _outline(draft: dict) -> str:
    lines = []
    for d in draft.get("days", []):
        stops = "; ".join(
            f"{i.get('time', '')} {i.get('name') or i.get('ref')}" + (f" [{i['ref']}]" if i.get("ref") else "")
            for i in d.get("items", [])
            if isinstance(i, dict)
        )
        lines.append(f"Day {d.get('day')} - {d.get('title', '')}: {stops}")
    picks = ((draft.get("stay") or {}).get("picks")) or []
    if picks:
        lines.append("Stay picks: " + "; ".join(str(p.get("name")) for p in picks if isinstance(p, dict)))
    return "\n".join(lines)


def _evidence_lines(aggs: dict[str, EntityAgg], types: set[str], limit: int) -> str:
    rows = sorted((a for a in aggs.values() if a.type in types), key=lambda a: -a.score)[:limit]
    out = []
    for a in rows:
        price = price_text(a.price_min, a.price_max, a.unit)
        items = "; ".join(f"{i[0]} {price_text(i[1], i[2], i[3])}" for i in a.items[:2])
        notes = "; ".join(a.warnings[:1] + a.facts[:2])
        out.append(" | ".join(x for x in (a.name + (f" ({a.area})" if a.area else ""), price, items, notes) if x))
    return "\n".join(out) or "-"


# ------------------------------------------------------------------ nodes


def resolve_node(state: PlanState, config: RunnableConfig) -> dict:
    req = _req(state)
    _emit(config)("resolve", f"Finding {', '.join(req.destinations)} on the map", 3)
    dests, seen = [], set()
    for name in req.destinations:
        d = get_or_create_destination(name)
        if d.id not in seen:
            seen.add(d.id)
            dests.append(d)
    return {"dests": dests, "gaps": []}


def research_node(state: PlanState, config: RunnableConfig) -> dict:
    if state.get("tweak"):
        return {"gaps": list((state.get("previous") or {}).get("gaps", []))}
    req, emit = _req(state), _emit(config)
    gaps = list(state.get("gaps", []))
    span = 52 // len(state["dests"])
    for i, d in enumerate(state["dests"]):
        lo = 8 + i * span
        result = research(d, req.vibes, req.travel_month(), emit, (lo, lo + span))
        gaps += result["gaps"]
    return {"gaps": gaps}


def weather_node(state: PlanState, config: RunnableConfig) -> dict:
    req = _req(state)
    primary = state["dests"][0]
    w = get_weather(primary.lat, primary.lon, req.resolved_start(), req.resolved_days(), req.travel_month())
    _emit(config)("weather", w["summary"] or "Checking the season", 62)
    return {"weather": w}


def evidence_node(state: PlanState, config: RunnableConfig) -> dict:
    aggs, tips, sources = build_evidence([d.id for d in state["dests"]])
    dg, tt = digest(aggs, tips)
    _emit(config)("evidence", f"Weighing {len(aggs)} places and {len(tips)} traveller tips", 65)
    return {"evidence": (aggs, tips, sources), "digest": dg, "tips_text": tt}


def draft_node(state: PlanState, config: RunnableConfig) -> dict:
    req, emit = _req(state), _emit(config)
    attempts = state.get("attempts", 0)
    issues = state.get("issues") or []
    n_days = req.resolved_days()
    brief = prompts.trip_brief(req, state["dests"], state["weather"].get("summary", ""))

    feedback = ""
    if issues and attempts > 0:
        feedback = "\nFIX THESE PROBLEMS FROM YOUR LAST DRAFT:\n" + "\n".join(f"- {i}" for i in issues)
        emit("draft", "Reworking the plan: " + issues[0][:110], 72 + 5 * attempts)
    elif state.get("tweak"):
        emit("draft", f"Applying your change: “{state['tweak'][:90]}”", 70)
    else:
        emit("draft", "Drafting your day-by-day plan", 70)

    tweak_block = ""
    previous_draft = (state.get("previous") or {}).get("draft")
    if state.get("tweak") and previous_draft:
        tweak_block = (
            f"\nCURRENT PLAN:\n{_outline(previous_draft)}\nTHE TRAVELLER ASKS: \"{state['tweak']}\"\n"
            "Apply this change. Keep everything else unless the change requires otherwise."
        )

    evidence = state["digest"] or "(no evidence collected yet: use well-known places with ref null)"
    title, stay, days = None, None, []
    # One day per call: free tiers allow only ~8K tokens per request, and small replies are reliable replies.
    for day_no in range(1, n_days + 1):
        is_first = day_no == 1
        scope = f"Plan day {day_no} of {n_days} only." if n_days > 1 else "Plan the single day."
        if day_no == n_days and n_days > 1:
            scope += " This is the last day: finish in time for departure."
        if days:
            done = {str(i.get("name") or i.get("ref")) for d in days for i in d.get("items", []) if isinstance(i, dict)}
            scope += " Already planned on earlier days, don't repeat sights: " + ", ".join(sorted(done))[:800]
        user = (
            f"TRIP\n{brief}\n\nEVIDENCE (ref | type | name (area) | price | sources | notes)\n{evidence}\n\n"
            f"TRAVELLER TIPS\n{state['tips_text'] or '-'}\n{feedback}{tweak_block}\n\n{scope}\n"
            + (prompts.PLAN_FORMAT if is_first else prompts.PLAN_FORMAT_DAYS_ONLY)
        )
        for _ in range(2):  # a reply without the day gets one more try
            data = complete_json("planner", prompts.PLAN_SYSTEM, user, max_tokens=3000, temperature=0.4, effort="low")
            batch = [d for d in data.get("days", []) if isinstance(d, dict) and d.get("items")] if isinstance(data, dict) else []
            if batch:
                break
        if is_first and isinstance(data, dict):
            title, stay = data.get("title"), data.get("stay")
        if batch:
            batch[0]["day"] = day_no
            days.append(batch[0])
        if n_days > 1:
            emit("draft", f"Day {day_no} of {n_days} drafted", min(70 + 8 * day_no // n_days + 5 * attempts, 79))
    if not days:
        raise LLMUnavailable("The planner returned an empty plan. Please try again.")
    return {"draft": {"title": title, "stay": stay or {}, "days": days}, "attempts": attempts + 1}


def cost_node(state: PlanState, config: RunnableConfig) -> dict:
    aggs = state["evidence"][0]
    _emit(config)("cost", "Mapping stops and pricing Rapido, auto and cab rides", 80)
    computed = compute(_req(state), state["dests"], state["draft"], aggs)
    b = computed["budget"]
    _emit(config)("cost", f"Budget check: ₹{b['total_min']:,}–{b['total_max']:,} for your ₹{b['user_budget']:,}", 84)
    return {"computed": computed, "issues": computed["issues"]}


def after_cost(state: PlanState) -> str:
    return "draft" if state.get("issues") and state.get("attempts", 0) < MAX_DRAFTS else "guides"


def guides_node(state: PlanState, config: RunnableConfig) -> dict:
    emit = _emit(config)
    previous_guides = (state.get("previous") or {}).get("guides")
    if state.get("tweak") and previous_guides:
        return {"guides": previous_guides}

    emit("guides", "Writing your food, transport and safety guides", 88)
    req = _req(state)
    dests, computed = state["dests"], state["computed"]
    aggs, tips, _ = state["evidence"]
    primary = dests[0]
    brief = prompts.trip_brief(req, dests, state["weather"].get("summary", ""))
    outline = _outline(state["draft"])
    b = computed["budget"]

    ic = computed["intercity"]
    ic_text = "-"
    if ic["options"]:
        ic_text = f"{ic['origin']} to {primary.name}, ≈{ic['distance_km']} km by road. " + "; ".join(
            f"{o['title']} ₹{o['cost_min']}-{o['cost_max']} ({o['per']}), {o['duration_text']}" for o in ic["options"]
        )
    overview_user = (
        f"TRIP\n{brief}\n\nPLAN OUTLINE\n{outline}\n\nBUDGET: estimate ₹{b['total_min']:,}-{b['total_max']:,} "
        f"vs ₹{b['user_budget']:,} ({b['status']})\nGETTING THERE (our estimates): {ic_text}\n\n"
        f"EVIDENCE TIPS\n{state['tips_text'] or '-'}\n\nABOUT {primary.name.upper()}: {primary.description[:500]}\n\n{prompts.OVERVIEW_FORMAT}"
    )

    fare_lines = "; ".join(
        f"{e['distance_km']} km {e['label']} ₹{e['cost_min']}-{e['cost_max']}"
        for e in fares.fare_examples(computed["apps"], req.travelers, computed["hilly"])
        if e["distance_km"] == 7
    )
    transport_tips = "\n".join(
        t.text for t in tips if any(w in t.text.lower() for w in ("auto", "cab", "taxi", "rapido", "uber", "ola", "bus", "jeep", "scooty", "bike", "rickshaw", "metro", "train"))
    )[:1200]
    local_user = (
        f"DESTINATION: {primary.name}, {primary.region}; population ≈ {primary.population or 'unknown'}; "
        f"elevation ≈ {int(primary.elevation or 0)} m; our guess at ride-app coverage: {computed['apps']}\n"
        f"TRAVELLERS: {req.travelers}; diet: {req.diet.replace('_', ' ')}\n\n"
        f"TRANSPORT EVIDENCE\n{_evidence_lines(aggs, {'transport'}, 10)}\n{transport_tips}\n"
        f"FARE MODEL (estimate, 7 km): {fare_lines}\n\nFOOD EVIDENCE\n{_evidence_lines(aggs, {'food', 'nightlife'}, 18)}\n\n{prompts.LOCAL_FORMAT}"
    )

    warning_types = {"warning", "scam", "permit", "closure", "crowd", "availability"}
    warnings = [t.text for t in tips if t.type in warning_types][:12]
    warnings += [w for a in aggs.values() for w in a.warnings][:8]
    kinds = sorted({i.get("kind", "") for d in state["draft"].get("days", []) for i in d.get("items", []) if isinstance(i, dict)})
    essentials_user = (
        f"TRIP\n{brief}\n\nACTIVITY TYPES: {', '.join(k for k in kinds if k)}\nPLAN OUTLINE\n{outline[:1500]}\n\n"
        f"WARNINGS FROM EVIDENCE\n" + ("\n".join(f"- {w}" for w in warnings) or "-") + f"\n\n{prompts.ESSENTIALS_FORMAT}"
    )

    def run(system: str, user: str):
        try:
            return complete_json("planner", system, user, max_tokens=3000, temperature=0.4, effort="low")
        except LLMUnavailable as e:
            log.warning("guide failed: %s", e)
            return None

    with ThreadPoolExecutor(3) as pool:
        f_over = pool.submit(run, prompts.OVERVIEW_SYSTEM, overview_user)
        f_local = pool.submit(run, prompts.LOCAL_SYSTEM, local_user)
        f_ess = pool.submit(run, prompts.ESSENTIALS_SYSTEM, essentials_user)
        guides = {"overview": f_over.result(), "local": f_local.result(), "essentials": f_ess.result()}
    return {"guides": {k: v for k, v in guides.items() if isinstance(v, dict)}}


def compose_node(state: PlanState, config: RunnableConfig) -> dict:
    _emit(config)("compose", "Putting it all together", 97)
    aggs, tips, sources = state["evidence"]
    dest_ids = [d.id for d in state["dests"]]
    with SessionLocal() as s:
        claim_count = s.scalar(select(func.count(Claim.id)).where(Claim.destination_id.in_(dest_ids))) or 0
    gaps = list(state.get("gaps", [])) + [f"Heads-up: {i}" for i in (state.get("issues") or []) if not i.startswith("Over budget")]
    itinerary = compose(
        _req(state), state["dests"], state["draft"], state["computed"], state.get("guides") or {},
        aggs, tips, sources, state["weather"], gaps, claim_count, state.get("version", 1),
    )
    return {"itinerary": itinerary}


def _build():
    g = StateGraph(PlanState)
    g.add_node("resolve", resolve_node)
    g.add_node("research", research_node)
    g.add_node("weather", weather_node)
    g.add_node("evidence", evidence_node)
    g.add_node("draft", draft_node)
    g.add_node("cost", cost_node)
    g.add_node("guides", guides_node)
    g.add_node("compose", compose_node)
    g.set_entry_point("resolve")
    g.add_edge("resolve", "research")
    g.add_edge("research", "weather")
    g.add_edge("weather", "evidence")
    g.add_edge("evidence", "draft")
    g.add_edge("draft", "cost")
    g.add_conditional_edges("cost", after_cost, {"draft": "draft", "guides": "guides"})
    g.add_edge("guides", "compose")
    g.add_edge("compose", END)
    return g.compile()


GRAPH = _build()


def run_planner(trip_id: str, request: dict, emit: Emit, *, tweak: str | None = None, previous: dict | None = None, version: int = 1):
    """Returns (itinerary, internal state to keep for future tweaks)."""
    final = GRAPH.invoke(
        {
            "trip_id": trip_id,
            "request": request,
            "tweak": tweak,
            "previous": previous,
            "version": version,
            "attempts": 0,
            "issues": [],
        },
        config={"configurable": {"emit": emit}, "recursion_limit": 40},
    )
    return final["itinerary"], {"draft": final["draft"], "guides": final.get("guides") or {}, "gaps": final.get("gaps") or []}
