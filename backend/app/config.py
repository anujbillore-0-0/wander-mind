from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All configuration comes from environment variables (or a .env file)."""

    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore")

    database_url: str = "sqlite:///./wandermind.db"
    searxng_url: str = "http://localhost:8080"
    cors_origins: str = "http://localhost:3000"

    # LLM providers. Set any subset of keys; models whose provider has no key are skipped.
    cerebras_api_key: str = ""
    groq_api_key: str = ""
    mistral_api_key: str = ""
    gemini_api_key: str = ""
    openrouter_api_key: str = ""

    # Ordered fallback chains, "provider:model". Each model has its own free quota, so listing several
    # models of one provider multiplies capacity. Models whose provider has no key are skipped.
    planner_models: str = (
        "cerebras:gpt-oss-120b,"
        "groq:openai/gpt-oss-120b,"
        "groq:qwen/qwen3.8-27b,"
        "mistral:mistral-large-latest,"
        "gemini:gemini-flash-lite-latest,"
        "groq:openai/gpt-oss-20b,"
        "openrouter:openai/gpt-oss-120b:free"
    )
    extract_models: str = (
        "cerebras:gpt-oss-120b,"
        "mistral:mistral-small-latest,"
        "groq:openai/gpt-oss-20b,"
        "groq:qwen/qwen3.8-27b,"
        "gemini:gemini-flash-lite-latest,"
        "groq:openai/gpt-oss-120b,"
        "openrouter:openai/gpt-oss-20b:free"
    )

    # Free-tier tokens per minute, per model. Calls are paced to stay under these. Raise them on paid plans.
    groq_tpm: int = 8000
    cerebras_tpm: int = 60000
    mistral_tpm: int = 400000
    gemini_tpm: int = 200000
    openrouter_tpm: int = 60000

    # Optional evidence sources. Without them the app still works with fewer sources.
    youtube_api_key: str = ""
    reddit_client_id: str = ""
    reddit_client_secret: str = ""
    # Wikimedia and Reddit require a descriptive agent with a URL or email - put your own here.
    user_agent: str = "WanderMind/0.1 (https://github.com/wander-mind; self-hosted trip planner)"

    # Research volume per topic. Raise for richer evidence, lower to save LLM quota.
    research_refresh_days: int = 21
    research_videos_per_topic: int = 2
    research_pages_per_topic: int = 2
    research_threads_per_topic: int = 1
    research_max_llm_chunks: int = 20
    research_parallelism: int = 3

    worker_interval_hours: float = 24
    worker_start_delay_minutes: float = 5
    seed_destinations: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
