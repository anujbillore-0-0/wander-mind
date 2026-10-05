"""The contract between planner and UI.

TripRequest is everything we ask the traveller. Itinerary is everything a complete plan contains.
web/src/lib/types.ts mirrors these models - keep them in sync.
"""

from datetime import date, timedelta
from math import ceil
from typing import Literal

from pydantic import BaseModel, Field, model_validator

GroupType = Literal["solo", "couple", "friends", "family", "business"]
Pace = Literal["relaxed", "balanced", "packed"]
Fitness = Literal["easy", "moderate", "challenging"]
Diet = Literal["no_preference", "veg", "non_veg", "jain", "vegan", "eggetarian"]
TimeOfDay = Literal["early_morning", "morning", "afternoon", "evening", "night", "unknown"]
DayStart = Literal["early", "normal", "late"]
EvidenceStatus = Literal["verified", "reported", "estimate"]


# ---------------------------------------------------------------- inputs


class TripRequest(BaseModel):
    # Where & when
    description: str = ""  # the one-line "describe your trip" text, kept for context
    destinations: list[str] = Field(min_length=1, max_length=3)
    origin: str = ""  # where the traveller starts, for getting there & back
    start_date: date | None = None
    end_date: date | None = None
    flexible_month: str = ""  # "2026-11" when dates aren't fixed
    num_days: int | None = Field(default=None, ge=1, le=21)
    arrival_time: TimeOfDay = "morning"
    departure_time: TimeOfDay = "evening"

    # Who
    group_type: GroupType = "solo"
    adults: int = Field(1, ge=1, le=30)
    children: int = Field(0, ge=0, le=20)
    seniors: int = Field(0, ge=0, le=20)
    solo_female: bool = False
    occasion: str = "none"  # none | honeymoon | birthday | anniversary | bachelor | reunion | workation

    # Money & stay
    budget_total: int = Field(..., ge=500, le=10_000_000)  # INR for the whole group, whole trip
    budget_includes_intercity: bool = True
    stay_types: list[str] = []  # hostel | budget_hotel | mid_hotel | homestay | resort | luxury | camping
    stay_booked: bool = False
    stay_address: str = ""
    rooms: int | None = Field(default=None, ge=1, le=20)

    # Style
    vibes: list[str] = []  # food | culture | adventure | nature | spiritual | nightlife | shopping | ...
    pace: Pace = "balanced"
    fitness: Fitness = "moderate"
    day_start: DayStart = "normal"
    crowd_tolerance: Literal["avoid", "ok"] = "ok"

    # Food
    diet: Diet = "no_preference"
    food_notes: str = ""  # allergies, must-try dishes
    alcohol_ok: bool = False

    # Getting around
    local_transport: list[str] = []  # ride_apps | auto | public | rent_two_wheeler | private_cab | walk
    can_ride_two_wheeler: bool = False
    intercity_modes: list[str] = []  # train | bus | flight | self_drive

    # Must / must-not
    must_include: list[str] = []
    avoid: list[str] = []
    accessibility: list[str] = []  # elderly_friendly | wheelchair | avoid_long_walks | avoid_stairs | infant
    notes: str = ""

    @model_validator(mode="after")
    def _check_dates(self):
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("end_date is before start_date")
        if self.start_date and self.end_date and (self.end_date - self.start_date).days > 20:
            raise ValueError("trips longer than 21 days aren't supported yet")
        return self

    @property
    def travelers(self) -> int:
        return self.adults + self.children + self.seniors

    def resolved_days(self) -> int:
        if self.start_date and self.end_date:
            return (self.end_date - self.start_date).days + 1
        if self.start_date and self.num_days:
            return self.num_days
        return self.num_days or 2

    def resolved_start(self) -> date | None:
        return self.start_date

    def resolved_end(self) -> date | None:
        if self.end_date:
            return self.end_date
        if self.start_date:
            return self.start_date + timedelta(days=self.resolved_days() - 1)
        return None

    def travel_month(self) -> int:
        if self.start_date:
            return self.start_date.month
        if self.flexible_month and len(self.flexible_month) >= 7:
            try:
                return int(self.flexible_month[5:7])
            except ValueError:
                pass
        return date.today().month

    def default_rooms(self) -> int:
        if self.rooms:
            return self.rooms
        sleepers = self.adults + self.seniors
        return max(1, ceil(sleepers / 2))


