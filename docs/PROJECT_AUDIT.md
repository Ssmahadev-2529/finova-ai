# Finova AI — Complete Project Audit (Baseline & Remediation Record)

**Audit Date:** 2026-11-10  
**Repository:** `D:\Myprojects\finova`  
**Git Baseline Commit:** `7a8d43b` on branch `master` (`.gitignore` and `backend/.gitignore` exclude `.env`, `.env.*`, `*.db`, `*.sqlite3`, `node_modules/`, `dist/`).  
**Environment Tooling Verified:** `python` (3.12), `node`, `npm`, `npx`, Chrome, Edge, and scratch `playwright-core` runner present locally. `psql`, `redis-server`, `docker`, `render`, `vercel`, and `gh` CLI are not installed locally; `vercel-plugin` is installed and requires user sign-in. Both orphan files (`index.html` and `frontend/public/meridian.html`) have been removed.

---

## 1. Verification of Previously Completed Phase 2A Changes

The Phase 2A infrastructure hardening changes were verified directly against source files and live local test runs:
- **No import-time DDL:** `backend/database.py` performs no schema creation or migrations on import.
- **Controlled migration entrypoint:** `backend/migrate.py` (`run_prestartup_migrations`) executes `initialize_database()` under `_LOCAL_INIT_LOCK` (SQLite) and `SELECT pg_advisory_xact_lock(:lock_id)` (PostgreSQL transaction-scoped advisory lock, PgBouncer transaction-pooler safe) before Uvicorn starts (`render.yaml`, `backend/Dockerfile`, `backend/Procfile`).
- **Fail-closed startup:** Production `lifespan` in `backend/main.py` runs non-mutating `verify_database_ready()` (checking `REQUIRED_TABLES` and `REQUIRED_COLUMNS`) and `rate_limiter_manager.verify_connection()`, cleaning up resources on error.
- **Non-blocking `/health`:** Offloads `SELECT 1` via `asyncio.to_thread(_probe_database_health)` and calls `rate_limiter_manager.check_health()`, returning HTTP `200` only when required dependencies pass and `503` without secret leakage otherwise.
- **Pure ASGI middleware pipeline:** `CORSMiddleware` -> `SecurityHeadersMiddleware` -> `RequestSizeLimitMiddleware` -> `RateLimitingMiddleware` ensures security and CORS headers on `200`, `400`, `413`, `429`, `500`, and `503` responses, plus chunked/streaming body size cutoff (`MAX_REQUEST_SIZE_BYTES = 10MB`).
- **Local baseline execution results:**
  - `python backend/test_security_auth.py`: **40/40 passed** (`9.310s`)
  - `python -m unittest discover -s backend -p "test_*.py"`: **101/101 passed** (`11.618s`)
  - `cd backend; python migrate.py`: **Exit code 0**
  - `npm run build --prefix frontend`: **`tsc -b && vite build` passed** (`2225` modules, `5.32s`)

---

## 2. Feature Inventory & Classification

Status taxonomy: `COMPLETE` | `PARTIALLY COMPLETE` | `BROKEN` | `MISSING` | `NEEDS IMPROVEMENT`

