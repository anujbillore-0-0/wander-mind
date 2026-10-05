"""One small gateway over the free LLM providers. All of them speak the OpenAI API.

Free tiers cap tokens per minute *per model*, so every call is booked against a one-minute token
window for the model it goes to. A call goes to the first model in the chain with room in its
window; when none has room, the call waits for the earliest one to free up. That keeps parallel
research from triggering waves of 429s. Real 429s still park a model until the provider's
retry-after has passed.
"""

import json
import logging
import re
import threading
import time
from collections import Counter, defaultdict
from dataclasses import dataclass

from openai import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    BadRequestError,
    OpenAI,
    RateLimitError,
)

from .config import settings

log = logging.getLogger(__name__)

PROVIDERS: dict[str, tuple[str, str]] = {
    "cerebras": ("https://api.cerebras.ai/v1", "cerebras_api_key"),
    "groq": ("https://api.groq.com/openai/v1", "groq_api_key"),
    "mistral": ("https://api.mistral.ai/v1", "mistral_api_key"),
    "gemini": ("https://generativelanguage.googleapis.com/v1beta/openai/", "gemini_api_key"),
    "openrouter": ("https://openrouter.ai/api/v1", "openrouter_api_key"),
}

# Background extraction can queue behind other calls; a traveller's planning call shouldn't wait as long.
DEADLINE_SECONDS = {"extract": 900, "planner": 300}


class LLMUnavailable(RuntimeError):
    pass


@dataclass(frozen=True)
class ModelSpec:
    provider: str
    model: str

    @property
    def label(self) -> str:
        return f"{self.provider}:{self.model}"

    @property
    def tpm(self) -> int:
        return int(getattr(settings, f"{self.provider}_tpm"))


def _chain(task: str) -> list[ModelSpec]:
    raw = settings.planner_models if task == "planner" else settings.extract_models
    specs = []
    for part in raw.split(","):
        part = part.strip()
        if ":" not in part:
            continue
        provider, model = part.split(":", 1)
        if provider in PROVIDERS and getattr(settings, PROVIDERS[provider][1]):
            specs.append(ModelSpec(provider, model))
    return specs


def configured_providers() -> list[str]:
    return [p for p, (_, key) in PROVIDERS.items() if getattr(settings, key)]


_clients: dict[str, OpenAI] = {}
_lock = threading.Lock()
_window_lock = threading.Lock()
_window: dict[str, list[list[float]]] = defaultdict(list)  # model label -> [[timestamp, tokens], ...]
_cooldown_until: dict[str, float] = {}
_no_json_mode: set[str] = set()
usage = Counter()  # "<model label>:calls" / ":tokens" - shown on /api/health


def _client(provider: str) -> OpenAI:
    with _lock:
        if provider not in _clients:
            base_url, key_attr = PROVIDERS[provider]
            _clients[provider] = OpenAI(
                base_url=base_url, api_key=getattr(settings, key_attr), timeout=120, max_retries=0
            )
        return _clients[provider]


def _reasoning_kwargs(spec: ModelSpec, effort: str) -> dict:
    """Reasoning models spend output tokens thinking; keep that small so the JSON fits."""
    if "gpt-oss" in spec.model:
        if spec.provider in ("groq", "cerebras"):
            return {"reasoning_effort": effort}
        if spec.provider == "openrouter":
            return {"extra_body": {"reasoning": {"effort": effort}}}
    if spec.provider == "groq" and "qwen" in spec.model:
        return {"extra_body": {"reasoning_format": "hidden"}}
    return {}


def _prompt_tokens(system: str, user: str) -> int:
    # ~3 chars per token: conservative for English, about right for Hindi/Hinglish.
    return (len(system) + len(user)) // 3 + 20


def _fit_max_tokens(spec: ModelSpec, prompt_tokens: int, wanted: int) -> int:
    """Providers reject a request whose prompt + max_tokens exceeds the per-minute limit."""
    room = int(spec.tpm * 0.95) - prompt_tokens
    return max(min(wanted, room), 600)


def _try_reserve(spec: ModelSpec, tokens: int) -> tuple[list[float] | None, float]:
    """Book tokens in the model's one-minute window. Returns (booking, 0) or (None, seconds to wait)."""
    with _window_lock:
        now = time.time()
        entries = [e for e in _window[spec.label] if e[0] > now - 60]
        _window[spec.label] = entries
        used = sum(e[1] for e in entries)
        if used + tokens <= spec.tpm or not entries:
            booking = [now, float(tokens)]
            entries.append(booking)
            return booking, 0.0
        excess, freed = used + tokens - spec.tpm, 0.0
        for ts, t in entries:
            freed += t
            if freed >= excess:
                return None, ts + 60 - now + 0.1
        return None, 60.0


def _cooldown_seconds(err: RateLimitError) -> float:
    try:
        retry_after = err.response.headers.get("retry-after")
        if retry_after:
            return min(float(retry_after) + 0.5, 3600)
    except (AttributeError, ValueError):
        pass
    msg = str(err).lower()
    if any(k in msg for k in ("per day", "tpd", "rpd", "daily", "quota")):
        return 3600
    return 20


