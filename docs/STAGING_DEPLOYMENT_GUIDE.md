# Finova AI — Staging Deployment Guide (PostgreSQL, Redis, Render & Vercel)

**Target Stack:** Managed PostgreSQL + Managed Redis + Render Backend (`finova-backend`) + Vercel Frontend (`finova-ai`) + PayPal Sandbox.  
**Pre-Deployment Verified Config Files:** [`render.yaml`](file:///d:/Myprojects/finova/render.yaml), [`backend/Dockerfile`](file:///d:/Myprojects/finova/backend/Dockerfile), [`backend/Procfile`](file:///d:/Myprojects/finova/backend/Procfile), [`frontend/vercel.json`](file:///d:/Myprojects/finova/frontend/vercel.json).

---

## 1. Provision Staging PostgreSQL & Redis
1. **Managed PostgreSQL (Render Postgres / Supabase / Neon):**
   - Copy the pooled/direct TLS connection string (`postgresql+psycopg2://...` or `postgresql://...?sslmode=require`).
   - Do **not** run DDL inside worker processes; [`render.yaml`](file:///d:/Myprojects/finova/render.yaml) executes `python migrate.py` once before starting Uvicorn (`--workers 2 --proxy-headers`).
2. **Managed Redis (Upstash Redis / Render Key Value):**
   - Obtain `rediss://:<token>@<host>:<port>` (TLS enabled).
   - Required whenever `APP_ENV=staging` or `APP_ENV=production` — [`RateLimitingMiddleware`](file:///d:/Myprojects/finova/backend/services/rate_limiter.py) intentionally returns HTTP `503` (fail-closed) if Redis is unset or unreachable.

## 2. Deploy Render Staging Backend
1. In Render Dashboard, create a **Blueprint** from the Git repository reading [`render.yaml`](file:///d:/Myprojects/finova/render.yaml), OR configure the Web Service (`rootDir: backend`, `healthCheckPath: /health`):
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `python migrate.py && uvicorn main:app --host 0.0.0.0 --port $PORT --workers 2 --proxy-headers`
2. Populate required secret environment variables in Render (`sync: false`, never committed):
   - `APP_ENV=staging` *(enforces production/staging security validations in [`config.py`](file:///d:/Myprojects/finova/backend/config.py))*
   - `JWT_SECRET_KEY=<64+ hex char cryptographic random key>`
   - `DATABASE_URL=<staging PostgreSQL URI>`
   - `REDIS_URL=<staging Redis/Upstash URI>`
   - `FRONTEND_ORIGIN=https://<staging-frontend-domain>.vercel.app`
   - `TRUST_PROXY_HEADERS=true` + `TRUSTED_PROXY_IPS=<verified Render ingress CIDRs>` *(keep `false` if CIDR allowlist is not verified)*
   - `PAYPAL_MODE=sandbox`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`
   - Optional AI/Email: `GEMINI_API_KEY`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`

## 3. Deploy Vercel Staging Frontend
1. Sign in to Vercel (`vercel-plugin` or Vercel Dashboard) and import repository with **Root Directory:** `frontend`.
2. Set environment variable in Vercel Staging Environment:
   - `VITE_API_BASE_URL=https://<staging-backend-service>.onrender.com/api/v1`
3. Verify CSP compatibility in [`frontend/vercel.json`](file:///d:/Myprojects/finova/frontend/vercel.json) (`connect-src` allows `https://*.onrender.com`, `https://www.sandbox.paypal.com`, `https://api-m.sandbox.paypal.com`).
4. Update Render `FRONTEND_ORIGIN` to the exact Vercel preview/staging origin and confirm `GET /health` -> `200 {"status": "HEALTHY", "database": "OK", "redis": "OK"}`.

