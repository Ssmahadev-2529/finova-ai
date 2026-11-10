# Finova AI — Production Deployment Plan

**Target Release Model:** Split Managed Cloud Architecture (`Vercel` SPA -> `Render` FastAPI ASGI -> `Managed PostgreSQL` + `Managed Redis` + `PayPal REST API`).  
**Precondition:** **STOPPED PRIOR TO PRODUCTION.** Production rollout MUST NOT begin until staging validation ([STAGING_VALIDATION_REPORT.md](./STAGING_VALIDATION_REPORT.md)) completes cleanly and the user gives explicit production authorization.

---

## 1. Pre-Production Exit Criteria (Mandatory Gates)
1. **Staging Infrastructure Verified:** Live staging PostgreSQL & TLS Redis provisioned and tested under `APP_ENV=staging` with multi-worker `uvicorn --workers 2`.
2. **External Secret Rotation:** Distinct cryptographically random `JWT_SECRET_KEY` (`>= 64` hex chars), production `DATABASE_URL` (`sslmode=require`), TLS `REDIS_URL`, SMTP credentials, and PayPal credentials stored strictly in Render/Vercel secret vaults (never reused from dev/staging).
3. **Database Backup & Recovery Verified:** Automated daily PITR/snapshot backup enabled on managed PostgreSQL and restore procedure tested on an isolated staging DB clone.
4. **Live Webhook Round-Trip & Email Test:** PayPal webhook endpoint (`/api/v1/paypal/webhooks`) registered with verified `PAYPAL_WEBHOOK_ID` and SMTP reset delivery verified end-to-end.
5. **User Written Approval:** Explicit human confirmation to switch PayPal mode/credentials or deploy production services.

---

## 2. Production Cutover Sequence
1. Provision production PostgreSQL & Redis; record connection strings in Render production secret environment.
2. Deploy Render production service from [`render.yaml`](file:///d:/Myprojects/finova/render.yaml):
   - Pre-startup build & migration runs `python migrate.py` under PostgreSQL transaction advisory lock `pg_advisory_xact_lock`.
   - Confirm `GET /health` -> `200` and `GET /ready` -> `200` (`database: OK`, `redis: OK`).
3. Deploy Vercel production frontend (`Root Directory: frontend`, [`frontend/vercel.json`](file:///d:/Myprojects/finova/frontend/vercel.json)) with `VITE_API_BASE_URL` set to the exact production Render API URL.
4. Configure Render `FRONTEND_ORIGIN` and `TRUST_PROXY_HEADERS` / `TRUSTED_PROXY_IPS` matching the verified production Vercel domain and Render ingress CIDRs.
5. Run non-destructive production smoke checks (`/health`, auth register/login/logout, CSRF/CORS preflight check, security headers audit).

---

## 3. Rollback Plan
- **Frontend:** Instant 1-click deployment rollback in Vercel Dashboard to the prior immutable build.
- **Backend:** Re-pin Render Web Service to previous Docker image / commit hash.
- **Database:** Schema changes in Finova AI are strictly additive (`CREATE TABLE IF NOT EXISTS`, nullable/defaulted `ALTER TABLE ADD COLUMN`); if data restoration is ever needed, pause writes and restore from pre-cutover PostgreSQL snapshot.

