# FINOVA AI — SECURITY ARCHITECTURE, AUDIT & RELIABILITY GUIDE
**Phase 8: Enterprise Security Hardening & Zero-Trust Defense**

---

## 1. Security Architecture Overview

Finova AI is architected using a defense-in-depth model specifically designed for merchants handling PayPal REST API captures, commercial financial transactions, and AI-assisted financial support.

```
+-----------------------------------------------------------------------------------+
|                                 CLIENT LAYER                                      |
|  - React 18 / Tailwind / Vite SPA                                                 |
|  - In-Memory / LocalStorage JWT Bearer Token Management                           |
|  - Zero-Trust Client-Reported Status (Frontend Never Dictates Settlement State)  |
+-----------------------------------------------------------------------------------+
                                         |
                                         | HTTPS / TLS 1.3
                                         v
+-----------------------------------------------------------------------------------+
|                             NETWORK & EDGE SECURITY                               |
|  - SecurityHeadersMiddleware (HSTS, CSP, X-Frame-Options, X-Content-Type-Options) |
|  - RequestSizeLimitMiddleware (Strict 10MB payload limit)                         |
|  - Sliding-Window RateLimitingMiddleware (20 Auth / 120 API req/min per IP)        |
|  - CORS Whitelisting (Configured frontend origin, no wildcard credentials)        |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                            AUTHENTICATION & IDENTITY                              |
|  - Bcrypt Password Hashing (Cost Factor 12, Salted, Constant-Time Verify)         |
|  - HMAC-SHA256 Signed JWT Access Tokens (exp, iat, jti, iss)                      |
|  - Server-Side Revocation Cache (Instant Blacklisting on Logout)                   |
|  - Cryptographically Secure One-Time Password Reset Tokens (30m Expiration)      |
|  - Role-Based Access Control (RBAC) & User-Level Data Isolation                   |
+-----------------------------------------------------------------------------------+
          |                                                     |
          v                                                     v
+-------------------------------+             +-------------------------------------+
|      PAYPAL API SECURITY      |             |         AI SECURITY ENVELOPE        |
| - Server-Side Secrets Only    |             | - Prompt Injection Neutralization   |
| - OAuth 2.0 In-Memory Cache   |             | - Automatic Card & Token Redaction  |
| - Cert URL Domain Whitelisting|             | - Strict Read-Only Execution Bounds |
| - Capture & Webhook Event     |             | - Isolated Tool Execution Context   |
|   Idempotency Engine          |             +-------------------------------------+
+-------------------------------+                               |
          |                                                     |
          +--------------------------+--------------------------+
                                     |
                                     v
+-----------------------------------------------------------------------------------+
|                              PERSISTENCE & COMPLIANCE                             |
|  - Parameterized SQLAlchemy ORM Queries (Immune to SQL Injection)                 |
|  - Multi-Tenant User Isolation (Scoped queries on user_id)                        |
|  - Security Audit Logging (security_audit_logs with automatic redaction)          |
|  - Webhook Event Ledger (webhook_events for replay defense)                       |
+-----------------------------------------------------------------------------------+
```

---

## 2. Authentication Setup & Guide

### User Registration
- **Endpoint**: `POST /api/v1/auth/register`
- **Password Standards**: Minimum 8 characters, at least 1 uppercase letter, at least 1 lowercase letter, at least 1 digit.
- **Hashing**: Salted using `bcrypt.gensalt(12)` and hashed via `bcrypt.hashpw`. Plaintext passwords are never stored in memory longer than necessary and never written to disk or logs.

### User Login
- **Endpoint**: `POST /api/v1/auth/login`
- **Verification**: `bcrypt.checkpw()` executes in constant time to prevent timing-based side-channel attacks.
- **Output**: Returns a signed JWT access token containing `sub` (User ID), `email`, `role`, and a unique cryptographic `jti` (JWT ID).

### Logout & Server-Side Token Invalidation
- **Endpoint**: `POST /api/v1/auth/logout`
- **Revocation**: The server extracts the `jti` claim and records it in the in-memory revocation cache until the token's natural expiration. Any subsequent request using this revoked token is immediately rejected with HTTP `401 Unauthorized`.

### Password Reset Flow
1. **Request**: `POST /api/v1/auth/forgot-password` generates a high-entropy 32-byte URL-safe reset token (`secrets.token_urlsafe(32)`) valid for 30 minutes. To avoid user enumeration, requests for non-existent emails return standard responses.
2. **Execution**: `POST /api/v1/auth/reset-password` validates token expiration and updates the password using fresh bcrypt salt. The token is immediately cleared, preventing reuse.

---

## 3. PayPal API Security & Idempotency

### Protection of Client Secret
- `PAYPAL_CLIENT_SECRET` is read strictly from backend environment variables and never surfaced through public endpoints or frontend builds.
- The public configuration endpoint `GET /api/v1/paypal/config` only returns `clientId`, `mode`, `currency`, and `isConfigured`.

### Never Trust Frontend Settlement Status
- The client cannot dictate whether an order is `COMPLETED`, `REFUNDED`, or `DENIED`.
- Order capture status is retrieved directly from PayPal Orders API v2 (`/v2/checkout/orders/{order_id}/capture`). Only captures marked `COMPLETED` or `PENDING` by PayPal's server are persisted.

### Webhook Cryptographic Verification
- Webhook events are verified against PayPal's verification endpoint (`/v1/notifications/verify-webhook-signature`).
- **Domain Constraint**: `paypal-cert-url` is strictly validated to ensure it originates from official trusted PayPal domains (`https://api.paypal.com/` or `https://api.sandbox.paypal.com/`), defeating Server-Side Request Forgery (SSRF) and certificate spoofing attacks.

