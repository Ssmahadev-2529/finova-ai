"""
Finova AI - Shared Atomic Rate Limiter
Provides a Redis Lua-script sliding-window rate limiter for multi-worker / multi-instance
production deployments, with an explicit development/test-only in-memory fallback.
"""

import asyncio
import logging
import time
import uuid
from collections import defaultdict
from typing import Any, Optional, Tuple

from redis import asyncio as redis_asyncio
from redis.exceptions import RedisError

from config import settings

logger = logging.getLogger("finova.ratelimit")

SLIDING_WINDOW_LUA = """
local key = KEYS[1]
local now_ms = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, 0, now_ms - window_ms)
local current = redis.call('ZCARD', key)
if current >= limit then
    return {0, current}
end
redis.call('ZADD', key, now_ms, member)
redis.call('PEXPIRE', key, window_ms)
return {1, current + 1}
"""


class RateLimiterUnavailableError(RuntimeError):
    """Raised when the shared Redis rate limiter is required or unreachable."""


class RedisSlidingWindowRateLimiter:
    """Atomic Redis ZSET + Lua sliding-window rate limiter shared across workers/instances."""

    def __init__(self, redis_client: redis_asyncio.Redis, key_prefix: str = "finova:rl"):
        self._client = redis_client
        self._key_prefix = key_prefix
        self._script = self._client.register_script(SLIDING_WINDOW_LUA)

    async def allow(self, bucket: str, subject_ip: str, limit: int, window_seconds: int = 60) -> Tuple[bool, int]:
        key = f"{self._key_prefix}:{bucket}:{subject_ip}"
        now_ms = int(time.time() * 1000)
        window_ms = int(window_seconds * 1000)
        member = f"{now_ms}:{uuid.uuid4().hex[:10]}"

        try:
            result = await self._script(
                keys=[key],
                args=[now_ms, window_ms, int(limit), member],
            )
            allowed = int(result[0]) == 1
            count = int(result[1])
            return allowed, count
        except (RedisError, OSError, ValueError, TypeError) as exc:
            logger.error("Redis rate limiter execution failed (%s)", type(exc).__name__)
            raise RateLimiterUnavailableError("Shared rate-limiting backend is unavailable.") from exc

    async def ping(self) -> bool:
        try:
            ok = await self._client.ping()
            if not ok:
                raise RateLimiterUnavailableError("Redis PING returned falsy response.")
            return True
        except (RedisError, OSError, ValueError, TypeError) as exc:
            logger.error("Redis PING failed (%s)", type(exc).__name__)
            raise RateLimiterUnavailableError("Shared rate-limiting backend is unavailable.") from exc

    async def close(self) -> None:
        try:
            await self._client.aclose()
        except Exception:
            pass


class InMemorySlidingWindowRateLimiter:
    """
    Development/test-only process-local sliding-window rate limiter.
    Protected by an asyncio.Lock with bounded tracked-key eviction.
    Never permitted as a silent fallback in production environments.
    """

    MAX_TRACKED_KEYS = 5000

    def __init__(self):
        self._buckets = defaultdict(list)
        self._lock = asyncio.Lock()

    def _prune_stale(self, now: float, window_seconds: int) -> None:
        if len(self._buckets) <= 1000:
            return
        stale_keys = [
            k for k, ts_list in self._buckets.items()
            if not ts_list or (now - ts_list[-1] >= window_seconds)
        ]
        for k in stale_keys:
            self._buckets.pop(k, None)
        while len(self._buckets) > self.MAX_TRACKED_KEYS:
            oldest_key = next(iter(self._buckets))
            self._buckets.pop(oldest_key, None)

    async def allow(self, bucket: str, subject_ip: str, limit: int, window_seconds: int = 60) -> Tuple[bool, int]:
        now = time.time()
        key = f"{bucket}:{subject_ip}"
        async with self._lock:
            self._prune_stale(now, window_seconds)
            timestamps = [ts for ts in self._buckets[key] if now - ts < window_seconds]
            if len(timestamps) >= int(limit):
                self._buckets[key] = timestamps
                return False, len(timestamps)
            timestamps.append(now)
            self._buckets[key] = timestamps
            return True, len(timestamps)

    async def close(self) -> None:
        self._buckets.clear()