# ---------------------------------------------------------------- outputs


class Evidence(BaseModel):
    status: EvidenceStatus = "estimate"
    source_count: int = 0
    latest: str | None = None  # ISO date of the newest supporting source
    source_ids: list[int] = []
    quotes: list[dict] = []  # {text, quote, source_id, url}


class Place(BaseModel):
    name: str
    area: str = ""
    lat: float | None = None
    lon: float | None = None
    maps_url: str = ""


class Money(BaseModel):
    min: int = 0
    max: int = 0
    per: str = "person"  # person | group | night | ride | item
    note: str = ""


class TransportOption(BaseModel):
    mode: str
    label: str
    cost_min: int
    cost_max: int
    duration_min: int
    note: str = ""


class Leg(BaseModel):
    mode: str
    label: str
    distance_km: float
    duration_min: int
    cost_min: int
    cost_max: int
    note: str = ""
    approximate: bool = False
    options: list[TransportOption] = []


class Alternative(BaseModel):
    title: str
    note: str = ""
    cost_min: int | None = None
    cost_max: int | None = None
    evidence: Evidence = Field(default_factory=Evidence)


class PlanItem(BaseModel):
    id: str
    time: str  # "09:00"
    end_time: str = ""
    slot: str = "morning"  # morning | afternoon | evening | night
    kind: str = "attraction"  # attraction | food | activity | shopping | nightlife | experience | rest | stay
    title: str
    description: str = ""
    place: Place
    duration_min: int = 60
    cost: Money = Field(default_factory=Money)
    tips: list[str] = []
    booking_required: bool = False
    image_url: str = ""
    evidence: Evidence = Field(default_factory=Evidence)
    alternatives: list[Alternative] = []
    leg_to_next: Leg | None = None


class DayWeather(BaseModel):
    date: str | None = None
    t_min: float | None = None
    t_max: float | None = None
    precip_mm: float | None = None
    precip_prob: int | None = None
    label: str = ""
    icon: str = "sun"


class DayPlan(BaseModel):
    day: int
    date: str | None = None
    title: str
    summary: str = ""
    destination: str = ""
    weather: DayWeather | None = None
    start_leg: Leg | None = None  # stay -> first stop
    end_leg: Leg | None = None  # last stop -> stay
    items: list[PlanItem] = []
    cost_min: int = 0
    cost_max: int = 0
    distance_km: float = 0


class SeasonEvent(BaseModel):
    name: str
    when: str = ""
    note: str = ""


class Season(BaseModel):
    label: str = ""  # e.g. "Post-monsoon, pleasant"
    crowd_level: str = "moderate"  # low | moderate | high
    summary: str = ""
    notes: list[str] = []
    events: list[SeasonEvent] = []
    weather_kind: str = "typical"  # forecast | typical


class BudgetCategory(BaseModel):
    key: str
    label: str
    min: int
    max: int
    note: str = ""


class Budget(BaseModel):
    currency: str = "INR"
    user_budget: int
    total_min: int
    total_max: int
    per_person_min: int
    per_person_max: int
    status: Literal["under", "near", "over"] = "under"
    categories: list[BudgetCategory] = []
    saving_tips: list[str] = []
    upgrade_tips: list[str] = []


class GettingThereOption(BaseModel):
    mode: str
    title: str
    duration_text: str = ""
    cost_min: int = 0
    cost_max: int = 0
    per: str = "person, one way"
    details: str = ""
    booking_tip: str = ""
    recommended: bool = False


class GettingThere(BaseModel):
    origin: str = ""
    distance_km: float | None = None
    arrival_hub: str = ""
    options: list[GettingThereOption] = []
    notes: list[str] = []


class StayArea(BaseModel):
    name: str
    why: str = ""
    best_for: str = ""


class StayOption(BaseModel):
    id: str
    name: str
    type: str = "hotel"
    area: str = ""
    price_min: int = 0
    price_max: int = 0
    per: str = "night"
    why: str = ""
    best_for: str = ""
    recommended: bool = False
    place: Place | None = None
    evidence: Evidence = Field(default_factory=Evidence)


