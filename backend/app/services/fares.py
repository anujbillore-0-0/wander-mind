"""Local and intercity fare estimates.

None of the ride apps publish a fare API, so legs are priced with a simple
base + per-km model per mode. That gives a range, not a quote, and the UI labels it as an estimate.
Recent fares found in evidence are shown alongside in the transport guide.
"""

from dataclasses import dataclass
from math import ceil


@dataclass(frozen=True)
class Mode:
    key: str
    label: str
    base: float
    per_km: float
    min_fare: float
    speed_kmh: float
    capacity: int
    wait_min: int = 4
    per_person: bool = False


CITY_MODES: dict[str, Mode] = {
    "walk": Mode("walk", "Walk", 0, 0, 0, 4.5, 99, 0, per_person=True),
    "bike_taxi": Mode("bike_taxi", "Bike taxi (Rapido / Uber Moto)", 15, 7, 25, 22, 1),
    "auto": Mode("auto", "Auto-rickshaw", 30, 13, 35, 18, 3),
    "cab": Mode("cab", "Cab (Uber / Ola / Rapido)", 60, 16, 100, 20, 4),
    "local_taxi": Mode("local_taxi", "Local taxi (fixed rates)", 0, 28, 300, 20, 4, 8),
    "shared": Mode("shared", "Shared auto / jeep", 10, 2.5, 15, 15, 99, 10, per_person=True),
    "bus": Mode("bus", "City bus", 10, 1.2, 10, 14, 99, 12, per_person=True),
}

MODE_NOTES = {
    "bike_taxi": "Book on Rapido, Uber Moto or Ola Bike. One rider per bike.",
    "auto": "Book on an app or agree the fare before you sit in.",
    "cab": "Book on Uber, Ola or Rapido Cab. Prices rise at peak hours.",
    "local_taxi": "Taxi stands often run on fixed union rates. Confirm the price first.",
    "shared": "Hop-on, hop-off on fixed routes. Cheapest way around.",
    "bus": "Cheapest option. Ask locals for the route number.",
    "walk": "Short walk.",
}


def app_status(population: int | None, elevation: float | None) -> str:
    """Prior guess at ride-app coverage. Evidence can override it in the transport guide."""
    pop, elev = population or 0, elevation or 0
    if elev >= 1800 and pop < 400_000:
        return "unlikely"  # hill stations run on taxi unions and shared jeeps
    if pop >= 400_000 and elev < 1200:
        return "likely"
    if pop >= 100_000:
        return "limited"
    return "unlikely"


def is_hilly(elevation: float | None) -> bool:
    return (elevation or 0) >= 1000


def road_km(straight_km: float, hilly: bool) -> float:
    return straight_km * (1.7 if hilly else 1.35)


def _round5(x: float) -> int:
    return int(5 * round(x / 5))


def estimate(mode_key: str, km: float, travelers: int, hilly: bool) -> dict:
    m = CITY_MODES[mode_key]
    speed = m.speed_kmh * (0.65 if hilly and mode_key != "walk" else 1)
    duration = round(km / speed * 60) + m.wait_min
    if mode_key == "walk":
        lo = hi = 0
    else:
        units = travelers if m.per_person else ceil(travelers / m.capacity)
        fare = max(m.min_fare, m.base + m.per_km * km)
        lo, hi = _round5(fare * 0.85 * units), _round5(fare * 1.3 * units)
    label = m.label
    if mode_key == "bike_taxi" and travelers > 1:
        label = f"{label} × {travelers}"
    return {
        "mode": mode_key,
        "label": label,
        "cost_min": lo,
        "cost_max": hi,
        "duration_min": max(duration, 2),
        "note": MODE_NOTES.get(mode_key, ""),
    }


def candidate_modes(km: float, travelers: int, prefs: list[str], accessibility: list[str], vulnerable: bool, apps: str) -> list[str]:
    """Ordered list of sensible modes for a leg; the first is the recommendation."""
    walk_ok = km <= 1.0 and not ({"wheelchair", "avoid_long_walks"} & set(accessibility))
    modes: list[str] = ["walk"] if walk_ok else []
    if apps in ("likely", "limited"):
        if travelers == 1 and not vulnerable and km <= 15:
            modes.append("bike_taxi")
        if travelers <= 3 and "wheelchair" not in accessibility and km <= 20:
            modes.append("auto")
        modes.append("cab")
        if "public" in prefs:
            modes.append("bus")
    else:
        if travelers <= 2 and km <= 15 and not vulnerable:
            modes.append("shared")
        modes.append("local_taxi")

    # Respect stated preferences by moving preferred modes to the front (walk stays first when it fits).
    preferred = {
        "private_cab": ["cab", "local_taxi"],
        "auto": ["auto"],
        "ride_apps": ["bike_taxi", "auto", "cab"],
        "public": ["bus", "shared"],
    }
    wanted = [m for p in prefs for m in preferred.get(p, [])]
    head = [m for m in modes if m == "walk"]
    rest = [m for m in modes if m != "walk"]
    rest.sort(key=lambda m: wanted.index(m) if m in wanted else len(wanted))
    return head + rest