### Backend & Persistence (`backend/`)
| Feature / Component | Classification | Verified Code Evidence |
|---|---|---|
| Infrastructure Hardening (Phase 2A) | **COMPLETE** | `backend/database.py`, `backend/migrate.py`, `backend/main.py`, `backend/services/rate_limiter.py`, `render.yaml`, `backend/Dockerfile`, `backend/Procfile` |
| Registration, Login, JWT, JTI Revocation, Token Versioning | **COMPLETE** (gaps noted) | `backend/routes/auth_routes.py`, `backend/services/auth_service.py` — Bcrypt-12, HS256 JWT (`require_exp`, `require_sub`, `iss`), DB revocation (`revoked_tokens`), `token_version` invalidation, out-of-band SMTP reset (`services/email_service.py`). Missing: authenticated profile update, change-password endpoint, failed reset audit logging, refresh token strategy. |
| Tenant Isolation & RBAC Helpers | **COMPLETE** | `resolve_scoped_user_id`, `scope_transaction_query`, `require_admin_user`, explicit `SEED_DEMO_TRANSACTION_IDS` isolation (`services/auth_service.py`). |
| Core Security Middleware & Config Validation | **COMPLETE** | Production `JWT_SECRET_KEY` entropy & `REDIS_URL` enforcement (`config.py`), strict CORS allowlist, pure ASGI headers/body-limit/Redis rate limiter (`main.py`). Minor gap: webhooks share IP rate-limit bucket; `PATCH` missing from CORS `allow_methods`. |
| Transaction Read & Sandbox Simulation API | **PARTIALLY COMPLETE** | `GET /api/v1/transactions` & `POST /api/v1/transactions/simulate` (`routes/transaction_routes.py`). No pagination (`limit`/`offset`), only exact case-sensitive `status`/`risk`/`source` filters, no search/date/amount filters or sorting. |
| Transaction CRUD, Categories, Budgets & Reports Export | **MISSING** | No `GET/PUT/PATCH/DELETE /transactions/{id}`, no `POST /transactions` manual entry, no `categories` or `budgets` models/endpoints/analytics, no CSV/JSON report export. |
| PayPal Sandbox Create, Capture & Webhook Verification | **PARTIALLY COMPLETE / BUGGY** | Atomic `CAPTURING` claim, `CAPTURE_UNKNOWN` reconciliation, `PayPal-Request-Id`, strict cert URL allowlist & signature verification (`routes/paypal_routes.py`, `services/paypal_service.py`). **Bug:** `capture_paypal_order` compares `"US" != "United States"`, misclassifying US domestic captures as international (`+1.5%` surcharge). `REFUNDED` webhooks leave `net_amount` positive; `COMPLETED` webhooks skip orphan order persistence. |
| PayPal Refunds, Order Status Sync & Dispute Webhooks | **MISSING** | No `/paypal/refund`, no `/paypal/orders/{order_id}` sync endpoint, no `CUSTOMER.DISPUTE.CREATED` webhook persistence. |
| Database Constraints & Monetary Precision | **NEEDS IMPROVEMENT** | `PayPalOrderModel.amount` uses `Numeric(12,2)`, while `TransactionModel` uses `Float` (`amount`, `estimated_fee`, `actual_fee`, `net_amount`) and string `date`. Zero `ForeignKey` constraints declared on `user_id`/`paypal_order_id`. No migration downgrade/backup docs. |
| Financial Analytics & Decision Intelligence | **PARTIALLY COMPLETE / BUGGY** | `services/analytics_service.py`, `services/decision_intelligence_service.py`. **Bug:** `get_revenue_forecast` reads `"netAmount"` instead of `"net"` (`net` always `0.0`). Fabricates `$1,000` baseline when `N=0`, hardcodes `cb_pct=0.444` and `$140–$280` estimates, sums mixed currencies without FX conversion (`JPY` missing from `RATES_TO_USD`), ignores `$0.00` `actual_fee` via `> 0`. |
| Cost Optimizer Service | **PARTIALLY COMPLETE / NEEDS IMPROVEMENT** | `services/cost_optimizer_service.py`. Multi-tier & FX spread engine exists, but uses `float`, sums mixed currencies directly, ignores `$0.00` actual fees (`> 0`), and frontend never calls `/optimizer/calculate` or `/optimizer/compare-scenarios`. |
| Anomaly Detection & Account Health Predictor | **PARTIALLY COMPLETE / BUGGY** | `services/anomaly_service.py`. **Bugs:** shared `self.isolation_forest` instance is mutated across concurrent requests (race condition), `model_meta` reports `100 trees` vs actual `n_estimators=50`, `analyze_transaction` never receives `historical_amounts`. No persisted model version metadata or offline precision/recall/F1 evaluation report. |
| Scam & Phishing Shield | **PARTIALLY COMPLETE** | `services/scam_shield_service.py`. Zero-touch URL & domain analysis works, but keyword/regex-only heuristics, hardcodes `dataSource="synthetic"` in `to_dict()`, and `history` lacks pagination `offset`/filters. |
| AI Financial Assistant & RAG | **PARTIALLY COMPLETE / NEEDS IMPROVEMENT** | `services/ai_agent_service.py`. Prompt injection defense & deterministic cards exist, **but** `scam_logs` & `history` & `highest_fee_txn` are never sent to Gemini, Gemini errors are silently swallowed, response shapes differ between injection vs normal paths, hardcoded demo IDs (`TXN-984199`, `TXN-984203`) appear in prompts/replies, no chunked RAG retrieval/embeddings, no AI usage tracking/token telemetry. |