def extract_json(text: str):
    """Pull a JSON object out of a model reply that may contain fences or reasoning."""
    text = re.sub(r"<think>.*?</think>", "", text or "", flags=re.S).strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    if fence:
        text = fence.group(1).strip()
    starts = [i for i in (text.find("{"), text.find("[")) if i != -1]
    if not starts:
        raise ValueError("no JSON in reply")
    candidate = text[min(starts):]
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        end = max(candidate.rfind("}"), candidate.rfind("]"))
        return json.loads(candidate[: end + 1])


class _SkipModel(Exception):
    """This model can't serve this particular request (bad JSON, too long) - try the next one."""


def _call(spec: ModelSpec, system: str, user: str, max_tokens: int, temperature: float, effort: str, booking: list[float]):
    kwargs: dict = {
        "model": spec.model,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "max_tokens": max_tokens,
        "temperature": temperature,
        **_reasoning_kwargs(spec, effort),
    }
    if spec.label not in _no_json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    for attempt in range(3):
        try:
            resp = _client(spec.provider).chat.completions.create(**kwargs)
        except BadRequestError as e:
            msg = str(e).lower()
            if "response_format" in kwargs and ("response_format" in msg or "json" in msg):
                # Provider rejects JSON mode (or failed to produce it) - retry with plain text.
                _no_json_mode.add(spec.label)
                kwargs.pop("response_format")
                continue
            raise _SkipModel(f"HTTP 400 {str(e)[:160]}") from e

        usage[f"{spec.label}:calls"] += 1
        if resp.usage and resp.usage.total_tokens:
            usage[f"{spec.label}:tokens"] += resp.usage.total_tokens
            booking[1] = float(resp.usage.total_tokens) if attempt == 0 else booking[1] + resp.usage.total_tokens
        choice = resp.choices[0]
        content = choice.message.content or ""
        try:
            return extract_json(content)
        except (ValueError, json.JSONDecodeError):
            if choice.finish_reason == "length" or attempt == 2:
                raise _SkipModel("reply was cut off or not JSON")
            kwargs["messages"] = kwargs["messages"] + [
                {"role": "assistant", "content": content[:1500]},
                {"role": "user", "content": "That was not valid JSON. Reply with ONLY the JSON object."},
            ]
    raise _SkipModel("no usable reply")


def complete_json(
    task: str,
    system: str,
    user: str,
    *,
    max_tokens: int = 2048,
    temperature: float = 0.3,
    effort: str = "low",
):
    """Run a JSON-returning prompt on the first available model for `task` ("planner" or "extract")."""
    chain = _chain(task)
    if not chain:
        raise LLMUnavailable(
            "No LLM API key configured. Add at least one of CEREBRAS_API_KEY, GROQ_API_KEY, "
            "MISTRAL_API_KEY, GEMINI_API_KEY or OPENROUTER_API_KEY to .env"
        )
    errors: list[str] = []
    skipped: set[str] = set()
    rejected_keys: set[str] = set()
    deadline = time.time() + DEADLINE_SECONDS.get(task, 300)
    prompt_tokens = _prompt_tokens(system, user)

    while True:
        now = time.time()
        candidates = [s for s in chain if s.label not in skipped]
        if not candidates:
            break
        spec, booking, waits = None, None, []
        for s in candidates:
            cooling = _cooldown_until.get(s.label, 0) - now
            if cooling > 0:
                waits.append(cooling)
                continue
            booking, wait = _try_reserve(s, prompt_tokens + _fit_max_tokens(s, prompt_tokens, max_tokens))
            if booking is not None:
                spec = s
                break
            waits.append(wait)
        if spec is None:
            wake = min(waits) if waits else 1.0
            if now + wake > deadline:
                break
            time.sleep(min(max(wake, 0.5), 20))
            continue

        try:
            return _call(spec, system, user, _fit_max_tokens(spec, prompt_tokens, max_tokens), temperature, effort, booking)
        except RateLimitError as e:
            wait = _cooldown_seconds(e)
            _cooldown_until[spec.label] = time.time() + wait
            errors.append(f"{spec.label} rate-limited ({int(wait)}s)")
        except (APIConnectionError, APITimeoutError) as e:
            _cooldown_until[spec.label] = time.time() + 20
            errors.append(f"{spec.label} {type(e).__name__}")
        except APIStatusError as e:
            if e.status_code == 413:  # this request is too big for this model's limits
                skipped.add(spec.label)
            else:
                _cooldown_until[spec.label] = time.time() + (600 if e.status_code in (401, 403, 404) else 30)
            if e.status_code in (401, 403):
                rejected_keys.add(spec.provider)
            errors.append(f"{spec.label} HTTP {e.status_code}")
        except _SkipModel as e:
            skipped.add(spec.label)
            errors.append(f"{spec.label} {e}")
        log.warning("LLM fallback: %s", errors[-1])

    if rejected_keys and rejected_keys >= {s.provider for s in chain}:
        raise LLMUnavailable(
            f"The API key for {', '.join(sorted(rejected_keys))} was rejected. Check it in .env and restart the server."
        )
    raise LLMUnavailable("All LLM providers are busy or failed: " + "; ".join(errors[-6:]))
