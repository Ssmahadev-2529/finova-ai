# Finova AI — Performance Benchmark & ML Evaluation Report

**Measured Date:** 2026-11-10  
**Environment:** Windows 11 local Python 3.12 + SQLite (`finova.db`) via FastAPI ASGI `TestClient(app)` (`15` iterations per endpoint after `15` seeded tenant records).

---

## 1. Backend API & Inference Latency Measurements

| Endpoint / Workload | Sample Count | P50 Latency (ms) | P95 Latency (ms) | Max Latency (ms) | Notes |
|---|---:|---:|---:|---:|---|
| `GET /health` | 15 | **4.93 ms** | **5.79 ms** | **6.37 ms** | Async thread-offloaded DB probe + limiter check |
| `GET /api/v1/transactions/paged?page=1&page_size=10` | 15 | **9.61 ms** | **10.48 ms** | **11.58 ms** | Indexed query + pagination envelope |
| `GET /api/v1/analytics/summary` | 15 | **8.99 ms** | **9.71 ms** | **9.73 ms** | Decimal FX aggregation across tenant rows |
| `GET /api/v1/health/metrics` (ML Pipeline) | 15 | **71.79 ms** | **80.72 ms** | **100.92 ms** | Per-evaluation thread-safe `IsolationForest` + `LOF` + health scoring |
| `POST /api/v1/assistant/chat` (RAG Deterministic) | 15 | **75.54 ms** | **79.22 ms** | **81.02 ms** | Tenant RAG TF-IDF retrieval + `ai_usage_logs` persistence *(offline deterministic mode)* |
| `POST /api/v1/auth/login` (Bcrypt cost 12) | 5 | **197.79 ms** | — | — | Deliberate CPU work-factor brute-force mitigation |

---

## 2. Anomaly Detection ML Train/Eval Split Validation (`AnomalyService.evaluate_train_test_split`)

- **Model Architecture:** Unsupervised ensemble (`sklearn.ensemble.IsolationForest(n_estimators=100, contamination=0.08, n_jobs=1)` + `sklearn.neighbors.LocalOutlierFactor(contamination=0.08, novelty=True, n_jobs=1)`) instantiated **per evaluation** (thread-safe across concurrent tenants) paired with deterministic `2.5σ` USD-normalized Z-score fallback when `N < 10`.
- **Feature Vector (USD FX-Normalized):** `[usd_amount, is_cross_border, is_denied, is_refund, usd_amount_zscore, is_disputed]`
- **Chronological Split & Leakage Control:**
  - **Training Baseline (`2026-08-*`, `trainSize = 150`):** Strictly clean historical multi-currency transactions (`USD`, `EUR`, `GBP`, `JPY`); zero test samples or labels enter baseline fitting or normalization statistics.
  - **Held-Out Evaluation Split (`2026-09-*`, `testSize = 100`):** Disjoint IDs (`TST-N-*`, `TST-A-*`), `positiveCount = 25` (synthetic fraud/cross-border/dispute spikes), `negativeCount = 75` (normal multi-currency transactions).
  - **`leakageCheckPassed`**: **`true`** (`train_ids ∩ test_ids = ∅` and `max(train_dates) < min(test_dates)`).
- **Verified Split Metrics (`datasetSize = 250`, `random_state = 42`):**
  - **True Positives (`TP`):** `25` | **False Positives (`FP`):** `8`
  - **True Negatives (`TN`):** `67` | **False Negatives (`FN`):** `0`
  - **`precision`**: **`0.7576`** (`75.76%`)
  - **`recall`**: **`1.0000`** (`100.0%`)
  - **`f1Score`**: **`0.8621`** (`86.21%`)
  - **`falsePositiveRate`**: **`0.1067`** (`10.67%`)
  - **`falseNegativeRate`**: **`0.0000`** (`0.0%`)
- **Single-Batch Separation Sanity Benchmark (`AnomalyService.evaluate_benchmark`, 18 samples):** `Precision = 1.0`, `Recall = 1.0`, `F1 = 1.0`, `FPR = 0.0`, `FNR = 0.0`, plus `0` false-positive statistical alerts across `6x ¥5,000 JPY` (~$33.50 USD each).
- **Limitation Disclosure:** Offline synthetic multi-currency benchmarks measure unsupervised `IsolationForest` + `LOF(novelty=True)` separation on held-out synthetic fraud/dispute anomalies. Real production dispute, chargeback, and seller behavior requires labeled merchant production outcomes and ongoing drift recalibration.
