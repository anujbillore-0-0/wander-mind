"""Weather for the trip: a real forecast when the dates are close, otherwise last year's weather for the same days."""

from datetime import date, timedelta

import httpx

from .http import get_json

WMO = {
    0: ("Clear sky", "sun"),
    1: ("Mostly clear", "sun"),
    2: ("Partly cloudy", "cloud-sun"),
    3: ("Overcast", "cloud"),
    45: ("Fog", "fog"),
    48: ("Fog", "fog"),
    51: ("Light drizzle", "drizzle"),
    53: ("Drizzle", "drizzle"),
    55: ("Heavy drizzle", "drizzle"),
    56: ("Freezing drizzle", "drizzle"),
    57: ("Freezing drizzle", "drizzle"),
    61: ("Light rain", "rain"),
    63: ("Rain", "rain"),
    65: ("Heavy rain", "rain"),
    66: ("Freezing rain", "rain"),
    67: ("Freezing rain", "rain"),
    71: ("Light snow", "snow"),
    73: ("Snow", "snow"),
    75: ("Heavy snow", "snow"),
    77: ("Snow grains", "snow"),
    80: ("Showers", "rain"),
    81: ("Showers", "rain"),
    82: ("Heavy showers", "rain"),
    85: ("Snow showers", "snow"),
    86: ("Snow showers", "snow"),
    95: ("Thunderstorm", "storm"),
    96: ("Thunderstorm, hail", "storm"),
    99: ("Thunderstorm, hail", "storm"),
}

MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]


def _safe_date(year: int, month: int, day: int) -> date:
    try:
        return date(year, month, day)
    except ValueError:
        return date(year, month, 28)


def get_weather(lat: float, lon: float, start: date | None, days: int, month: int) -> dict:
    today = date.today()
    forecastable = start is not None and today <= start and start + timedelta(days=days - 1) <= today + timedelta(days=15)
    daily = "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum"

    if forecastable:
        kind = "forecast"
        q_start = start
        url = "https://api.open-meteo.com/v1/forecast"
        params_daily = daily + ",precipitation_probability_max"
    else:
        kind = "typical"
        ref = start or _safe_date(today.year if month >= today.month else today.year + 1, month, 10)
        year = ref.year - 1
        while _safe_date(year, ref.month, ref.day) + timedelta(days=days) > today - timedelta(days=6):
            year -= 1
        q_start = _safe_date(year, ref.month, ref.day)
        url = "https://archive-api.open-meteo.com/v1/archive"
        params_daily = daily

    q_end = q_start + timedelta(days=days - 1)
    try:
        data = get_json(
            url,
            {
                "latitude": round(lat, 3),
                "longitude": round(lon, 3),
                "daily": params_daily,
                "timezone": "auto",
                "start_date": q_start.isoformat(),
                "end_date": q_end.isoformat(),
            },
            ttl_hours=3 if kind == "forecast" else 24 * 60,
        )
    except httpx.HTTPError:
        return {"kind": kind, "days": [], "summary": ""}

    d = data.get("daily") or {}
    out = []
    for i in range(len(d.get("time", []))):
        code = (d.get("weather_code") or [None])[i]
        label, icon = WMO.get(code, ("", "sun"))
        trip_day = (start + timedelta(days=i)).isoformat() if start else None
        out.append(
            {
                "date": trip_day,
                "t_min": (d.get("temperature_2m_min") or [None])[i],
                "t_max": (d.get("temperature_2m_max") or [None])[i],
                "precip_mm": (d.get("precipitation_sum") or [None])[i],
                "precip_prob": (d.get("precipitation_probability_max") or [None] * (i + 1))[i],
                "label": label,
                "icon": icon,
            }
        )

    summary = ""
    temps_min = [x["t_min"] for x in out if x["t_min"] is not None]
    temps_max = [x["t_max"] for x in out if x["t_max"] is not None]
    if temps_min and temps_max:
        rainy = sum(1 for x in out if (x["precip_mm"] or 0) >= 2)
        lead = "Forecast" if kind == "forecast" else f"Typical for {MONTHS[q_start.month - 1]} (same dates last year)"
        summary = f"{lead}: {round(min(temps_min))}–{round(max(temps_max))}°C, {rainy} rainy day{'s' if rainy != 1 else ''} of {len(out)}."
    return {"kind": kind, "days": out, "summary": summary}
