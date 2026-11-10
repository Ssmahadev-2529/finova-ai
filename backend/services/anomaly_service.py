import logging
import os
os.environ["LOKY_MAX_CPU_COUNT"] = "1"
import numpy as np
from datetime import datetime
from typing import List, Dict, Any, Tuple, Optional
from sklearn.ensemble import IsolationForest
from sklearn.neighbors import LocalOutlierFactor
from services.shared_utils import convert_to_usd, is_cross_border, parse_transaction_datetime

logger = logging.getLogger("finova.anomaly")
MODEL_VERSION = "finova-if-lof-v1.1"

class AnomalyService:
    """
    Finova AI - Account Health & Anomaly Predictor Service.
    
    Combines unsupervised machine learning (Isolation Forest & Local Outlier Factor)
    with deterministic statistical anomaly detection (Z-scores, moving baselines)
    and behavioral metrics to evaluate merchant account standing on a 0-100 scale.
    
    Tiers:
      80 - 100: Healthy
      60 - 79:  Stable
      40 - 59:  Needs Attention
      0  - 39:  High Concern
      
    DISCLAIMER: Finova AI provides merchant self-audit analytics and early financial
    warning indicators. Finova AI does NOT represent PayPal, predict internal PayPal
    limitation algorithms, or make decisions on behalf of PayPal risk operations.
    """

    def __init__(self):
        self.model_version = MODEL_VERSION
        self.n_estimators = 100
        self.contamination = 0.08
        self.random_state = 42

    def _build_isolation_forest(self) -> IsolationForest:
        """Creates a fresh thread-safe estimator per evaluation request."""
        return IsolationForest(
            n_estimators=self.n_estimators,
            contamination=self.contamination,
            random_state=self.random_state,
            n_jobs=1,
        )

    def analyze_transaction(
        self,
        amount: float,
        is_international: bool,
        email: str,
        historical_amounts: Optional[List[float]] = None
    ) -> Tuple[bool, int, str, Optional[str]]:
        """
        Evaluates a single transaction for statistical anomaly and fraud indicators.
        Returns (is_anomaly, risk_score, risk_level, anomaly_reason).
        """
        reasons = []
        risk_score = 10

        # Feature 1: Extreme value check relative to historical baseline
        mean_amt = float(np.mean(historical_amounts)) if historical_amounts and len(historical_amounts) > 0 else 600.0
        std_amt = float(np.std(historical_amounts)) if historical_amounts and len(historical_amounts) > 1 else 400.0

        if amount > (mean_amt + 3 * std_amt) or amount > 3500.0:
            reasons.append(f"Order amount (${amount:.2f}) deviates significantly from historical baseline (${mean_amt:.2f})")
            risk_score += 45

        # Feature 2: High-risk or disposable email domain check
        disposable_domains = {
            "sharklasers.com", "tempmail.com", "throwaway.org", "guerrillamail.com",
            "mailinator.com", "quick-verify-paypal.cc", "crypto-p2p-clearing.xyz"
        }
        domain = email.split("@")[-1].lower() if "@" in email else ""
        if domain in disposable_domains:
            reasons.append(f"Untrusted disposable or high-risk domain detected ({domain})")
            risk_score += 40

        # Feature 3: Cross-border surcharge / high-risk country
        if is_international and amount > 2000.0:
            reasons.append("High-value cross-border transaction requiring Seller Protection carrier signature")
            risk_score += 20

        # Normalize score
        risk_score = min(99, max(5, risk_score))

        # Risk level categorization
        if risk_score >= 80:
            risk_level = "CRITICAL"
        elif risk_score >= 60:
            risk_level = "HIGH"
        elif risk_score >= 30:
            risk_level = "MEDIUM"
        else:
            risk_level = "LOW"

        is_anomaly = (risk_score >= 60)
        anomaly_reason = "; ".join(reasons) if reasons else None

        return is_anomaly, risk_score, risk_level, anomaly_reason

    def compute_behavior_metrics(self, transactions: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Analyzes transaction frequency, amounts, volume velocity, status distributions,
        and currency entropy to establish baseline behavior.
        """
        if not transactions:
            return {
                "totalTransactions": 0,
                "totalVolume": 0.0,
                "averageAmount": 0.0,
                "medianAmount": 0.0,
                "stdAmount": 0.0,
                "maxAmount": 0.0,
                "completedCount": 0,
                "deniedCount": 0,
                "refundedCount": 0,
                "disputedCount": 0,
                "pendingCount": 0,
                "successRate": 100.0,
                "failureRate": 0.0,
                "refundRate": 0.0,
                "disputeRate": 0.0,
                "velocityPerDay": 0.0,
                "volumeVolatility": 0.0,
                "internationalRatio": 0.0,
                "currencyDistribution": {}
            }

        total = len(transactions)
        usd_amounts = [float(convert_to_usd(t.get("amount", 0.0), t.get("currency", "USD"))) for t in transactions]
        total_volume = round(float(sum(usd_amounts)), 2)
        avg_amount = round(float(np.mean(usd_amounts)), 2)
        median_amount = round(float(np.median(usd_amounts)), 2)
        std_amount = round(float(np.std(usd_amounts)), 2)
        max_amount = round(float(max(usd_amounts)), 2)

        # Status breakdowns
        completed = sum(1 for t in transactions if str(t.get("status", "")).upper() == "COMPLETED")
        denied = sum(1 for t in transactions if str(t.get("status", "")).upper() in ["DENIED", "FAILED"])
        refunded = sum(1 for t in transactions if str(t.get("status", "")).upper() == "REFUNDED")
        disputed = sum(1 for t in transactions if str(t.get("status", "")).upper() == "DISPUTED")
        pending = sum(1 for t in transactions if str(t.get("status", "")).upper() == "PENDING")

        success_rate = round((completed / total) * 100, 2)
        failure_rate = round((denied / total) * 100, 2)
        refund_rate = round((refunded / total) * 100, 2)
        dispute_rate = round((disputed / total) * 100, 2)

        # Currency & Cross-border
        currency_counts: Dict[str, int] = {}
        cross_border_count = 0
        for t in transactions:
            curr = str(t.get("currency", "USD")).upper()
            currency_counts[curr] = currency_counts.get(curr, 0) + 1
            if is_cross_border(t.get("country")):
                cross_border_count += 1

        international_ratio = round((cross_border_count / total) * 100, 2)

        # Velocity & Volatility estimation
        dates = []
        for t in transactions:
            d_str = t.get("date") or t.get("createdAt")
            if d_str:
                dates.append(parse_transaction_datetime(d_str))

        velocity_per_day = round(total / 7.0, 1) # Default 7-day window
        volume_volatility = 0.0

        if len(dates) >= 2:
            dates.sort()
            span_days = max(1.0, (dates[-1] - dates[0]).total_seconds() / 86400.0)
            velocity_per_day = round(total / span_days, 1)

            # Volatility: sort chronologically ascending so older vs recent half is order-independent
            paired = sorted(
                zip(
                    [
                        parse_transaction_datetime(str(t.get("date") or t.get("createdAt") or ""))
                        for t in transactions
                    ],
                    usd_amounts,
                ),
                key=lambda item: item[0],
            )
            mid_idx = total // 2
            older_vol = sum(val for _, val in paired[:mid_idx]) if mid_idx > 0 else 1.0
            recent_vol = sum(val for _, val in paired[mid_idx:]) if mid_idx < total else 1.0
            ratio = (recent_vol / max(1.0, older_vol))
            volume_volatility = round((ratio - 1.0) * 100, 1)

        return {
            "totalTransactions": total,
            "totalVolume": total_volume,
            "averageAmount": avg_amount,
            "medianAmount": median_amount,
            "stdAmount": std_amount,
            "maxAmount": max_amount,
            "completedCount": completed,
            "deniedCount": denied,
            "refundedCount": refunded,
            "disputedCount": disputed,
            "pendingCount": pending,
            "successRate": success_rate,
            "failureRate": failure_rate,
            "refundRate": refund_rate,
            "disputeRate": dispute_rate,
            "velocityPerDay": velocity_per_day,
            "volumeVolatility": volume_volatility,
            "internationalRatio": international_ratio,
            "currencyDistribution": currency_counts
        }

    def detect_anomalies(self, transactions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Runs unsupervised machine learning (Isolation Forest + LOF) when N >= 10,
        with robust deterministic statistical fallback for small datasets (N < 10).
        Returns list of flagged anomalous transactions with specific reasons and risk scores.
        """
        if not transactions:
            return []

        anomalies = []
        n = len(transactions)
        usd_amounts = [float(convert_to_usd(t.get("amount", 0.0), t.get("currency", "USD"))) for t in transactions]
        mean_amt = float(np.mean(usd_amounts)) if usd_amounts else 0.0
        std_amt = float(np.std(usd_amounts)) if len(usd_amounts) > 1 else 0.0

        if n >= 10:
            try:
                # Multi-feature vector: [usd_amount, is_international, is_denied, is_refund, amount_zscore, is_disputed]
                feature_matrix = []
                for idx_t, t in enumerate(transactions):
                    amt_usd = usd_amounts[idx_t]
                    is_intl = 1.0 if is_cross_border(t.get("country")) else 0.0
                    status = str(t.get("status", "")).upper()
                    is_denied = 1.0 if status in ["DENIED", "FAILED"] else 0.0
                    is_refund = 1.0 if status == "REFUNDED" else 0.0
                    is_disputed = 1.0 if status == "DISPUTED" else 0.0
                    zscore = (amt_usd - mean_amt) / max(1.0, std_amt)
                    feature_matrix.append([amt_usd, is_intl, is_denied, is_refund, zscore, is_disputed])

                X = np.array(feature_matrix)

                # Fit per-evaluation Isolation Forest cleanly (thread-safe across tenants)
                iso_forest = self._build_isolation_forest()
                iso_forest.fit(X)
                if_preds = iso_forest.predict(X) # -1 for outliers, 1 for inliers
                if_scores = iso_forest.score_samples(X)

                # Fit Local Outlier Factor
                lof = LocalOutlierFactor(n_neighbors=min(5, n - 1), contamination=0.08, n_jobs=1)
                lof_preds = lof.fit_predict(X)

                for idx, t in enumerate(transactions):
                    is_if_outlier = (if_preds[idx] == -1)
                    is_lof_outlier = (lof_preds[idx] == -1)
                    score_val = round(float(if_scores[idx]), 3)

                    # Also respect existing database flags
                    db_anomaly = bool(t.get("isAnomaly") or t.get("is_anomaly"))
                    db_reason = t.get("anomalyReason") or t.get("anomaly_reason")

                    if is_if_outlier or is_lof_outlier or db_anomaly:
                        raw_amt = float(t.get("amount", 0.0))
                        amt_usd = usd_amounts[idx]
                        triggers = []
                        if amt_usd > (mean_amt + 2.5 * std_amt) or amt_usd > 3000.0:
                            triggers.append(f"Amount (${amt_usd:,.2f} USD eq.) exceeds statistical 2.5σ baseline (${mean_amt:,.2f})")
                        if is_if_outlier:
                            triggers.append(f"Isolation Forest identified feature outlier (Score: {score_val})")
                        if is_lof_outlier:
                            triggers.append("Local Outlier Factor flagged unusual density deviation")
                        if db_reason and db_reason not in "; ".join(triggers):
                            triggers.append(db_reason)

                        status = str(t.get("status", "")).upper()
                        risk_score = int(t.get("riskScore") or t.get("risk_score") or 65)
                        if status in ["DISPUTED", "DENIED"]:
                            risk_score = max(risk_score, 85)

                        severity = "CRITICAL" if risk_score >= 80 else ("HIGH" if risk_score >= 60 else "MEDIUM")

                        anomalies.append({
                            "id": f"ANO-{t.get('id', idx)}",
                            "transactionId": t.get("id"),
                            "date": t.get("date") or t.get("createdAt") or "Recent",
                            "customerName": t.get("customerName") or t.get("customer_name") or "Merchant Customer",
                            "amount": raw_amt,
                            "currency": t.get("currency", "USD"),
                            "status": status,
                            "riskScore": risk_score,
                            "severity": severity,
                            "reason": "; ".join(triggers) if triggers else "Unsupervised ML pattern anomaly",
                            "isolationScore": score_val
                        })
                return anomalies
            except Exception as exc:
                logger.warning("ML anomaly detection fallback engaged (%s)", type(exc).__name__)

        # Fallback: Deterministic statistical anomaly detection (for small N or on ML error)
        for idx, t in enumerate(transactions):
            raw_amt = float(t.get("amount", 0.0))
            amt_usd = usd_amounts[idx]
            status = str(t.get("status", "")).upper()
            db_anomaly = bool(t.get("isAnomaly") or t.get("is_anomaly"))
            db_reason = t.get("anomalyReason") or t.get("anomaly_reason")

            is_stat_outlier = (std_amt > 0 and amt_usd > (mean_amt + 2.5 * std_amt)) or amt_usd >= 3500.0
            is_high_risk_status = status in ["DISPUTED", "DENIED"]

            if is_stat_outlier or is_high_risk_status or db_anomaly:
                triggers = []
                if is_stat_outlier:
                    triggers.append(f"Transaction amount (${amt_usd:,.2f} USD eq.) is significantly above average (${mean_amt:,.2f})")
                if is_high_risk_status:
                    triggers.append(f"Critical status flag: {status}")
                if db_reason and db_reason not in "; ".join(triggers):
                    triggers.append(db_reason)

                risk_score = int(t.get("riskScore") or t.get("risk_score") or (85 if is_high_risk_status else 65))
                severity = "CRITICAL" if risk_score >= 80 else ("HIGH" if risk_score >= 60 else "MEDIUM")

                anomalies.append({
                    "id": f"ANO-{t.get('id', idx)}",
                    "transactionId": t.get("id"),
                    "date": t.get("date") or t.get("createdAt") or "Recent",
                    "customerName": t.get("customerName") or t.get("customer_name") or "Merchant Customer",
                    "amount": raw_amt,
                    "currency": t.get("currency", "USD"),
                    "status": status,
                    "riskScore": risk_score,
                    "severity": severity,
                    "reason": "; ".join(triggers) if triggers else "Statistical outlier detected",
                    "isolationScore": 0.65
                })

        return anomalies

    def calculate_account_health(
        self,
        transactions: List[Dict[str, Any]],
        simulation_deltas: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Calculates an explainable Account Health Score (0-100) and risk indicators.
        
        Tiers:
          80 - 100: Healthy
          60 - 79:  Stable
          40 - 59:  Needs Attention
          0  - 39:  High Concern
        """
        behavior = self.compute_behavior_metrics(transactions)
        detected_anomalies = self.detect_anomalies(transactions)

        total_txns = behavior["totalTransactions"]
        dispute_rate = behavior["disputeRate"]
        refund_rate = behavior["refundRate"]
        failure_rate = behavior["failureRate"]
        anomaly_count = len(detected_anomalies)
        anomaly_ratio = round((anomaly_count / max(1, total_txns)) * 100, 2)
        volatility = behavior["volumeVolatility"]

        # If a simulation delta is provided, adjust parameters
        if simulation_deltas:
            add_disputes = float(simulation_deltas.get("additionalDisputes", 0))
            add_refunds = float(simulation_deltas.get("additionalRefunds", 0))
            add_failures = float(simulation_deltas.get("additionalFailures", 0))
            vol_multiplier = float(simulation_deltas.get("volumeSpikeMultiplier", 1.0))

            sim_total = max(1, total_txns + int(add_disputes + add_refunds + add_failures))
            dispute_rate = round(((behavior["disputedCount"] + add_disputes) / sim_total) * 100, 2)
            refund_rate = round(((behavior["refundedCount"] + add_refunds) / sim_total) * 100, 2)
            failure_rate = round(((behavior["deniedCount"] + add_failures) / sim_total) * 100, 2)
            volatility = round(volatility * vol_multiplier, 1)

        # Explainable Score Deduction Breakdown
        base_score = 100
        dispute_deduction = 0
        refund_deduction = 0
        failure_deduction = 0
        anomaly_deduction = 0
        volatility_deduction = 0

        # 1. Dispute Penalty (PayPal standard limit: 1.0%)
        # > 0.8% is warning zone; > 1.0% is severe penalty
        if dispute_rate > 0.0:
            if dispute_rate >= 1.0:
                dispute_deduction = int(35 + (dispute_rate - 1.0) * 20)
            elif dispute_rate >= 0.5:
                dispute_deduction = int(dispute_rate * 30)
            else:
                dispute_deduction = int(dispute_rate * 20)
            dispute_deduction = min(45, max(0, dispute_deduction))

        # 2. Refund Penalty (Benchmark: 3.5%)
        if refund_rate > 3.5:
            refund_deduction = int((refund_rate - 3.5) * 2.5)
        elif refund_rate > 0.0:
            refund_deduction = int(refund_rate * 1.0)
        refund_deduction = min(20, max(0, refund_deduction))

        # 3. Failed / Denied Payment Penalty (Benchmark: < 3.0%)
        if failure_rate > 3.0:
            failure_deduction = int((failure_rate - 3.0) * 1.8)
        failure_deduction = min(15, max(0, failure_deduction))

        # 4. Anomaly Density Penalty
        if anomaly_ratio > 0.0:
            anomaly_deduction = int(anomaly_ratio * 1.2)
        anomaly_deduction = min(15, max(0, anomaly_deduction))

        # 5. Volume Volatility Penalty (velocity spikes > 150%)
        if volatility > 150.0:
            volatility_deduction = 10
        elif volatility > 75.0:
            volatility_deduction = 5

        # Compute Final Health Score
        final_score = base_score - (dispute_deduction + refund_deduction + failure_deduction + anomaly_deduction + volatility_deduction)
        final_score = max(5, min(100, final_score))

        # Assign 4 Tiers
        if final_score >= 80:
            health_tier = "Healthy"
            health_status = "Excellent" if dispute_rate < 0.3 else "Good"
        elif final_score >= 60:
            health_tier = "Stable"
            health_status = "Fair"
        elif final_score >= 40:
            health_tier = "Needs Attention"
            health_status = "Needs Attention"
        else:
            health_tier = "High Concern"
            health_status = "At Risk"

        score_breakdown = {
            "baseScore": base_score,
            "disputeDeduction": dispute_deduction,
            "refundDeduction": refund_deduction,
            "failureDeduction": failure_deduction,
            "anomalyDeduction": anomaly_deduction,
            "volatilityDeduction": volatility_deduction,
            "finalScore": final_score
        }

        # 6 Comprehensive Risk Indicators
        risk_indicators = [
            {
                "id": "IND-DISPUTE",
                "name": "Dispute Exposure Ratio",
                "value": dispute_rate,
                "unit": "%",
                "benchmark": "1.00% Max",
                "status": "Safe" if dispute_rate < 0.6 else ("Warning" if dispute_rate < 1.0 else "Critical"),
                "severity": "critical" if dispute_rate >= 1.0 else ("warning" if dispute_rate >= 0.6 else "healthy"),
                "description": "PayPal accounts exceeding 1.0% dispute rate face payment holds and excess dispute fees ($15–$20)."
            },
            {
                "id": "IND-REFUND",
                "name": "Refund Velocity Ratio",
                "value": refund_rate,
                "unit": "%",
                "benchmark": "3.50% Avg",
                "status": "Normal" if refund_rate <= 3.5 else ("Elevated" if refund_rate <= 7.0 else "High"),
                "severity": "critical" if refund_rate > 7.0 else ("warning" if refund_rate > 3.5 else "healthy"),
                "description": "Standard e-commerce baseline is under 3.5%. Elevated refunds erode processing margins."
            },
            {
                "id": "IND-SUCCESS",
                "name": "Payment Authorization Success Rate",
                "value": behavior["successRate"],
                "unit": "%",
                "benchmark": "95.0% Min",
                "status": "Optimal" if behavior["successRate"] >= 90.0 else "Sub-optimal",
                "severity": "healthy" if behavior["successRate"] >= 90.0 else "warning",
                "description": "Ratio of settled completed transactions vs denied, failed, or disputed checkouts."
            },
            {
                "id": "IND-FAILURE",
                "name": "Denied / Card Decline Rate",
                "value": failure_rate,
                "unit": "%",
                "benchmark": "3.00% Max",
                "status": "Clean" if failure_rate <= 3.0 else ("Review" if failure_rate <= 8.0 else "Elevated"),
                "severity": "critical" if failure_rate > 8.0 else ("warning" if failure_rate > 3.0 else "healthy"),
                "description": "Unusually high card declines or denials indicate checkout friction or card-testing attacks."
            },
            {
                "id": "IND-VOLATILITY",
                "name": "Transaction Volume Velocity",
                "value": volatility,
                "unit": "% Δ",
                "benchmark": "±50% Range",
                "status": "Steady" if abs(volatility) <= 75.0 else ("Surge" if volatility > 75.0 else "Drop"),
                "severity": "warning" if abs(volatility) > 100.0 else "healthy",
                "description": "Recent volume change compared to baseline. Sudden surges can trigger temporary reserve reviews."
            },
            {
                "id": "IND-ANOMALY",
                "name": "Unsupervised Anomaly Density",
                "value": anomaly_ratio,
                "unit": "%",
                "benchmark": "5.00% Baseline",
                "status": "Low" if anomaly_ratio <= 5.0 else ("Moderate" if anomaly_ratio <= 10.0 else "High"),
                "severity": "critical" if anomaly_ratio > 10.0 else ("warning" if anomaly_ratio > 5.0 else "healthy"),
                "description": "Transactions flagged by Isolation Forest as statistical or behavioral outliers."
            }
        ]

        # Dynamic Historical Trajectory (computed from transaction timestamps or rolling segments)
        trends = self._compute_dynamic_trends(transactions, final_score, dispute_rate)

        # Early-Warning Predictive Intelligence
        early_warnings = []
        if dispute_rate >= 0.6:
            early_warnings.append({
                "id": "WARN-01",
                "title": "Dispute Rate Entering PayPal Monitoring Horizon",
                "triggerMetric": f"Current dispute rate: {dispute_rate}% (Threshold: 0.80%)",
                "severity": "critical" if dispute_rate >= 1.0 else "warning",
                "consequence": "Accounts crossing 1.0% face standard $15–$20 chargeback processing fees and rolling reserves.",
                "mitigation": "Upload tracking numbers via PayPal Seller Protection API within 24 hours of order fulfillment."
            })

        if failure_rate >= 5.0:
            early_warnings.append({
                "id": "WARN-02",
                "title": "Elevated Checkout Decline Ratio",
                "triggerMetric": f"Current decline rate: {failure_rate}% (Baseline: < 3.0%)",
                "severity": "warning",
                "consequence": "Repeated declines may signal card-testing bots targeting your checkout endpoints.",
                "mitigation": "Enable reCAPTCHA v3 or Cloudflare Turnstile on checkout forms and require 3D-Secure 2.0."
            })

        if behavior["internationalRatio"] > 40.0:
            early_warnings.append({
                "id": "WARN-03",
                "title": "Substantial Cross-Border Order Exposure",
                "triggerMetric": f"Cross-border share: {behavior['internationalRatio']}%",
                "severity": "info",
                "consequence": "Foreign buyers incur +1.50% international cross-border surcharges and currency conversion spreads.",
                "mitigation": "Consider presenting local European payment methods (e.g. iDEAL, Bancontact) through PayPal."
            })

        # Actionable Preventive Recommendations
        preventive_recommendations = [
            {
                "id": "REC-01",
                "title": "Dispute Defense: Mandatory Tracking Number Uploads",
                "severity": "warning" if dispute_rate >= 0.5 else "info",
                "action": "Ensure all physical shipments receive automated PayPal tracking synchronization upon carrier scan.",
                "impact": "Reduces 'Item Not Received' dispute liability by up to 42% under PayPal Seller Protection."
            },
            {
                "id": "REC-02",
                "title": "Cardholder Authentication: 3D-Secure for High-Ticket Orders",
                "severity": "critical" if final_score < 70 else "warning",
                "action": "Require 3DS 2.0 biometric or SMS authentication for transactions exceeding $1,000.",
                "impact": "Legally shifts chargeback liability away from the merchant to the card issuer."
            },
            {
                "id": "REC-03",
                "title": "Fee Optimization: Micropayment Tier Qualification",
                "severity": "info",
                "action": "Route orders under $12.00 to PayPal Micropayments tier (5.0% + $0.05) rather than standard (3.49% + $0.49).",
                "impact": "Saves an estimated $0.28 to $0.35 per micro-transaction."
            }
        ]

        # Model Metadata & Disclaimers
        model_meta = {
            "version": self.model_version,
            "algorithm": (
                f"Hybrid Isolation Forest ({self.n_estimators} trees) + Local Outlier Factor (k=5)"
                if total_txns >= 10
                else "Deterministic Statistical Baseline Mode (N < 10)"
            ),
            "sampleSize": total_txns,
            "confidenceScore": min(98, max(50, int(50 + (total_txns * 3.5)))) if total_txns > 0 else 0,
            "mode": "ML-Active" if total_txns >= 10 else "Statistical-Fallback",
            "anomalyIsConfirmedFraud": False,
            "disclaimer": (
                "Anomaly flags indicate statistical feature deviations for merchant review only — "
                "an anomaly flag does NOT confirm fraud. Finova AI does NOT represent PayPal or predict internal PayPal decisions."
            ),
        }

        # Safe absorption margin (how many more disputes before hitting 1.0%)
        # (disputed + X) / (total + X) = 0.01  => X ~ (0.01*total - disputed) / 0.99
        max_disputes_tolerated = max(0, int(round((0.01 * max(1, total_txns) - behavior["disputedCount"]) / 0.99)))
        if dispute_rate >= 1.0:
            safety_margin_text = "Dispute threshold exceeded (>= 1.00%). Immediate case resolution recommended."
        else:
            safety_margin_text = f"You can absorb approximately {max(1, max_disputes_tolerated)} additional disputes before reaching the 1.00% PayPal review threshold."

        return {
            "healthScore": final_score,
            "healthTier": health_tier,
            "healthStatus": health_status,
            "disputeRate": dispute_rate,
            "refundRate": refund_rate,
            "failureRate": failure_rate,
            "anomalyRatio": anomaly_ratio,
            "suddenSpikeDetected": volatility > 100.0,
            "isolationForestScore": round(float(np.mean([a.get("isolationScore", 0.74) for a in detected_anomalies])) if detected_anomalies else 0.74, 2),
            "safetyMarginText": safety_margin_text,
            "maxDisputesTolerated": max_disputes_tolerated,
            "scoreBreakdown": score_breakdown,
            "behaviorMetrics": behavior,
            "riskIndicators": risk_indicators,
            "detectedAnomalies": detected_anomalies,
            "trends": trends,
            "earlyWarnings": early_warnings,
            "preventiveRecommendations": preventive_recommendations,
            "modelMeta": model_meta,
            "dataSource": "sandbox"
        }

    def _compute_dynamic_trends(
        self,
        transactions: List[Dict[str, Any]],
        current_score: int,
        current_dispute_rate: float
    ) -> List[Dict[str, Any]]:
        """
        Calculates dynamic chronological trends from actual transaction dates.
        Splits into 4 chronological quarters or periods.
        """
        if not transactions:
            return [
                {"period": "Period 1", "healthScore": 95, "transactionVolume": 0, "anomalyCount": 0, "disputeRate": 0.0},
                {"period": "Period 2", "healthScore": 92, "transactionVolume": 0, "anomalyCount": 0, "disputeRate": 0.0},
                {"period": "Period 3", "healthScore": 86, "transactionVolume": 0, "anomalyCount": 0, "disputeRate": 0.0},
                {"period": "Period 4", "healthScore": current_score, "transactionVolume": 0, "anomalyCount": 0, "disputeRate": current_dispute_rate}
            ]

        # Chunk transactions into 4 chronological periods
        # Sort by date
        sorted_txns = sorted(transactions, key=lambda x: str(x.get("date") or x.get("createdAt") or ""))
        n = len(sorted_txns)
        chunk_size = max(1, n // 4)

        trends = []
        for i in range(4):
            start = i * chunk_size
            end = (i + 1) * chunk_size if i < 3 else n
            chunk = sorted_txns[start:end]
            if not chunk:
                chunk = sorted_txns[-1:]

            vol = round(sum(float(t.get("amount", 0.0)) for t in chunk), 2)
            disputes = sum(1 for t in chunk if str(t.get("status", "")).upper() == "DISPUTED")
            anomalies = sum(1 for t in chunk if t.get("isAnomaly") or t.get("is_anomaly"))
            d_rate = round((disputes / max(1, len(chunk))) * 100, 2)

            # Historical score projection
            period_score = max(35, min(100, 100 - int(d_rate * 25) - int(anomalies * 5)))
            if i == 3:
                period_score = current_score
                d_rate = current_dispute_rate

            label = f"Period {i + 1}"
            first_date = chunk[0].get("date", "").split(" ")[0] if chunk[0].get("date") else None
            if first_date:
                label = first_date

            trends.append({
                "period": label,
                "healthScore": period_score,
                "transactionVolume": vol,
                "anomalyCount": anomalies,
                "disputeRate": d_rate
            })

        return trends

    def evaluate_benchmark(self, labeled_transactions: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Evaluates statistical/ML outlier flags against a labeled offline evaluation dataset
        and reports Precision, Recall, F1, False Positive Rate, and False Negative Rate.
        """
        if not labeled_transactions:
            return {
                "modelVersion": self.model_version,
                "sampleCount": 0,
                "precision": 0.0,
                "recall": 0.0,
                "f1Score": 0.0,
                "falsePositiveRate": 0.0,
                "falseNegativeRate": 0.0,
            }
        detected = self.detect_anomalies(labeled_transactions)
        flagged_ids = {str(item.get("transactionId")) for item in detected if item.get("transactionId") is not None}

        tp = fp = fn = tn = 0
        for row in labeled_transactions:
            row_id = str(row.get("id"))
            actual = bool(row.get("expectedAnomaly"))
            pred = row_id in flagged_ids
            if pred and actual:
                tp += 1
            elif pred and not actual:
                fp += 1
            elif not pred and actual:
                fn += 1
            else:
                tn += 1

        precision = round(tp / (tp + fp), 4) if (tp + fp) > 0 else 0.0
        recall = round(tp / (tp + fn), 4) if (tp + fn) > 0 else 0.0
        f1 = round((2 * precision * recall) / (precision + recall), 4) if (precision + recall) > 0 else 0.0
        fpr = round(fp / (fp + tn), 4) if (fp + tn) > 0 else 0.0
        fnr = round(fn / (fn + tp), 4) if (fn + tp) > 0 else 0.0
        return {
            "modelVersion": self.model_version,
            "sampleCount": len(labeled_transactions),
            "truePositives": tp,
            "falsePositives": fp,
            "falseNegatives": fn,
            "trueNegatives": tn,
            "precision": precision,
            "recall": recall,
            "f1Score": f1,
            "falsePositiveRate": fpr,
            "falseNegativeRate": fnr,
        }

    def evaluate_train_test_split(self, random_state: int = 42) -> Dict[str, Any]:
        """
        Evaluates unsupervised anomaly detection (Isolation Forest + LOF novelty)
        using strictly disjoint chronological training and held-out evaluation splits.
        No test samples or evaluation labels enter baseline fitting or threshold estimation.
        """
        rng = np.random.default_rng(random_state)
        currencies = ["USD", "EUR", "GBP", "JPY"]
        normal_countries = ["US", "GB", "DE", "CA"]

        # 1. Clean baseline training split (chronologically earlier, N=150 normal transactions)
        train_txns: List[Dict[str, Any]] = []
        for idx in range(150):
            curr = currencies[idx % len(currencies)]
            usd_target = float(np.clip(rng.normal(280.0, 95.0), 45.0, 620.0))
            if curr == "JPY":
                raw_amt = round(usd_target * 150.0, 0)
            elif curr == "EUR":
                raw_amt = round(usd_target / 1.08, 2)
            elif curr == "GBP":
                raw_amt = round(usd_target / 1.27, 2)
            else:
                raw_amt = round(usd_target, 2)
            day = (idx % 28) + 1
            train_txns.append({
                "id": f"TRN-{idx:04d}",
                "date": f"2026-08-{day:02d} 12:00",
                "amount": raw_amt,
                "currency": curr,
                "country": normal_countries[idx % len(normal_countries)],
                "status": "COMPLETED",
            })

        # 2. Disjoint held-out evaluation split (chronologically later, N=100: 75 normal + 25 anomalous)
        test_txns: List[Dict[str, Any]] = []
        for idx in range(75):
            curr = currencies[(idx + 1) % len(currencies)]
            usd_target = float(np.clip(rng.normal(285.0, 90.0), 50.0, 610.0))
            if curr == "JPY":
                raw_amt = round(usd_target * 150.0, 0)
            elif curr == "EUR":
                raw_amt = round(usd_target / 1.08, 2)
            elif curr == "GBP":
                raw_amt = round(usd_target / 1.27, 2)
            else:
                raw_amt = round(usd_target, 2)
            day = (idx % 28) + 1
            test_txns.append({
                "id": f"TST-N-{idx:04d}",
                "date": f"2026-09-{day:02d} 14:00",
                "amount": raw_amt,
                "currency": curr,
                "country": normal_countries[(idx + 2) % len(normal_countries)],
                "status": "COMPLETED",
                "expectedAnomaly": False,
            })

        anomaly_scenarios = [
            ("USD", 4850.00, "US", "COMPLETED"),
            ("EUR", 4200.00, "NG", "DENIED"),
            ("USD", 3600.00, "RU", "DISPUTED"),
            ("GBP", 2950.00, "RO", "DISPUTED"),
            ("JPY", 690000.0, "US", "DENIED"),
        ]
        for idx in range(25):
            curr, amt, country, st = anomaly_scenarios[idx % len(anomaly_scenarios)]
            day = (idx % 28) + 1
            test_txns.append({
                "id": f"TST-A-{idx:04d}",
                "date": f"2026-09-{day:02d} 18:30",
                "amount": round(amt * (1.0 + (idx % 4) * 0.08), 2),
                "currency": curr,
                "country": country,
                "status": st,
                "expectedAnomaly": True,
            })

        # Verify strict leakage prevention: disjoint IDs and strictly non-overlapping time windows
        train_ids = {t["id"] for t in train_txns}
        test_ids = {t["id"] for t in test_txns}
        train_max_date = max(t["date"] for t in train_txns)
        test_min_date = min(t["date"] for t in test_txns)
        leakage_check_passed = len(train_ids.intersection(test_ids)) == 0 and train_max_date < test_min_date

        # Fit strictly on training baseline
        train_usd = [float(convert_to_usd(t["amount"], t["currency"])) for t in train_txns]
        train_mean = float(np.mean(train_usd))
        train_std = max(1.0, float(np.std(train_usd)))

        def _extract_matrix(rows: List[Dict[str, Any]]) -> np.ndarray:
            feats = []
            for row in rows:
                amt_usd = float(convert_to_usd(row["amount"], row["currency"]))
                is_intl = 1.0 if is_cross_border(row.get("country")) else 0.0
                st_u = str(row.get("status", "")).upper()
                is_denied = 1.0 if st_u in ["DENIED", "FAILED"] else 0.0
                is_refund = 1.0 if st_u == "REFUNDED" else 0.0
                is_disputed = 1.0 if st_u == "DISPUTED" else 0.0
                zscore = (amt_usd - train_mean) / train_std
                feats.append([amt_usd, is_intl, is_denied, is_refund, zscore, is_disputed])
            return np.array(feats)

        X_train = _extract_matrix(train_txns)
        X_test = _extract_matrix(test_txns)

        iso_forest = IsolationForest(
            n_estimators=self.n_estimators,
            contamination=self.contamination,
            random_state=random_state,
            n_jobs=1,
        )
        iso_forest.fit(X_train)

        lof_novelty = LocalOutlierFactor(
            n_neighbors=min(10, len(train_txns) - 1),
            contamination=self.contamination,
            novelty=True,
            n_jobs=1,
        )
        lof_novelty.fit(X_train)

        if_preds = iso_forest.predict(X_test)
        lof_preds = lof_novelty.predict(X_test)

        tp = fp = fn = tn = 0
        for idx, row in enumerate(test_txns):
            actual = bool(row["expectedAnomaly"])
            pred = bool(if_preds[idx] == -1 or lof_preds[idx] == -1)
            if pred and actual:
                tp += 1
            elif pred and not actual:
                fp += 1
            elif not pred and actual:
                fn += 1
            else:
                tn += 1

        precision = round(tp / (tp + fp), 4) if (tp + fp) > 0 else 0.0
        recall = round(tp / (tp + fn), 4) if (tp + fn) > 0 else 0.0
        f1 = round((2 * precision * recall) / (precision + recall), 4) if (precision + recall) > 0 else 0.0
        fpr = round(fp / (fp + tn), 4) if (fp + tn) > 0 else 0.0
        fnr = round(fn / (fn + tp), 4) if (fn + tp) > 0 else 0.0

        return {
            "modelVersion": self.model_version,
            "datasetSize": len(train_txns) + len(test_txns),
            "trainSize": len(train_txns),
            "testSize": len(test_txns),
            "positiveCount": sum(1 for t in test_txns if t["expectedAnomaly"]),
            "negativeCount": sum(1 for t in test_txns if not t["expectedAnomaly"]),
            "truePositives": tp,
            "falsePositives": fp,
            "falseNegatives": fn,
            "trueNegatives": tn,
            "precision": precision,
            "recall": recall,
            "f1Score": f1,
            "falsePositiveRate": fpr,
            "falseNegativeRate": fnr,
            "leakageCheckPassed": leakage_check_passed,
            "limitations": (
                "Offline synthetic multi-currency benchmark measures unsupervised Isolation Forest + LOF(novelty=True) "
                "separation on held-out synthetic fraud/dispute anomalies. Real production dispute, chargeback, and seller "
                "behavior requires labeled merchant production outcomes and ongoing drift recalibration."
            ),
        }


anomaly_service = AnomalyService()