### Frontend & Root (`frontend/`, `/`)
| Feature / Component | Classification | Verified Code Evidence |
|---|---|---|
| React SPA Shell, Sidebar, Light/Dark Toggle & Auth Modal | **PARTIALLY COMPLETE** | `App.tsx`, `Header.tsx`, `Sidebar.tsx`, `AuthModal.tsx`. Works client-side, defaults to light theme (`#F8FAFC`), handles `#reset_token=`. Missing: client password complexity check, confirm password, accessible dialog semantics/focus/Escape, profile edit, change password, confirmation dialogs. |
| Transactions Ledger & Receipt Modal | **PARTIALLY COMPLETE** | `TransactionsView.tsx`. Client-side search & status/risk/source filters work on loaded list, but no server-side pagination, no Add/Edit/Delete transaction UI, no Categories/Budgets UI, no CSV export, non-keyboard clickable `<tr>`. |
| Dashboards & Financial Views (Mock vs Live Data) | **NEEDS IMPROVEMENT / PARTIALLY COMPLETE** | `DashboardView.tsx`, `CostOptimizerView.tsx`, `ScamShieldView.tsx`, `AccountHealthView.tsx`, `AiAssistantView.tsx`, `SettingsView.tsx`. Authenticated views still fall back to hardcoded numbers (`84.6`, `14.2`, `+15.8%`, `Mon–Sun` chart array, `$1,987.89`, `62.4/100`) and keep `INITIAL_TRANSACTIONS` if an authenticated user has 0 transactions (`App.tsx:129-131`). Unused API helpers (`calculateFees`, `compareCostScenarios`, `getHealthTimeline`, `getSystemHealth`). |
| Light-Mode UI Consistency & Responsiveness | **NEEDS IMPROVEMENT** | `CostOptimizerView.tsx:778-789` uses dark translucent gradient + white text on light backgrounds; mobile header hides data source selector (`hidden sm:flex`); several `grid-cols-3`/`grid-cols-4` lack `sm:` breakpoints. |
| Settings Persistence | **BROKEN / UNWIRED** | `SettingsView.tsx` & `App.tsx:316-323` update in-memory state only; never persisted or applied; "Reset Ledger" has no confirmation dialog. |
| Orphan / Duplicate Files | **NEEDS CLEANUP** | Root `index.html` & `frontend/public/meridian.html` are identical copies of an unrelated "Meridian" dark landing template referencing missing fonts. `vercel.json` duplicated cleanly at root and `frontend/`. |
| Frontend & E2E Automated Testing | **MISSING** | Zero frontend unit/component/integration/E2E tests; `vitest`, `@testing-library/react`, and `playwright` not installed. |

---

## 3. Concrete Security, Accuracy & Reliability Defect Backlog (Phase 0)

