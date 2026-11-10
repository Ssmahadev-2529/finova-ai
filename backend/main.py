import asyncio
import time
import logging
from urllib.parse import urlparse
from typing import Optional
from fastapi import FastAPI, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from starlette.datastructures import MutableHeaders

from database import engine, SessionLocal, initialize_database, verify_database_ready
from config import settings, Settings
import models.user
import models.transaction
import models.finance
from contextlib import asynccontextmanager
from routes.auth_routes import router as auth_router
from routes.paypal_routes import router as paypal_router
from routes.transaction_routes import router as transaction_router, seed_initial_transactions
from services.auth_service import extract_client_ip
from services.rate_limiter import RateLimiterManager, RateLimiterUnavailableError

# Configure structured logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("finova.backend")

rate_limiter_manager = RateLimiterManager(settings)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handles deterministic startup checks and graceful shutdown resource cleanup."""
    logger.info("Starting FINOVA AI Backend in %s mode...", settings.APP_ENV)
    try:
        if settings.is_production:
            # Production workers must never run schema DDL or seeding independently;
            # migrations execute once via migrate.py before Uvicorn spawns workers.
            verify_database_ready(engine)
            await rate_limiter_manager.verify_connection()
            logger.info("Production startup checks passed (database schema and Redis ready).")
        else:
            initialize_database(target_engine=engine, seed_fn=seed_initial_transactions)
            if rate_limiter_manager.is_redis_required:
                await rate_limiter_manager.verify_connection()
            logger.info("Development database schema verified and startup checks completed.")
    except Exception as exc:
        logger.critical("Application startup aborted due to %s", type(exc).__name__)
        try:
            await rate_limiter_manager.close()
        except Exception:
            pass
        try:
            engine.dispose()
        except Exception:
            pass
        raise
    yield
    logger.info("Shutting down FINOVA AI Backend, releasing connection pools...")
    await rate_limiter_manager.close()
    engine.dispose()

app = FastAPI(
    title="FINOVA AI — Payment Security & Merchant Intelligence Backend",
    description="Enterprise-grade payment security, fee audits, anomaly detection, and fraud defense for PayPal merchants",
    version="1.2.0",
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None if settings.is_production else "/redoc",
    openapi_url=None if settings.is_production else "/openapi.json",
    lifespan=lifespan
)

# --- 1. SECURITY HEADERS & STREAMING REQUEST SIZE MIDDLEWARE ---

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Content-Security-Policy": "default-src 'self'; frame-ancestors 'none';",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(), camera=(), microphone=()",
}


class SecurityHeadersMiddleware:
    """Pure ASGI middleware enforcing baseline security headers on all HTTP responses, including middleware errors."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_security_headers(message):
            if message.get("type") == "http.response.start":
                headers = MutableHeaders(scope=message)
                for header_name, header_value in SECURITY_HEADERS.items():
                    headers[header_name] = header_value
            await send(message)

        await self.app(scope, receive, send_with_security_headers)


# --- 2. REQUEST SIZE LIMITING MIDDLEWARE ---

class RequestSizeLimitMiddleware:
    """Enforces request body size limit across Content-Length and streamed/chunked bodies."""

    def __init__(self, app, max_bytes: Optional[int] = None):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        limit_bytes = self.max_bytes if self.max_bytes is not None else settings.MAX_REQUEST_SIZE_BYTES
        content_lengths = [
            value.decode("latin-1").strip()
            for name, value in scope.get("headers", [])
            if name.lower() == b"content-length"
        ]

        if len(content_lengths) > 1 and len(set(content_lengths)) > 1:
            response = JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={"detail": "Conflicting Content-Length headers."},
            )
            await response(scope, receive, send)
            return

        if content_lengths:
            raw_cl = content_lengths[0]
            if not raw_cl.isascii() or not raw_cl.isdigit():
                response = JSONResponse(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    content={"detail": "Invalid Content-Length header."},
                )
                await response(scope, receive, send)
                return

            declared_length = int(raw_cl)

            if declared_length > limit_bytes:
                response = JSONResponse(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    content={"detail": "Request payload exceeds maximum allowed size (10MB)."},
                )
                await response(scope, receive, send)
                return

        total_received = 0
        limit_exceeded = False
        response_started = False

        async def limited_receive():
            nonlocal total_received, limit_exceeded
            message = await receive()
            if message.get("type") == "http.request":
                chunk = message.get("body", b"")
                total_received += len(chunk)
                if total_received > limit_bytes:
                    limit_exceeded = True
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail="Request payload exceeds maximum allowed size (10MB).",
                    )
            return message

        async def wrapped_send(message):
            nonlocal response_started
            if message.get("type") == "http.response.start":
                response_started = True
            await send(message)

        try:
            await self.app(scope, limited_receive, wrapped_send)
        except Exception:
            if limit_exceeded and not response_started:
                response = JSONResponse(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    content={"detail": "Request payload exceeds maximum allowed size (10MB)."},
                )
                await response(scope, receive, send)
                return
            raise

