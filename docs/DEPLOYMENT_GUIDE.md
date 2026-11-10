# FINOVA AI — PRODUCTION DEPLOYMENT & DEVOPS ARCHITECTURE GUIDE
**Phase 9: Full-Stack Cloud Deployment (Vercel + Render + Supabase + PayPal Sandbox)**

---

## 1. Deployment Architecture Diagram

```
                              [ End Users / Merchants ]
                                          |
                                          | HTTPS (TLS 1.3)
                                          v
+-----------------------------------------------------------------------------------+
|                        FRONTEND HOSTING: VERCEL (Free Tier)                       |
|  - Domain: https://finova-ai.vercel.app (or custom domain)                         |
|  - Framework: Vite + React 18 + TypeScript + Tailwind CSS                         |
|  - Routing: Single-Page Application (SPA) with vercel.json rewrite to index.html  |
|  - Edge CDN: Global caching of static assets (.js, .css, .svg)                    |
|  - Env: VITE_API_BASE_URL=https://finova-backend.onrender.com/api/v1               |
+-----------------------------------------------------------------------------------+
                                          |
                                          | Secure REST API calls (JWT Bearer Token)
                                          v
+-----------------------------------------------------------------------------------+
|                        BACKEND HOSTING: RENDER (Free Tier)                        |
|  - Domain: https://finova-backend.onrender.com                                    |
|  - Runtime: Docker (Python 3.12-slim) or Native Python Runtime                    |
|  - Server: Uvicorn ASGI production server (2 worker processes)                   |
|  - Health Probe: GET /health (monitored every 30s)                                |
|  - Security: HSTS, CSP, X-Frame-Options, Sliding-Window Rate Limiting (20 auth/min) |
|  - CORS: Configured for Vercel domain and *.vercel.app preview URLs               |
+-----------------------------------------------------------------------------------+
          |                                   |                           |
          | OAuth 2.0 / REST v2               | SQL Queries (SSL)         | AI Prompts
          v                                   v                           v
+-----------------------+   +----------------------------------+   +----------------+
| PAYPAL DEVELOPER      |   | DATABASE: SUPABASE (Free Tier)   |   | GOOGLE GEMINI  |
| REST SANDBOX          |   | - Engine: PostgreSQL 15 / 16     |   | AI API         |
| - api-m.sandbox.      |   | - Port: 5432 / 6543 (Pooler)     |   | - Context-     |
|   paypal.com          |   | - Automatic Tables & Relations   |   |   aware RAG    |
| - Webhook delivery to |   | - Nightly Cloud Backups          |   | - Strict read- |
|   /paypal/webhooks    |   | - SSL Enforced (sslmode=require) |   |   only bounds  |
+-----------------------+   +----------------------------------+   +----------------+
```

---

## 2. Frontend Deployment (Vercel)

