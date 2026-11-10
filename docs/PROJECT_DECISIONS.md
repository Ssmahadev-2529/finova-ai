# Finova AI — Architecture & Engineering Decisions Log

## ADR-001: Preserve Incremental SQLite-Compatible + PostgreSQL Transaction-Locked Migrations
- **Context:** The existing repository does not use Alembic (`backend/requirements.txt`), relies on SQLAlchemy ORM models plus idempotent `ALTER TABLE` helpers in `backend/database.py`, and already has live schema verification in `backend/migrate.py` and `test_security_auth.py` (`test_22`, `test_37`).
- **Decision:** Keep the advisory-locked pre-startup runner (`backend/migrate.py`) with `pg_advisory_xact_lock` for PostgreSQL and `_LOCAL_INIT_LOCK` for SQLite rather than retrofitting Alembic unnecessarily, while adding versioned idempotent additive migration steps tested on disposable databases before any schema change.
- **Consequences:** Zero risk of breaking existing deployments (`render.yaml`, `Dockerfile`, `Procfile`) and full PgBouncer transaction-pooler compatibility; requires every column/table addition to be strictly idempotent (`IF NOT EXISTS` / inspector column checks).

## ADR-002: Transaction-Scoped PostgreSQL Advisory Lock (`pg_advisory_xact_lock`)
- **Context:** Session-level `pg_advisory_lock` + `conn.commit()` leaks locks or breaks exclusion under PgBouncer transaction pooling (e.g., Supabase port `6543`).
- **Decision:** Acquire `pg_advisory_xact_lock(:lock_id)` inside the same `with conn.begin():` transaction block that executes DDL (`create_all` + additive `ALTER TABLE`s).
- **Consequences:** Lock acquisition and release are atomic with transaction commit/rollback across both direct PostgreSQL and PgBouncer transaction pooling.

## ADR-003: Pure ASGI Security & Streaming Middleware Stack
- **Context:** Starlette's `BaseHTTPMiddleware` wraps downstream `receive()` in a background `anyio.TaskGroup` with `listen_for_disconnect`, colliding with mid-stream request-body size aborts and masking headers on early middleware exits (`413`, `429`, `503`).
- **Decision:** Implement `SecurityHeadersMiddleware`, `RequestSizeLimitMiddleware`, and `RateLimitingMiddleware` as pure ASGI middlewares ordered inside `CORSMiddleware`.
- **Consequences:** All HTTP error responses (`400`, `413`, `429`, `500`, `503`) receive both security and CORS headers, and oversized chunked requests abort mid-stream without unbounded memory buffering.

## ADR-004: Centralize Financial, Date & Redaction Helpers Before Expanding Backend Endpoints
- **Context:** Audit revealed duplicated `_parse_date` helpers (3 copies), divergent PayPal fee formulas (`"US" != "United States"` surcharge bug, missing `JPY` FX rate, `Decimal` vs `Float` mixing), and duplicated PAN redaction regexes.
- **Decision:** Introduce `backend/services/shared_utils.py` containing single authoritative `Decimal`-based currency/PayPal fee helpers, canonical ISO-2 country checks, unified datetime parsing, and PII/PAN redaction functions before adding CRUD, budget, and reporting endpoints.
- **Consequences:** Eliminates drift across PayPal captures, simulations, optimizer predictions, analytics summaries, and AI context extraction.

## ADR-005: Thread-Safe Stateless ML Fitting & Offline Evaluation Harness
- **Context:** `AnomalyDetectionService` mutates a shared singleton `self.isolation_forest` per call and claims `"100 trees"` while configuring `n_estimators=50`.
- **Decision:** Instantiate estimators cleanly per evaluation (or encapsulate model artifact + metadata immutably) keyed by explicit `MODEL_VERSION`, always pass historical transaction amounts to risk scoring, and validate precision/recall/F1 on a deterministic synthetic benchmark dataset without leaking test fixtures into production scoring thresholds.
- **Consequences:** Concurrent multi-tenant API calls never race on shared estimator state, and anomaly outputs are reproducibly benchmarked and explicitly distinguished from confirmed fraud.

## ADR-006: Light-First Fintech Design System & Zero Fabricated UI Figures
- **Context:** Current views display hardcoded fallback KPIs (`84.6`, `+15.8%`, `Mon–Sun` chart values) when backend responses are empty or unauthenticated, and `CostOptimizerView` uses a dark banner with low contrast in light mode.
- **Decision:** Standardize on the light `#F8FAFC` / `#FFFFFF` + `#0070BA` fintech palette cleanly across light mode (while keeping dark mode toggle non-broken), remove all fabricated financial fallback numbers in authenticated views, and render explicit loading, empty, unauthenticated, and error banners instead.
- **Consequences:** Users and automated tests only observe authentic backend ledger calculations or transparent explicit empty/error states.

## ADR-007: Non-Breaking API Evolution & Frontend Vitest + Playwright-Ready Verification
- **Context:** `GET /api/v1/transactions` returns a flat JSON array (`list[dict]`) consumed by existing frontend callers and 101 backend tests. Removing that contract would break existing tests and UI callers.
- **Decision:** Preserve `GET /api/v1/transactions` returning `list[dict]` by default with optional `search`, `status`, `risk`, `source`, `category`, `txn_type`, `date_from`, `date_to`, `min_amount`, `max_amount`, `sort_by`, `sort_dir`, `limit`, and `offset` parameters (and `X-Total-Count` response header plus an optional `GET /api/v1/transactions/paged` envelope if needed by UI pagination), while adding `vitest` + `@testing-library/react` + `jsdom` to `frontend/` for genuine component/integration tests.
- **Consequences:** 100% backward compatibility with all existing automated backend tests alongside real pagination, filtering, sorting, and frontend test coverage.
