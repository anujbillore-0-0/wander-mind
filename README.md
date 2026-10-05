# Wander Mind

An evidence-based trip planner. Wander Mind reads **recent travel vlogs, their comments, Reddit threads and blogs**,
extracts real prices, timings and warnings, and builds a day-by-day itinerary inside your budget. Every stop carries
a stamp showing where its information came from.

Everything is free to run: local Docker services, free-tier LLM APIs, and OpenStreetMap / Open-Meteo / Wikipedia data.

---

## Quick start (Docker)

```bash
cp .env.example .env        # then add at least ONE LLM key (see below)
docker compose up --build
```

Open <http://localhost:3000>. A sample plan you can explore without any keys is at <http://localhost:3000/trip/sample>.

Docker Compose starts:

| Service   | What it does                                                  | Port |
|-----------|---------------------------------------------------------------|------|
| `web`     | Next.js frontend                                              | 3000 |
| `api`     | FastAPI + LangGraph planner                                   | 8000 |
| `worker`  | Re-researches popular destinations in the background          | -    |
| `db`      | Postgres (pgvector image) for evidence, trips, cache          | 5432 |
| `searxng` | Self-hosted web search for blogs and forums (no API key)      | 8080 |

## Run without Docker (development)

```bash
# backend - uses SQLite by default, no database setup needed
cd backend
python -m venv .venv && .venv/Scripts/activate      # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# frontend
cd web
npm install
npm run dev

# optional: web search for blogs and forums
docker compose up searxng
```

The backend reads `.env` from the project root.

## Free keys

You need **one** LLM key. Add more and the app rotates between them whenever one hits its free-tier limit.
Calls are paced against each model's per-minute token limit (`GROQ_TPM` etc.), and several models from the same
provider are used in turn, because free quotas are per model. A single Groq key therefore spreads work across
`gpt-oss-20b`, `qwen3.8-27b` and `gpt-oss-120b`. A brand-new city takes a few minutes on one Groq key. Places
you've researched before take about a minute.

| Provider   | Where                                   | Notes                                    |
|------------|-----------------------------------------|------------------------------------------|
| Cerebras   | https://cloud.cerebras.ai               | Fastest. ~1M tokens/day, 8K context cap   |
| Groq       | https://console.groq.com/keys           | ~200K tokens/day per model               |
| Mistral    | https://console.mistral.ai/api-keys     | Large monthly allowance, low req/min     |
| Gemini     | https://aistudio.google.com/apikey      | Flash-Lite free tier                     |
| OpenRouter | https://openrouter.ai/keys              | `:free` models, low daily cap            |

Optional sources that make plans richer:

- **YouTube Data API key**: better search plus vlog comments, which often hold the freshest prices.
- **Reddit app credentials**: since late 2025 Reddit only gives API access to projects it approves (a manual
  Data Access Request that needs a public product URL). Without approval, Reddit is skipped.
- **USER_AGENT**: put your own URL or email. Wikipedia rejects anonymous agents.

Free-tier limits change often. Check each provider's dashboard.

## How a plan is made

```
resolve ─► research ─► weather ─► evidence ─► draft ─► cost ──(problems?)──► draft (max 2)
                                                        └──────────────────► guides ─► compose
```

1. **Resolve**: finds the place with Photon (OpenStreetMap), which understands old names, states, regions and
   islands (Bangalore → Bengaluru, Goa, Spiti Valley, Bali). The name you typed is kept as an alias for research.
   It also gets a Wikipedia photo and summary.
2. **Research**: only for stale topics (food, stay, transport, budget, season, your vibes). It searches YouTube,
   the web (SearXNG) and Reddit, then fetches transcripts, comments and articles. The useful passages are picked by
   keyword before any LLM call, then the LLM extracts structured claims: entity, price range, unit, tip, warning,
   quote and video timestamp.
3. **Evidence**: claims are merged per place (fuzzy name matching), and prices are combined as a weighted median
   that favours recent sources.
4. **Draft**: the LLM builds days from the evidence digest, citing refs like `E12`. Places without evidence are
   marked as *AI estimates*.
5. **Cost** (plain code, no LLM): geocodes stops, prices every leg (Rapido/auto/cab in cities, local taxis and
   shared jeeps in hill towns), picks a stay that fits, adds getting there and back, and checks the budget.
   The critic sends problems back to the draft step: over budget, pace too packed, missing must-dos, zig-zagging days.
6. **Guides**: three parallel LLM calls write the season notes, food and transport guide, and safety and packing notes.
7. **Compose**: the result is validated against the `Itinerary` schema (`backend/app/schemas.py`).

After a plan is ready you can **tweak** it ("make it cheaper", "more street food on day 2"). Tweaks reuse the
research and re-plan in place. Travellers can also report **what they paid**, and each report becomes evidence for
future plans.

### What we ask

Destinations (up to 3), starting city, exact or flexible dates, arrival and departure time, group type and size,
solo-woman safety mode, occasion, total budget (with or without travel there), stay type or an existing booking,
vibes, pace, fitness, mornings, crowd tolerance, diet, allergies, drinks, local transport preferences, scooter
licence, intercity modes, must-include, avoid, accessibility needs, and free-text notes. Only a destination and a
budget are required. Typing one sentence on the home page pre-fills the rest.

### What a plan contains

Title, summary and highlights · season, crowds, events and day-by-day weather · budget by category with saving tips ·
getting there and back (train, bus, flight, cab, self-drive with prices) · where to stay (areas + options) ·
day-by-day timeline with times, costs, tips, booking flags, alternatives, a map and a priced leg between every stop ·
food guide (must-try dishes with veg marks, places and prices) · getting around (app availability, fare table,
rentals) · packing, documents, money, connectivity, etiquette, safety, scams, health, accessibility, emergency
numbers · book-ahead list · rainy-day ideas and hidden gems · every source, plus what couldn't be verified.

## Project layout

```
backend/app/
  main.py            API routes
  schemas.py         TripRequest + Itinerary contract (mirrored in web/src/lib/types.ts)
  llm.py             free-LLM gateway with fallback and cooldowns
  research/          collectors (YouTube, Reddit, web), extraction, evidence store
  planner/           LangGraph graph, prompts, costing, compose
  services/          geo, weather, fares, cached HTTP
  worker.py          background refresher
web/src/
  app/               pages: home, /plan, /trip/[id], /trips
  components/plan    trip form + boarding-pass summary
  components/trip    itinerary view, timeline, map, evidence sheet, sections
```

## Tests

```bash
cd backend && .venv/Scripts/python -m pytest -q    # runs the full planner offline, with scripted sources and LLM
cd web && npx tsc --noEmit && npx eslint src
```

## Good to know

- Prices are **ranges with sources**, not quotes. The UI says when something is an AI estimate.
- Price evidence is combined one vote per source. Vlogs, comments and traveller reports count more than web articles,
  and foreigner rates and camera fees are left out of entry prices, so one SEO listicle can't inflate a plan.
- The background worker pauses whenever someone is planning a trip, so it never competes with you for LLM quota.
  `SEED_DESTINATIONS` pre-researches extra places. Leave it empty on a single free key.
- Maps use Leaflet with OpenStreetMap tiles (free, no key, fine for personal and light use).
- YouTube blocks most cloud-server IPs, so run this on a home connection, or expect fewer transcripts on a server.
- Store facts, short quotes and links, never republish full transcripts, and always credit the creator.
  Wander Mind links every quote back to its source.