### Step 2.1: Connect GitHub / Git Repository to Vercel
1. Log in to [Vercel Dashboard](https://vercel.com/dashboard).
2. Click **"Add New..."** -> **"Project"**.
3. Import your Git repository (`finova`).

### Step 2.2: Configure Build Settings
- **Framework Preset**: `Vite`
- **Root Directory**: `frontend` (or leave as root if using the root `vercel.json`)
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

### Step 2.3: Set Environment Variables in Vercel
In the project settings under **Environment Variables**, configure:

| Variable Name | Value | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | `https://finova-backend.onrender.com/api/v1` | Points the frontend to your live Render backend. |

### Step 2.4: Deploy & Verify
- Click **"Deploy"**. Vercel will build the frontend in ~30 seconds.
- Test routing: Click between tabs (`/`, refresh the browser) to verify that `vercel.json` rewrites prevent 404 errors.

---

## 3. Backend Deployment (Render)

### Option A: 1-Click Render Blueprint (Recommended)
The repository includes a ready-to-use [`render.yaml`](file:///d:/Myprojects/finova/render.yaml) specification file.
1. Log in to [Render Dashboard](https://dashboard.render.com/).
2. Click **"New +"** -> **"Blueprint"**.
3. Select your `finova` repository. Render will automatically read `render.yaml` and configure:
   - Name: `finova-backend`
   - Runtime: `Python 3.12`
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `uvicorn main:app --host 0.0.0.0 --port $PORT --workers 2`
   - Health Check Path: `/health`
4. Fill in the sensitive environment variables prompted by the wizard.

### Option B: Manual Web Service Setup
1. Click **"New +"** -> **"Web Service"**.
2. Connect your repository.
3. Configure settings:
   - **Name**: `finova-backend`
   - **Region**: `Oregon (US West)` or closest to your users.
   - **Root Directory**: `backend`
   - **Runtime**: `Python 3` (or `Docker` using `backend/Dockerfile`)
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT --workers 2`
   - **Plan**: `Free`
4. Expand **Advanced** -> Set **Health Check Path** to `/health`.

### Backend Environment Variables on Render:

| Variable Name | Recommended Value | Description |
|---|---|---|
| `PYTHON_VERSION` | `3.12.0` | Forces Python 3.12 runtime. |
| `APP_ENV` | `production` | Enables production security mode. |
| `DATABASE_URL` | `postgresql://postgres:[PWD]@db.[REF].supabase.co:5432/postgres` | Supabase PostgreSQL connection string. |
| `PAYPAL_MODE` | `sandbox` | Keeps PayPal in Sandbox mode. |
| `PAYPAL_BASE_URL` | `https://api-m.sandbox.paypal.com` | Sandbox API endpoint. |
| `PAYPAL_CLIENT_ID` | `<Your PayPal Sandbox Client ID>` | From PayPal Developer Dashboard. |
| `PAYPAL_CLIENT_SECRET` | `<Your PayPal Sandbox Client Secret>` | Stored securely on backend only. |
| `PAYPAL_WEBHOOK_ID` | `<Your PayPal Webhook ID>` | Obtained after registering webhook. |
| `JWT_SECRET_KEY` | `<Random 64-char hex string>` | Generated secret for JWT token signing. |
| `FRONTEND_ORIGIN` | `https://finova-ai.vercel.app` | Your deployed Vercel frontend domain. |
| `GEMINI_API_KEY` | `<Your Google Gemini API Key>` | For AI Financial Support Agent. |

---

## 4. Database Setup (Supabase PostgreSQL)

### Step 4.1: Create Free Supabase Project
1. Go to [Supabase](https://supabase.com/) and create a new project named `finova-db`.
2. Set a strong database password and select a region close to your Render service (e.g., `US West / Oregon`).

### Step 4.2: Retrieve Connection URI
1. In Supabase Dashboard, go to **Project Settings** -> **Database**.
2. Under **Connection string**, select **URI**.
3. Choose **Transaction pooler** (port `6543`) or **Session pooler** (port `5432`):
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres
   ```
4. Copy this URI into the `DATABASE_URL` environment variable in Render.

### Step 4.3: Automatic Schema Migrations
- Finova AI includes an automatic schema bootstrapper via SQLAlchemy:
  ```python
  Base.metadata.create_all(bind=engine)
  ```
- When the Render backend starts up for the first time, it automatically creates:
  - `users` (Merchant authentication & RBAC)
  - `transactions` (Ledger with PayPal Order/Capture IDs & fees)
  - `security_audit_logs` (Tamper-evident audit trail)
  - `webhook_events` (Idempotency replay defense)
  - `scam_audit_logs` (Phishing & URL risk audits)
- Baseline demonstration records are automatically initialized.

---

## 5. PayPal Sandbox Webhook Setup

### Step 5.1: Register Webhook in Developer Dashboard
1. Go to [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/applications/sandbox).
2. Open your REST application: **Finova AI**.
3. Scroll down to the **Webhooks** section and click **"Add Webhook"**.
4. Set **Webhook URL**:
   ```
   https://finova-backend.onrender.com/api/v1/paypal/webhooks
   ```
5. Check the following **Event Types**:
   - `Payment capture completed`
   - `Payment capture denied`
   - `Payment capture refunded`
6. Click **"Save"**.
7. Copy the generated **Webhook ID** (e.g. `9B82103984029182H`).

### Step 5.2: Update Render Environment Variables
- Add `PAYPAL_WEBHOOK_ID=9B82103984029182H` to Render environment variables.
- Render will automatically trigger a zero-downtime redeploy.
- All subsequent Sandbox payments will trigger verified, idempotent captures.

---

## 6. Verification & End-to-End Testing

### Test 1: API Health Check
Run in terminal or browser:
```bash
curl -I https://finova-backend.onrender.com/health
```
Expected response:
```http
HTTP/2 200
content-type: application/json
x-content-type-options: nosniff
x-frame-options: DENY
strict-transport-security: max-age=31536000; includeSubDomains

{
  "status": "HEALTHY",
  "database": "HEALTHY",
  "paypal_api_endpoint": "https://api-m.sandbox.paypal.com",
  "paypal_configured": true,
  "rateLimiting": "ENABLED",
  "securityHeaders": "ENFORCED"
}
```

### Test 2: Frontend-Backend Connectivity
1. Open your Vercel deployment URL (`https://finova-ai.vercel.app`).
2. Verify that the **PayPal Merchant Intelligence** dashboard loads live data.
3. Open Developer Tools (F12) -> **Network** tab to confirm calls to `/api/v1/analytics/summary` return `HTTP 200`.

### Test 3: PayPal Sandbox Order & Capture
1. In the top header, click **"Simulate Payment"** or trigger a PayPal Sandbox checkout.
2. Complete the order with a PayPal Sandbox buyer account.
3. Confirm that the transaction appears in the **Recent PayPal Sandbox Transactions** ledger with verified capture fees and net amounts.

---

## 7. Troubleshooting & Operational Guide

| Symptom | Cause | Solution |
|---|---|---|
| **CORS error in browser console** | `FRONTEND_ORIGIN` does not match the Vercel domain. | In Render env vars, set `FRONTEND_ORIGIN` to exact frontend URL (e.g. `https://finova-ai.vercel.app`). Finova backend also automatically allows any `*.vercel.app` domain. |
| **Render cold start delay (50s)** | Free tier spins down web services after 15 minutes of inactivity. | Normal on free tier. To keep warm, set up an UptimeRobot / Cron monitor pinging `https://finova-backend.onrender.com/health` every 10 minutes, or upgrade to Render Starter plan ($7/mo). |
| **Database connection error** | Supabase connection string format or password issue. | Ensure URI uses `postgresql://` (or `postgres://` which Finova normalizes automatically). Check that special characters in DB password are URL-encoded. |
| **Vercel 404 on page refresh** | SPA client-side router not falling back to `index.html`. | Verify `vercel.json` exists in root and frontend with `rewrites: [{"source": "/(.*)", "destination": "/index.html"}]`. |
| **PayPal Webhook verification failed (403)** | Webhook ID mismatch or testing via localhost. | Webhooks require a public HTTPS URL. Verify `PAYPAL_WEBHOOK_ID` matches the ID in PayPal Developer Dashboard. |

