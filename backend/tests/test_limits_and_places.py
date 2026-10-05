"""Token pacing in the LLM gateway and destination ranking."""

from app import llm
from app.db import Destination
from app.research.pipeline import destination_needles, mentions
from app.services.geo import rank_photon


def test_token_window_paces_calls(monkeypatch):
    monkeypatch.setattr(llm.settings, "groq_tpm", 8000)
    spec = llm.ModelSpec("groq", "pace-test-model")
    first, wait = llm._try_reserve(spec, 5000)
    assert first is not None and wait == 0
    second, wait = llm._try_reserve(spec, 5000)
    assert second is None and 59 < wait <= 61, "the second call must wait for the first to age out"
    other = llm.ModelSpec("groq", "another-model")
    assert llm._try_reserve(other, 5000)[0] is not None, "each model has its own budget"


def test_max_tokens_fit_under_request_limit(monkeypatch):
    monkeypatch.setattr(llm.settings, "groq_tpm", 8000)
    spec = llm.ModelSpec("groq", "x")
    assert llm._fit_max_tokens(spec, prompt_tokens=5000, wanted=4000) == 2600
    assert llm._fit_max_tokens(spec, prompt_tokens=1000, wanted=1800) == 1800


def feat(name, osm_value, country="IN", type_="city", state=""):
    return {"properties": {"name": name, "osm_value": osm_value, "type": type_, "countrycode": country, "state": state}, "geometry": {"coordinates": [0, 0]}}


def test_rank_prefers_real_destination():
    # Shapes taken from real Photon responses.
    assert rank_photon([feat("Bengaluru", "city"), feat("Bangalore University", "university", type_="house")], "Bangalore")["properties"]["name"] == "Bengaluru"
    gokarna = rank_photon([feat("Gokarna", "village", state="West Bengal"), feat("Gokarna", "town", state="Karnataka")], "Gokarna")
    assert gokarna["properties"]["state"] == "Karnataka"
    bali = rank_photon([feat("Bali", "state", country="ID", type_="state"), feat("Bāli", "village")], "Bali")
    assert bali["properties"]["countrycode"] == "ID"
    assert rank_photon([feat("Goa", "state", type_="state"), feat("Goa", "town", country="PH")], "Goa")["properties"]["countrycode"] == "IN"


def test_headline_price_resists_listicles_and_foreigner_rates():
    from datetime import datetime

    from app.db import Claim, Source
    from app.research.store import EXTRA_FEE_RE, _headline_price

    now = datetime(2026, 9, 1)
    sources = {1: Source(id=1, kind="web"), 2: Source(id=2, kind="youtube"), 3: Source(id=3, kind="youtube")}
    # The real Rajwada claims: one SEO page says 300-600, two vlogs say ~20 for Indians.
    raw = [
        (1, "entry fee", 300, 600, "person", "Entry to Rajwada Palace costs 300-600 per person."),
        (2, "entry", 20, 20, "person", "Entry fee to Rajwada Palace is 20 per person."),
        (3, "entry for Indians", 20, 20, "entry", "Entry for Indian visitors costs 20 rupees."),
        (3, "entry for foreigners", 400, 400, "entry", "Entry for foreign visitors costs 400 rupees."),
        (3, "camera fee", 25, 25, "entry", "Using a camera costs an extra 25 rupees."),
        (3, "entry ticket", 10, 250, "entry", "Entry costs 10 rupees for Indians and 250 for foreigners."),
    ]
    claims = [Claim(source_id=s, item=i, price_min=lo, price_max=hi, unit=u, text=t, published_at=now) for s, i, lo, hi, u, t in raw]
    headline = [c for c in claims if not EXTRA_FEE_RE.search(f"{c.item} {c.text}")]
    unit, lo, hi, kinds, n_sources = _headline_price(headline, sources, lambda c: c.published_at)
    assert unit == "person" and lo == 20 and hi == 20
    assert kinds == {"web", "youtube"} and n_sources == 3


def test_relevance_matches_aliases_and_distinctive_words():
    dest = Destination(name="Bengaluru", aliases=["Bangalore"], key="bengaluru", lat=0, lon=0)
    needles = destination_needles(dest)
    assert mentions("BANGALORE street food under ₹100", needles)
    assert not mentions("How to book Rapido cab", needles)
    spiti = Destination(name="Spiti Valley", aliases=[], key="spiti valley", lat=0, lon=0)
    assert mentions("SPITI 2026 | Kaza to Chandratal", destination_needles(spiti))
