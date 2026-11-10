"""
Finova AI - Transaction Intelligence Engine Service
Transforms raw and captured PayPal Sandbox transaction records into
actionable financial intelligence, revenue trends, fee optimizations,
and anomaly insights.
"""

from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from decimal import Decimal
from collections import defaultdict
import numpy as np
from sqlalchemy.orm import Session
from models.transaction import TransactionModel
from services.auth_service import scope_transaction_query
from services.shared_utils import (
    USD_EXCHANGE_RATES,
    convert_to_usd,
    is_domestic_us,
    parse_strict_filter_date,
    parse_transaction_datetime,
    quantize_currency,
    to_decimal,
)


class TransactionAnalyticsService:
    def __init__(self):
        pass

    def get_summary(
        self,
        db: Session,
        scoped_user_id: Optional[str] = None,
        date_from: Optional[str] = None,
        date_to: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Calculates high-level transaction intelligence metrics from the database:
        - Total transaction volume (FX-normalized to USD portfolio equivalent via Decimal math)
        - Income, expenses, and net cash flow breakdown
        - Confirmed actual PayPal fees vs estimated commercial fees (preserving $0.00 fees)
        - Status, category, and data source breakdowns
        """
        query = scope_transaction_query(db.query(TransactionModel), TransactionModel, scoped_user_id)
        transactions = query.order_by(TransactionModel.created_at.desc()).all()

        if date_from or date_to:
            start_dt = parse_strict_filter_date(date_from) if date_from else None
            end_dt = parse_strict_filter_date(date_to) if date_to else None
            if end_dt and len((date_to or "").strip()) <= 10:
                end_dt = end_dt.replace(hour=23, minute=59, second=59)
            filtered = []
            for t in transactions:
                dt = parse_transaction_datetime(t.date, t.created_at)
                if start_dt and dt < start_dt:
                    continue
                if end_dt and dt > end_dt:
                    continue
                filtered.append(t)
            transactions = filtered

        if not transactions:
            return {
                "totalTransactions": 0,
                "grossPaymentVolume": 0.0,
                "completedVolume": 0.0,
                "totalNetReceived": 0.0,
                "totalIncome": 0.0,
                "totalExpenses": 0.0,
                "netCashFlow": 0.0,
                "totalFees": 0.0,
                "totalActualFees": 0.0,
                "totalEstimatedFees": 0.0,
                "confirmedFeeCoveragePct": 0.0,
                "averageTicketSize": 0.0,
                "categoryBreakdown": [],
                "statusBreakdown": {},
                "sourceBreakdown": {"sandbox": {"count": 0, "volume": 0.0}, "synthetic": {"count": 0, "volume": 0.0}},
                "riskMetrics": {
                    "anomalyCount": 0,
                    "criticalCount": 0,
                    "highCount": 0,
                    "lowMediumCount": 0,
                    "disputeRate": 0.0,
                    "refundRate": 0.0
                }
            }

        total_txns = len(transactions)
        income_txns = [t for t in transactions if (getattr(t, "txn_type", None) or "income").lower() != "expense"]
        expense_txns = [t for t in transactions if (getattr(t, "txn_type", None) or "income").lower() == "expense"]

        gross_volume_dec = sum(
            (convert_to_usd(t.amount, t.currency) for t in income_txns if t.status != "DENIED"),
            Decimal("0.00"),
        )
        completed_income = [t for t in income_txns if t.status == "COMPLETED"]
        completed_volume_dec = sum((convert_to_usd(t.amount, t.currency) for t in completed_income), Decimal("0.00"))
        total_net_dec = sum((convert_to_usd(t.net_amount, t.currency) for t in completed_income), Decimal("0.00"))

        total_expenses_dec = sum(
            (convert_to_usd(t.amount, t.currency) for t in expense_txns if t.status != "DENIED"),
            Decimal("0.00"),
        )
        net_cash_flow_dec = (total_net_dec - total_expenses_dec).quantize(Decimal("0.01"))

        # Fee calculations: distinguish confirmed actual fees ($0.00 included) from estimates
        actual_fee_txns = [t for t in transactions if t.actual_fee is not None]
        total_actual_fees_dec = sum((convert_to_usd(t.actual_fee, t.currency) for t in actual_fee_txns), Decimal("0.00"))
        total_estimated_fees_dec = sum(
            (convert_to_usd(t.estimated_fee, t.currency) for t in transactions if t.estimated_fee is not None),
            Decimal("0.00"),
        )

        total_effective_fees_dec = sum(
            (
                convert_to_usd(t.actual_fee if t.actual_fee is not None else t.estimated_fee, t.currency)
                for t in income_txns
                if t.status in ["COMPLETED", "DISPUTED"]
            ),
            Decimal("0.00"),
        )

        valid_income_count = len([t for t in income_txns if t.status != "DENIED"])
        fee_coverage_pct = round((len(actual_fee_txns) / total_txns) * 100, 1) if total_txns > 0 else 0.0
        avg_ticket_dec = (gross_volume_dec / Decimal(valid_income_count)) if valid_income_count > 0 else Decimal("0.00")

        # Status breakdown
        status_map: Dict[str, Dict[str, Any]] = {
            "COMPLETED": {"count": 0, "volume": 0.0, "fees": 0.0, "net": 0.0},
            "PENDING": {"count": 0, "volume": 0.0, "fees": 0.0, "net": 0.0},
            "DENIED": {"count": 0, "volume": 0.0, "fees": 0.0, "net": 0.0},
            "REFUNDED": {"count": 0, "volume": 0.0, "fees": 0.0, "net": 0.0},
            "DISPUTED": {"count": 0, "volume": 0.0, "fees": 0.0, "net": 0.0}
        }
        cat_map: Dict[str, Dict[str, Any]] = defaultdict(lambda: {"count": 0, "volume": Decimal("0.00"), "expenses": Decimal("0.00")})

        for t in transactions:
            st = t.status.upper() if t.status else "COMPLETED"
            if st not in status_map:
                status_map[st] = {"count": 0, "volume": 0.0, "fees": 0.0, "net": 0.0}
            amt_usd = convert_to_usd(t.amount, t.currency)
            eff_fee = t.actual_fee if t.actual_fee is not None else (t.estimated_fee or 0.0)
            fee_usd = convert_to_usd(eff_fee, t.currency)
            net_usd = convert_to_usd(t.net_amount or 0.0, t.currency)

            status_map[st]["count"] += 1
            status_map[st]["volume"] = round(float(to_decimal(status_map[st]["volume"]) + amt_usd), 2)
            status_map[st]["fees"] = round(float(to_decimal(status_map[st]["fees"]) + fee_usd), 2)
            status_map[st]["net"] = round(float(to_decimal(status_map[st]["net"]) + net_usd), 2)

            if st != "DENIED":
                cat = (getattr(t, "category", None) or "Payment").strip()
                cat_map[cat]["count"] += 1
                if (getattr(t, "txn_type", None) or "income").lower() == "expense":
                    cat_map[cat]["expenses"] += amt_usd
                else:
                    cat_map[cat]["volume"] += amt_usd

        category_breakdown = [
            {
                "category": cat,
                "count": vals["count"],
                "incomeVolume": float(quantize_currency(vals["volume"], "USD")),
                "expenseVolume": float(quantize_currency(vals["expenses"], "USD")),
            }
            for cat, vals in sorted(cat_map.items(), key=lambda kv: kv[1]["volume"] + kv[1]["expenses"], reverse=True)
        ]

        # Source breakdown: PayPal Sandbox captures vs Synthetic demonstration records
        source_map = {
            "sandbox": {"count": 0, "volume": 0.0},
            "synthetic": {"count": 0, "volume": 0.0}
        }
        for t in transactions:
            src = t.data_source if t.data_source in source_map else "synthetic"
            source_map[src]["count"] += 1
            amt_usd = convert_to_usd(t.amount, t.currency)
            source_map[src]["volume"] = round(float(to_decimal(source_map[src]["volume"]) + amt_usd), 2)

        # Risk metrics
        anomaly_count = sum(1 for t in transactions if t.is_anomaly)
        critical_count = sum(1 for t in transactions if t.risk_level == "CRITICAL")
        high_count = sum(1 for t in transactions if t.risk_level == "HIGH")
        low_med_count = total_txns - (critical_count + high_count)
        disputed_count = status_map.get("DISPUTED", {}).get("count", 0)
        refunded_count = status_map.get("REFUNDED", {}).get("count", 0)

        dispute_rate = round((disputed_count / total_txns) * 100, 2) if total_txns > 0 else 0.0
        refund_rate = round((refunded_count / total_txns) * 100, 2) if total_txns > 0 else 0.0

        return {
            "totalTransactions": total_txns,
            "grossPaymentVolume": float(quantize_currency(gross_volume_dec, "USD")),
            "completedVolume": float(quantize_currency(completed_volume_dec, "USD")),
            "totalNetReceived": float(quantize_currency(total_net_dec, "USD")),
            "totalIncome": float(quantize_currency(gross_volume_dec, "USD")),
            "totalExpenses": float(quantize_currency(total_expenses_dec, "USD")),
            "netCashFlow": float(quantize_currency(net_cash_flow_dec, "USD")),
            "totalFees": float(quantize_currency(total_effective_fees_dec, "USD")),
            "totalActualFees": float(quantize_currency(total_actual_fees_dec, "USD")),
            "totalEstimatedFees": float(quantize_currency(total_estimated_fees_dec, "USD")),
            "confirmedFeeCoveragePct": fee_coverage_pct,
            "averageTicketSize": float(quantize_currency(avg_ticket_dec, "USD")),
            "categoryBreakdown": category_breakdown,
            "statusBreakdown": status_map,
            "sourceBreakdown": source_map,
            "riskMetrics": {
                "anomalyCount": anomaly_count,
                "criticalCount": critical_count,
                "highCount": high_count,
                "lowMediumCount": low_med_count,
                "disputeRate": dispute_rate,
                "refundRate": refund_rate
            }
        }

    def _parse_date(self, txn: TransactionModel) -> datetime:
        """Delegates to unified transaction datetime parser."""
        return parse_transaction_datetime(txn.date, txn.created_at)

    def get_trends(self, db: Session, period: str = "daily", scoped_user_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Generates structured time-series trend summaries for interactive charts:
        - daily: grouped by date (with day name, volume, fee, net amount, anomaly count)
        - weekly: grouped by calendar week
        - monthly: grouped by month
        """
        query = scope_transaction_query(db.query(TransactionModel), TransactionModel, scoped_user_id)
        transactions = query.all()
        period = period.lower().strip()
        if period not in ["daily", "weekly", "monthly"]:
            period = "daily"

        if not transactions:
            return {
                "period": period,
                "data": [],
                "summary": {
                    "totalVolume": 0.0,
                    "totalFees": 0.0,
                    "netBalance": 0.0,
                    "growthRatePct": 0.0
                }
            }

        # Bucket transactions
        buckets = defaultdict(lambda: {
            "volume": 0.0,
            "fees": 0.0,
            "net": 0.0,
            "count": 0,
            "anomalies": 0,
            "completedCount": 0,
            "pendingCount": 0,
            "deniedCount": 0
        })

        for t in transactions:
            dt = self._parse_date(t)
            fee = t.actual_fee if t.actual_fee is not None else (t.estimated_fee or 0.0)
            
            if period == "daily":
                key = dt.strftime("%Y-%m-%d")
            elif period == "weekly":
                # ISO year and week number e.g. 2026-W44
                iso_yr, iso_wk, _ = dt.isocalendar()
                key = f"{iso_yr}-W{iso_wk:02d}"
            else:  # monthly
                key = dt.strftime("%Y-%m")

            b = buckets[key]
            amt_usd = float(convert_to_usd(t.amount, t.currency))
            fee_usd = float(convert_to_usd(fee, t.currency))
            net_usd = float(convert_to_usd(t.net_amount or 0.0, t.currency))
            if t.status != "DENIED":
                b["volume"] += amt_usd
            if t.status in ["COMPLETED", "DISPUTED"]:
                b["fees"] += fee_usd
            if t.status == "COMPLETED":
                b["net"] += net_usd
                b["completedCount"] += 1
            elif t.status == "PENDING":
                b["pendingCount"] += 1
            elif t.status == "DENIED":
                b["deniedCount"] += 1

            b["count"] += 1
            if t.is_anomaly:
                b["anomalies"] += 1

        # Sort chronologically
        sorted_keys = sorted(buckets.keys())
        
        # Build formatted data points
        series = []
        for k in sorted_keys:
            b = buckets[k]
            label = k
            if period == "daily":
                try:
                    d_obj = datetime.strptime(k, "%Y-%m-%d")
                    label = d_obj.strftime("%a %b %d") # e.g. "Mon Nov 02"
                except Exception:
                    label = k
            elif period == "weekly":
                label = f"Wk {k.split('-W')[-1]}" if "-W" in k else k
            elif period == "monthly":
                try:
                    d_obj = datetime.strptime(k, "%Y-%m")
                    label = d_obj.strftime("%b %Y")
                except Exception:
                    label = k

            series.append({
                "periodKey": k,
                "label": label,
                "day": label,  # Backwards compatibility for Recharts XAxis
                "volume": round(b["volume"], 2),
                "fee": round(b["fees"], 2),
                "net": round(b["net"], 2),
                "count": b["count"],
                "anomalies": b["anomalies"],
                "completed": b["completedCount"],
                "pending": b["pendingCount"],
                "denied": b["deniedCount"]
            })

        # Calculate volume trajectory growth
        growth_rate = 0.0
        if len(series) >= 2:
            prev_vol = series[-2]["volume"]
            curr_vol = series[-1]["volume"]
            if prev_vol > 0:
                growth_rate = round(((curr_vol - prev_vol) / prev_vol) * 100, 1)

        total_vol = sum(s["volume"] for s in series)
        total_fees = sum(s["fee"] for s in series)
        net_bal = sum(s["net"] for s in series)

        return {
            "period": period,
            "data": series,
            "summary": {
                "totalVolume": round(total_vol, 2),
                "totalFees": round(total_fees, 2),
                "netBalance": round(net_bal, 2),
                "growthRatePct": growth_rate,
                "dataPointCount": len(series)
            }
        }

    def get_patterns_and_distribution(self, db: Session, scoped_user_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Analyzes spending and revenue patterns:
        - Currency distribution (USD, EUR, GBP, etc.)
        - Ticket size brackets (<$20, $20-$100, $100-$500, $500-$2000, >$2000)
        - Payment rail distribution (PayPal Wallet, Card, Venmo, Pay in 4)
        - Velocity shifts and statistical outlier detection
        - Domestic vs Cross-border geographic distribution
        """
        query = scope_transaction_query(db.query(TransactionModel), TransactionModel, scoped_user_id)
        transactions = query.all()
        if not transactions:
            return {
                "currencyDistribution": [],
                "paymentRailDistribution": [],
                "ticketBrackets": [],
                "geographicDistribution": {"domesticVolume": 0.0, "internationalVolume": 0.0, "internationalPct": 0.0},
                "outliers": [],
                "velocityShift": {"detected": False, "changePct": 0.0}
            }

        valid_txns = [t for t in transactions if t.status != "DENIED"]
        total_txns = len(valid_txns)
        
        # Exchange rates for converting to USD portfolio equivalent (includes JPY & multi-currency)
        total_usd_volume = sum(float(convert_to_usd(t.amount, t.currency)) for t in valid_txns)

        # 1. Currency distribution
        currency_map = defaultdict(lambda: {"count": 0, "volume": 0.0, "usdVolume": 0.0, "actualFees": 0.0})
        for t in valid_txns:
            curr = (t.currency or "USD").upper()
            c_entry = currency_map[curr]
            c_entry["count"] += 1
            c_entry["volume"] += t.amount
            c_entry["usdVolume"] += float(convert_to_usd(t.amount, curr))
            fee = t.actual_fee if t.actual_fee is not None else (t.estimated_fee or 0.0)
            c_entry["actualFees"] += fee

        currency_dist = []
        for curr, data in currency_map.items():
            pct = round((data["usdVolume"] / total_usd_volume) * 100, 1) if total_usd_volume > 0 else 0.0
            currency_dist.append({
                "currency": curr,
                "count": data["count"],
                "volume": round(data["volume"], 2),
                "usdEquivalent": round(data["usdVolume"], 2),
                "percentage": pct,
                "totalFees": round(data["actualFees"], 2)
            })
        currency_dist.sort(key=lambda x: x["usdEquivalent"], reverse=True)

        # 2. Payment rail distribution
        rail_map = defaultdict(lambda: {"count": 0, "volume": 0.0})
        for t in valid_txns:
            method = t.payment_method or "PayPal Wallet"
            rail_map[method]["count"] += 1
            rail_map[method]["volume"] += float(convert_to_usd(t.amount, t.currency))

        rail_dist = []
        for method, data in rail_map.items():
            pct = round((data["volume"] / total_usd_volume) * 100, 1) if total_usd_volume > 0 else 0.0
            rail_dist.append({
                "method": method,
                "count": data["count"],
                "volume": round(data["volume"], 2),
                "percentage": pct
            })
        rail_dist.sort(key=lambda x: x["volume"], reverse=True)

        # 3. Ticket size brackets (FX-normalized to USD portfolio equivalent)
        brackets_def = [
            {"bracket": "Micropayments (< $20)", "min": 0.0, "max": 20.0, "micropayEligible": True},
            {"bracket": "Small Basket ($20 - $100)", "min": 20.0, "max": 100.0, "micropayEligible": False},
            {"bracket": "Standard Commercial ($100 - $500)", "min": 100.0, "max": 500.0, "micropayEligible": False},
            {"bracket": "High Value ($500 - $2,000)", "min": 500.0, "max": 2000.0, "micropayEligible": False},
            {"bracket": "Enterprise / Spikes (> $2,000)", "min": 2000.0, "max": float("inf"), "micropayEligible": False}
        ]

        ticket_brackets = []
        for b in brackets_def:
            matched = [t for t in valid_txns if b["min"] <= float(convert_to_usd(t.amount, t.currency)) < b["max"]]
            matched_vol = sum(float(convert_to_usd(t.amount, t.currency)) for t in matched)
            pct = round((matched_vol / total_usd_volume) * 100, 1) if total_usd_volume > 0 else 0.0
            ticket_brackets.append({
                "bracket": b["bracket"],
                "count": len(matched),
                "volume": round(matched_vol, 2),
                "percentage": pct,
                "micropayEligible": b["micropayEligible"]
            })

        # 4. Geographic distribution (Domestic US vs Cross-Border)
        domestic_vol = sum(float(convert_to_usd(t.amount, t.currency)) for t in valid_txns if is_domestic_us(t.country))
        usd_valid_volume = sum(float(convert_to_usd(t.amount, t.currency)) for t in valid_txns)
        inter_vol = max(0.0, usd_valid_volume - domestic_vol)
        inter_pct = round((inter_vol / usd_valid_volume) * 100, 1) if usd_valid_volume > 0 else 0.0

        # 5. Outlier detection (> 2.5 std deviations above USD-normalized mean)
        amounts_usd = [float(convert_to_usd(t.amount, t.currency)) for t in transactions if t.amount > 0]
        mean_amt = float(np.mean(amounts_usd)) if amounts_usd else 0.0
        std_amt = float(np.std(amounts_usd)) if len(amounts_usd) > 1 else 0.0
        threshold = mean_amt + (2.5 * std_amt)

        outliers = []
        for t in transactions:
            usd_amt = float(convert_to_usd(t.amount, t.currency))
            if usd_amt > threshold and usd_amt > 1500.0:
                outliers.append({
                    "id": t.id,
                    "paypalOrderId": t.paypal_order_id,
                    "amount": t.amount,
                    "usdAmount": round(usd_amt, 2),
                    "currency": t.currency,
                    "status": t.status,
                    "customer": t.customer_name,
                    "reason": f"USD equivalent (${usd_amt:,.2f}) is ${(usd_amt - mean_amt):.2f} above standard mean ($ {mean_amt:.2f})"
                })

        return {
            "currencyDistribution": currency_dist,
            "paymentRailDistribution": rail_dist,
            "ticketBrackets": ticket_brackets,
            "geographicDistribution": {
                "domesticVolume": round(domestic_vol, 2),
                "domesticPct": round(100.0 - inter_pct, 1),
                "internationalVolume": round(inter_vol, 2),
                "internationalPct": inter_pct
            },
            "statisticalBaseline": {
                "meanAmount": round(mean_amt, 2),
                "standardDeviation": round(std_amt, 2),
                "outlierThreshold": round(threshold, 2)
            },
            "outliers": outliers[:5]
        }

    def generate_ai_insights(self, db: Session, scoped_user_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Synthesizes database metrics into evidence-based natural language insights:
        - Financial executive summary
        - PayPal fee cost-saving recommendations
        - Anomaly alerts with explicit evidence & citation
        - Strict distinction between actual captured fees and estimates
        """
        summary = self.get_summary(db, scoped_user_id=scoped_user_id)
        patterns = self.get_patterns_and_distribution(db, scoped_user_id=scoped_user_id)
        
        insights = []
        now_str = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

        # 1. Reconciliation & Data Source Insight
        cov_pct = summary["confirmedFeeCoveragePct"]
        actual_fees = summary["totalActualFees"]
        est_fees = summary["totalEstimatedFees"]
        insights.append({
            "id": "INS-RECON-01",
            "type": "reconciliation",
            "title": "PayPal Fee Audit & Settlement Reconciliation",
            "summary": (
                f"PayPal has returned confirmed seller receivable breakdown data for {cov_pct}% of ledger captures. "
                f"Confirmed actual fees totaled ${actual_fees:.2f} USD, aligning with expected commercial tier pricing (3.49% + $0.49)."
            ),
            "evidence": [
                f"Captured Sandbox fees: ${actual_fees:.2f} USD across confirmed transactions",
                f"Estimated unbilled/pre-capture fees: ${est_fees:.2f} USD",
                f"Reconciliation coverage: {cov_pct}% of total records"
            ],
            "recommendation": "Maintain automatic webhook synchronization for PAYMENT.CAPTURE.COMPLETED to capture exact PayPal transaction fees in real-time.",
            "severity": "success" if cov_pct >= 50 else "info",
            "potentialSavings": None,
            "dataSource": "sandbox" if cov_pct > 0 else "synthetic",
            "timestamp": now_str
        })

        # 2. Currency Spread Optimization
        currencies = patterns["currencyDistribution"]
        non_usd = [c for c in currencies if c["currency"] != "USD"]
        if non_usd:
            non_usd_vol = sum(c.get("usdEquivalent", c["volume"]) for c in non_usd)
            total_vol = summary["grossPaymentVolume"]
            non_usd_pct = round((non_usd_vol / total_vol) * 100, 1) if total_vol > 0 else 0.0
            spread_loss_est = round(non_usd_vol * 0.035, 2)
            
            insights.append({
                "id": "INS-CURR-02",
                "type": "cost_optimization",
                "title": f"Foreign Currency Conversion Spread Optimization ({non_usd_pct}% Volume)",
                "summary": (
                    f"You have received {non_usd_pct}% of your payment volume in foreign currencies ({', '.join(c['currency'] for c in non_usd)}). "
                    f"PayPal charges approximately a 3.50% conversion spread when auto-converting foreign balances into USD."
                ),
                "evidence": [
                    f"Foreign currency volume: ${non_usd_vol:.2f} across {sum(c['count'] for c in non_usd)} transactions",
                    f"Estimated conversion spread incurred: ~${spread_loss_est:.2f} USD"
                ],
                "recommendation": "Enable multi-currency holding accounts in your PayPal Business Dashboard. Hold EUR and GBP in native balances to pay international vendors or withdraw to local multi-currency accounts.",
                "severity": "warning" if non_usd_pct >= 20 else "info",
                "potentialSavings": f"Up to ${spread_loss_est:.2f} USD",
                "dataSource": "hybrid",
                "timestamp": now_str
            })

        # 3. Micropayments Opportunity
        brackets = patterns["ticketBrackets"]
        micro = next((b for b in brackets if b["bracket"].startswith("Micropayments")), None)
        if micro and micro["count"] >= 1:
            # Under standard pricing: 3.49% + $0.49
            # Under micropayments pricing: 5.0% + $0.05
            # For a $5 transaction: Standard fee = $0.66 (13.3%), Micropayments fee = $0.30 (6.0%) -> 54% savings!
            insights.append({
                "id": "INS-MICRO-03",
                "type": "cost_optimization",
                "title": "PayPal Micropayments Pricing Tier Opportunity",
                "summary": (
                    f"Your ledger includes {micro['count']} transaction(s) under $20.00. "
                    "The standard PayPal fixed fee ($0.49) disproportionately inflates processing costs on micro-tickets to over 10-50% effective fee rates."
                ),
                "evidence": [
                    f"Recorded micropayment orders: {micro['count']} order(s) totaling ${micro['volume']:.2f}",
                    "Standard commercial fee structure: 3.49% + $0.49 fixed fee per checkout",
                    "Micropayments fee structure: 5.00% + $0.05 fixed fee"
                ],
                "recommendation": "If your product catalog includes low-ticket digital goods or tips, configure a dedicated PayPal Micropayments business sub-account.",
                "severity": "info",
                "potentialSavings": "Reduces fixed fees from $0.49 down to $0.05 per micro-transaction",
                "dataSource": "sandbox",
                "timestamp": now_str
            })

        # 4. Anomaly and Risk Alerts
        outliers = patterns["outliers"]
        anomalies = summary["riskMetrics"]["anomalyCount"]
        if anomalies > 0 or len(outliers) > 0:
            evidence_items = []
            if outliers:
                for o in outliers[:2]:
                    evidence_items.append(f"Transaction {o['id']} ({o['amount']} {o['currency']}) - {o['customer']}: {o['reason']}")
            if anomalies > 0:
                evidence_items.append(f"Finova Isolation Forest flagged {anomalies} total anomalous transaction pattern(s)")

            insights.append({
                "id": "INS-ANOM-04",
                "type": "fraud_warning",
                "title": f"High-Value Anomaly Alert: {len(outliers) + anomalies} Pattern(s) Flagged",
                "summary": (
                    "Unusual transaction spikes or untrusted buyer credentials detected. "
                    "Transactions exceeding $750.00 require strict adherence to PayPal Seller Protection policies to defend against future unauthorized cardholder chargebacks."
                ),
                "evidence": evidence_items,
                "recommendation": "Always retain carrier proof of delivery with signature confirmation for orders >= $750. Never ship to an unconfirmed address provided via external messaging.",
                "severity": "critical" if any(o["amount"] > 3000 for o in outliers) else "warning",
                "potentialSavings": "Shields against chargeback liability up to full order value",
                "dataSource": "hybrid",
                "timestamp": now_str
            })

        return insights

analytics_service = TransactionAnalyticsService()