class Stay(BaseModel):
    booked: bool = False
    booked_address: str = ""
    nights: int = 0
    rooms: int = 1
    areas: list[StayArea] = []
    options: list[StayOption] = []
    tips: list[str] = []


class Dish(BaseModel):
    dish: str
    where: str = ""
    price_text: str = ""
    note: str = ""
    veg: bool | None = None


class FoodPlace(BaseModel):
    name: str
    area: str = ""
    known_for: str = ""
    price_min: int | None = None
    price_max: int | None = None
    per: str = "person"
    best_time: str = ""
    in_plan: bool = False
    place: Place | None = None
    evidence: Evidence = Field(default_factory=Evidence)


class Food(BaseModel):
    must_try: list[Dish] = []
    places: list[FoodPlace] = []
    tips: list[str] = []


class AppAvailability(BaseModel):
    name: str
    status: Literal["confirmed", "likely", "limited", "unlikely"] = "likely"
    note: str = ""


class ModeInfo(BaseModel):
    mode: str
    label: str
    typical_fare: str = ""
    best_for: str = ""
    note: str = ""


class FareExample(BaseModel):
    distance_km: float
    label: str
    cost_min: int
    cost_max: int


class Transport(BaseModel):
    summary: str = ""
    apps: list[AppAvailability] = []
    modes: list[ModeInfo] = []
    fare_examples: list[FareExample] = []
    rental: str = ""
    tips: list[str] = []


class EmergencyContact(BaseModel):
    label: str
    number: str


class Essentials(BaseModel):
    packing: list[str] = []
    documents: list[str] = []
    money: list[str] = []
    connectivity: list[str] = []
    etiquette: list[str] = []
    safety: list[str] = []
    scams: list[str] = []
    health: list[str] = []
    accessibility: list[str] = []
    emergency: list[EmergencyContact] = []


class BookAhead(BaseModel):
    item: str
    when: str = ""
    why: str = ""


class SimpleIdea(BaseModel):
    title: str
    note: str = ""


class SourceRef(BaseModel):
    id: int
    kind: str
    title: str
    url: str
    author: str = ""
    published_at: str | None = None


class DestinationInfo(BaseModel):
    name: str
    region: str = ""
    country: str = ""
    lat: float
    lon: float
    description: str = ""
    image_url: str = ""
    wiki_url: str = ""


class ResearchStats(BaseModel):
    videos: int = 0
    comment_threads: int = 0
    reddit_threads: int = 0
    web_pages: int = 0
    user_reports: int = 0
    claims: int = 0
    newest_source: str | None = None


class Itinerary(BaseModel):
    title: str
    summary: str = ""
    highlights: list[str] = []
    destination: DestinationInfo
    other_destinations: list[DestinationInfo] = []
    start_date: str | None = None
    end_date: str | None = None
    days_count: int
    nights: int
    travelers: int
    travelers_label: str
    style_tags: list[str] = []
    season: Season = Field(default_factory=Season)
    weather: list[DayWeather] = []
    budget: Budget
    getting_there: GettingThere = Field(default_factory=GettingThere)
    stay: Stay = Field(default_factory=Stay)
    days: list[DayPlan] = []
    food: Food = Field(default_factory=Food)
    transport: Transport = Field(default_factory=Transport)
    essentials: Essentials = Field(default_factory=Essentials)
    book_ahead: list[BookAhead] = []
    rainy_day: list[SimpleIdea] = []
    hidden_gems: list[SimpleIdea] = []
    sources: list[SourceRef] = []
    data_gaps: list[str] = []
    research: ResearchStats = Field(default_factory=ResearchStats)
    generated_at: str
    version: int = 1


# ---------------------------------------------------------------- API payloads


class ParseRequest(BaseModel):
    text: str = Field(min_length=3, max_length=2000)


class TweakRequest(BaseModel):
    instruction: str = Field(min_length=3, max_length=1000)


class PriceReportIn(BaseModel):
    item_title: str = Field(min_length=1, max_length=200)
    place_name: str = ""
    kind: str = "attraction"
    price_paid: float = Field(ge=0, le=1_000_000)
    unit: str = "person"
    note: str = Field(default="", max_length=500)
