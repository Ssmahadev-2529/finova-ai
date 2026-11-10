import sys
import os
import unittest
import logging

logging.getLogger('sqlalchemy.engine').setLevel(logging.WARNING)

# Add backend directory to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from services.anomaly_service import AnomalyService
from models.transaction import TransactionModel
from models.user import UserModel
from database import SessionLocal, engine, Base
from routes.transaction_routes import (
    get_health_metrics,
    get_health_timeline,
    simulate_health_pattern,
    HealthSimulationRequest,
    seed_initial_transactions,
)

class TestAccountHealthPredictor(unittest.TestCase):
    def setUp(self):
        Base.metadata.create_all(bind=engine)
        self.db = SessionLocal()
        seed_initial_transactions(self.db)
        self.anomaly_service = AnomalyService()
        self.test_user = UserModel(
            id="USR-HEALTH-TEST",
            email="health@finova.test",
            hashed_password="x",
            full_name="Health Tester",
            business_name="Finova Health",
            is_active=True,
            role="merchant",
        )

    def tearDown(self):
        self.db.close()

    def test_01_empty_dataset_resilience(self):
        """Service should handle empty transaction dataset gracefully without throwing exceptions."""
        health = self.anomaly_service.calculate_account_health([])
        self.assertEqual(health["healthScore"], 100)
        self.assertEqual(health["healthTier"], "Healthy")
        self.assertEqual(health["disputeRate"], 0.0)
        self.assertEqual(health["refundRate"], 0.0)
        self.assertEqual(len(health["detectedAnomalies"]), 0)
        self.assertEqual(health["modelMeta"]["mode"], "Statistical-Fallback")

    def test_02_small_dataset_statistical_fallback(self):
        """Small datasets (N < 10) should safely use deterministic statistical fallback."""
        sample_txns = [
            {"id": "TXN-1", "amount": 100.0, "status": "COMPLETED", "currency": "USD", "country": "United States", "date": "2026-11-01 10:00"},
            {"id": "TXN-2", "amount": 150.0, "status": "COMPLETED", "currency": "USD", "country": "United States", "date": "2026-11-02 11:00"},
            {"id": "TXN-3", "amount": 120.0, "status": "COMPLETED", "currency": "USD", "country": "United States", "date": "2026-11-03 12:00"}
        ]
        health = self.anomaly_service.calculate_account_health(sample_txns)
        self.assertGreaterEqual(health["healthScore"], 90)
        self.assertEqual(health["healthTier"], "Healthy")
        self.assertEqual(health["modelMeta"]["mode"], "Statistical-Fallback")
        self.assertEqual(health["behaviorMetrics"]["totalTransactions"], 3)
        self.assertEqual(health["behaviorMetrics"]["averageAmount"], 123.33)

    def test_03_healthy_baseline_account(self):
        """An account with high completion and low dispute/refund rates must score in the Healthy tier (80-100)."""
        txns = [
            {"id": f"TXN-{i}", "amount": 200.0 + i * 10, "status": "COMPLETED", "currency": "USD", "country": "United States", "date": f"2026-11-0{i % 4 + 1} 10:00"}
            for i in range(12)
        ]
        health = self.anomaly_service.calculate_account_health(txns)
        self.assertGreaterEqual(health["healthScore"], 80)
        self.assertEqual(health["healthTier"], "Healthy")
        self.assertEqual(health["disputeRate"], 0.0)
        self.assertEqual(health["refundRate"], 0.0)
        self.assertEqual(health["failureRate"], 0.0)
        self.assertIn("additional disputes", health["safetyMarginText"])

    def test_04_elevated_dispute_rate_penalty(self):
        """Dispute rates crossing PayPal 1.0% limit should heavily penalize health score into Needs Attention or High Concern."""
        # 10 completed, 2 disputed => dispute rate = 2/12 = 16.67%
        txns = [
            {"id": f"TXN-{i}", "amount": 300.0, "status": "COMPLETED", "currency": "USD", "country": "United States", "date": "2026-11-01 10:00"}
            for i in range(10)
        ]
        txns.append({"id": "TXN-DISP-1", "amount": 3500.0, "status": "DISPUTED", "currency": "USD", "country": "United States", "date": "2026-11-02 11:00"})
        txns.append({"id": "TXN-DISP-2", "amount": 4200.0, "status": "DISPUTED", "currency": "USD", "country": "Cyprus", "date": "2026-11-03 12:00"})

        health = self.anomaly_service.calculate_account_health(txns)
        self.assertLess(health["healthScore"], 70)
        self.assertIn(health["healthTier"], ["Needs Attention", "High Concern", "Stable"])
        self.assertGreater(health["scoreBreakdown"]["disputeDeduction"], 20)
        self.assertGreaterEqual(len(health["earlyWarnings"]), 1)
        self.assertIn("Dispute Rate", health["earlyWarnings"][0]["title"])

    def test_05_elevated_refund_and_declines(self):
        """High refund velocity (> 3.5%) and card declines (> 3.0%) must generate deductions."""
        txns = [
            {"id": f"TXN-{i}", "amount": 100.0, "status": "COMPLETED", "currency": "USD", "country": "United States", "date": "2026-11-01 10:00"}
            for i in range(7)
        ]
        # Add 2 refunds and 2 declines out of 11 total
        txns.append({"id": "TXN-REF-1", "amount": 100.0, "status": "REFUNDED", "currency": "USD", "country": "United States", "date": "2026-11-02 11:00"})
        txns.append({"id": "TXN-REF-2", "amount": 100.0, "status": "REFUNDED", "currency": "USD", "country": "United States", "date": "2026-11-02 11:30"})
        txns.append({"id": "TXN-DEN-1", "amount": 100.0, "status": "DENIED", "currency": "USD", "country": "United States", "date": "2026-11-03 12:00"})
        txns.append({"id": "TXN-DEN-2", "amount": 100.0, "status": "DENIED", "currency": "USD", "country": "United States", "date": "2026-11-03 12:30"})

        health = self.anomaly_service.calculate_account_health(txns)
        self.assertGreater(health["scoreBreakdown"]["refundDeduction"], 0)
        self.assertGreater(health["scoreBreakdown"]["failureDeduction"], 0)
        self.assertLess(health["healthScore"], 95)

    def test_06_unsupervised_isolation_forest_anomaly_detection(self):
        """When N >= 10, Isolation Forest detects feature outliers."""
        txns = [
            {"id": f"TXN-{i}", "amount": 50.0 + i * 2, "status": "COMPLETED", "currency": "USD", "country": "United States", "date": "2026-11-01 10:00"}
            for i in range(12)
        ]
        # Add extreme outlier
        txns.append({
            "id": "TXN-OUTLIER",
            "amount": 9500.0,
            "status": "DENIED",
            "currency": "EUR",
            "country": "Nigeria",
            "customer_name": "Suspicious Entity",
            "date": "2026-11-04 15:00"
        })

        anomalies = self.anomaly_service.detect_anomalies(txns)
        self.assertGreaterEqual(len(anomalies), 1)
        outlier_ids = [a["transactionId"] for a in anomalies]
        self.assertIn("TXN-OUTLIER", outlier_ids)

        outlier = next(a for a in anomalies if a["transactionId"] == "TXN-OUTLIER")
        self.assertEqual(outlier["severity"], "CRITICAL")
        self.assertIn("exceeds statistical", outlier["reason"])

    def test_07_what_if_scenario_simulation(self):
        """Simulating additional disputes and declines should accurately project score degradation."""
        txns = [
            {"id": f"TXN-{i}", "amount": 250.0, "status": "COMPLETED", "currency": "USD", "country": "United States", "date": "2026-11-01 10:00"}
            for i in range(10)
        ]
        base_health = self.anomaly_service.calculate_account_health(txns)
        self.assertGreaterEqual(base_health["healthScore"], 90)

        # Simulate 3 additional disputes and 2 refunds
        sim_health = self.anomaly_service.calculate_account_health(
            txns,
            simulation_deltas={"additionalDisputes": 3, "additionalRefunds": 2, "additionalFailures": 1, "volumeSpikeMultiplier": 1.5}
        )

        self.assertLess(sim_health["healthScore"], base_health["healthScore"])
        self.assertGreater(sim_health["scoreBreakdown"]["disputeDeduction"], base_health["scoreBreakdown"]["disputeDeduction"])

    def test_08_api_endpoints(self):
        """FastAPI route functions for metrics, timeline, and simulation should execute cleanly."""
        metrics_res = get_health_metrics(current_user=self.test_user, db=self.db)
        self.assertIn("healthScore", metrics_res)
        self.assertIn("healthTier", metrics_res)
        self.assertIn("scoreBreakdown", metrics_res)
        self.assertIn("riskIndicators", metrics_res)
        self.assertIn("trends", metrics_res)
        self.assertEqual(len(metrics_res["trends"]), 4)

        timeline_res = get_health_timeline(current_user=self.test_user, db=self.db)
        self.assertIsInstance(timeline_res, list)

        sim_req = HealthSimulationRequest(
            additionalDisputes=2,
            additionalRefunds=1,
            additionalFailures=1,
            volumeSpikeMultiplier=1.0
        )
        sim_res = simulate_health_pattern(req=sim_req, current_user=self.test_user, db=self.db)
        self.assertIn("currentScore", sim_res)
        self.assertIn("simulatedScore", sim_res)
        self.assertIn("scoreDelta", sim_res)
        self.assertTrue(sim_res["isScoreDegraded"])

if __name__ == "__main__":
    unittest.main()