def leg(straight_km: float, travelers: int, prefs: list[str], accessibility: list[str], vulnerable: bool, apps: str, hilly: bool, approximate: bool = False) -> dict:
    km = round(road_km(straight_km, hilly), 1)
    if km > 40:
        return intercity_leg(km, travelers, approximate)
    modes = candidate_modes(km, travelers, prefs, accessibility, vulnerable, apps)
    options = [estimate(m, km, travelers, hilly) for m in modes[:3]]
    best = options[0]
    return {
        "mode": best["mode"],
        "label": best["label"],
        "distance_km": km,
        "duration_min": best["duration_min"],
        "cost_min": best["cost_min"],
        "cost_max": best["cost_max"],
        "note": best["note"],
        "approximate": approximate,
        "options": options,
    }


def intercity_leg(km: float, travelers: int, approximate: bool = False) -> dict:
    vehicles = ceil(travelers / 4)
    cab = {
        "mode": "cab",
        "label": "Outstation cab",
        "cost_min": _round5(11 * km * vehicles),
        "cost_max": _round5(15 * km * vehicles),
        "duration_min": round(km / 45 * 60),
        "note": "One-way outstation cab. Book a day ahead.",
    }
    bus = {
        "mode": "bus",
        "label": "State / private bus",
        "cost_min": _round5(1.0 * km * travelers),
        "cost_max": _round5(2.2 * km * travelers),
        "duration_min": round(km / 38 * 60) + 15,
        "note": "Cheapest. Check the state transport site or redBus.",
    }
    first, second = (bus, cab) if travelers <= 2 else (cab, bus)
    return {**{k: first[k] for k in ("mode", "label", "cost_min", "cost_max", "duration_min", "note")}, "distance_km": round(km, 1), "approximate": approximate, "options": [first, second]}


def intercity_options(straight_km: float, travelers: int, prefs: list[str], budget_per_person_day: float = 2000) -> list[dict]:
    """Getting there & back. Costs are per person one way, except car modes, which are per vehicle."""
    km = straight_km * 1.25
    vehicles = ceil(travelers / 4)
    opts = []
    opts.append(
        {
            "mode": "train",
            "title": "Train (Sleeper to 3AC)",
            "cost_min": _round5(max(150, 0.45 * km)),
            "cost_max": _round5(max(450, 1.6 * km)),
            "per": "person, one way",
            "hours": km / 55 + 0.5,
        }
    )
    opts.append(
        {
            "mode": "bus",
            "title": "Bus (ordinary to AC sleeper)",
            "cost_min": _round5(max(120, 1.0 * km)),
            "cost_max": _round5(max(300, 2.3 * km)),
            "per": "person, one way",
            "hours": km / 45,
        }
    )
    if km >= 500:
        opts.append(
            {
                "mode": "flight",
                "title": "Flight (economy)",
                "cost_min": 3000,
                "cost_max": 8500,
                "per": "person, one way",
                "hours": 1.5 + km / 700 + 3,
            }
        )
    if km <= 700:
        opts.append(
            {
                "mode": "cab",
                "title": "Outstation cab",
                "cost_min": _round5(11 * km * vehicles),
                "cost_max": _round5(15 * km * vehicles),
                "per": f"{vehicles} vehicle{'s' if vehicles > 1 else ''}, one way",
                "hours": km / 50,
            }
        )
        opts.append(
            {
                "mode": "self_drive",
                "title": "Self drive (fuel + tolls)",
                "cost_min": _round5(6 * km * vehicles),
                "cost_max": _round5(9 * km * vehicles),
                "per": f"{vehicles} car{'s' if vehicles > 1 else ''}, one way",
                "hours": km / 50,
            }
        )

    wanted = [p for p in prefs if p != "any"]
    if wanted:
        opts.sort(key=lambda o: 0 if o["mode"] in wanted else 1)
        recommended = opts[0]["mode"]
    elif km < 250:
        # A shared cab only makes sense for groups who aren't counting every rupee.
        recommended = "cab" if travelers >= 3 and budget_per_person_day >= 2500 else "bus"
    elif km < 1100 or budget_per_person_day < 3000:
        recommended = "train"
    else:
        recommended = "flight" if any(o["mode"] == "flight" for o in opts) else "train"
    for o in opts:
        o["recommended"] = o["mode"] == recommended
        h = o.pop("hours")
        o["duration_text"] = f"≈ {round(h)} h" if h >= 1.5 else f"≈ {round(h * 60)} min"
        o["group_cost"] = o["mode"] in ("cab", "self_drive")
    return opts


def fare_examples(apps: str, travelers: int, hilly: bool) -> list[dict]:
    modes = ["bike_taxi", "auto", "cab"] if apps in ("likely", "limited") else ["shared", "local_taxi"]
    out = []
    for km in (3, 7, 12):
        for m in modes:
            e = estimate(m, km, 1 if m == "bike_taxi" else travelers, hilly)
            out.append({"distance_km": km, "label": CITY_MODES[m].label, "cost_min": e["cost_min"], "cost_max": e["cost_max"]})
    return out
