# Finova AI — External Integration Status Report

**Verification Date:** 2026-11-10  
**Security Policy:** Raw API keys, client secrets, passwords, and webhook IDs are never printed or persisted in documentation or repository files.

| External Integration | Current Status | Verification Method | Exact Findings & Blockers |
|---|---|---|---|
| **PayPal Sandbox OAuth & Orders v2** | **VERIFIED LIVE (Sandbox)** | Executed `paypal_service.get_access_token()` + `create_order(Decimal("10.00"), "USD")` against `https://api-m.sandbox.paypal.com` | **`oauth_token_obtained=true`**, **`sandbox_order_created=true`**, status **`CREATED`**. Zero captures or live fund charges performed. |
| **PayPal Capture, Refund & Webhook Signature Code** | **VERIFIED (Mocked Upstream)** | Executed in `test_security_auth.py` & `test_phase_backend_completion.py` | Domestic `"US"` fee accuracy, `$0.00` fee preservation, `JPY` zero-decimal formatting, atomic `CAPTURING`/`REFUNDING`, replay protection verified with mocked HTTP responses. |
| **PayPal Live Webhook Delivery** | **NOT CONFIGURED / BLOCKED** | `.env` presence check | `PAYPAL_WEBHOOK_ID` is not configured and no public HTTPS webhook callback URL is deployed yet. |
| **Google Gemini API (`AiAgentService`)** | **NOT CONFIGURED (Deterministic RAG Active)** | `.env` presence check + API/E2E runtime check | `GEMINI_API_KEY` is unset locally. Tenant-scoped TF-IDF RAG retriever + deterministic financial summary responder & `ai_usage_logs` telemetry verified passing (`Latency P50 = 75.54 ms`). |
| **SMTP Password Reset Delivery (`email_service.py`)** | **NOT CONFIGURED** | `.env` presence check + unit mock tests | `SMTP_HOST`, `SMTP_USERNAME`, and `SMTP_PASSWORD` are unset. Out-of-band token flow & `PASSWORD_RESET_FAILED` audit logging verified with unit tests. |
| **PostgreSQL Database (`DATABASE_URL`)** | **LOCAL SQLITE ONLY / STAGING PG BLOCKED** | `migrate.py` (SQLite live) + PostgreSQL DDL compilation (`10` tables) | Local dev uses `sqlite:///./finova.db`. No live cloud PostgreSQL instance provisioned in this environment. |
| **Redis Rate Limiter (`REDIS_URL`)** | **MEMORY DEV FALLBACK / STAGING REDIS BLOCKED** | Fail-closed & sliding-window Lua suite (`test_security_auth.py`) | `REDIS_URL` unset locally (`redis` not installed locally); production mode fail-closed `503` verified in tests. |
| **Render & Vercel Hosting** | **BLOCKED (Auth / CLI Missing)** | Config audit + `list_plugin_accounts` | Config files (`render.yaml`, `frontend/vercel.json`) verified; `vercel-plugin` awaits user sign-in and Render credentials are external. |

