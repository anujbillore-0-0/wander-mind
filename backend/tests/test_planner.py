"""End-to-end planner run with scripted sources and a scripted LLM (no network, no API keys)."""

import re
from datetime import date, datetime, timedelta

import pytest

from app import llm
from app.db import init_db
from app.planner import graph
from app.research import collect_web, collect_youtube, extract
from app.schemas import Itinerary, TripRequest

DEST = {
    "name": "Indore", "region": "Madhya Pradesh", "country": "India", "country_code": "IN",
    "lat": 22.7179, "lon": 75.8333, "population": 1994397, "elevation": 550.0, "timezone": "Asia/Kolkata",
}
PLACES = {
    "Rajwada Palace": (22.7186, 75.8547),
    "Sarafa Bazaar": (22.7190, 75.8560),
    "Johny Hot Dog": (22.7244, 75.8839),
    "Lal Bagh Palace": (22.7045, 75.8463),
    "Zostel Indore": (22.7250, 75.8800),
    "Hotel Budget Inn": (22.7200, 75.8700),
    "Patalpani Waterfall": (22.5070, 75.7800),
}

RECENT = datetime.now() - timedelta(days=40)

EXTRACTED = [
    {"entity": "Johny Hot Dog", "type": "food", "area": "56 Dukan", "claim": "price", "item": "egg benjo", "price_min": 60, "price_max": 70, "unit": "item", "text": "Egg benjo costs about 60-70 rupees.", "quote": "saath rupaye", "t": 120},
    {"entity": "Sarafa Bazaar", "type": "food", "area": "Rajwada", "claim": "price", "item": "garadu", "price_min": 50, "price_max": 80, "unit": "plate", "text": "Garadu plate costs 50-80 rupees in winter.", "quote": "", "t": 300},
    {"entity": "Sarafa Bazaar", "type": "food", "area": "Rajwada", "claim": "best_time", "item": "", "price_min": None, "price_max": None, "unit": "", "text": "Opens after 9pm once jewellery shops close.", "quote": "", "t": 310},
    {"entity": "Rajwada Palace", "type": "attraction", "area": "Rajwada", "claim": "price", "item": "entry ticket", "price_min": 10, "price_max": 25, "unit": "entry", "text": "Entry ticket is around 10-25 rupees.", "quote": "", "t": 30},
    {"entity": "Zostel Indore", "type": "stay", "area": "Vijay Nagar", "claim": "price", "item": "dorm bed", "price_min": 499, "price_max": 699, "unit": "night", "text": "Dorm beds cost 499-699 per night.", "quote": "", "t": 400},
    {"entity": "Rapido", "type": "transport", "area": "", "claim": "availability", "item": "", "price_min": None, "price_max": None, "unit": "", "text": "Rapido bike taxis are easy to find in Indore.", "quote": "", "t": None},
    {"entity": None, "type": "general", "area": "", "claim": "scam", "item": "", "price_min": None, "price_max": None, "unit": "", "text": "Autos near the railway station overcharge tourists; book on an app.", "quote": "", "t": None},
]


def fake_extract(task, system, user, **kw):
    assert task == "extract"
    return {"claims": EXTRACTED}


