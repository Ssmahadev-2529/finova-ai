# Finova AI — Production Release Readiness Checklist

**Status Verdict:** **CODE & LOCAL E2E VERIFIED — EXTERNAL STAGING & APPROVAL REQUIRED** *(All local code, database schema/migrations, security hardening, `110` backend unit tests, `7` Vitest tests, Vite build, PayPal Sandbox OAuth/Order Create check, and `16/16` live headless Chrome Playwright E2E flows passed. Live cloud staging provisioning, external integrations verification, and explicit user production approval are still required.)*

## 1. Application & Security Readiness (Verified Complete Locally)
- [x] Fail-closed production configuration (`APP_ENV=production` validates strong `JWT_SECRET_KEY`, valid `DATABASE_URL`, valid `REDIS_URL`, and `TRUSTED_PROXY_CIDRS` / allowed origins).
- [x] Pure ASGI middleware order (`CORSMiddleware` -> `SecurityHeadersMiddleware` -> `RequestSizeLimitMiddleware` 10MB -> `RateLimitingMiddleware` fail-closed `503` if Redis unavailable).
- [x] Authentication integrity: Bcrypt-12, HS256 JWT (`require_exp`, `require_sub`, `iss`, `jti` DB revocation, atomic `token_version` rotation on password change/reset) + race-free stale-token `401` guard in frontend `apiFetch`.
- [x] Tenant isolation & RBAC across Transactions, PayPal Orders/Refunds, Categories (`POST/GET/PUT/PATCH/DELETE`), Budgets, Analytics, Scam Shield, AI RAG, and Audit Logs.
- [x] PayPal webhook verification (`PAYPAL_WEBHOOK_ID` required, HTTPS PayPal cert allowlist, redirect disabled, `webhook_events` replay deduplication) & Sandbox OAuth + Order Create verified live (`CREATED`).
- [x] Financial precision: `Numeric(12,2)` on `PayPalOrderModel`/`BudgetModel`, Decimal math in shared utilities & fee engine, `JPY` zero-decimal & `40` fixed fee, `$0.00` fee handling via `is not None`.
- [x] ML validation: Leak-free chronological train/eval split (`trainSize=150`, `testSize=100`, `F1=0.8621`, `leakageCheckPassed=true`) with honest limitations disclosure.
- [x] Frontend build, hygiene & E2E: `tsc -b && vite build` green (`0` TS errors), orphan root `index.html` & `frontend/public/meridian.html` deleted, `7/7` Vitest tests green, and `16/16` Playwright real Chrome flows passed (`0` page errors, `0` 5xx, `mobileHorizontalOverflow=false`).

## 2. External Staging & Production Gate (Required Before Go-Live)
- [ ] **Provision Managed PostgreSQL (Staging):** Set `DATABASE_URL`, execute `python backend/migrate.py` once before Uvicorn workers boot, verify `pg_advisory_xact_lock`, indexes, constraints, and backup snapshots.
- [ ] **Provision Managed Redis (Staging):** Set `REDIS_URL`, verify sliding-window rate limiter under multi-worker load (`workers > 1`) and fail-closed `503` test when Redis stops.
- [ ] **Deploy Render Backend Staging + Vercel Frontend Staging:** Sign in to `vercel-plugin` (or configure Render/Vercel dashboard tokens), deploy staging URLs, and verify HTTPS CORS, `/health` (`200`), and `/ready` probes.
- [ ] **Configure External Cloud Credentials & Verify Live Round-Trips:** Set `PAYPAL_WEBHOOK_ID` (test PayPal Webhook Simulator -> `/api/v1/paypal/webhooks`), `GEMINI_API_KEY` (live Gemini test), and `SMTP_*` (password-reset email delivery test).
- [ ] **Re-run Live Staging Smoke & Browser E2E:** Point Playwright smoke checks at live HTTPS Vercel/Render staging URLs.
- [ ] **Explicit User Authorization:** Confirm final production secret rotation, backup verification, and explicit written approval prior to **Production Deployment**.
