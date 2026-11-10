# Finova AI — Multi-Agent Orchestration & Engineering Rules

Project-level instructions for Google Antigravity operating in the **Finova AI** repository (`d:/Myprojects/finova`).  
All specialist agents are loaded on demand from the global Agency Agents skills library (`C:/Users/ssmah/.gemini/config/skills/<agent-name>/SKILL.md`) and project-local skills (`.agents/skills/`).

---

## 1. Finova AI Architecture Reference

- **Frontend (`frontend/`)**: React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons, Recharts.
  - Entry & State: `frontend/src/App.tsx`, `frontend/src/services/api.ts`, `frontend/src/types.ts`
  - Views: `frontend/src/views/` (`DashboardView.tsx`, `TransactionsView.tsx`, `CostOptimizerView.tsx`, `ScamShieldView.tsx`, `AccountHealthView.tsx`, `AiAssistantView.tsx`, `SettingsView.tsx`)
  - Styling & Design System: `frontend/src/index.css`, `frontend/tailwind.config.js`, `.agents/skills/design-taste-frontend/SKILL.md`
- **Backend (`backend/`)**: Python 3.11+, FastAPI, SQLAlchemy ORM, Pydantic v2, httpx.
  - Entry & Middleware: `backend/main.py` (security headers, 10 MB request limit, rate limiter, CORS, `/health`, `/ready`), `backend/config.py`
  - Routers: `backend/routes/auth_routes.py`, `backend/routes/paypal_routes.py`, `backend/routes/transaction_routes.py`
  - Database & Models: `backend/database.py`, `backend/models/user.py`, `backend/models/transaction.py` (`finova.db` local SQLite; PostgreSQL in production)
- **Payments & Auth Services**:
  - PayPal Sandbox REST API v2: `backend/services/paypal_service.py`
  - Auth (Bcrypt cost 12, HS256 JWT + JTI revocation, audit logs): `backend/services/auth_service.py`
- **AI / ML & Analytics Services**:
  - Financial Support Agent (Gemini + ground-truth ledger context): `backend/services/ai_agent_service.py`
  - Anomaly & Health (Isolation Forest, LOF, Z-score): `backend/services/anomaly_service.py`
  - Analytics, Cost & Scam Shield: `backend/services/analytics_service.py`, `backend/services/cost_optimizer_service.py`, `backend/services/scam_shield_service.py`, `backend/services/decision_intelligence_service.py`
- **Testing & Deployment**:
  - Backend `unittest` suites: `backend/test_security_auth.py`, `backend/test_hackathon_e2e_evaluation.py`, `backend/test_analytics.py`, `backend/test_cost_optimizer.py`, `backend/test_scam_shield.py`, `backend/test_account_health.py`, `backend/test_financial_assistant.py`, `backend/test_decision_intelligence.py`
  - Infrastructure & Docs: `render.yaml`, `vercel.json`, `docs/DEPLOYMENT_GUIDE.md`, `docs/SECURITY_ARCHITECTURE.md`

---

## 2. Verified Agency Agents Team Roster

Always reference and read the exact installed `SKILL.md` under `C:/Users/ssmah/.gemini/config/skills/<skill-id>/SKILL.md` (or `.agents/skills/design-taste-frontend/SKILL.md`). Never invent unlisted agent names.

### A. Orchestration Team
- `agency-agents-orchestrator` — Pipeline coordination, specialist delegation, dev-QA loops *(note: map legacy prompt references to Antigravity `agency-*` IDs)*.
- `agency-senior-project-manager` — Spec-to-task breakdown, realistic scope control.
- `agency-software-architect` — System boundaries, domain design, architectural trade-offs *(pair with `agency-master-plan-architect` for deep plans)*.

### B. Frontend Team
- `agency-frontend-developer` — React 18, TypeScript, Vite builds, API client integration, state management.
- `agency-ui-designer` — Design systems, component consistency *(coordinate with local `design-taste-frontend` and `agency-ui-finish-gate-reviewer`)*.
- `agency-ux-researcher` — Usability flows, merchant journey clarity *(supported by `agency-ux-architect`)*.
- `agency-accessibility-auditor` — WCAG compliance, keyboard navigation, contrast, screen-reader semantics.
- `agency-data-visualization-engineer` — Recharts time-series, confidence bands, colorblind-safe encodings.

### C. Backend Team
- `agency-backend-architect` — FastAPI structure, middleware, async I/O, modularity.
- `agency-api-platform-engineer` — REST contract consistency, Pydantic validation, rate limiting, versioning.
- `agency-database-optimizer` — SQLAlchemy indexing, N+1 elimination, PostgreSQL/SQLite query tuning *(supported by `agency-database-reliability-engineer`)*.
- `agency-identity-access-engineer` — JWT authentication, RBAC (`merchant` vs `admin`), tenant isolation.
- `agency-payments-billing-engineer` — PayPal Orders v2, capture idempotency, webhook signature verification, monetary precision, ledger reconciliation.

### D. AI / ML Team
- `agency-ai-engineer` — Production ML integration, Scikit-learn concurrency/lifecycle, Gemini fallback reliability.
- `agency-rag-pipeline-engineer` — Ground-truth ledger retrieval, context budgeting, hallucination prevention.
- `agency-prompt-engineer` — Structured system prompts, input/output guardrails, prompt-injection resilience.
- `agency-model-qa-specialist` — Precision/recall/F1 validation, calibration checks, false-positive audits.

