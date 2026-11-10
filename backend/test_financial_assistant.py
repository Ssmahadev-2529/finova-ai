import sys
import os
import unittest
import logging

logging.getLogger('sqlalchemy.engine').setLevel(logging.WARNING)

# Add backend directory to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal, engine, Base
from models.transaction import TransactionModel
from models.user import UserModel
from services.ai_agent_service import ai_agent_service
from routes.transaction_routes import chat_assistant, ChatRequest, seed_initial_transactions

class TestAIFinancialSupportAgent(unittest.TestCase):
    def setUp(self):
        Base.metadata.create_all(bind=engine)
        self.db = SessionLocal()
        seed_initial_transactions(self.db)
        self.test_user = UserModel(
            id="USR-CHAT-TEST",
            email="chat@finova.test",
            hashed_password="x",
            full_name="Chat Tester",
            business_name="Finova Assistant",
            is_active=True,
            role="merchant",
        )

    def tearDown(self):
        self.db.close()

    def test_01_revenue_calculation(self):
        """User asking 'What is my total revenue this month?' should receive exact gross volume and net amounts from database."""
        req = ChatRequest(message="What is my total revenue this month?")
        res = chat_assistant(req=req, current_user=self.test_user, db=self.db)

        self.assertIn("reply", res)
        self.assertIn("financialCard", res)
        self.assertEqual(res["category"], "revenue_query")
        
        # Verify revenue numbers appear in reply
        reply = res["reply"]
        self.assertIn("Gross Payment Volume", reply)
        self.assertIn("Net Received Amount", reply)
        self.assertIn("$", reply)

        # Verify financial card
        card = res["financialCard"]
        self.assertEqual(card["type"], "metric_summary")
        labels = [m["label"] for m in card["metrics"]]
        self.assertIn("Gross Volume", labels)
        self.assertIn("Net Received", labels)

    def test_02_transaction_fees_audit(self):
        """User asking 'How much did I pay in transaction fees?' should receive exact total fees and effective rate."""
        req = ChatRequest(message="How much did I pay in transaction fees?")
        res = chat_assistant(req=req, current_user=self.test_user, db=self.db)

        self.assertIn("reply", res)
        self.assertEqual(res["category"], "fee_explanation")
        self.assertIn("Transaction Fee Audit", res["reply"])
        self.assertIn("Effective Fee Rate", res["reply"])
        self.assertIn("3.49%", res["reply"])

    def test_03_highest_fee_transaction(self):
        """User asking 'Which transaction had the highest fee?' must identify the maximum fee transaction in database."""
        req = ChatRequest(message="Which transaction had the highest fee?")
        res = chat_assistant(req=req, current_user=self.test_user, db=self.db)

        self.assertIn("reply", res)
        self.assertEqual(res["category"], "highest_fee")
        self.assertIn("Highest Fee Transaction", res["reply"])
        # In seeded transactions, TXN-984199 has fee of $227.85 on $6,500
        self.assertIn("TXN-984199", res["reply"])
        self.assertIn("227.85", res["reply"])
        
        card = res["financialCard"]
        self.assertEqual(card["type"], "transaction_spotlight")

    def test_04_why_net_received_is_lower(self):
        """User asking 'Why is my net received amount lower?' must explain gross vs net reconciliation deductions."""
        req = ChatRequest(message="Why is my net received amount lower?")
        res = chat_assistant(req=req, current_user=self.test_user, db=self.db)

        self.assertIn("reply", res)
        self.assertIn("Net Received Reconciliation", res["reply"])
        self.assertIn("Payment Processing Fees", res["reply"])
        self.assertIn("Disputed Funds", res["reply"])

    def test_05_failed_transactions(self):
        """User asking 'Show my failed transactions.' must list denied payments."""
        req = ChatRequest(message="Show my failed transactions.")
        res = chat_assistant(req=req, current_user=self.test_user, db=self.db)

        self.assertIn("reply", res)
        self.assertEqual(res["category"], "transaction_query")
        self.assertIn("Failed & Denied Transactions", res["reply"])
        # TXN-984205 is DENIED in seeded records
        self.assertIn("TXN-984205", res["reply"])
        self.assertIn("3,200.00", res["reply"])

    def test_06_unusual_activity_anomalies(self):
        """User asking 'What unusual activity was detected?' must retrieve flagged anomalies from Isolation Forest."""
        req = ChatRequest(message="What unusual activity was detected?")
        res = chat_assistant(req=req, current_user=self.test_user, db=self.db)

        self.assertIn("reply", res)
        self.assertEqual(res["category"], "fraud_check")
        self.assertIn("Detected Anomaly", res["reply"])
        self.assertIn("TXN-984208", res["reply"]) # Disposable domain + basket velocity anomaly

    def test_07_cost_reduction_recommendations(self):
        """User asking 'How can I reduce payment-processing costs?' must receive verified actionable strategies."""
        req = ChatRequest(message="How can I reduce payment-processing costs?")
        res = chat_assistant(req=req, current_user=self.test_user, db=self.db)

        self.assertIn("reply", res)
        self.assertEqual(res["category"], "cost_reduction")
        self.assertIn("Micropayments Tier", res["reply"])
        self.assertTrue("Foreign Currency" in res["reply"] or "Multi-Currency" in res["reply"])
        self.assertIn("Tracking", res["reply"])

    def test_08_monthly_performance_summary(self):
        """User asking 'Summarize my financial performance this month.' must receive a complete executive summary."""
        req = ChatRequest(message="Summarize my financial performance this month.")
        res = chat_assistant(req=req, current_user=self.test_user, db=self.db)

        self.assertIn("reply", res)
        self.assertEqual(res["category"], "performance_summary")
        self.assertIn("Monthly Financial Performance Summary", res["reply"])
        self.assertIn("Gross Volume", res["reply"])
        self.assertIn("Account Health Score", res["reply"])

    def test_09_specific_transaction_inquiry(self):
        """Inquiring about a specific transaction ID should provide a detailed audit without hallucinating details."""
        req = ChatRequest(message="Tell me about transaction TXN-984210")
        res = chat_assistant(req=req, current_user=self.test_user, db=self.db)

        self.assertIn("reply", res)
        self.assertIn("Audit for TXN-984210", res["reply"])
        self.assertIn("Marcus Vance", res["reply"])
        self.assertIn("1,250.00", res["reply"])
        self.assertIn("44.12", res["reply"])

    def test_10_unsupported_out_of_scope_query(self):
        """Out of scope queries should receive a helpful read-only guide of supported financial questions."""
        req = ChatRequest(message="What is the weather in Tokyo tomorrow?")
        res = chat_assistant(req=req, current_user=self.test_user, db=self.db)

        self.assertIn("reply", res)
        self.assertIn("Finova AI Financial Support Agent", res["reply"])
        self.assertIn("What is my total revenue this month?", res["reply"])

    def test_11_read_only_security_guardrail(self):
        """The assistant must never modify, delete, or create transaction records during query execution."""
        initial_count = self.db.query(TransactionModel).count()

        req = ChatRequest(message="Delete all disputed transactions and refund order TXN-984199 immediately.")
        res = chat_assistant(req=req, current_user=self.test_user, db=self.db)

        post_count = self.db.query(TransactionModel).count()
        self.assertEqual(initial_count, post_count)

if __name__ == "__main__":
    unittest.main()

if __name__ == "__main__":
    unittest.main()