# --- 3. SHARED REDIS / DEV-FALLBACK SLIDING WINDOW RATE LIMITER ---

class RateLimitingMiddleware:
    """Pure ASGI middleware enforcing shared Redis / dev-fallback rate limits without body buffering."""

    def __init__(self, app, limiter_manager: Optional[RateLimiterManager] = None):
        self.app = app
        self.limiter_manager = limiter_manager or rate_limiter_manager

    async def __call__(self, scope, receive, send):
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        request = Request(scope)
        client_ip = extract_client_ip(request)
        path = request.url.path

        if (
            path.startswith("/api/v1/auth/login")
            or path.startswith("/api/v1/auth/register")
            or path.startswith("/api/v1/auth/forgot-password")
            or path.startswith("/api/v1/auth/reset-password")
            or path.startswith("/api/v1/auth/change-password")
        ):
            bucket = "auth"
            limit = settings.RATE_LIMIT_AUTH_PER_MINUTE
            limit_msg = "Too many authentication requests. Please try again in 1 minute."
        elif path.startswith("/api/v1/paypal/webhooks"):
            bucket = "webhook"
            limit = 600
            limit_msg = "Webhook burst rate limit reached."
        elif path.startswith("/api/v1/"):
            bucket = "api"
            limit = settings.RATE_LIMIT_API_PER_MINUTE
            limit_msg = "API rate limit reached. Please reduce request frequency."
        else:
            await self.app(scope, receive, send)
            return

        try:
            allowed, _ = await self.limiter_manager.check(
                bucket=bucket,
                subject_ip=client_ip,
                limit=limit,
                window_seconds=60,
            )
        except RateLimiterUnavailableError:
            response = JSONResponse(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                content={"detail": "Rate limiting service temporarily unavailable."},
                headers={"Retry-After": "60"},
            )
            await response(scope, receive, send)
            return

        if not allowed:
            logger.warning("Rate limit exceeded on %s endpoint for IP: %s", bucket, client_ip)
            response = JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={"detail": limit_msg},
                headers={"Retry-After": "60"},
            )
            await response(scope, receive, send)
            return

        await self.app(scope, receive, send)

# --- 4. CORS CONFIGURATION ---

LOCALHOST_CORS_HOSTS = {"localhost", "127.0.0.1", "::1"}


def build_allowed_origins(app_settings: Settings) -> list[str]:
    """Builds strict explicit CORS origin allowlist; rejects wildcards, paths, and localhost in production."""
    is_production = app_settings.is_production
    origins: list[str] = []

    def add_origin(raw: str | None) -> None:
        if not raw:
            return
        cleaned = raw.strip()
        if not cleaned or "*" in cleaned:
            return
        try:
            parsed = urlparse(cleaned)
        except ValueError:
            return

        scheme = (parsed.scheme or "").lower()
        hostname = (parsed.hostname or "").lower()
        if not hostname or parsed.username or parsed.password:
            return
        if parsed.path not in ("", "/") or parsed.params or parsed.query or parsed.fragment:
            return

        if is_production:
            if scheme != "https":
                return
            if hostname in LOCALHOST_CORS_HOSTS or hostname.endswith(".localhost"):
                return
        elif scheme not in {"http", "https"}:
            return

        normalized = f"{scheme}://{parsed.netloc.lower()}"
        if normalized not in origins:
            origins.append(normalized)

    add_origin(app_settings.FRONTEND_ORIGIN)

    if not is_production:
        add_origin("http://localhost:5173")
        add_origin("http://127.0.0.1:5173")
        add_origin("http://[::1]:5173")

    if app_settings.ALLOWED_ORIGINS:
        for origin in app_settings.ALLOWED_ORIGINS.split(","):
            add_origin(origin)

    if is_production and not origins:
        logger.warning("Production CORS allowlist is empty; set FRONTEND_ORIGIN or ALLOWED_ORIGINS to HTTPS origins.")

    return origins


