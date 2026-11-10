import React, { useState } from 'react';
import {
  AccountHealthMetrics,
  Transaction,
  AnomalyEvent,
  HealthSimulationResponse
} from '../types';
import { api } from '../services/api';
import { StatCard } from '../components/common/StatCard';
import { PayPalLogo } from '../components/common/PayPalLogo';
import {
  Activity,
  ShieldCheck,
  AlertTriangle,
  TrendingUp,
  Cpu,
  RefreshCw,
  Sparkles,
  CheckCircle2,
  Info,
  ArrowRight,
  ShieldAlert,
  Sliders,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  HelpCircle,
  BarChart3,
  Clock,
  DollarSign,
  Globe,
  Percent,
  Play,
  RotateCcw
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

interface AccountHealthViewProps {
  metrics: AccountHealthMetrics;
  transactions: Transaction[];
  onRefreshAudit: () => void;
}

export const AccountHealthView: React.FC<AccountHealthViewProps> = ({
  metrics,
  transactions,
  onRefreshAudit
}) => {
  const [isAuditing, setIsAuditing] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);

  // Scenario Simulator State
  const [simDisputes, setSimDisputes] = useState(0);
  const [simRefunds, setSimRefunds] = useState(0);
  const [simFailures, setSimFailures] = useState(0);
  const [simVolumeMultiplier, setSimVolumeMultiplier] = useState(1.0);
  const [simResult, setSimResult] = useState<HealthSimulationResponse | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  const handleRunAudit = () => {
    setIsAuditing(true);
    setTimeout(() => {
      onRefreshAudit();
      setIsAuditing(false);
    }, 700);
  };

  const handleRunSimulation = async () => {
    setIsSimulating(true);
    try {
      const res = await api.simulateHealthPattern({
        additionalDisputes: Number(simDisputes),
        additionalRefunds: Number(simRefunds),
        additionalFailures: Number(simFailures),
        volumeSpikeMultiplier: Number(simVolumeMultiplier)
      });
      setSimResult(res);
    } catch (err) {
      console.warn('Simulation failed:', err);
    } finally {
      setIsSimulating(false);
    }
  };

  const handleResetSimulation = () => {
    setSimDisputes(0);
    setSimRefunds(0);
    setSimFailures(0);
    setSimVolumeMultiplier(1.0);
    setSimResult(null);
  };

  // Tier determination & badge styling
  // 80-100: Healthy | 60-79: Stable | 40-59: Needs Attention | 0-39: High Concern
  const healthScore = simResult ? simResult.simulatedScore : metrics.healthScore;
  const currentTier = simResult
    ? simResult.simulatedTier
    : (metrics.healthTier || (healthScore >= 80 ? 'Healthy' : healthScore >= 60 ? 'Stable' : healthScore >= 40 ? 'Needs Attention' : 'High Concern'));

  const getTierColorClass = (tier: string) => {
    switch (tier) {
      case 'Healthy':
        return 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800';
      case 'Stable':
        return 'bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-800';
      case 'Needs Attention':
        return 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800';
      case 'High Concern':
      default:
        return 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800';
    }
  };

  // Safe margin calculation
  const disputeRate = metrics.disputeRate;
  const safetyMargin = metrics.safetyMarginText ||
    (disputeRate < 1.0
      ? `You can absorb approximately ${metrics.maxDisputesTolerated ?? 12} additional disputes before reaching the 1.00% PayPal ceiling.`
      : 'Dispute ceiling exceeded (>= 1.00%). Immediate case resolution recommended.');

  // Extract score breakdown
  const breakdown = simResult ? simResult.simulatedBreakdown : (metrics.scoreBreakdown || {
    baseScore: 100,
    disputeDeduction: disputeRate > 0 ? Math.min(40, Math.round(disputeRate * 25)) : 0,
    refundDeduction: metrics.refundRate > 3.5 ? Math.min(20, Math.round((metrics.refundRate - 3.5) * 2)) : 0,
    failureDeduction: (metrics.failureRate || 0) > 3.0 ? Math.min(15, Math.round(((metrics.failureRate || 0) - 3.0) * 1.5)) : 0,
    anomalyDeduction: Math.min(15, Math.round(metrics.anomalyRatio * 1.2)),
    volatilityDeduction: metrics.suddenSpikeDetected ? 10 : 0,
    finalScore: metrics.healthScore
  });

  // Extract detected anomalies
  const anomalies: AnomalyEvent[] = metrics.detectedAnomalies || [];

  // Extract behavior metrics
  const behavior = metrics.behaviorMetrics;

  return (
    <div className="space-y-6">
      {/* 1. Header & Actions */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <span>PayPal Seller Account Health & Anomaly Predictor</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-[#7E96C4] mt-0.5">
            Unsupervised machine learning (Isolation Forest & Local Outlier Factor) monitoring checkout velocity spikes, dispute ratios, and Seller Protection status.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <PayPalLogo size="sm" />
          <button
            onClick={handleRunAudit}
            disabled={isAuditing}
            className="px-4 py-2 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-[#0E2046] border border-slate-300 dark:border-[#20438A] hover:border-[#0070BA] text-xs text-[#003087] dark:text-white font-bold flex items-center gap-2 transition-colors disabled:opacity-50 shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isAuditing ? 'animate-spin text-[#0070BA]' : ''}`} />
            <span>{isAuditing ? 'Recalculating Models...' : 'Re-run Isolation Forest'}</span>
          </button>
        </div>
      </div>

      {/* 2. Model & Disclaimers Notice */}
      <div className="bg-white dark:bg-[#081329] border border-slate-200 dark:border-[#162F64] rounded-2xl p-4 flex items-start gap-3 shadow-sm">
        <div className="p-2 rounded-xl bg-[#0070BA]/15 text-[#0070BA] shrink-0 mt-0.5">
          <Cpu className="w-4 h-4" />
        </div>
        <div className="text-xs flex-1">
          <div className="flex flex-wrap items-center gap-2 font-bold text-slate-900 dark:text-white">
            <span>{metrics.modelMeta?.algorithm || 'Hybrid Isolation Forest (100 Trees) + Local Outlier Factor'}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#0070BA]/15 text-[#0070BA] dark:text-[#38BDF8] border border-[#0070BA]/30 font-mono">
              Confidence: {metrics.modelMeta?.confidenceScore || 85}%
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-[#0E2046] text-slate-600 dark:text-[#9BB0D6] border border-slate-200 dark:border-[#20438A] font-mono">
              Sample Size: {metrics.modelMeta?.sampleSize || transactions.length} txns
            </span>
          </div>
          <p className="text-slate-600 dark:text-[#9BB0D6] mt-1 leading-relaxed">
            Finova extracts 6 behavioral feature vectors (amount, cross-border flag, denial status, refund status, z-score, dispute flag) to evaluate merchant standing without requiring labeled fraud data.
          </p>
          <div className="mt-2 pt-2 border-t border-slate-100 dark:border-[#162F64] text-[11px] text-slate-500 dark:text-[#7E96C4] flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-[#0070BA] shrink-0" />
            <span>
              <strong>Merchant Self-Audit Disclaimer:</strong> Finova AI provides merchant self-audit analytics and early financial warning indicators. Finova AI does NOT represent PayPal, predict internal PayPal limitation algorithms, or make decisions on behalf of PayPal risk operations.
            </span>
          </div>
        </div>
      </div>

      {/* 3. Account Health Hero & Key Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Account Standing"
          value={`${healthScore} / 100`}
          subtitle={`Tier: ${currentTier}`}
          icon={Activity}
          accentColor={healthScore >= 80 ? 'emerald' : healthScore >= 60 ? 'blue' : healthScore >= 40 ? 'amber' : 'rose'}
          badge={
            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${getTierColorClass(currentTier)}`}>
              {currentTier}
            </span>
          }
        />
        <StatCard
          title="Dispute Rate"
          value={`${disputeRate}%`}
          subtitle="PayPal ceiling: 1.00%"
          icon={ShieldCheck}
          accentColor={disputeRate > 0.8 ? 'amber' : 'blue'}
          change={{ value: disputeRate > 0.8 ? 'Near Warning' : 'Safe Zone', isPositive: disputeRate <= 0.8 }}
        />
        <StatCard
          title="Refund Rate"
          value={`${metrics.refundRate}%`}
          subtitle="Typical benchmark: 3.5%"
          icon={TrendingUp}
          accentColor={metrics.refundRate > 5.0 ? 'amber' : 'blue'}
          change={{ value: metrics.refundRate <= 3.5 ? 'Normal' : 'Elevated', isPositive: metrics.refundRate <= 3.5 }}
        />
        <StatCard
          title="Anomaly Ratio"
          value={`${metrics.anomalyRatio}%`}
          subtitle={`${anomalies.length} Flagged Incidents`}
          icon={Cpu}
          accentColor="cyan"
          badge={
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-[#0070BA]/15 text-[#0070BA] dark:text-[#38BDF8] border border-[#0070BA]/30 font-bold">
              Score: {metrics.isolationForestScore}
            </span>
          }
        />
      </div>

      {/* 4. Score Calculation Breakdown & Dispute Safety Gauge */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Transparent Score Breakdown (7 cols) */}
        <div className="lg:col-span-7 fintech-card p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Account Health Calculation Breakdown</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-[#0E2046] text-slate-600 dark:text-[#9BB0D6] border border-slate-200 dark:border-[#20438A]">
                  Deterministic Math
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-[#7E96C4]">
                Transparent explanation of deductions applied to your base score (100)
              </p>
            </div>
            <button
              onClick={() => setShowBreakdown(!showBreakdown)}
              className="text-xs text-[#0070BA] dark:text-[#38BDF8] hover:underline font-bold flex items-center gap-1 btn-press"
            >
              <span>{showBreakdown ? 'Collapse' : 'Inspect'}</span>
              {showBreakdown ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Quick Summary Formula */}
          <div className="p-3 rounded-xl fintech-panel text-xs flex flex-wrap items-center justify-between gap-2">
            <span className="text-slate-600 dark:text-[#9BB0D6]">
              Base (100) - Disputes ({breakdown.disputeDeduction}) - Refunds ({breakdown.refundDeduction}) - Declines ({breakdown.failureDeduction}) - Anomalies ({breakdown.anomalyDeduction}) - Velocity ({breakdown.volatilityDeduction})
            </span>
            <span className="font-extrabold text-sm text-[#0070BA] dark:text-[#38BDF8] font-mono tabular-nums">
              = {breakdown.finalScore} / 100
            </span>
          </div>

          {/* Expanded Breakdown Table */}
          {showBreakdown && (
            <div className="mt-4 space-y-2 text-xs animate-in fade-in">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900">
                <span className="font-bold text-emerald-800 dark:text-emerald-300">Base Account Standing</span>
                <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">+{breakdown.baseScore} pts</span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#162F64]">
                <div>
                  <span className="font-bold text-slate-900 dark:text-white">Dispute Ratio Penalty</span>
                  <span className="text-[11px] text-slate-500 dark:text-[#7E96C4] block">PayPal standard ceiling 1.00%</span>
                </div>
                <span className={`font-mono font-bold ${breakdown.disputeDeduction > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'}`}>
                  -{breakdown.disputeDeduction} pts
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#162F64]">
                <div>
                  <span className="font-bold text-slate-900 dark:text-white">Refund Frequency Penalty</span>
                  <span className="text-[11px] text-slate-500 dark:text-[#7E96C4]">Benchmark: 3.50%</span>
                </div>
                <span className={`font-mono font-bold ${breakdown.refundDeduction > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`}>
                  -{breakdown.refundDeduction} pts
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#162F64]">
                <div>
                  <span className="font-bold text-slate-900 dark:text-white">Payment Denial / Decline Penalty</span>
                  <span className="text-[11px] text-slate-500 dark:text-[#7E96C4]">Benchmark: &lt; 3.00%</span>
                </div>
                <span className={`font-mono font-bold ${breakdown.failureDeduction > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'}`}>
                  -{breakdown.failureDeduction} pts
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#162F64]">
                <div>
                  <span className="font-bold text-slate-900 dark:text-white">Isolation Forest Outlier Density</span>
                  <span className="text-[11px] text-slate-500 dark:text-[#7E96C4]">Flagged unusual transactions</span>
                </div>
                <span className={`font-mono font-bold ${breakdown.anomalyDeduction > 0 ? 'text-[#0070BA] dark:text-[#38BDF8]' : 'text-slate-400'}`}>
                  -{breakdown.anomalyDeduction} pts
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#162F64]">
                <div>
                  <span className="font-bold text-slate-900 dark:text-white">Volume Velocity Spike Penalty</span>
                  <span className="text-[11px] text-slate-500 dark:text-[#7E96C4]">Velocity delta &gt; 150%</span>
                </div>
                <span className={`font-mono font-bold ${breakdown.volatilityDeduction > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`}>
                  -{breakdown.volatilityDeduction} pts
                </span>
              </div>
            </div>
          )}

          {/* Tier scale guide */}
          <div className="mt-4 pt-3 border-t border-slate-200 dark:border-[#162F64] grid grid-cols-4 gap-2 text-center text-[10px] font-mono">
            <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300">
              <span className="font-bold block">80–100</span>
              Healthy
            </div>
            <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300">
              <span className="font-bold block">60–79</span>
              Stable
            </div>
            <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300">
              <span className="font-bold block">40–59</span>
              Needs Attention
            </div>
            <div className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300">
              <span className="font-bold block">0–39</span>
              High Concern
            </div>
          </div>
        </div>

        {/* Dispute Threshold Safety Meter (5 cols) */}
        <div className="lg:col-span-5 fintech-card p-5 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1 flex items-center justify-between">
              <span>PayPal Dispute Rate Safety Gauge</span>
              <span className="text-xs font-mono font-bold text-[#B45309] dark:text-[#FFC439]">{disputeRate}% / 1.00%</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-[#7E96C4] mb-4">
              PayPal merchant accounts exceeding 1.0% dispute rate face reserve requirements and excess dispute fees ($15–$20/case).
            </p>

            {/* Visual Gauge Bar */}
            <div className="space-y-2">
              <div className="h-4 w-full bg-slate-100 dark:bg-[#050C1C] rounded-full overflow-hidden p-0.5 border border-slate-200 dark:border-[#162F64] flex">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-[#FFC439] to-rose-500 transition-all duration-500"
                  style={{ width: `${Math.min(100, (disputeRate / 1.2) * 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-slate-500 dark:text-[#7E96C4] font-mono">
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">0.0% (Safe)</span>
                <span className="text-[#B45309] dark:text-[#FFC439] font-bold">0.8% (Warning Horizon)</span>
                <span className="text-rose-600 dark:text-rose-400 font-bold">1.0% (Critical Review)</span>
              </div>
            </div>

            <div className="mt-5 p-3.5 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#162F64] text-xs space-y-1">
              <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[#0070BA]" />
                <span>Safety Absorption Margin</span>
              </div>
              <p className="text-slate-600 dark:text-[#9BB0D6] text-[11px] leading-relaxed">
                {safetyMargin}
              </p>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-[#162F64] text-[11px] text-slate-500 dark:text-[#7E96C4] flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-[#0070BA] shrink-0" />
            <span>Updated with every settled transaction webhook event.</span>
          </div>
        </div>
      </div>

      {/* 5. 6 Key Risk Indicators Grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#0070BA]" />
            <span>Account Risk & Exposure Indicators</span>
          </h3>
          <span className="text-xs text-slate-500 dark:text-[#7E96C4]">6 Behavioral Metrics Audited</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(metrics.riskIndicators || [
            { id: '1', name: 'Dispute Exposure Ratio', value: disputeRate, unit: '%', benchmark: '1.00% Max', status: disputeRate < 0.6 ? 'Safe' : 'Warning', severity: disputeRate < 0.6 ? 'healthy' : 'warning', description: 'PayPal ceiling 1.00% before excess chargeback fees apply.' },
            { id: '2', name: 'Refund Velocity Ratio', value: metrics.refundRate, unit: '%', benchmark: '3.50% Avg', status: metrics.refundRate <= 3.5 ? 'Normal' : 'Elevated', severity: metrics.refundRate <= 3.5 ? 'healthy' : 'warning', description: 'Standard e-commerce benchmark is 3.50%.' },
            { id: '3', name: 'Payment Success Rate', value: behavior?.successRate ?? 88.9, unit: '%', benchmark: '95.0% Min', status: (behavior?.successRate ?? 88.9) >= 90 ? 'Optimal' : 'Sub-optimal', severity: (behavior?.successRate ?? 88.9) >= 90 ? 'healthy' : 'warning', description: 'Settled transactions vs denied, failed, or disputed checkouts.' },
            { id: '4', name: 'Denied / Decline Rate', value: metrics.failureRate ?? (behavior?.failureRate ?? 11.1), unit: '%', benchmark: '3.00% Max', status: (metrics.failureRate ?? 0) <= 3.0 ? 'Clean' : 'Review', severity: (metrics.failureRate ?? 0) <= 3.0 ? 'healthy' : 'warning', description: 'Card declines or denials indicating checkout friction.' },
            { id: '5', name: 'Volume Volatility Shift', value: behavior?.volumeVolatility ?? 22.4, unit: '% Δ', benchmark: '±50% Range', status: Math.abs(behavior?.volumeVolatility ?? 22.4) <= 75 ? 'Steady' : 'Surge', severity: 'healthy', description: 'Recent volume velocity compared to historical 30-day baseline.' },
            { id: '6', name: 'Anomaly Density', value: metrics.anomalyRatio, unit: '%', benchmark: '5.00% Baseline', status: metrics.anomalyRatio <= 5.0 ? 'Low' : 'Moderate', severity: metrics.anomalyRatio <= 5.0 ? 'healthy' : 'warning', description: 'Flagged transactions by Isolation Forest as statistical outliers.' },
          ]).map((ind) => (
            <div
              key={ind.id}
              className="p-4 rounded-xl bg-white dark:bg-[#081329] border border-slate-200 dark:border-[#162F64] shadow-sm flex flex-col justify-between space-y-3"
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">{ind.name}</span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      ind.severity === 'critical'
                        ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                        : ind.severity === 'warning'
                        ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                        : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                    }`}
                  >
                    {ind.status}
                  </span>
                </div>

                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-xl font-extrabold text-slate-900 dark:text-white font-mono">
                    {ind.value}{ind.unit}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-[#7E96C4] font-mono">
                    (Target: {ind.benchmark})
                  </span>
                </div>

                <p className="text-[11px] text-slate-600 dark:text-[#9BB0D6] leading-relaxed">
                  {ind.description}
                </p>
              </div>

              {/* Progress track */}
              <div className="w-full bg-slate-100 dark:bg-[#050C1C] h-1.5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    ind.severity === 'critical'
                      ? 'bg-rose-500'
                      : ind.severity === 'warning'
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(8, Number(ind.value) * 10))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 6. Historical Trajectory & Behavior Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Trend Chart (7 cols) */}
        <div className="lg:col-span-7 bg-white dark:bg-[#081329] border border-slate-200 dark:border-[#162F64] rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Account Health & Anomaly Historical Trajectory</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-[#7E96C4]">Chronological seller score vs detected anomaly incidents</p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold">
                <span className="w-2.5 h-0.5 bg-emerald-500"></span>
                Health Score
              </span>
              <span className="flex items-center gap-1.5 text-[#0070BA] dark:text-[#38BDF8] font-bold">
                <span className="w-2.5 h-0.5 bg-[#0070BA]"></span>
                Anomalies
              </span>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={metrics.trends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#CBD5E1" opacity={0.5} vertical={false} />
                <XAxis dataKey="period" stroke="#64748B" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748B" fontSize={11} tickLine={false} domain={[30, 100]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#FFFFFF',
                    borderColor: '#CBD5E1',
                    borderRadius: '12px',
                    fontSize: '12px',
                    color: '#0F172A',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="healthScore"
                  name="Health Score"
                  stroke="#10B981"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#10B981' }}
                />
                <Line
                  type="monotone"
                  dataKey="anomalyCount"
                  name="Anomalies"
                  stroke="#0070BA"
                  strokeWidth={2}
                  dot={{ r: 3, fill: '#0070BA' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Behavioral Velocity Intelligence (5 cols) */}
        <div className="lg:col-span-5 bg-white dark:bg-[#081329] border border-slate-200 dark:border-[#162F64] rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#0070BA]" />
                <span>Behavioral Merchant Profile</span>
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-[#0E2046] text-slate-600 dark:text-[#9BB0D6] border border-slate-200 dark:border-[#20438A]">
                Historical Baseline
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs mb-4">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#162F64]">
                <span className="text-slate-500 dark:text-[#7E96C4] text-[11px] block">Average Ticket Size</span>
                <span className="text-base font-extrabold text-slate-900 dark:text-white font-mono">
                  ${behavior?.averageAmount ? behavior.averageAmount.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '1,987.89'}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Median: ${behavior?.medianAmount ?? 620.00}</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#162F64]">
                <span className="text-slate-500 dark:text-[#7E96C4] text-[11px] block">Checkout Velocity</span>
                <span className="text-base font-extrabold text-slate-900 dark:text-white font-mono">
                  {behavior?.velocityPerDay ?? 1.4} / day
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Total: {behavior?.totalTransactions ?? transactions.length} orders</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#162F64]">
                <span className="text-slate-500 dark:text-[#7E96C4] text-[11px] block">Cross-Border Share</span>
                <span className="text-base font-extrabold text-slate-900 dark:text-white font-mono">
                  {behavior?.internationalRatio ?? 44.4}%
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Foreign buyers</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#162F64]">
                <span className="text-slate-500 dark:text-[#7E96C4] text-[11px] block">Largest Order</span>
                <span className="text-base font-extrabold text-slate-900 dark:text-white font-mono">
                  ${behavior?.maxAmount ? behavior.maxAmount.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '6,500.00'}
                </span>
                <span className="text-[10px] text-slate-400 block mt-0.5">Single ticket peak</span>
              </div>
            </div>

            <p className="text-slate-600 dark:text-[#9BB0D6] text-xs leading-relaxed">
              Normal distribution patterns are computed from historical database records. Transactions deviating beyond 2.5 standard deviations are flagged for merchant inspection.
            </p>
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-[#162F64] text-[11px] text-slate-500 dark:text-[#7E96C4] flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-[#0070BA] shrink-0" />
            <span>Currencies active: {behavior?.currencyDistribution ? Object.keys(behavior.currencyDistribution).join(', ') : 'USD, EUR, GBP'}</span>
          </div>
        </div>
      </div>

      {/* 7. Detected Anomalies Timeline */}
      <div className="bg-white dark:bg-[#081329] border border-slate-200 dark:border-[#162F64] rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-[#0070BA]/15 text-[#0070BA]">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Anomaly Detection Timeline</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-[#0E2046] text-slate-600 dark:text-[#9BB0D6] border border-slate-200 dark:border-[#20438A]">
                  {anomalies.length} Flagged
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-[#7E96C4]">
                Flagged by statistical baselines or Isolation Forest (Note: statistical anomalies are not proof of fraud)
              </p>
            </div>
          </div>
        </div>

        {anomalies.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 dark:text-[#7E96C4] border border-dashed border-slate-200 dark:border-[#162F64] rounded-xl">
            <CheckCircle2 className="w-6 h-6 text-emerald-500 mx-auto mb-2" />
            <p className="font-bold text-slate-900 dark:text-white">Zero Statistical Anomalies Detected</p>
            <p className="mt-1">All processed transactions conform to historical volume, velocity, and geographic baselines.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-[#162F64]">
            {anomalies.map((ano) => (
              <div key={ano.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div
                    className={`p-2 rounded-xl shrink-0 mt-0.5 ${
                      ano.severity === 'CRITICAL'
                        ? 'bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400'
                        : ano.severity === 'HIGH'
                        ? 'bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400'
                        : 'bg-blue-100 dark:bg-[#0070BA]/20 text-[#0070BA] dark:text-[#38BDF8]'
                    }`}
                  >
                    <AlertCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs text-slate-900 dark:text-white">{ano.transactionId}</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.2 rounded-full uppercase ${
                          ano.severity === 'CRITICAL'
                            ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                            : ano.severity === 'HIGH'
                            ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                            : 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                        }`}
                      >
                        {ano.severity} (Score: {ano.riskScore})
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">{ano.date}</span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-[#9BB0D6] mt-1">
                      {ano.reason}
                    </p>
                    <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-[#7E96C4] mt-1">
                      <span>Customer: <strong className="text-slate-700 dark:text-[#CBD5E1]">{ano.customerName}</strong></span>
                      <span>•</span>
                      <span>Status: <strong className="text-slate-700 dark:text-[#CBD5E1]">{ano.status}</strong></span>
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="font-mono font-extrabold text-sm text-slate-900 dark:text-white">
                    ${ano.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} {ano.currency}
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Outlier Deviation
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 8. Interactive What-If Scenario Simulator */}
      <div className="bg-white dark:bg-[#081329] border border-slate-200 dark:border-[#162F64] rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-[#0070BA]/15 text-[#0070BA]">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>Account Health Pattern Simulator (What-If Analysis)</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#0070BA]/15 text-[#0070BA] dark:text-[#38BDF8] border border-[#0070BA]/30 font-mono">
                  Sandbox Testing
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-[#7E96C4]">
                Simulate potential dispute spikes, refund surges, or checkout decline bursts to anticipate score shifts
              </p>
            </div>
          </div>

          {simResult && (
            <button
              onClick={handleResetSimulation}
              className="px-3 py-1.5 rounded-full text-xs font-bold text-slate-600 dark:text-[#9BB0D6] bg-slate-100 hover:bg-slate-200 dark:bg-[#0E2046] border border-slate-200 dark:border-[#20438A] flex items-center gap-1.5 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Simulation</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          {/* Add disputes */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#162F64]">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-1">
              Additional Disputes (+{simDisputes})
            </label>
            <input
              type="range"
              min="0"
              max="5"
              step="1"
              value={simDisputes}
              onChange={(e) => setSimDisputes(parseInt(e.target.value, 10))}
              className="w-full accent-[#0070BA]"
            />
            <span className="text-[10px] text-slate-400 block mt-1">PayPal standard limit: 1.00%</span>
          </div>

          {/* Add refunds */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#162F64]">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-1">
              Additional Refunds (+{simRefunds})
            </label>
            <input
              type="range"
              min="0"
              max="8"
              step="1"
              value={simRefunds}
              onChange={(e) => setSimRefunds(parseInt(e.target.value, 10))}
              className="w-full accent-[#0070BA]"
            />
            <span className="text-[10px] text-slate-400 block mt-1">Standard benchmark: 3.50%</span>
          </div>

          {/* Add card denials */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#162F64]">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-1">
              Additional Denials (+{simFailures})
            </label>
            <input
              type="range"
              min="0"
              max="6"
              step="1"
              value={simFailures}
              onChange={(e) => setSimFailures(parseInt(e.target.value, 10))}
              className="w-full accent-[#0070BA]"
            />
            <span className="text-[10px] text-slate-400 block mt-1">Declines / checkout friction</span>
          </div>

          {/* Volume multiplier */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#162F64]">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block mb-1">
              Volume Surge ({simVolumeMultiplier}x)
            </label>
            <input
              type="range"
              min="1.0"
              max="3.0"
              step="0.5"
              value={simVolumeMultiplier}
              onChange={(e) => setSimVolumeMultiplier(parseFloat(e.target.value))}
              className="w-full accent-[#0070BA]"
            />
            <span className="text-[10px] text-slate-400 block mt-1">Sudden velocity acceleration</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={handleRunSimulation}
            disabled={isSimulating}
            className="px-5 py-2.5 rounded-xl bg-[#0070BA] hover:bg-[#003087] text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-colors disabled:opacity-50"
          >
            <Play className={`w-3.5 h-3.5 ${isSimulating ? 'animate-spin' : ''}`} />
            <span>{isSimulating ? 'Simulating Impact...' : 'Evaluate What-If Scenario'}</span>
          </button>

          {simResult && (
            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="text-slate-500 dark:text-[#7E96C4]">
                Current: <strong className="text-slate-900 dark:text-white">{simResult.currentScore} ({simResult.currentTier})</strong>
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
              <span className={`font-bold ${simResult.isScoreDegraded ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600'}`}>
                Simulated: {simResult.simulatedScore} ({simResult.simulatedTier}) [{simResult.scoreDelta > 0 ? `+${simResult.scoreDelta}` : simResult.scoreDelta}]
              </span>
            </div>
          )}
        </div>

        {/* Simulation Feedback Alert */}
        {simResult && simResult.isScoreDegraded && (
          <div className="mt-4 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-300 space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-rose-600" />
              <span>Simulated Risk Degradation Alert</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              Under this hypothetical scenario, your account standing decreases by {Math.abs(simResult.scoreDelta)} points to tier <strong className="uppercase">{simResult.simulatedTier}</strong>.
              {' '}{simResult.safetyMarginText}
            </p>
          </div>
        )}
      </div>

      {/* 9. Preventive AI Recommendations */}
      <div className="bg-white dark:bg-[#081329] border border-slate-200 dark:border-[#162F64] rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-[#0070BA]/15 text-[#0070BA]">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Preventive PayPal Merchant Action Plan</h3>
              <p className="text-xs text-slate-500 dark:text-[#7E96C4]">Actionable steps to defend merchant standing, avoid reserves, and lower payment processing costs</p>
            </div>
          </div>
          <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-[#0E2046] text-slate-600 dark:text-[#9BB0D6] border border-slate-200 dark:border-[#20438A]">
            {metrics.preventiveRecommendations?.length || 3} Actions Available
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {metrics.preventiveRecommendations.map((rec) => (
            <div
              key={rec.id}
              className="p-4 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#162F64] flex flex-col justify-between space-y-3 hover:border-slate-300 dark:hover:border-[#224587] transition-colors"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-[10px] text-slate-500 dark:text-[#7E96C4]">{rec.id}</span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.2 rounded-full uppercase ${
                      rec.severity === 'critical'
                        ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                        : rec.severity === 'warning'
                        ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                        : 'bg-blue-100 dark:bg-[#0070BA]/20 text-[#003087] dark:text-[#38BDF8] border border-blue-200 dark:border-[#0070BA]/40'
                    }`}
                  >
                    {rec.severity}
                  </span>
                </div>

                <h4 className="text-xs font-bold text-slate-900 dark:text-white leading-snug mb-1">
                  {rec.title}
                </h4>
                <p className="text-slate-600 dark:text-[#9BB0D6] text-[11px] leading-relaxed">
                  {rec.action}
                </p>
              </div>

              <div className="p-2.5 rounded-lg bg-white dark:bg-[#081329] border border-slate-200 dark:border-[#162F64] text-[11px] shadow-sm">
                <span className="text-emerald-600 dark:text-emerald-400 font-bold block mb-0.5">Projected Impact:</span>
                <span className="text-slate-700 dark:text-[#9BB0D6]">{rec.impact}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