### E. Data Science Team
- `agency-data-engineer` — Aggregation pipelines, ledger preprocessing, time-series bucketing.
- `agency-statistician` — Holt's linear forecasting, confidence intervals, statistical fallback for small `N`, outlier validity.
- `agency-analytics-reporter` — KPI formulas (gross, net, fees, dispute/refund rates) and executive insights *(supported by `agency-financial-analyst`)*.

### F. Quality, Security & Operations Team
- `agency-code-reviewer` — Correctness, maintainability, performance, minimal scope *(pair with `agency-minimal-change-engineer` for targeted bug fixes)*.
- `agency-application-security-engineer` — OWASP/BOLA/IDOR checks, CORS, headers, auth enforcement *(supported by `agency-ai-generated-code-security-auditor`, `agency-secrets-credential-hygiene-engineer`)*.
- `agency-api-tester` & `agency-test-automation-engineer` — Backend `unittest` validation, negative security tests, E2E browser flows.
- `agency-performance-benchmarker` — API latency, bundle size, database timing checks.
- `agency-technical-writer` — API docs, README updates, runbooks *(supported by `agency-devops-automator` for `render.yaml`/`vercel.json`)*.

---

## 3. Automatic Agent Selection & Delegation Rules

1. **Progressive Disclosure**: Never load all agent skills at once. Identify affected Finova components first, then call `read_file` ONLY on the assigned specialists' `SKILL.md` files.
2. **Task Sizing**:
   - *Simple, localized change* (e.g., styling fix, isolated bug): Assign **1 primary specialist** (e.g., `agency-frontend-developer` or `agency-minimal-change-engineer`).
   - *Complex, cross-layer, payment, auth, database, or AI task*: Coordinate **2–3 domain specialists** via `agency-agents-orchestrator`, plus mandatory independent review from `agency-code-reviewer` and (where applicable) `agency-application-security-engineer`.
3. **Component Routing**:
   - Auth / BOLA / Middleware / Secrets -> `agency-identity-access-engineer` + `agency-application-security-engineer`
   - PayPal / Fees / Webhooks / Money math -> `agency-payments-billing-engineer` + `agency-application-security-engineer`
   - Gemini Assistant / Prompts / RAG -> `agency-rag-pipeline-engineer` + `agency-prompt-engineer`
   - Isolation Forest / LOF / Forecasting -> `agency-ai-engineer` + `agency-statistician` + `agency-model-qa-specialist`
   - React / Recharts / CSS / Vite -> `agency-frontend-developer` + `agency-data-visualization-engineer` + `design-taste-frontend`
   - Database / Deployment -> `agency-database-optimizer` / `agency-devops-automator`

---

## 4. Seven-Phase Collaboration Workflow

1. **Phase 1 – Understand**: Inspect all relevant existing files before proposing edits. Never assume schema, routes, or frontend props from memory.
2. **Phase 2 – Plan**: Select the minimal set of specialist agents, read their `SKILL.md`, and draft a scoped implementation and verification plan.
3. **Phase 3 – Approval Gate**: Stop and wait for explicit user approval before modifying architecture, altering database schemas/migrations, changing PayPal/auth security behavior, touching deployment files, or performing multi-file changes.
4. **Phase 4 – Implement**: Execute minimal, clean diffs preserving existing Finova features and API contracts unless explicitly approved to change.
5. **Phase 5 – Review**: Run independent review (`agency-code-reviewer`, plus `agency-application-security-engineer` for security-sensitive paths).
6. **Phase 6 – Test**: Execute actual checks after final edits (e.g., `python -m unittest ...` in `backend/`, `npm run build --prefix frontend`) and report verbatim scope and results.
7. **Phase 7 – Deliver**: Report implemented behavior, agents involved, exact files changed, tests executed with results, remaining issues, and next steps.

---

## 5. Non-Negotiable Engineering, Security & Quality Standards

- **Secrets & Privacy**: Never hardcode or log API keys, JWT secrets, PayPal Client Secrets, tokens, passwords, or raw card numbers. Use environment variables (`.env`, `.env.example`).
- **Authorization Integrity**: Protect sensitive routes with strict JWT authentication (`get_current_user`); never trust client-supplied `user_id` parameters over authenticated user identity.
- **Payment & Financial Precision**: Keep PayPal Client Secret strictly server-side; verify webhook signatures unconditionally in production; enforce capture/webhook idempotency; compute deterministic financial metrics in backend code (never let AI invent amounts, IDs, or statuses).
- **Safe Database & Deployment Evolution**: Explain any schema change or migration plan before modifying models or `finova.db`; preserve `render.yaml` and `vercel.json` unless changes are explicitly requested and justified.
- **No Unnecessary Churn**: Never duplicate `~/.gemini/config/skills/` into the project, never alter `.agents/skills/design-taste-frontend/` or `skills-lock.json` unless asked, and avoid speculative refactors outside task scope.
- **Honest Verification**: Never claim a test passed unless executed after the final edit with observed passing output. Clearly distinguish verified behavior from mocked/skipped test scope.

