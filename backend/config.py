from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator, model_validator
from typing import Optional
import logging
import secrets

logger = logging.getLogger("finova.config")

ALLOWED_APP_ENVS = {"development", "dev", "test", "staging", "prod", "production"}
PRODUCTION_ENVS = {"production", "prod", "staging"}
ALLOWED_JWT_ALGORITHMS = {"HS256", "HS384", "HS512"}
KNOWN_WEAK_JWT_SECRETS = {
    "finova-enterprise-security-jwt-secret-key-prod-2026-xyz",
    "change_this_to_a_secure_random_hex_string_32_chars_min",
    "secret",
    "changeme",
    "default",
    "dev-secret",
    "jwt-secret",
    "your-secret-key",
    "your_jwt_secret_key",
}
WEAK_SECRET_SUBSTRINGS = (
    "change_this",
    "change-this",
    "changeme",
    "placeholder",
    "your_",
    "your-",
    "replace_me",
    "replace-me",
    "dev-secret",
    "example",
)


def is_weak_or_placeholder_secret(secret: str) -> bool:
    """Returns True if a JWT secret is empty, short, low-entropy, or a known placeholder."""
    cleaned = secret.strip()
    if len(cleaned) < 32:
        return True
    lowered = cleaned.lower()
    if lowered in KNOWN_WEAK_JWT_SECRETS:
        return True
    if any(marker in lowered for marker in WEAK_SECRET_SUBSTRINGS):
        return True
    # Reject trivial repeated-character / low-entropy patterns case-insensitively
    if len(set(lowered)) < 8:
        return True
    return False


class Settings(BaseSettings):
    PAYPAL_CLIENT_ID: str = "your_paypal_client_id"
    PAYPAL_CLIENT_SECRET: str = "your_paypal_client_secret"
    PAYPAL_MODE: str = "sandbox"
    PAYPAL_BASE_URL: str = "https://api-m.sandbox.paypal.com"
    PAYPAL_WEBHOOK_ID: Optional[str] = None

    DATABASE_URL: str = "sqlite:///./finova.db"
    GEMINI_API_KEY: Optional[str] = None

    # Security & Authentication Settings
    JWT_SECRET_KEY: str = ""
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 120
    PASSWORD_RESET_TOKEN_EXPIRE_MINUTES: int = 30
    RATE_LIMIT_AUTH_PER_MINUTE: int = 20
    RATE_LIMIT_API_PER_MINUTE: int = 120
    MAX_REQUEST_SIZE_BYTES: int = 10485760  # 10MB

    APP_ENV: str = "development"
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    FRONTEND_ORIGIN: str = "http://localhost:5173"
    ALLOWED_ORIGINS: Optional[str] = None
    TRUST_PROXY_HEADERS: bool = False
    TRUSTED_PROXY_IPS: Optional[str] = None
    REDIS_URL: Optional[str] = None

    # Out-of-Band Email / SMTP Configuration (Password Reset Delivery)
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USERNAME: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    SMTP_FROM_EMAIL: Optional[str] = None
    SMTP_USE_TLS: bool = True
    SMTP_USE_SSL: bool = False
    SMTP_TIMEOUT_SECONDS: int = 10

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def is_production(self) -> bool:
        """Returns True for staging/prod/production environments."""
        return self.APP_ENV in PRODUCTION_ENVS

    @field_validator("APP_ENV")
    @classmethod
    def validate_app_env(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in ALLOWED_APP_ENVS:
            raise ValueError(
                f"Unsupported APP_ENV '{value}'. Allowed values: {', '.join(sorted(ALLOWED_APP_ENVS))}."
            )
        return normalized

    @field_validator("JWT_ALGORITHM")
    @classmethod
    def validate_jwt_algorithm(cls, value: str) -> str:
        normalized = value.strip().upper()
        if normalized not in ALLOWED_JWT_ALGORITHMS:
            raise ValueError(
                f"Unsupported JWT_ALGORITHM '{value}'. Allowed algorithms: {', '.join(sorted(ALLOWED_JWT_ALGORITHMS))}."
            )
        return normalized

    @model_validator(mode="after")
    def validate_security_settings(self) -> "Settings":
        explicitly_set = "JWT_SECRET_KEY" in self.model_fields_set
        secret = self.JWT_SECRET_KEY.strip()

        if self.is_production:
            if not secret:
                raise ValueError("JWT_SECRET_KEY must be set in production environments.")
            if is_weak_or_placeholder_secret(secret):
                raise ValueError(
                    "JWT_SECRET_KEY is weak, a placeholder, or shorter than 32 characters in production."
                )
            self.JWT_SECRET_KEY = secret

            redis_url = (self.REDIS_URL or "").strip()
            if not redis_url:
                raise ValueError("REDIS_URL must be configured for shared rate limiting in production.")
            lowered_redis = redis_url.lower()
            if not (lowered_redis.startswith("redis://") or lowered_redis.startswith("rediss://")):
                raise ValueError("REDIS_URL must use redis:// or rediss:// scheme.")
            if any(marker in lowered_redis for marker in WEAK_SECRET_SUBSTRINGS):
                raise ValueError("REDIS_URL cannot contain placeholder values in production.")
            self.REDIS_URL = redis_url
        else:
            if explicitly_set and not secret:
                raise ValueError("JWT_SECRET_KEY cannot be empty when explicitly configured.")
            if not secret:
                # Generate an ephemeral per-process key in development if .env omits it
                self.JWT_SECRET_KEY = secrets.token_hex(32)
                logger.warning(
                    "JWT_SECRET_KEY not set in %s environment; using ephemeral per-process key.",
                    self.APP_ENV,
                )
            else:
                self.JWT_SECRET_KEY = secret
                if is_weak_or_placeholder_secret(secret):
                    logger.warning(
                        "JWT_SECRET_KEY appears weak or placeholder-like in %s environment.",
                        self.APP_ENV,
                    )

        return self


settings = Settings()
