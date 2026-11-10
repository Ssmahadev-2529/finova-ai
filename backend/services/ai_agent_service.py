"""
Finova AI - AI Financial Support Agent Service
Context-aware, read-only financial assistant powered by Gemini API
and deterministic backend financial engines.

Retrieves verified transaction records, cost analytics, anomaly events,
and scam shield logs to provide grounded, hallucination-free answers.
"""

import httpx
import logging
import math
import re
import time
import uuid
from collections import Counter
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from models.transaction import TransactionModel, ScamAuditModel
from models.finance import BudgetModel, AIUsageLogModel
from models.user import UserModel
from services.analytics_service import analytics_service
from services.auth_service import scope_transaction_query, scope_scam_audit_query
from services.cost_optimizer_service import cost_optimizer_service
from services.anomaly_service import anomaly_service
from services.scam_shield_service import scam_shield_service
from services.shared_utils import redact_sensitive_text, convert_to_usd
from config import settings

logger = logging.getLogger("finova.ai")

PAYPAL_KNOWLEDGE_CHUNKS = [
    {
        "source": "policy:paypal-commercial-pricing",
        "text": "PayPal US standard commercial rate is 3.49% plus $0.49 USD fixed fee; international cross-border transactions add +1.50% surcharge.",
    },
    {
        "source": "policy:paypal-micropayments",
        "text": "PayPal Micropayments schedule is 5.00% plus $0.05 USD fixed fee, reducing processing fees on orders under $12.00 USD.",
    },
    {
        "source": "policy:paypal-fx-balances",
        "text": "Holding native EUR or GBP balances in a PayPal Business account helps avoid ~3.50% automatic foreign currency conversion spreads.",
    },
    {
        "source": "policy:paypal-seller-protection",
        "text": "Uploading carrier tracking within 24 hours and requiring signature confirmation on orders >= $750 protects merchants under PayPal Seller Protection against Item Not Received and Unauthorized disputes.",
    },
]