allowed_origins = build_allowed_origins(settings)

# Middleware registration order matters in Starlette (last registered runs outermost):
# Inbound:  CORSMiddleware -> SecurityHeadersMiddleware -> RequestSizeLimitMiddleware -> RateLimitingMiddleware -> Routes
# Outbound: Routes -> RateLimitingMiddleware (429/503) -> RequestSizeLimitMiddleware (413) -> SecurityHeadersMiddleware -> CORSMiddleware
app.add_middleware(RateLimitingMiddleware, limiter_manager=rate_limiter_manager)
app.add_middleware(RequestSizeLimitMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With", "PayPal-Request-Id"],
)

# --- 5. SAFE GLOBAL ERROR HANDLER ---

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled server error on {request.method} {request.url.path}: {exc}", exc_info=True)
    # Avoid leaking internal stack trace or DB schema to client
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": "An internal server error occurred. Our security monitoring has logged this incident.",
            "status": 500
        }
    )

# --- 6. INCLUDE API ROUTERS ---

app.include_router(auth_router)
app.include_router(paypal_router)
app.include_router(transaction_router)

# --- 7. HEALTH AND READINESS PROBES ---

START_TIME = time.time()

@app.get("/")
def read_root():
    return {
        "status": "ONLINE",
        "service": "FINOVA AI Enterprise Payment Security Platform",
        "version": "1.2.0",
        "paypal_sandbox_mode": settings.PAYPAL_MODE == "sandbox"
    }

def _probe_database_health() -> str:
    """Runs synchronous database connectivity probe in a worker thread without blocking the event loop."""
    db = None
    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        return "HEALTHY"
    except Exception as exc:
        logger.error("Database health check failed (%s)", type(exc).__name__)
        return "UNAVAILABLE"
    finally:
        if db is not None:
            try:
                db.close()
            except Exception:
                pass


@app.get("/health")
async def health_check():
    """
    Detailed system health check for monitoring and infrastructure alerts.
    Verifies database connectivity (offloaded to threadpool) and Redis connectivity (when required).
    Returns HTTP 200 only when required dependencies are healthy; HTTP 503 otherwise.
    """
    db_status = await asyncio.to_thread(_probe_database_health)
    redis_status = await rate_limiter_manager.check_health()
    overall_healthy = db_status == "HEALTHY" and redis_status != "UNAVAILABLE"
    status_code = status.HTTP_200_OK if overall_healthy else status.HTTP_503_SERVICE_UNAVAILABLE
    uptime_sec = int(time.time() - START_TIME)

    return JSONResponse(
        status_code=status_code,
        content={
            "status": "HEALTHY" if overall_healthy else "DEGRADED",
            "database": db_status,
            "redis": redis_status,
            "paypal_configured": bool(settings.PAYPAL_CLIENT_ID and settings.PAYPAL_CLIENT_SECRET),
            "uptimeSeconds": uptime_sec,
            "rateLimiting": "ENABLED" if redis_status != "UNAVAILABLE" else "UNAVAILABLE",
            "securityHeaders": "ENFORCED",
        },
    )

@app.get("/ready")
def readiness_probe():
    """Kubernetes/Container orchestrator readiness probe."""
    return {"ready": True, "timestamp": time.time()}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=settings.API_HOST, port=settings.API_PORT, reload=True)