class RateLimiterManager:
    """Selects Redis-backed limiting in production and allows an explicit dev/test-only fallback."""

    def __init__(
        self,
        app_settings: Any = settings,
        redis_client: Optional[redis_asyncio.Redis] = None,
    ):
        self._settings = app_settings
        self._redis_limiter: Optional[RedisSlidingWindowRateLimiter] = None
        self._memory_limiter: Optional[InMemorySlidingWindowRateLimiter] = None
        self._init_error: Optional[str] = None
        self._redis_url_configured: Optional[str] = None

        self._has_custom_client = redis_client is not None

        if redis_client is not None:
            self._redis_limiter = RedisSlidingWindowRateLimiter(redis_client)
        else:
            self._ensure_configured()

    def _ensure_configured(self) -> None:
        if self._has_custom_client:
            return
        redis_url = (getattr(self._settings, "REDIS_URL", None) or "").strip()
        if not redis_url and self._redis_limiter is not None:
            self._redis_limiter = None
            self._redis_url_configured = None
        if redis_url:
            if self._redis_limiter is not None and self._redis_url_configured == redis_url:
                return
            try:
                client = redis_asyncio.from_url(
                    redis_url,
                    encoding="utf-8",
                    decode_responses=True,
                    socket_connect_timeout=2.0,
                    socket_timeout=2.0,
                )
                self._redis_limiter = RedisSlidingWindowRateLimiter(client)
                self._redis_url_configured = redis_url
                self._init_error = None
            except Exception as exc:
                self._redis_limiter = None
                self._init_error = type(exc).__name__
                logger.error("Failed to initialize Redis rate limiter client (%s)", self._init_error)
            return

        if getattr(self._settings, "is_production", False):
            self._redis_limiter = None
            self._init_error = "REDIS_URL missing in production"
            return

        if self._memory_limiter is None:
            logger.warning(
                "REDIS_URL not configured in %s environment; using development-only in-memory rate limiter.",
                getattr(self._settings, "APP_ENV", "development"),
            )
            self._memory_limiter = InMemorySlidingWindowRateLimiter()

    async def check(self, bucket: str, subject_ip: str, limit: int, window_seconds: int = 60) -> Tuple[bool, int]:
        self._ensure_configured()

        # In production, Redis is strictly mandatory — never fall back silently to process-local memory.
        if getattr(self._settings, "is_production", False):
            if self._redis_limiter is None:
                raise RateLimiterUnavailableError("Production rate limiting requires a configured Redis backend.")
            return await self._redis_limiter.allow(bucket, subject_ip, limit, window_seconds)

        # In development/test, if REDIS_URL (or custom client) was explicitly provided, enforce it explicitly.
        redis_url = (getattr(self._settings, "REDIS_URL", None) or "").strip()
        if self._redis_limiter is not None:
            return await self._redis_limiter.allow(bucket, subject_ip, limit, window_seconds)
        if redis_url:
            raise RateLimiterUnavailableError("Configured Redis rate-limiting backend is unavailable.")

        assert self._memory_limiter is not None
        return await self._memory_limiter.allow(bucket, subject_ip, limit, window_seconds)

    @property
    def is_redis_required(self) -> bool:
        redis_url = (getattr(self._settings, "REDIS_URL", None) or "").strip()
        return bool(getattr(self._settings, "is_production", False) or redis_url or self._has_custom_client)

    async def verify_connection(self) -> None:
        self._ensure_configured()
        if not self.is_redis_required:
            return
        if self._redis_limiter is None:
            raise RateLimiterUnavailableError("Required Redis rate-limiting backend is not configured.")
        await self._redis_limiter.ping()

    async def check_health(self) -> str:
        if not self.is_redis_required:
            return "DEV_FALLBACK"
        try:
            await self.verify_connection()
            return "HEALTHY"
        except RateLimiterUnavailableError:
            return "UNAVAILABLE"

    async def close(self) -> None:
        if self._redis_limiter is not None:
            await self._redis_limiter.close()
        if self._memory_limiter is not None:
            await self._memory_limiter.close()
