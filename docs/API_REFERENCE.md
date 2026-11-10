# Finova AI — REST API Reference (`/api/v1`)

All endpoints enforce JSON request/response payloads (except CSV file stream export), `10 MB` streaming request-size limits, security response headers, and Redis/in-memory sliding-window rate limits.

## 1. System Probes
- `GET /health` — Non-blocking DB (`SELECT 1`) and rate-limiter readiness probe (`200 HEALTHY` or `503` without secret leakage).
- `GET /ready` — Alias readiness check.

## 2. Authentication & Account Security (`/api/v1/auth`, `20 req/min` bucket)
- `POST /api/v1/auth/register` (`201`) — Creates merchant user (Bcrypt-12, strong 10+ char password required) and issues HS256 JWT.
- `POST /api/v1/auth/login` (`200`) — Verifies credentials and issues JWT bound to `sub`, `exp`, `iss`, `jti`, and `tv` (`token_version`).
- `POST /api/v1/auth/logout` (`200`) — Revokes active JWT `jti` into `revoked_tokens`.
- `GET /api/v1/auth/me` (`200`) — Returns authenticated user profile.
- `PUT /api/v1/auth/profile` (`200`) — Updates authenticated user `fullName` and `businessName` (non-whitespace validated).
- `POST /api/v1/auth/change-password` (`200`) — Verifies current password, enforces strength, atomically increments `UserModel.token_version` (`+1`) to invalidate all prior JWTs, and records audit logs.
- `POST /api/v1/auth/forgot-password` (`200`) — Uniform non-enumerating response; sends reset fragment `#reset_token=` when SMTP is configured and audits failures internally.
- `POST /api/v1/auth/reset-password` (`200`) — Validates single-use token, rotates password, increments `token_version`.
- `GET /api/v1/auth/audit-logs?limit=` (`200`) — Returns tenant-scoped security audit logs (`admin` can query globally).

## 3. Transactions, Search, Pagination & Export
- `GET /api/v1/transactions` — Filtered transaction list (`status`, `risk`, `source`, `category`, `txn_type`, `search`, `date_from`, `date_to`, `min_amount`, `max_amount`, `sort_by`, `sort_dir`, `limit`, `offset`). Invalid `date_from`/`date_to` returns `400`.
- `GET /api/v1/transactions/paged` — Returns `{ items, total, page, pageSize, totalPages }`.
- `GET /api/v1/transactions/export` — Streams UTF-8 `text/csv` with `sanitize_csv_cell` formula-injection escaping.
- `POST /api/v1/transactions` (`201`) — Creates manual `income` or `expense` ledger entry with Decimal precision and strict `date` validation (`<= 32` chars).
- `POST /api/v1/transactions/simulate` (`200`) — Records simulated sandbox order capture scoped to caller.
- `GET /api/v1/transactions/{txn_id}` (`200`) — Tenant-owned single transaction lookup.
- `PUT|PATCH /api/v1/transactions/{txn_id}` (`200`) — Edits owned manual entry & recomputes fees/net; blocks amount/currency/status/type mutation on settled PayPal sandbox captures (`400`) and edits to read-only seed baseline rows (`403`).
- `DELETE /api/v1/transactions/{txn_id}` (`200`) — Deletes non-settled manual entry; blocks deletion of settled PayPal sandbox orders (`400`).

## 4. Categories, Budgets & AI Telemetry
- `GET /api/v1/categories`, `POST /api/v1/categories` (`201`), `PUT|PATCH /api/v1/categories/{cat_id}` (`200`), `DELETE /api/v1/categories/{cat_id}` — User-owned ledger categories with case-insensitive uniqueness, cross-tenant IDOR protection, and DB `UniqueConstraint`.
- `GET /api/v1/budgets`, `POST /api/v1/budgets` (`201`), `PUT|PATCH /api/v1/budgets/{budget_id}`, `DELETE /api/v1/budgets/{budget_id}` — User budgets (`weekly`, `monthly`, `quarterly`, `Numeric(12,2)`).
- `GET /api/v1/budgets/utilization` — Computes rolling `7d`/`30d`/`90d` FX-normalized spend & fee utilization (`ON_TRACK`, `WARNING`, `EXCEEDED`) strictly isolated per budget owner.
- `GET /api/v1/assistant/usage` — Returns lifetime SQL aggregate AI query metrics (`totalQueries`, `geminiQueries`, `deterministicQueries`, `fallbackCount`, `averageLatencyMs`, `recentLogs`).

## 5. PayPal Sandbox REST v2 Integration
- `GET /api/v1/paypal/config` — Public sandbox mode & Client ID (never exposes Client Secret).
- `POST /api/v1/paypal/create-order` — Authenticated order creation persisting `PayPalOrderModel` ownership (`Numeric(12,2)`).
- `POST /api/v1/paypal/capture-order/{order_id}` — Atomic `CAPTURING` claim outside network calls, `CAPTURE_UNKNOWN` recovery, domestic `"US"` fee accuracy, `$0.00` fee preservation, `JPY` zero-decimal formatting.
- `GET /api/v1/paypal/orders/{order_id}` — Safe order state reconciliation preserving `CAPTURING`, `CAPTURE_UNKNOWN`, and terminal refund/dispute states.
- `POST /api/v1/paypal/refund` — Atomic `REFUNDING` claim, `REFUND_UNKNOWN` safe reconciliation, `CAPTURE_FULLY_REFUNDED` recovery, updates `net_amount` to `0.0`.
- `POST /api/v1/paypal/webhooks` (`600 req/min` webhook bucket) — Mandatory PayPal signature verification, HTTPS allowlisted cert URL check (no redirects), replay protection (`webhook_events`), handles `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.REFUNDED`, and `CUSTOMER.DISPUTE.CREATED`.

## 6. Analytics, Decision Intelligence, Cost Optimizer, Scam Shield & AI Agent
- `GET /api/v1/analytics/summary`, `/analytics/trends`, `/analytics/patterns`, `/analytics/insights`
- `GET /api/v1/analytics/comparison`, `/analytics/forecast`, `/analytics/decision-intelligence`, `POST /api/v1/analytics/simulate-scenario`
- `POST /api/v1/optimizer/calculate`, `GET /api/v1/optimizer/historical-analysis`, `GET /api/v1/optimizer/recommendations`, `POST /api/v1/optimizer/compare-scenarios`
- `POST /api/v1/scam-shield/analyze`, `GET /api/v1/scam-shield/history`, `GET /api/v1/scam-shield/threat-distribution`
- `GET /api/v1/health/metrics`, `GET /api/v1/health/timeline`, `POST /api/v1/health/simulate-pattern`
- `POST /api/v1/assistant/chat`