### Idempotency & Replay Attack Defense
- Webhook transmissions are stored in the `webhook_events` ledger. Duplicate transmissions of the same `event_id` or `paypal_transmission_id` return `{"status": "ALREADY_PROCESSED"}` without duplicate database mutations or balance adjustments.
- Capture requests check existing order IDs in `transactions` to prevent duplicate captures.

---

## 4. AI Security & Defense Envelope

### Prompt Injection Neutralization
The Financial Support Agent intercepts all incoming queries through `sanitize_input()`:
- Detects and halts adversarial jailbreak attempts (`ignore previous instructions`, `reveal system prompt`, `system override`, `eval(`, `exec(`).
- Responds with an isolated security alert and safely neutralizes execution.

### Sensitive Data Redaction
- **Payment Card PANs**: Redacts 13-19 digit card numbers using Luhn-compatible regex patterns into `[REDACTED_CARD_NUMBER]`.
- **API Keys and Tokens**: Replaces candidate bearer tokens and authorization secrets with `[REDACTED_TOKEN]`.

### Strict Read-Only Execution Bounds
- The AI agent has zero database write access, zero transaction creation privileges, and zero PayPal funds-movement capabilities.
- All AI responses are constructed through deterministic fact extractors and ground-truth database aggregations.

---

## 5. Security Audit Report

### Vulnerabilities Identified & Resolved During Phase 8

| ID | Vulnerability / Threat | Severity | Remediation Applied | Status |
|---|---|---|---|---|
| **VULN-01** | Missing Authentication on Protected Operations | **CRITICAL** | Built JWT auth layer with bcrypt hashing, token revocation, and user data isolation. | **RESOLVED** |
| **VULN-02** | SSRF & Cert Spoofing in Webhook Signature Verification | **HIGH** | Added strict origin domain whitelisting on `paypal-cert-url` (`api.paypal.com`, `api.sandbox.paypal.com`). | **RESOLVED** |
| **VULN-03** | Webhook & Payment Capture Replay Attacks | **HIGH** | Implemented `WebhookEventModel` idempotency tracking and order duplicate checks. | **RESOLVED** |
| **VULN-04** | Prompt Injection in AI Financial Assistant | **HIGH** | Implemented adversarial prompt injection filter and safe execution boundaries. | **RESOLVED** |
| **VULN-05** | Sensitive Data Exposure in Logs & Audit Trails | **MEDIUM** | Built `sanitize_log_data()` to automatically mask passwords, tokens, API keys, and PANs. | **RESOLVED** |
| **VULN-06** | Brute-Force & Denial of Service Vulnerability | **MEDIUM** | Implemented sliding-window rate limiting (20 Auth req/min, 120 API req/min) and 10MB payload limit. | **RESOLVED** |
| **VULN-07** | Information Disclosure on Unhandled Server Errors | **LOW** | Added global exception handler returning sanitized JSON without stack traces. | **RESOLVED** |
| **VULN-08** | Missing Essential HTTP Security Headers | **LOW** | Injected HSTS, CSP, X-Frame-Options (`DENY`), and X-Content-Type-Options (`nosniff`). | **RESOLVED** |

### Unresolved Risks & Operational Recommendations
1. **Distributed Multi-Instance Rate Limiting**: The current sliding-window rate limiter is in-memory. For horizontal multi-pod deployments, migrate state to an Upstash Redis or Redis token bucket cluster.
2. **Database Encryption-at-Rest**: In production deployments on Linux/PostgreSQL, configure tablespace-level transparent data encryption (TDE) or cloud volume encryption (AWS EBS / Google Cloud CMEK).
3. **External Secrets Manager**: For production, inject `PAYPAL_CLIENT_SECRET` and `JWT_SECRET_KEY` via AWS Secrets Manager, HashiCorp Vault, or Google Cloud Secret Manager rather than plain `.env` files.

---

## 6. API Security Checklist

- [x] HTTPS enforced via Strict-Transport-Security header (max-age 31536000).
- [x] Passwords hashed with salted bcrypt (cost factor 12).
- [x] JWT tokens signed with HMAC-SHA256 and verified on every protected request.
- [x] Tokens can be revoked immediately on logout via server blacklist.
- [x] Rate limiting active on login, registration, and reset endpoints.
- [x] CORS restricted to authorized frontend origins.
- [x] Webhook certificates constrained to trusted PayPal domains.
- [x] Webhook events executed idempotently with replay tracking.
- [x] Request payload size restricted to 10MB.
- [x] Unhandled exceptions sanitized to prevent stack trace leakage.
- [x] SQL queries parameterized via SQLAlchemy ORM.
- [x] Prompt injection filters protecting LLM endpoints.
- [x] Credit cards and authorization secrets redacted prior to audit logging.
- [x] Database health and readiness probes exposed at `/health` and `/ready`.

---

## 7. Verification Test Results

```
Ran 63 tests in 5.507s
OK
```

All 63 automated tests passed across all 8 development phases:
- `test_security_auth.py` (11 tests: Bcrypt, JWT, Logout, Reset, SQLi, Prompt Injection, Webhook Idempotency, Card Redaction, User Isolation)
- `test_decision_intelligence.py` (9 tests: Comparisons, Holt Forecasting, Decision Engine, Simulator)
- `test_financial_assistant.py` (11 tests: Deterministic RAG, Ground Truth, Fee Summaries)
- `test_account_health.py` (8 tests: Isolation Forest, Local Outlier Factor, Safety Margins)
- `test_scam_shield.py` (7 tests: Syntactic URL analysis, Punycode, Urgency detection)
- `test_cost_optimizer.py` (10 tests: Fee schedules, Surcharges, Multicurrency calculations)
- `test_analytics.py` (7 tests: Trends, Volumes, Rail patterns, AI insights)

