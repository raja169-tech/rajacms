"""
config.py — Application settings loaded from environment variables.
Uses pydantic-settings for automatic .env loading and type validation.
"""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Supabase ──────────────────────────────────────────────────────────────
    supabase_url: str
    supabase_service_key: str
    supabase_storage_bucket: str = "proof-uploads"

    # ── JWT ───────────────────────────────────────────────────────────────────
    jwt_secret: str
    jwt_refresh_secret: str
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 15
    jwt_refresh_token_expire_days: int = 14

    # ── CORS ──────────────────────────────────────────────────────────────────
    allowed_origins: str = "http://localhost:5500"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    # ── Environment ───────────────────────────────────────────────────────────
    env: str = "development"

    @property
    def is_production(self) -> bool:
        return self.env == "production"

    # ── Rate Limiting ─────────────────────────────────────────────────────────
    rate_limit_login: str = "5/15minutes"


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton — reads .env once at startup."""
    return Settings()