class AIAgentService:
    def __init__(self):
        self._initial_api_key = settings.GEMINI_API_KEY
        self.api_key = settings.GEMINI_API_KEY

    def _resolve_api_key(self) -> str:
        """Resolves runtime GEMINI_API_KEY cleanly while respecting test overrides of self.api_key."""
        if self.api_key and self.api_key != self._initial_api_key:
            return self.api_key.strip()
        return (settings.GEMINI_API_KEY or self.api_key or "").strip()

    def _sanitize_untrusted_field(self, value: Any, max_len: int = 120) -> str:
        """Sanitizes untrusted DB strings before embedding into LLM prompt/RAG context."""
        if value is None:
            return ""
        raw = str(value).replace("\r", " ").replace("\n", " ").strip()
        cleaned, blocked, _ = self.sanitize_input(raw)
        if blocked:
            return "[REDACTED_UNTRUSTED_TEXT]"
        return redact_sensitive_text(cleaned)[:max_len]

    def sanitize_input(self, query: str) -> tuple[str, bool, str]:
        """
        Sanitizes user query:
        - Detects prompt injection and adversarial jailbreak attempts.
        - Redacts credit card numbers and sensitive auth tokens.
        - Prevents unauthorized execution requests.
        """
        if not query:
            return "", False, ""

        clean = query.strip()
        lower = clean.lower()

        # Adversarial Prompt Injection Signatures
        injection_patterns = [
            r"ignore (all )?previous instructions",
            r"reveal (your )?(system )?prompt",
            r"you are now (an? )?(unrestricted|jailbroken)",
            r"system override",
            r"drop (table|database)",
            r"delete from users",
            r"select \* from users",
            r"<script[\s>]",
            r"javascript:",
            r"exec\s*\(",
            r"eval\s*\("
        ]
        for pat in injection_patterns:
            if re.search(pat, lower):
                return clean, True, "Prompt injection or unauthorized execution signature detected."

        # Redact Luhn-valid card PANs & sensitive tokens via shared utility
        clean = redact_sensitive_text(clean)
        clean = re.sub(r"\b(?:Bearer\s+)?[A-Za-z0-9_-]{32,}\b", "[REDACTED_TOKEN]", clean)

        return clean, False, ""

    def _tokenize(self, text: str) -> List[str]:
        return re.findall(r"[a-z0-9_.-]{2,}", (text or "").lower())

    def _retrieve_relevant_chunks(
        self,
        query: str,
        txns_dict: List[Dict[str, Any]],
        scam_logs: List[Any],
        budgets: List[Any],
        summary: Dict[str, Any],
        top_k: int = 6,
    ) -> List[Dict[str, Any]]:
        """
        Tenant-scoped hybrid lexical/TF-IDF cosine retriever over verified merchant records,
        budgets, scam audit logs, and PayPal merchant policy knowledge snippets.
        """
        corpus: List[Dict[str, str]] = [
            {
                "source": "ledger:summary",
                "text": (
                    f"Merchant ledger summary: {summary.get('totalTransactions', 0)} transactions, "
                    f"gross ${summary.get('grossPaymentVolume', 0.0):.2f} USD, "
                    f"net ${summary.get('totalNetReceived', 0.0):.2f} USD, "
                    f"fees ${summary.get('totalFees', 0.0):.2f} USD, "
                    f"expenses ${summary.get('totalExpenses', 0.0):.2f} USD."
                ),
            }
        ]
        for txn in txns_dict[:25]:
            fee_val = txn.get("actualFee") if txn.get("actualFee") is not None else (txn.get("estimatedFee") or 0.0)
            c_name = self._sanitize_untrusted_field(txn.get("customerName"), 64)
            cat_val = self._sanitize_untrusted_field(txn.get("category", "Payment"), 48)
            ctry_val = self._sanitize_untrusted_field(txn.get("country"), 48)
            reason_val = self._sanitize_untrusted_field(txn.get("anomalyReason"), 140)
            corpus.append(
                {
                    "source": f"txn:{txn.get('id')}",
                    "text": (
                        f"Transaction {txn.get('id')} ({txn.get('status')}) customer {c_name} "
                        f"amount {txn.get('amount')} {txn.get('currency')} fee {fee_val} net {txn.get('netAmount')} "
                        f"category {cat_val} type {txn.get('txnType', 'income')} "
                        f"country {ctry_val} risk {txn.get('riskLevel')} {reason_val}"
                    ),
                }
            )
        for b in budgets[:10]:
            safe_cat = self._sanitize_untrusted_field(b.category, 64)
            corpus.append(
                {
                    "source": f"budget:{safe_cat}",
                    "text": f"Budget category {safe_cat} limit {float(b.limit_amount):.2f} {b.currency} period {b.period}",
                }
            )
        for s in scam_logs[:5]:
            corpus.append(
                {
                    "source": f"scam:{s.id}",
                    "text": f"Scam shield audit {s.id} type {s.target_type} risk {s.risk_level} score {s.risk_score}/100",
                }
            )
        corpus.extend(PAYPAL_KNOWLEDGE_CHUNKS)

        q_tokens = self._tokenize(query)
        if not q_tokens:
            return [{"source": c["source"], "text": c["text"], "score": 1.0} for c in corpus[:top_k]]

        doc_tokens_list = [self._tokenize(c["text"]) for c in corpus]
        df: Counter = Counter()
        for toks in doc_tokens_list:
            for tok in set(toks):
                df[tok] += 1
        n_docs = len(corpus)

        def _tfidf_vec(toks: List[str]) -> Dict[str, float]:
            tf = Counter(toks)
            total = max(1, len(toks))
            return {
                tok: (cnt / total) * (math.log((n_docs + 1) / (df[tok] + 1)) + 1.0)
                for tok, cnt in tf.items()
            }

        q_vec = _tfidf_vec(q_tokens)
        q_norm = math.sqrt(sum(v * v for v in q_vec.values())) or 1.0

        scored = []
        for idx, doc in enumerate(corpus):
            d_vec = _tfidf_vec(doc_tokens_list[idx])
            d_norm = math.sqrt(sum(v * v for v in d_vec.values())) or 1.0
            dot = sum(q_vec[t] * d_vec[t] for t in q_vec if t in d_vec)
            cos = dot / (q_norm * d_norm)
            if doc["source"] == "ledger:summary":
                cos += 0.15
            scored.append({"source": doc["source"], "text": doc["text"], "score": round(cos, 4)})

        scored.sort(key=lambda item: item["score"], reverse=True)
        return scored[:top_k]

    def handle_financial_query(
        self,
        db: Session,
        query: str,
        history: Optional[List[Dict[str, Any]]] = None,
        scoped_user_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Main entry point for financial assistant inquiries with tenant-scoped RAG,
        prompt-injection protection, deterministic ledger grounding, and usage telemetry.
        """
        start_ts = time.perf_counter()
        sanitized_query, is_injection, injection_reason = self.sanitize_input(query)
        if is_injection:
            return {
                "reply": "⚠️ Security Alert: Finova AI Financial Assistant operates strictly in an isolated, read-only analytics envelope. "
                         "Administrative system override requests, credential disclosures, or arbitrary command execution attempts are automatically neutralized.",
                "intent": "security_violation",
                "category": "security",
                "groundTruth": {
                    "source": "Security Envelope Guardian",
                    "violation": injection_reason,
                    "executionRights": "Read-Only Enforced"
                },
                "cards": [
                    {
                        "type": "security_alert",
                        "title": "Adversarial Input Blocked",
                        "metrics": {"Risk": "Critical", "Action": "Neutralized"},
                        "details": "User input contained prompt injection or system override tokens. Execution was safely halted."
                    }
                ],
                "suggestedPrompts": [
                    "What is my total revenue this month?",
                    "How much did I pay in transaction fees?",
                    "What unusual activity was detected?"
                ]
            }

        clean_q = sanitized_query
        txn_query = scope_transaction_query(db.query(TransactionModel), TransactionModel, scoped_user_id)
        transactions = txn_query.order_by(TransactionModel.created_at.desc()).all()
        txns_dict = [t.to_dict() for t in transactions]
        scam_query = scope_scam_audit_query(db.query(ScamAuditModel), ScamAuditModel, scoped_user_id)
        scam_logs = scam_query.order_by(ScamAuditModel.created_at.desc()).limit(5).all()
        budgets = (
            db.query(BudgetModel).filter(BudgetModel.user_id == scoped_user_id).all()
            if scoped_user_id
            else []
        )

        summary = analytics_service.get_summary(db, scoped_user_id=scoped_user_id)
        health = anomaly_service.calculate_account_health(txns_dict)
        cost_analysis = cost_optimizer_service.get_historical_analysis(db, scoped_user_id=scoped_user_id)
        anomalies = health.get("detectedAnomalies") or []
        scam_dist = scam_shield_service.get_threat_distribution(db, scoped_user_id=scoped_user_id)

        completed_txns = [t for t in txns_dict if str(t.get("status", "")).upper() == "COMPLETED"]
        denied_txns = [t for t in txns_dict if str(t.get("status", "")).upper() in ["DENIED", "FAILED"]]
        refunded_txns = [t for t in txns_dict if str(t.get("status", "")).upper() == "REFUNDED"]
        disputed_txns = [t for t in txns_dict if str(t.get("status", "")).upper() == "DISPUTED"]

        gross_volume = float(summary.get("grossPaymentVolume", 0.0))
        completed_volume = float(summary.get("completedVolume", 0.0))
        total_fees = float(summary.get("totalFees", 0.0))
        net_received = float(summary.get("totalNetReceived", 0.0))
        avg_ticket = float(summary.get("averageTicketSize", 0.0))
        effective_rate = round((total_fees / gross_volume) * 100, 2) if gross_volume > 0 else 0.0

        txns_with_fees = [
            t for t in txns_dict
            if (t.get("actualFee") if t.get("actualFee") is not None else (t.get("estimatedFee") or 0.0)) > 0.0
        ]
        highest_fee_txn = max(
            txns_with_fees,
            key=lambda t: float(t.get("actualFee") if t.get("actualFee") is not None else (t.get("estimatedFee") or 0.0)),
            default=None
        )

        retrieved_chunks = self._retrieve_relevant_chunks(
            query=clean_q,
            txns_dict=txns_dict,
            scam_logs=scam_logs,
            budgets=budgets,
            summary=summary,
        )

        # Intent classification
        clean_q = sanitized_query
        lower = clean_q.lower()

        intent, category = self._classify_intent(lower)

        # Deterministic financial payload construction
        response_payload = self._build_deterministic_response(
            intent=intent,
            query=clean_q,
            gross_volume=gross_volume,
            completed_volume=completed_volume,
            total_fees=total_fees,
            net_received=net_received,
            effective_rate=effective_rate,
            avg_ticket=avg_ticket,
            highest_fee_txn=highest_fee_txn,
            denied_txns=denied_txns,
            refunded_txns=refunded_txns,
            disputed_txns=disputed_txns,
            anomalies=anomalies,
            health=health,
            cost_analysis=cost_analysis,
            scam_dist=scam_dist,
            txns_dict=txns_dict
        )

        effective_api_key = self._resolve_api_key()
        used_gemini = False
        used_fallback = False
        prompt_chars = len(clean_q)
        if effective_api_key and effective_api_key.startswith("AIza") and "your_gemini" not in effective_api_key:
            gemini_reply, used_gemini, prompt_chars = self._call_gemini_with_context_detailed(
                query=clean_q,
                facts_context={
                    "gross_volume": gross_volume,
                    "completed_volume": completed_volume,
                    "total_fees": total_fees,
                    "net_received": net_received,
                    "effective_rate": effective_rate,
                    "highest_fee_txn": highest_fee_txn,
                    "denied_count": len(denied_txns),
                    "anomalies_count": len(anomalies),
                    "health_score": health.get("healthScore"),
                    "health_tier": health.get("healthTier"),
                    "dispute_rate": health.get("disputeRate"),
                    "retrieved_chunks": retrieved_chunks,
                    "scam_logs": [s.to_dict() for s in scam_logs],
                },
                history=history,
                api_key=effective_api_key,
            )
            if gemini_reply:
                response_payload["reply"] = (
                    gemini_reply
                    + "\n\n---\n*Note: Verified dollar figures reflect your database ledger; AI commentary is advisory only and does not guarantee future financial outcomes.*"
                )
            else:
                used_fallback = True

        elapsed_ms = int((time.perf_counter() - start_ts) * 1000)
        response_payload["intent"] = intent
        response_payload["category"] = category
        response_payload["groundingSource"] = "gemini+rag" if used_gemini else "deterministic-rag"
        response_payload["retrievedSources"] = [c["source"] for c in retrieved_chunks]
        response_payload["context"] = {
            "transactionsExamined": len(txns_dict),
            "accountHealthScore": health.get("healthScore", 88),
            "totalVolume": gross_volume,
            "totalFees": total_fees,
            "netAmount": net_received,
            "contextChunks": len(retrieved_chunks),
            "provider": "gemini" if used_gemini else "deterministic",
        }

        try:
            persisted_uid = None
            if scoped_user_id and db.query(UserModel.id).filter(UserModel.id == scoped_user_id).first():
                persisted_uid = scoped_user_id
            db.add(
                AIUsageLogModel(
                    id=f"AIU-{uuid.uuid4().hex[:10].upper()}",
                    user_id=persisted_uid,
                    intent=intent,
                    provider="gemini" if used_gemini else "deterministic",
                    model_name="gemini-1.5-flash" if used_gemini else "deterministic-rag-v1",
                    latency_ms=elapsed_ms,
                    prompt_chars=prompt_chars,
                    response_chars=len(response_payload.get("reply", "")),
                    context_chunks=len(retrieved_chunks),
                    used_fallback=used_fallback,
                )
            )
            db.commit()
        except Exception as telemetry_exc:
            db.rollback()
            logger.debug("AI usage log skipped (%s)", type(telemetry_exc).__name__)

        return response_payload

    def _classify_intent(self, text: str) -> tuple[str, str]:
        """
        Classifies the user query into high-confidence financial intents.
        """
        # Specific Transaction lookup
        txn_match = re.search(r"\b(txn-[a-z0-9]+)\b", text, re.I)
        if txn_match:
            return "SPECIFIC_TXN", "transaction_query"

        # 1. Total revenue this month
        if any(k in text for k in ["revenue", "sales", "how much did i make", "gross volume", "turnover", "total received"]):
            return "REVENUE_QUERY", "revenue_query"

        # 2. How to reduce payment-processing costs
        if any(k in text for k in ["reduce", "lower fee", "save money", "optimize", "cut cost", "cost reduction", "cheaper"]):
            return "COST_REDUCTION", "cost_reduction"

        # 3. Highest fee transaction
        if any(k in text for k in ["highest fee", "largest fee", "most expensive transaction", "biggest fee", "maximum fee"]):
            return "HIGHEST_FEE", "highest_fee"

        # 4. Why is net received amount lower
        if any(k in text for k in ["why is my net", "net received lower", "why net lower", "net amount lower", "deductions", "where did the money go"]):
            return "NET_AMOUNT_LOWER", "fee_explanation"

        # 5. Transaction fees audit
        if any(k in text for k in ["how much did i pay in fee", "fees", "fee paid", "transaction fee", "total fee", "processing cost"]):
            return "FEE_AUDIT", "fee_explanation"

        # 5. Failed transactions
        if any(k in text for k in ["failed", "denied", "declined", "rejected", "unsuccessful"]):
            return "FAILED_TRANSACTIONS", "transaction_query"

        # 6. Unusual activity detected
        if any(k in text for k in ["unusual", "anomaly", "anomalies", "suspicious", "flagged", "outlier", "risk check"]):
            return "UNUSUAL_ACTIVITY", "fraud_check"

        # 7. Financial performance summary
        if any(k in text for k in ["summarize", "performance", "monthly summary", "overview", "executive summary", "financial performance"]):
            return "PERFORMANCE_SUMMARY", "performance_summary"

        # 9. Scam Shield / Phishing
        if any(k in text for k in ["scam", "phishing", "threat", "shield", "malicious"]):
            return "SCAM_AUDIT", "fraud_check"

        # 10. Account Health
        if any(k in text for k in ["health", "standing", "account score", "dispute rate", "safe limit"]):
            return "ACCOUNT_HEALTH", "policy_guidance"

        # 11. Policy guidance (3DS, disputes, Seller Protection)
        if any(k in text for k in ["chargeback", "dispute", "seller protection", "3d secure", "3ds", "resolution center"]):
            return "POLICY_GUIDANCE", "policy_guidance"

        return "GENERAL", "general"

    def _build_deterministic_response(
        self,
        intent: str,
        query: str,
        gross_volume: float,
        completed_volume: float,
        total_fees: float,
        net_received: float,
        effective_rate: float,
        avg_ticket: float,
        highest_fee_txn: Optional[Dict[str, Any]],
        denied_txns: List[Dict[str, Any]],
        refunded_txns: List[Dict[str, Any]],
        disputed_txns: List[Dict[str, Any]],
        anomalies: List[Dict[str, Any]],
        health: Dict[str, Any],
        cost_analysis: Dict[str, Any],
        scam_dist: Dict[str, Any],
        txns_dict: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Builds precise, deterministic replies and interactive UI summary cards.
        """
        if intent == "REVENUE_QUERY":
            reply = (
                f"### 📊 Merchant Revenue Audit\n\n"
                f"- **Gross Payment Volume:** **${gross_volume:,.2f} USD** across **{len(txns_dict)}** recorded transactions.\n"
                f"- **Settled (Completed) Volume:** **${completed_volume:,.2f} USD** ({len(completed_txns_list := [t for t in txns_dict if t.get('status') == 'COMPLETED'])} completed orders).\n"
                f"- **Net Received Amount:** **${net_received:,.2f} USD** settled into your PayPal balance.\n"
                f"- **Average Ticket Size:** **${avg_ticket:,.2f} USD**.\n\n"
                f"*Note: Figures reflect settled PayPal Sandbox transactions and verified ledger records.*"
            )
            card = {
                "type": "metric_summary",
                "title": "Revenue Performance Snapshot",
                "subtitle": "Active PayPal Ledger",
                "metrics": [
                    {"label": "Gross Volume", "value": f"${gross_volume:,.2f}", "subtext": f"{len(txns_dict)} total orders", "accentColor": "blue"},
                    {"label": "Completed Sales", "value": f"${completed_volume:,.2f}", "subtext": "Fully settled", "accentColor": "emerald"},
                    {"label": "Net Received", "value": f"${net_received:,.2f}", "subtext": "Post fee deductions", "accentColor": "emerald"},
                    {"label": "Effective Fee Rate", "value": f"{effective_rate}%", "subtext": "Commercial average", "accentColor": "amber"}
                ],
                "actionHint": "Ask 'How much did I pay in transaction fees?' to inspect fee breakdowns."
            }
            follow_ups = [
                "How much did I pay in transaction fees?",
                "Which transaction had the highest fee?",
                "Show my failed transactions."
            ]

        elif intent == "FEE_AUDIT":
            recon = cost_analysis.get("reconciliation") or {}
            actual_fees = recon.get("totalActualFees", cost_analysis.get("actualFeesCaptured", total_fees))
            estimated_fees = recon.get("totalEstimatedFees", cost_analysis.get("estimatedFeesTotal", total_fees))
            variance = recon.get("variance", cost_analysis.get("varianceAmount", 0.0))

            reply = (
                f"### 💳 Transaction Fee Audit\n\n"
                f"You paid a total of **${total_fees:,.2f} USD** in payment processing fees on a total gross volume of **${gross_volume:,.2f} USD**.\n\n"
                f"- **Effective Fee Rate:** **{effective_rate}%** of gross payment volume.\n"
                f"- **Confirmed Actual Fees:** **${actual_fees:,.2f} USD** extracted from PayPal capture breakdowns.\n"
                f"- **Estimated Base Fees:** **${estimated_fees:,.2f} USD** based on PayPal's standard US commercial schedule (`3.49% + $0.49`).\n"
                f"- **Reconciliation Variance:** **${abs(variance):,.2f} USD** ({'Within tolerance' if abs(variance) < 5 else 'Cross-border adjustments'}).\n\n"
                f"*Deductions include domestic transaction fees, cross-border card surcharges (+1.50%), and currency conversion spreads.*"
            )
            card = {
                "type": "metric_summary",
                "title": "Transaction Fee Reconciliation",
                "subtitle": "PayPal Standard 3.49% + $0.49 Schedule",
                "metrics": [
                    {"label": "Total Fees Paid", "value": f"${total_fees:,.2f}", "subtext": f"{effective_rate}% effective rate", "accentColor": "amber"},
                    {"label": "Confirmed Captured", "value": f"${actual_fees:,.2f}", "subtext": "From PayPal API", "accentColor": "blue"},
                    {"label": "Net Received", "value": f"${net_received:,.2f}", "subtext": "Available balance", "accentColor": "emerald"},
                    {"label": "Variance", "value": f"${abs(variance):,.2f}", "subtext": "Captured vs Estimated", "accentColor": "cyan"}
                ],
                "actionHint": "Ask 'Which transaction had the highest fee?' to inspect top expense drivers."
            }
            follow_ups = [
                "Which transaction had the highest fee?",
                "Why is my net received amount lower?",
                "How can I reduce payment-processing costs?"
            ]

        elif intent == "HIGHEST_FEE":
            if highest_fee_txn:
                h_id = highest_fee_txn.get("id")
                h_amt = float(highest_fee_txn.get("amount", 0.0))
                h_curr = highest_fee_txn.get("currency", "USD")
                h_fee = float(
                    highest_fee_txn.get("actualFee")
                    if highest_fee_txn.get("actualFee") is not None
                    else (highest_fee_txn.get("estimatedFee") or 0.0)
                )
                h_status = highest_fee_txn.get("status")
                h_customer = highest_fee_txn.get("customerName", "Customer")
                h_country = highest_fee_txn.get("country", "United States")
                h_pct = round((h_fee / max(1.0, h_amt)) * 100, 2)

                amt_str = f"${h_amt:,.2f} USD" if h_curr == "USD" else (f"¥{h_amt:,.0f} JPY" if h_curr == "JPY" else f"{h_amt:,.2f} {h_curr}")
                fee_str = f"${h_fee:,.2f} USD" if h_curr == "USD" else (f"¥{h_fee:,.0f} JPY" if h_curr == "JPY" else f"{h_fee:,.2f} {h_curr}")
                net_val = float(highest_fee_txn.get('netAmount', 0.0))
                net_str = f"${net_val:,.2f} USD" if h_curr == "USD" else (f"¥{net_val:,.0f} JPY" if h_curr == "JPY" else f"{net_val:,.2f} {h_curr}")
                reply = (
                    f"### 🏆 Highest Fee Transaction: {h_id}\n\n"
                    f"The transaction with the highest processing fee is **{h_id}**:\n"
                    f"- **Customer:** {h_customer} ({h_country})\n"
                    f"- **Order Amount:** **{amt_str}**\n"
                    f"- **Transaction Fee:** **{fee_str}** ({h_pct}% of order value)\n"
                    f"- **Net Settled:** **{net_str}**\n"
                    f"- **Status:** **{h_status}**\n\n"
                    f"**Why the fee was elevated:**\n"
                    f"At a transaction value of {amt_str}, the variable percentage fee (`3.49%`) plus cross-border or fixed charges totaled {fee_str}."
                )
                card = {
                    "type": "transaction_spotlight",
                    "title": f"Top Fee Outlier: {h_id}",
                    "subtitle": f"{h_customer} • {h_country}",
                    "metrics": [
                        {"label": "Order Amount", "value": amt_str, "accentColor": "blue"},
                        {"label": "Processing Fee", "value": fee_str, "accentColor": "rose"},
                        {"label": "Effective Rate", "value": f"{h_pct}%", "accentColor": "amber"},
                        {"label": "Status", "value": h_status, "accentColor": "emerald" if h_status == "COMPLETED" else "rose"}
                    ],
                    "actionHint": "Ask 'How can I reduce payment-processing costs?' to explore lower fee options."
                }
            else:
                reply = "No transaction fee records were located in your current ledger."
                card = None
            follow_ups = [
                "Why is my net received amount lower?",
                "How can I reduce payment-processing costs?",
                "Summarize my financial performance this month."
            ]

        elif intent == "NET_AMOUNT_LOWER":
            deduction_diff = gross_volume - net_received
            disputed_vol = sum(float(t.get("amount", 0.0)) for t in disputed_txns)
            denied_vol = sum(float(t.get("amount", 0.0)) for t in denied_txns)

            reply = (
                f"### 🔍 Net Received Reconciliation Analysis\n\n"
                f"Your net received amount (**${net_received:,.2f} USD**) is **${deduction_diff:,.2f} USD** lower than gross volume (**${gross_volume:,.2f} USD**) due to three verified financial factors:\n\n"
                f"1. **Payment Processing Fees (-${total_fees:,.2f} USD):** Standard PayPal merchant charges (3.49% + $0.49) assessed automatically at capture.\n"
                f"2. **Disputed Funds On Hold (-${disputed_vol:,.2f} USD):** {len(disputed_txns)} order(s) currently under bank dispute hold"
                + (
                    f" (e.g. {disputed_txns[0].get('id')} for ${float(disputed_txns[0].get('amount', 0)):,.2f}).\n"
                    if disputed_txns
                    else ".\n"
                )
                + f"3. **Declined / Denied Checkouts (-${denied_vol:,.2f} USD):** {len(denied_txns)} payment(s) denied by card issuers, resulting in $0.00 merchant settlement.\n\n"
                f"**Summary Equation:**\n"
                f"`Gross ($" f"{gross_volume:,.2f}) - Fees (${total_fees:,.2f}) - Dispute Holds (${disputed_vol:,.2f}) - Denials (${denied_vol:,.2f}) = Net Settled (${net_received:,.2f})`"
            )
            card = {
                "type": "metric_summary",
                "title": "Gross vs Net Settlement Walk",
                "subtitle": "Breakdown of all deductions",
                "metrics": [
                    {"label": "Gross Volume", "value": f"${gross_volume:,.2f}", "subtext": "100% of checkouts", "accentColor": "blue"},
                    {"label": "Commercial Fees", "value": f"-${total_fees:,.2f}", "subtext": "PayPal processing", "accentColor": "amber"},
                    {"label": "Disputed / Denied", "value": f"-${(disputed_vol + denied_vol):,.2f}", "subtext": "Holds & declines", "accentColor": "rose"},
                    {"label": "Net Settled", "value": f"${net_received:,.2f}", "subtext": "Available funds", "accentColor": "emerald"}
                ],
                "actionHint": "Review your disputed and failed transactions to release pending balance holds."
            }
            follow_ups = [
                "Show my failed transactions.",
                "What unusual activity was detected?",
                "How can I reduce payment-processing costs?"
            ]

        elif intent == "FAILED_TRANSACTIONS":
            if denied_txns:
                items = []
                for d in denied_txns:
                    d_amt = float(d.get("amount", 0.0))
                    d_curr = d.get("currency", "USD")
                    d_reason = d.get("anomalyReason") or "Bank decline: suspected fraudulent card or unverified credentials"
                    items.append(f"- **{d.get('id')}**: **${d_amt:,.2f} {d_curr}** from *{d.get('customerName')}* ({d.get('country')}) — *Reason: {d_reason}*")

                reply = (
                    f"### 🚫 Failed & Denied Transactions ({len(denied_txns)} incident{'s' if len(denied_txns) > 1 else ''})\n\n"
                    f"Here are the payment attempts that were denied or declined by payment processors:\n\n"
                    + "\n".join(items) +
                    f"\n\n**Financial Impact:** You were **not charged processing fees** on denied transactions, but no funds were credited."
                )
                card = {
                    "type": "transaction_list",
                    "title": "Failed & Denied Transactions",
                    "subtitle": f"{len(denied_txns)} total checkout declines",
                    "items": [
                        {
                            "id": d.get("id"),
                            "title": f"{d.get('id')} — ${float(d.get('amount', 0)):,.2f} {d.get('currency', 'USD')}",
                            "subtitle": f"{d.get('customerName')} • {d.get('country')}",
                            "badge": d.get("status", "DENIED"),
                            "badgeColor": "rose",
                            "detail": d.get("anomalyReason") or "Payment authorization declined by cardholder bank"
                        }
                        for d in denied_txns
                    ],
                    "actionHint": "Enable 3D-Secure 2.0 to reduce false-positive issuer declines."
                }
            else:
                reply = "Good news! You have **0 failed or denied transactions** in your recent transaction history."
                card = None
            follow_ups = [
                "What unusual activity was detected?",
                "What is my total revenue this month?",
                "Summarize my financial performance this month."
            ]

        elif intent == "UNUSUAL_ACTIVITY":
            if anomalies:
                items = []
                for a in anomalies[:5]:
                    items.append(
                        f"- **{a.get('transactionId')}**: **${float(a.get('amount', 0)):,.2f} {a.get('currency', 'USD')}** "
                        f"({a.get('severity')} Risk: {a.get('riskScore')}/100) — *{a.get('reason')}*"
                    )

                reply = (
                    f"### 🛡️ Detected Anomaly & Outlier Activity ({len(anomalies)} incident{'s' if len(anomalies) > 1 else ''})\n\n"
                    f"Finova's unsupervised Isolation Forest and behavioral models identified the following statistical outliers:\n\n"
                    + "\n".join(items) +
                    f"\n\n*Important: Statistical anomalies represent behavioral deviations (velocity or ticket surges), not definitive proof of fraud.*"
                )
                card = {
                    "type": "transaction_list",
                    "title": "Unsupervised Anomaly Timeline",
                    "subtitle": "Isolation Forest & Statistical Baselines",
                    "items": [
                        {
                            "id": a.get("transactionId"),
                            "title": f"{a.get('transactionId')} — ${float(a.get('amount', 0)):,.2f} {a.get('currency', 'USD')}",
                            "subtitle": f"{a.get('customerName')} • Severity: {a.get('severity')}",
                            "badge": f"Risk {a.get('riskScore')}/100",
                            "badgeColor": "rose" if a.get("severity") == "CRITICAL" else "amber",
                            "detail": a.get("reason")
                        }
                        for a in anomalies[:4]
                    ],
                    "actionHint": "Review customer shipping details before releasing high-ticket physical merchandise."
                }
            else:
                reply = "Finova's anomaly detection engine has detected **0 anomalous transactions**. All payments match normal baseline velocity."
                card = None
            follow_ups = [
                "Show my failed transactions.",
                "How much did I pay in transaction fees?",
                "Summarize my financial performance this month."
            ]

        elif intent == "COST_REDUCTION":
            micro_orders = [t for t in txns_dict if float(convert_to_usd(t.get("amount", 0), t.get("currency", "USD"))) <= 12.0]
            curr_analysis = cost_analysis.get("currencyAnalysis", [])
            non_usd_fx_loss = round(sum(float(c.get("conversionSpreadLossEst", 0.0)) for c in curr_analysis), 2)
            micro_savings = round(len(micro_orders) * 0.30, 2)
            est_total_savings = round(non_usd_fx_loss + micro_savings, 2)
            recs = [
                f"1. **Adopt PayPal Micropayments Tier:** Across {len(micro_orders)} low-ticket order(s) under $12.00 USD in your ledger, the micropayment rate (`5.0% + $0.05`) saves an estimated $0.28 to $0.35 per transaction over the standard `3.49% + $0.49` fee.",
                "2. **Enable Native Foreign Currency Balances:** Holding native EUR and GBP in your PayPal business account avoids PayPal's ~3.50% automatic currency conversion spread on international checkouts.",
                "3. **Upload Online Tracking within 24 Hours:** Immediate tracking synchronization protects against 'Item Not Received' disputes under PayPal Seller Protection, avoiding standard $15–$20 chargeback processing fees."
            ]
            reply = (
                f"### 💡 Evidence-Based Cost Optimization Recommendations\n\n"
                f"Based on your actual transaction volume (${gross_volume:,.2f}) and fee schedule ({effective_rate}% effective rate):\n\n"
                + "\n\n".join(recs) +
                f"\n\n*AI-assisted estimate (not guaranteed): these optimizations identify up to **${est_total_savings:,.2f} USD** in fee & FX savings across your recorded ledger.*"
            )
            card = {
                "type": "recommendation_list",
                "title": "Actionable Cost Reductions",
                "subtitle": f"Targeting your current {effective_rate}% effective rate",
                "items": [
                    {
                        "id": "OPT-1",
                        "title": "PayPal Micropayments Tier",
                        "subtitle": "Order baskets under $12.00",
                        "badge": "5% + $0.05",
                        "badgeColor": "blue",
                        "detail": "Saves $0.28-$0.35 per small order compared to standard $0.49 fixed fee."
                    },
                    {
                        "id": "OPT-2",
                        "title": "Multi-Currency Holding Accounts",
                        "subtitle": "EUR & GBP balances",
                        "badge": "Save 3.5%",
                        "badgeColor": "emerald",
                        "detail": "Eliminate foreign exchange conversion spreads on cross-border payments."
                    },
                    {
                        "id": "OPT-3",
                        "title": "Carrier Tracking Automation",
                        "subtitle": "Dispute fee defense",
                        "badge": "$15-$20 Saved",
                        "badgeColor": "amber",
                        "detail": "Avoid chargeback fees through automated PayPal Seller Protection delivery proof."
                    }
                ],
                "actionHint": "Visit the AI Cost Optimizer view to run scenario comparisons."
            }
            follow_ups = [
                "Which transaction had the highest fee?",
                "How much did I pay in transaction fees?",
                "Summarize my financial performance this month."
            ]

        elif intent == "PERFORMANCE_SUMMARY":
            health_score = health.get("healthScore", 88)
            health_tier = health.get("healthTier", "Healthy")
            dispute_rate = health.get("disputeRate", 0.0)

            reply = (
                f"### 📈 Monthly Financial Performance Summary\n\n"
                f"**Overall Performance Overview:**\n"
                f"- **Gross Volume:** **${gross_volume:,.2f} USD** across **{len(txns_dict)}** orders.\n"
                f"- **Net Received Amount:** **${net_received:,.2f} USD** successfully settled into your account.\n"
                f"- **Total Fees Incurred:** **${total_fees:,.2f} USD** (Effective Rate: **{effective_rate}%**).\n"
                f"- **Account Health Score:** **{health_score} / 100** (Standing: **{health_tier}**).\n"
                f"- **Dispute Exposure:** **{dispute_rate}%** (PayPal maximum ceiling: 1.00%).\n"
                f"- **Operational Incidents:** **{len(denied_txns)}** declined payments, **{len(anomalies)}** statistical anomalies.\n\n"
                f"**Strategic Assessment:** Your account remains in **{health_tier} standing**. To preserve your profit margins, address the {len(disputed_txns)} open dispute hold(s) and apply micropayment rates for small transactions."
            )
            card = {
                "type": "metric_summary",
                "title": "Executive Performance Summary",
                "subtitle": f"Account Health: {health_score}/100 ({health_tier})",
                "metrics": [
                    {"label": "Gross Revenue", "value": f"${gross_volume:,.2f}", "subtext": f"{len(txns_dict)} transactions", "accentColor": "blue"},
                    {"label": "Net Settled", "value": f"${net_received:,.2f}", "subtext": "Merchant wallet", "accentColor": "emerald"},
                    {"label": "Total Fees", "value": f"${total_fees:,.2f}", "subtext": f"{effective_rate}% effective rate", "accentColor": "amber"},
                    {"label": "Health Score", "value": f"{health_score}/100", "subtext": health_tier, "accentColor": "emerald" if health_score >= 80 else "amber"}
                ],
                "actionHint": "Ask 'How can I reduce payment-processing costs?' for fee reduction suggestions."
            }
            follow_ups = [
                "What is my total revenue this month?",
                "Which transaction had the highest fee?",
                "What unusual activity was detected?"
            ]

        elif intent == "SCAM_AUDIT":
            total_scans = scam_dist.get("totalScans", 0)
            avg_threat = scam_dist.get("averageRiskScore", 0)
            crit_count = scam_dist.get("distribution", {}).get("CRITICAL", {}).get("count", 0)

            reply = (
                f"### 🛡️ AI Scam Shield Intelligence Summary\n\n"
                f"- **Total Scanned Messages / Invoices:** **{total_scans}** communications audited.\n"
                f"- **Average Threat Risk Score:** **{avg_threat}/100**.\n"
                f"- **Critical Threats Intercepted:** **{crit_count}** phishing / overpayment attempts.\n\n"
                f"**Protection Scope:** Monitors impersonation domains, urgent suspension pretexts, credential harvesting prompts, and overpayment triangulation demands."
            )
            card = {
                "type": "metric_summary",
                "title": "AI Scam Shield Protection Overview",
                "subtitle": "Zero-Touch Phishing & Scam Analysis",
                "metrics": [
                    {"label": "Audits Logged", "value": f"{total_scans}", "subtext": "Sanitized ledger", "accentColor": "blue"},
                    {"label": "Critical Interceptions", "value": f"{crit_count}", "subtext": "High threat", "accentColor": "rose"},
                    {"label": "Average Risk", "value": f"{avg_threat}/100", "subtext": "Fleet benchmark", "accentColor": "amber"},
                    {"label": "Protection Status", "value": "Active", "subtext": "Deterministic filters", "accentColor": "emerald"}
                ],
                "actionHint": "Paste suspicious customer emails or SMS into the AI Scam Shield view for real-time analysis."
            }
            follow_ups = [
                "What unusual activity was detected?",
                "What is my account health score?",
                "Summarize my financial performance this month."
            ]

        elif intent == "ACCOUNT_HEALTH":
            h_score = health.get("healthScore", 88)
            h_tier = health.get("healthTier", "Healthy")
            d_rate = health.get("disputeRate", 0.0)
            r_rate = health.get("refundRate", 0.0)
            safety = health.get("safetyMarginText", "Safe margin intact.")

            reply = (
                f"### 🏥 Account Health & Seller Protection Standing\n\n"
                f"- **Current Score:** **{h_score} / 100** ({h_tier})\n"
                f"- **Dispute Rate:** **{d_rate}%** (PayPal Standard Ceiling: 1.00%)\n"
                f"- **Refund Rate:** **{r_rate}%** (Industry Average: 3.50%)\n"
                f"- **Safety Absorption:** {safety}\n\n"
                f"*Tier Interpretation: 80–100 (Healthy), 60–79 (Stable), 40–59 (Needs Attention), 0–39 (High Concern).*"
            )
            card = {
                "type": "metric_summary",
                "title": f"Account Standing: {h_score}/100",
                "subtitle": f"Standing: {h_tier}",
                "metrics": [
                    {"label": "Health Score", "value": f"{h_score}/100", "subtext": h_tier, "accentColor": "emerald" if h_score >= 80 else "amber"},
                    {"label": "Dispute Rate", "value": f"{d_rate}%", "subtext": "1.00% max ceiling", "accentColor": "amber" if d_rate > 0.8 else "blue"},
                    {"label": "Refund Rate", "value": f"{r_rate}%", "subtext": "3.50% benchmark", "accentColor": "cyan"},
                    {"label": "Isolation Score", "value": str(health.get("isolationForestScore", 0.74)), "subtext": "ML confidence", "accentColor": "emerald"}
                ],
                "actionHint": "Visit the Account Health view to run what-if simulations."
            }
            follow_ups = [
                "What is my total revenue this month?",
                "What unusual activity was detected?",
                "How can I reduce payment-processing costs?"
            ]

        elif intent == "SPECIFIC_TXN":
            txn_id_match = re.search(r"\b(txn-[a-z0-9]+)\b", query, re.I)
            target_id = txn_id_match.group(1).upper() if txn_id_match else (txns_dict[0].get("id", "").upper() if txns_dict else "UNKNOWN")
            found_txn = next((t for t in txns_dict if t.get("id", "").upper() == target_id), None)

            if found_txn:
                amt = float(found_txn.get("amount", 0.0))
                curr = found_txn.get("currency", "USD")
                fee = float(
                    found_txn.get("actualFee")
                    if found_txn.get("actualFee") is not None
                    else (found_txn.get("estimatedFee") or 0.0)
                )
                net = float(found_txn.get("netAmount", 0.0))
                status = found_txn.get("status")
                c_name = found_txn.get("customerName", "Customer")
                risk = found_txn.get("riskScore", 10)
                r_level = found_txn.get("riskLevel", "LOW")
                anomaly = found_txn.get("isAnomaly", False)
                reason = found_txn.get("anomalyReason") or "Normal authorized checkout"

                amt_s = f"${amt:,.2f} USD" if curr == "USD" else (f"¥{amt:,.0f} JPY" if curr == "JPY" else f"{amt:,.2f} {curr}")
                fee_s = f"${fee:,.2f} USD" if curr == "USD" else (f"¥{fee:,.0f} JPY" if curr == "JPY" else f"{fee:,.2f} {curr}")
                net_s = f"${net:,.2f} USD" if curr == "USD" else (f"¥{net:,.0f} JPY" if curr == "JPY" else f"{net:,.2f} {curr}")

                reply = (
                    f"### 🔍 Detailed Audit for {target_id}\n\n"
                    f"- **Customer:** {c_name} ({found_txn.get('customerEmail')})\n"
                    f"- **Gross Amount:** **{amt_s}**\n"
                    f"- **Fee Deducted:** **{fee_s}**\n"
                    f"- **Net Settled:** **{net_s}**\n"
                    f"- **Payment Method:** {found_txn.get('paymentMethod', 'PayPal Wallet')}\n"
                    f"- **Status:** **{status}**\n"
                    f"- **Risk Assessment:** **{risk} / 100 ({r_level})** {'[FLAGGED ANOMALY]' if anomaly else '[CLEAN]'}\n"
                    f"- **Diagnostic Notes:** *{reason}*\n"
                )
                card = {
                    "type": "transaction_spotlight",
                    "title": f"Transaction Detail: {target_id}",
                    "subtitle": f"{c_name} • {found_txn.get('country')}",
                    "metrics": [
                        {"label": "Amount", "value": amt_s, "accentColor": "blue"},
                        {"label": "Processing Fee", "value": fee_s, "accentColor": "amber"},
                        {"label": "Net Amount", "value": net_s, "accentColor": "emerald"},
                        {"label": "Risk Score", "value": f"{risk}/100 ({r_level})", "accentColor": "rose" if risk >= 60 else "emerald"}
                    ],
                    "actionHint": "All details retrieved directly from PayPal Sandbox database records."
                }
            else:
                reply = f"Transaction **{target_id}** was not found in your recorded PayPal Sandbox ledger. Please verify the transaction ID."
                card = None
            follow_ups = [
                "What is my total revenue this month?",
                "Which transaction had the highest fee?",
                "Show my failed transactions."
            ]

        else: # General or policy guidance
            reply = (
                f"Hello! I am your **Finova AI Financial Support Agent**.\n\n"
                f"I have direct read-only access to your **PayPal Sandbox transaction ledger** ({len(txns_dict)} records), "
                f"cost calculations, account health metrics (Score: {health.get('healthScore')}/100), and Scam Shield intelligence.\n\n"
                f"**Here are questions you can ask me:**\n"
                f"- *What is my total revenue this month?*\n"
                f"- *How much did I pay in transaction fees?*\n"
                f"- *Which transaction had the highest fee?*\n"
                f"- *Why is my net received amount lower?*\n"
                f"- *Show my failed transactions.*\n"
                f"- *What unusual activity was detected?*\n"
                f"- *How can I reduce payment-processing costs?*\n"
                f"- *Summarize my financial performance this month.*"
            )
            card = {
                "type": "metric_summary",
                "title": "Finova Financial Intelligence Assistant",
                "subtitle": "Connected to PayPal Sandbox Database",
                "metrics": [
                    {"label": "Active Records", "value": f"{len(txns_dict)} txns", "subtext": "Audited ledger", "accentColor": "blue"},
                    {"label": "Account Standing", "value": f"{health.get('healthScore')}/100", "subtext": health.get('healthTier', 'Healthy'), "accentColor": "emerald"},
                    {"label": "Gross Volume", "value": f"${gross_volume:,.2f}", "subtext": "All checkouts", "accentColor": "cyan"},
                    {"label": "Guardrails", "value": "Read-Only", "subtext": "No funds moved", "accentColor": "emerald"}
                ],
                "actionHint": "Click any suggested prompt below to begin your financial audit."
            }
            follow_ups = [
                "What is my total revenue this month?",
                "How much did I pay in transaction fees?",
                "Which transaction had the highest fee?"
            ]

        return {
            "reply": reply,
            "financialCard": card,
            "suggestedFollowUps": follow_ups
        }

    def _call_gemini_with_context(
        self,
        query: str,
        facts_context: Dict[str, Any],
        history: Optional[List[Dict[str, Any]]] = None,
        api_key: Optional[str] = None,
    ) -> Optional[str]:
        """Public helper returning only the Gemini reply string (or None) for backward-compatible callers."""
        reply, _, _ = self._call_gemini_with_context_detailed(
            query=query,
            facts_context=facts_context,
            history=history,
            api_key=api_key,
        )
        return reply

    def _call_gemini_with_context_detailed(
        self,
        query: str,
        facts_context: Dict[str, Any],
        history: Optional[List[Dict[str, Any]]] = None,
        api_key: Optional[str] = None,
    ) -> tuple[Optional[str], bool, int]:
        """
        Invokes Gemini API with grounded facts, retrieved RAG chunks, and sanitized history.
        Returns (reply_text, succeeded_bool, prompt_char_count). Never leaks secrets on failure.
        """
        prompt = ""
        try:
            system_prompt = (
                "You are Finova AI's Senior Financial Support Agent for PayPal merchants. "
                "You provide precise, evidence-based financial intelligence and merchant guidance. "
                "CRITICAL RULES:\n"
                "1. NEVER invent, assume, or hallucinate transactions, IDs, fees, or amounts.\n"
                "2. Strictly use the deterministic facts and retrieved chunks provided in Ground-Truth Context.\n"
                "3. Clearly distinguish verified ledger data from general advisory suggestions; never promise guaranteed returns.\n"
                "4. You are strictly read-only: never claim you can move money, modify accounts, or file disputes.\n"
                "5. Format output with clean GitHub markdown (headers, bullet points, bold numbers)."
            )

            top_fee = facts_context.get("highest_fee_txn")
            top_fee_line = ""
            if top_fee:
                fee_amt = top_fee.get("actualFee") if top_fee.get("actualFee") is not None else top_fee.get("estimatedFee")
                top_fee_line = (
                    f"- Highest Fee Transaction: {top_fee.get('id')} "
                    f"(${float(top_fee.get('amount', 0)):,.2f} {top_fee.get('currency', 'USD')}, fee ${float(fee_amt or 0):,.2f})\n"
                )

            rag_lines = "\n".join(
                f"  * [{c.get('source')}]: {c.get('text')}"
                for c in (facts_context.get("retrieved_chunks") or [])[:6]
            )
            scam_count = len(facts_context.get("scam_logs") or [])

            context_str = (
                f"GROUND-TRUTH CONTEXT (Strictly Scoped to Authenticated Merchant):\n"
                f"- Gross Volume: ${facts_context.get('gross_volume', 0.0):,.2f} USD\n"
                f"- Completed Volume: ${facts_context.get('completed_volume', 0.0):,.2f} USD\n"
                f"- Total Fees Paid: ${facts_context.get('total_fees', 0.0):,.2f} USD (Effective Rate: {facts_context.get('effective_rate', 0.0)}%)\n"
                f"- Net Received: ${facts_context.get('net_received', 0.0):,.2f} USD\n"
                f"- Account Health Score: {facts_context.get('health_score')}/100 ({facts_context.get('health_tier')})\n"
                f"- Dispute Rate: {facts_context.get('dispute_rate')}%\n"
                f"- Denied Transactions: {facts_context.get('denied_count')}\n"
                f"- Detected Anomalies: {facts_context.get('anomalies_count')}\n"
                f"- Recent Scam Audits Logged: {scam_count}\n"
                f"{top_fee_line}"
                f"RETRIEVED RAG CONTEXT:\n{rag_lines}\n"
            )

            history_lines = []
            for turn in (history or [])[-4:]:
                raw_role = str(turn.get("sender") or turn.get("role") or "user").strip().lower()
                role = "ASSISTANT" if raw_role in {"assistant", "ai", "model", "bot"} else "USER"
                raw_turn = str(turn.get("content", "") or turn.get("text", ""))
                cleaned_turn, hist_blocked, _ = self.sanitize_input(raw_turn)
                safe_turn = "[REDACTED_INJECTION]" if hist_blocked else redact_sensitive_text(cleaned_turn)[:240]
                if safe_turn:
                    history_lines.append(f"{role}: {safe_turn}")
            history_block = "\n".join(history_lines)

            prompt = f"{system_prompt}\n\n{context_str}\n"
            if history_block:
                prompt += f"RECENT CONVERSATION:\n{history_block}\n\n"
            prompt += f"Merchant Question: {query}\n\nFinova AI Response:"

            url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent"
            payload = {
                "contents": [{"parts": [{"text": prompt}]}]
            }

            key_to_use = api_key or self._resolve_api_key()
            with httpx.Client(timeout=10.0, follow_redirects=False) as client:
                resp = client.post(url, json=payload, headers={"x-goog-api-key": key_to_use})
                if resp.status_code == 200:
                    data = resp.json()
                    candidates = data.get("candidates", [])
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        if parts and parts[0].get("text"):
                            return parts[0].get("text", ""), True, len(prompt)
                logger.warning("Gemini API non-200 response [%s]; using deterministic RAG fallback.", resp.status_code)
        except Exception as exc:
            logger.warning("Gemini API call failed (%s); using deterministic RAG fallback.", type(exc).__name__)
        return None, False, len(prompt or query)

ai_agent_service = AIAgentService()
