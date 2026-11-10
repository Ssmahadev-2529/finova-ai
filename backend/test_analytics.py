"""
Finova AI - Transaction Intelligence Engine Test Suite
Tests:
1. Transaction summary calculation (volume, actual fees, estimated fees, net balance)
2. Daily, weekly, and monthly trend aggregation
3. Spending & revenue pattern distributions (currencies, rails, brackets, outliers)
4. AI insights generation & evidence citation
5. Missing / partial PayPal field safety
"""

import sys
import os
import unittest

backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from database import Base, engine, SessionLocal
from models.transaction import TransactionModel
from models.user import UserModel
from services.analytics_service import analytics_service
from routes.transaction_routes import (
    seed_initial_transactions,
    get_analytics_summary,
    get_analytics_trends,
    get_analytics_patterns,
    get_analytics_insights
)

class TestTransactionIntelligenceEngine(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(bind=engine)
        cls.db = SessionLocal()
        seed_initial_transactions(cls.db)
        cls.test_user = UserModel(
            id="USR-ANALYTICS-TEST",
            email="analytics@finova.test",
            hashed_password="x",
            full_name="Analytics Tester",
            business_name="Finova Analytics",
            is_active=True,
            role="merchant",
        )

    @classmethod
    def tearDownClass(cls):
        cls.db.close()

    def test_analytics_summary_endpoint(self):
        """Verify get_analytics_summary returns accurate financial metrics"""
        data = get_analytics_summary(current_user=self.test_user, db=self.db)

        self.assertIn("totalTransactions", data)
        self.assertIn("grossPaymentVolume", data)
        self.assertIn("totalNetReceived", data)
        self.assertIn("totalFees", data)
        self.assertIn("totalActualFees", data)
        self.assertIn("totalEstimatedFees", data)
        self.assertIn("confirmedFeeCoveragePct", data)
        self.assertIn("statusBreakdown", data)
        self.assertIn("sourceBreakdown", data)

        self.assertGreater(data["totalTransactions"], 0)
        self.assertGreater(data["grossPaymentVolume"], 0)
        self.assertGreater(data["totalNetReceived"], 0)
        self.assertGreaterEqual(data["confirmedFeeCoveragePct"], 0.0)

        # Status breakdown checks
        self.assertIn("COMPLETED", data["statusBreakdown"])
        self.assertIn("PENDING", data["statusBreakdown"])
        self.assertIn("DENIED", data["statusBreakdown"])
        self.assertIn("REFUNDED", data["statusBreakdown"])
        self.assertIn("DISPUTED", data["statusBreakdown"])

        # Source breakdown checks
        self.assertIn("sandbox", data["sourceBreakdown"])
        self.assertIn("synthetic", data["sourceBreakdown"])

    def test_analytics_trends_daily(self):
        """Verify get_analytics_trends(period='daily')"""
        data = get_analytics_trends(period="daily", current_user=self.test_user, db=self.db)

        self.assertEqual(data["period"], "daily")
        self.assertIn("data", data)
        self.assertIn("summary", data)
        self.assertGreater(len(data["data"]), 0)

        point = data["data"][0]
        self.assertIn("label", point)
        self.assertIn("volume", point)
        self.assertIn("fee", point)
        self.assertIn("net", point)
        self.assertIn("anomalies", point)

    def test_analytics_trends_weekly(self):
        """Verify get_analytics_trends(period='weekly')"""
        data = get_analytics_trends(period="weekly", current_user=self.test_user, db=self.db)

        self.assertEqual(data["period"], "weekly")
        self.assertIn("data", data)
        self.assertGreater(len(data["data"]), 0)

    def test_analytics_trends_monthly(self):
        """Verify get_analytics_trends(period='monthly')"""
        data = get_analytics_trends(period="monthly", current_user=self.test_user, db=self.db)

        self.assertEqual(data["period"], "monthly")
        self.assertIn("data", data)
        self.assertGreater(len(data["data"]), 0)

    def test_analytics_patterns_endpoint(self):
        """Verify get_analytics_patterns returns distributions and anomaly shifts"""
        data = get_analytics_patterns(current_user=self.test_user, db=self.db)

        self.assertIn("currencyDistribution", data)
        self.assertIn("paymentRailDistribution", data)
        self.assertIn("ticketBrackets", data)
        self.assertIn("geographicDistribution", data)

        # Check currencies
        currencies = [c["currency"] for c in data["currencyDistribution"]]
        self.assertIn("USD", currencies)

        # Check brackets
        brackets = [b["bracket"] for b in data["ticketBrackets"]]
        self.assertTrue(any("Micropayments" in b for b in brackets))

    def test_analytics_ai_insights_endpoint(self):
        """Verify get_analytics_insights generates evidence-based summaries"""
        insights = get_analytics_insights(current_user=self.test_user, db=self.db)

        self.assertIsInstance(insights, list)
        self.assertGreater(len(insights), 0)

        for ins in insights:
            self.assertIn("id", ins)
            self.assertIn("title", ins)
            self.assertIn("summary", ins)
            self.assertIn("evidence", ins)
            self.assertIn("recommendation", ins)
            self.assertIn("severity", ins)
            self.assertIn("dataSource", ins)
            self.assertIsInstance(ins["evidence"], list)

    def test_graceful_missing_fields(self):
        """Verify analytics engine handles records with null or missing optional fields safely"""
        dummy = TransactionModel(
            id="TXN-PARTIAL-TEST",
            paypal_order_id="TEST-ORDER-001",
            customer_name="Test Buyer",
            customer_email="test@example.com",
            amount=50.0,
            currency="USD",
            status="COMPLETED",
            date="2026-11-04 12:00",
            estimated_fee=2.24,
            actual_fee=None,       # Missing actual fee
            net_amount=47.76,
            payment_method=None,   # Missing payment method
            country=None,          # Missing country
            data_source="sandbox"
        )
        self.db.add(dummy)
        self.db.commit()

        # Engine should compute without exceptions
        summary = analytics_service.get_summary(self.db)
        self.assertIsNotNone(summary)

        trends = analytics_service.get_trends(self.db, "daily")
        self.assertIsNotNone(trends)

        patterns = analytics_service.get_patterns_and_distribution(self.db)
        self.assertIsNotNone(patterns)

        # Clean up dummy record
        self.db.delete(dummy)
        self.db.commit()

if __name__ == "__main__":
    unittest.main()