| ID | Severity | Component | Finding Summary |
|---|---|---|---|
| **BUG-01** | **P1 (High)** | PayPal Fee Engine (`paypal_routes.py:380`, `paypal_service.py:318`) | `"US" != "United States"` charges US domestic PayPal captures an extra +1.5% international surcharge. |
| **BUG-02** | **P1 (High)** | Decision Intelligence (`decision_intelligence_service.py:216`) | Reads `"netAmount"` instead of `"net"`, corrupting forecast historical net totals to `0.0`. |
| **BUG-03** | **P1 (High)** | ML Concurrency (`anomaly_service.py:30, 234-236, 656`) | Global `self.isolation_forest` fitted and queried concurrently across requests without isolation; `model_meta` misstates 100 vs 50 trees. |
| **BUG-04** | **P1 (High)** | Financial Precision & FX (`models/transaction.py`, `analytics_service.py`, `cost_optimizer_service.py`) | `TransactionModel` stores money in `Float`; analytics sums mixed currencies without FX conversion (`JPY` omitted from `RATES_TO_USD`); `$0.00` actual fees skipped by `> 0`. |
| **BUG-05** | **P1 (High)** | Hardcoded Mock Leakage (`App.tsx:129-131`, `DashboardView.tsx`, `AccountHealthView.tsx`, `ai_agent_service.py`) | Hardcoded KPI/chart fallbacks shown in authenticated views; demo IDs `TXN-984199`/`TXN-984203` hardcoded in AI agent prompts/replies; empty tenant retains `INITIAL_TRANSACTIONS`. |
| **BUG-06** | **P1 (High)** | Auth / Audit / Webhook Completeness (`auth_routes.py`, `paypal_routes.py`, `main.py`) | Failed password resets never reach `record_audit(..., FAILURE)`; PayPal webhooks share global `/api/v1/` IP rate limit (`120/min`); `REFUNDED` webhook leaves positive `net_amount`; missing `ForeignKey` constraints on models. |
| **BUG-07** | **P2 (Medium)** | Missing Financial CRUD / Budgets / Categories / Export | Missing manual Transaction Add/Edit/Delete, Categories, Budgets & utilization tracking, CSV export, PayPal Refund & Order Sync endpoints. |
| **BUG-08** | **P2 (Medium)** | AI / RAG & Telemetry Gaps (`ai_agent_service.py`) | `history`, `scam_logs`, `highest_fee_txn` excluded from Gemini prompt; silent exception swallowing; no structured chunked retrieval/scoring over ledger + PayPal policy docs; no token/latency usage logging. |
| **BUG-09** | **P2 (Medium)** | Unbounded `.all()` Queries & Pagination | `GET /transactions` and all analytics services fetch unbounded full-table rows with no pagination or DB aggregate queries. |
| **BUG-10** | **P2 (Medium)** | Frontend UX, Light-Theme Contrast, Accessibility & Form Validation | Dark-on-light contrast bug (`CostOptimizerView.tsx:778`), unvalidated custom buttons in `SimulatePaymentModal`, missing dialog ARIA/Escape/focus handling, silent API fallbacks, missing confirmation dialogs. |
| **BUG-11** | **P3 (Low)** | Code Duplication & Orphan Files | Duplicated `_parse_date`, fee schedules, redaction regexes, double ML run per chat turn, unused UI state (`scenarioResults`, `selectedAuditLog`), orphan `meridian.html`. |
| **BLK-01** | **EXTERNAL BLOCKER** | Staging & Production Infra | Local environment lacks PostgreSQL, Redis, Docker, Render CLI, Vercel CLI, Playwright browsers; `vercel-plugin` requires user sign-in; live staging/prod credentials & deployment authorization not yet provided. |

---

## 4. Phase 1–16 Remediation Resolution Summary (2026-11-10)

All actionable software defects (`BUG-01` through `BUG-11`) identified during Phase 0 were resolved and independently verified:
- **Resolved (`BUG-01` to `BUG-11`):**
  - Centralized monetary/FX/country/date/redaction/CSV safety helpers in `backend/services/shared_utils.py`.
  - Remediated PayPal domestic `"US"` surcharge, added `/api/v1/paypal/refund` (`REFUNDING`/`REFUND_UNKNOWN`), `/api/v1/paypal/orders/{order_id}` safe sync, and refund/dispute webhooks.
  - Added full manual Transaction CRUD (`POST`/`GET`/`PUT`/`PATCH`/`DELETE`), `/transactions/paged`, formula-escaped CSV `/transactions/export`, `CategoryModel`/`BudgetModel`/`AIUsageLogModel`, multi-currency rolling `/budgets/utilization`, `PUT /auth/profile`, and `POST /auth/change-password`.
  - Fixed `get_revenue_forecast` (`"net"`), `"qr_code"` fixed fees, chronological volatility/comparison splits, thread-safe `IsolationForest` + `LOF`, USD FX normalization in ML & analytics, multi-turn AI RAG history sanitization, and dynamic Gemini API key resolution.
  - Updated frontend (`App.tsx`, `BudgetsView.tsx`, `TransactionsView.tsx`, `DashboardView.tsx`, `CostOptimizerView.tsx`, `ScamShieldView.tsx`, `AccountHealthView.tsx`, `SettingsView.tsx`, `AuthModal.tsx`, `SimulatePaymentModal.tsx`, `StatusBadge.tsx`), eradicated `frontend/public/meridian.html`, eliminated fake fallback KPIs/charts, fixed light-mode contrast, and added Vitest + React Testing Library tests.
- **Independent Review Verdict:** Backend security & code re-review **APPROVED** (`0` remaining P0/P1/P2 findings).
- **Remaining External Blocker (`BLK-01`):** Cloud staging & production execution (`Phase 2B`, `Phase 15`, `Phase 17`) remain blocked solely by external infrastructure provisioning (`PostgreSQL`, `Redis`, `Render`, `Vercel` sign-in) and explicit deployment authorization.