def fake_planner(task, system, user, **kw):
    refs = dict((name.strip(), ref) for ref, name in re.findall(r"^(E\d+) \| \w+ \| ([^|(]+)", user, re.M))
    r = lambda name: refs.get(name)  # noqa: E731
    if system.startswith("Turn a traveller"):
        return {}
    if "evidence-based travel planner" in system:
        fixing = "FIX THESE PROBLEMS" in user
        stay_price = 2500
        palace_cost = 50 if fixing else 9000  # first draft blows the budget so the critic must loop
        days = [
            {"day": 1, "title": "Old city & night market", "summary": "Palaces by day, Sarafa by night.", "destination": "Indore", "items": [
                {"ref": r("Rajwada Palace"), "name": "Rajwada Palace", "area": "Rajwada", "kind": "attraction", "time": "10:00", "mins": 75, "why": "Holkar-era palace", "tip": "Go early", "cost_min": 10, "cost_max": 25, "book": False, "alts": [r("Lal Bagh Palace")]},
                {"ref": None, "name": "Lal Bagh Palace", "area": "Lal Bagh", "kind": "attraction", "time": "12:00", "mins": 90, "why": "Grand Holkar palace", "tip": None, "cost_min": palace_cost - 30, "cost_max": palace_cost, "book": False, "alts": []},
                {"ref": r("Johny Hot Dog"), "name": "Johny Hot Dog", "area": "56 Dukan", "kind": "food", "time": "18:30", "mins": 40, "why": "Famous egg benjo", "tip": None, "cost_min": 60, "cost_max": 120, "book": False, "alts": []},
                {"ref": r("Sarafa Bazaar"), "name": "Sarafa Bazaar", "area": "Rajwada", "kind": "food", "time": "21:30", "mins": 90, "why": "Night food market", "tip": None, "cost_min": 150, "cost_max": 300, "book": False, "alts": []},
            ]},
            {"day": 2, "title": "Waterfall morning", "summary": "Day trip to Patalpani.", "destination": "Indore", "items": [
                {"ref": None, "name": "Patalpani Waterfall", "area": "Mhow", "kind": "attraction", "time": "08:00", "mins": 120, "why": "Monsoon waterfall", "tip": None, "cost_min": 0, "cost_max": 0, "book": False, "alts": []},
                {"ref": None, "name": "Madhuram Sweets", "area": "Vijay Nagar", "kind": "food", "time": "13:00", "mins": 45, "why": "Lunch", "tip": None, "cost_min": 150, "cost_max": 250, "book": False, "alts": []},
            ]},
        ]
        # The planner asks for one day per call, like the real gateway.
        wanted = re.search(r"Plan day (\d+) of", user)
        if wanted:
            days = [d for d in days if d["day"] == int(wanted.group(1))]
        return {
            "title": "Indore food trail",
            "stay": {"areas": [{"name": "Vijay Nagar", "why": "Central, safe, cafes", "best_for": "Solo"}],
                     "picks": [{"ref": r("Zostel Indore"), "name": "Zostel Indore", "type": "hostel", "area": "Vijay Nagar", "price_min": 499, "price_max": 699, "why": "Social hostel", "best_for": "Solo"},
                               {"ref": None, "name": "Hotel Budget Inn", "type": "budget_hotel", "area": "Rajwada", "price_min": stay_price, "price_max": stay_price + 500, "why": "Near old city", "best_for": "Couples"}]},
            "days": days,
        }
    if "travel editor" in system:
        return {"summary": "Two days of palaces and street food.", "highlights": ["Sarafa at midnight"], "season": {"label": "Post-monsoon", "crowd_level": "moderate", "summary": "Pleasant evenings", "notes": [], "events": [{"name": "Diwali", "when": "Nov", "note": "Busy markets"}]},
                "getting_there": {"arrival_hub": "Indore Junction", "notes": [], "modes": [{"mode": "train", "details": "Several daily trains", "booking_tip": "Book 2 weeks ahead"}]},
                "book_ahead": [{"item": "Train tickets", "when": "2 weeks", "why": "Weekend rush"}], "rainy_day": [{"title": "Central Museum", "note": "Indoors"}], "hidden_gems": [], "saving_tips": ["Use Rapido"], "upgrade_tips": []}
    if "local guide" in system:
        return {"transport": {"summary": "Rapido and autos are everywhere.", "apps": [{"name": "Rapido", "status": "confirmed", "note": "Bike taxis everywhere"}], "modes": [{"mode": "auto", "label": "Auto", "typical_fare": "₹40-80", "best_for": "Short hops", "note": ""}], "rental": "", "tips": []},
                "food": {"must_try": [{"dish": "Poha jalebi", "where": "Anywhere at breakfast", "price_text": "₹30-50", "note": "", "veg": True}], "tips": []}}
    if "safety and logistics" in system:
        return {"packing": ["Light jacket"], "documents": ["ID"], "money": ["UPI works"], "connectivity": [], "etiquette": [], "safety": [], "scams": ["Fake guides"], "health": [], "accessibility": [], "emergency": [{"label": "Ambulance", "number": "108"}]}
    raise AssertionError(f"unexpected prompt: {system[:60]}")


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    init_db()
    monkeypatch.setattr(collect_youtube, "search_videos", lambda q, n: [
        {"video_id": f"vid{abs(hash(q)) % 10_000}", "title": f"Vlog: {q}", "channel": "Wanderer", "published_at": RECENT, "url": f"https://www.youtube.com/watch?v=vid{abs(hash(q)) % 10_000}"}
    ])
    monkeypatch.setattr(collect_youtube, "fetch_transcript", lambda vid: [(i * 10.0, f"Johny hot dog egg benjo saath rupaye price {i}") for i in range(30)])
    monkeypatch.setattr(collect_youtube, "fetch_comments", lambda vid: [])
    monkeypatch.setattr(collect_web, "search_web", lambda q, n: None)
    monkeypatch.setattr(extract, "complete_json", fake_extract)
    monkeypatch.setattr(graph, "complete_json", fake_planner)
    monkeypatch.setattr(graph, "get_weather", lambda lat, lon, start, days, month: {
        "kind": "forecast", "summary": "Forecast: 18-31°C, dry.",
        "days": [{"date": (start + timedelta(days=i)).isoformat(), "t_min": 18, "t_max": 31, "precip_mm": 0, "precip_prob": 5, "label": "Clear sky", "icon": "sun"} for i in range(days)],
    })
    import app.planner.costing as costing
    import app.planner.destinations as destinations
    monkeypatch.setattr(destinations, "resolve_destination", lambda name: dict(DEST) if "indore" in name.lower() else {**DEST, "name": name, "lat": 23.2599, "lon": 77.4126})
    monkeypatch.setattr(destinations, "wiki_summary", lambda *a, **k: {"description": "Indore is a city in Madhya Pradesh.", "image": "https://example.org/indore.jpg", "url": ""})
    monkeypatch.setattr(costing, "geocode_poi", lambda name, area, city, lat, lon: PLACES.get(name))
    monkeypatch.setattr(costing, "wiki_summary", lambda *a, **k: None)
    monkeypatch.setattr(costing, "resolve_destination", lambda name: {**DEST, "name": "Bhopal", "lat": 23.2599, "lon": 77.4126})


def test_full_plan_with_critic_loop():
    start = date.today() + timedelta(days=5)
    req = TripRequest(
        destinations=["Indore"], origin="Bhopal", start_date=start, end_date=start + timedelta(days=1),
        budget_total=6000, vibes=["food", "culture"], diet="no_preference", local_transport=["ride_apps"],
        must_include=["Sarafa"],
    )
    events = []
    itinerary, state = graph.run_planner("t1", req.model_dump(mode="json"), lambda s, m, p: events.append((s, m, p)))

    Itinerary.model_validate(itinerary)
    messages = [m for _, m, _ in events]
    assert any(m.startswith("Reworking the plan") for m in messages), "critic should have asked for a cheaper redraft"
    assert itinerary["budget"]["status"] in ("under", "near")
    assert len(itinerary["days"]) == 2

    day1 = itinerary["days"][0]["items"]
    by_title = {i["title"]: i for i in day1}
    # Evidence-backed prices override the model's guesses; unknown places are honest estimates.
    assert by_title["Johny Hot Dog"]["cost"]["min"] == 60
    assert by_title["Johny Hot Dog"]["evidence"]["status"] in ("verified", "reported")
    assert by_title["Johny Hot Dog"]["evidence"]["quotes"][0]["url"].endswith("&t=120s")
    assert by_title["Lal Bagh Palace"]["evidence"]["status"] == "estimate"
    # Legs between stops are priced with ride-app modes for a big city.
    leg = by_title["Rajwada Palace"]["leg_to_next"]
    assert leg and leg["cost_max"] >= leg["cost_min"] and leg["options"]
    # Getting there from Bhopal is costed and included.
    assert any(c["key"] == "intercity" for c in itinerary["budget"]["categories"])
    assert itinerary["getting_there"]["options"]
    # Evidence scam warning is surfaced first.
    assert itinerary["essentials"]["scams"][0].startswith("Autos near the railway station")
    assert itinerary["essentials"]["emergency"][0]["number"] == "112"
    assert itinerary["sources"], "every cited source should be listed"
    assert state["draft"]["days"]


def test_tweak_reuses_research_and_guides():
    start = date.today() + timedelta(days=5)
    req = TripRequest(destinations=["Indore"], start_date=start, end_date=start + timedelta(days=1), budget_total=8000)
    _, state = graph.run_planner("t2", req.model_dump(mode="json"), lambda *a: None)
    events = []
    itinerary, _ = graph.run_planner(
        "t2", req.model_dump(mode="json"), lambda s, m, p: events.append(m), tweak="more street food", previous=state, version=2
    )
    assert itinerary["version"] == 2
    assert not any("Looking for recent vlogs" in m for m in events)
    assert any("Applying your change" in m for m in events)


def test_llm_gateway_requires_a_key(monkeypatch):
    monkeypatch.setattr(llm.settings, "groq_api_key", "")
    monkeypatch.setattr(llm.settings, "cerebras_api_key", "")
    monkeypatch.setattr(llm.settings, "mistral_api_key", "")
    monkeypatch.setattr(llm.settings, "gemini_api_key", "")
    monkeypatch.setattr(llm.settings, "openrouter_api_key", "")
    with pytest.raises(llm.LLMUnavailable):
        llm.complete_json("planner", "s", "u")


def test_extract_json_handles_fences_and_reasoning():
    assert llm.extract_json('<think>hmm</think>```json\n{"a": 1}\n```') == {"a": 1}
    assert llm.extract_json('Sure! {"claims": []} hope that helps') == {"claims": []}
