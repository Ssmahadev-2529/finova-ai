import React, { useState, useEffect } from 'react';
import {
  Transaction,
  AccountHealthMetrics,
  NavigationTab,
  DataSourceType,
  AnalyticsSummary,
  TrendsResponse,
  PatternAnalyticsResponse,
  AiInsightCard,
  PeriodComparisonResponse,
  RevenueForecastResponse,
  DecisionIntelligenceItem,
  DecisionScenarioResponse
} from '../types';
import { StatCard } from '../components/common/StatCard';
import { DataSourceBadge } from '../components/common/DataSourceBadge';
import { RiskBadge } from '../components/common/RiskBadge';
import { StatusBadge } from '../components/common/StatusBadge';
import { PayPalLogo } from '../components/common/PayPalLogo';
import { api, authStorage } from '../services/api';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Percent,
  Wallet,
  Activity,
  ArrowUpRight,
  Sparkles,
  Info,
  AlertTriangle,
  ChevronRight,
  CreditCard,
  Globe,
  PieChart as PieChartIcon,
  Layers,
  CheckCircle2,
  Clock,
  Ban,
  RotateCcw,
  AlertCircle,
  Sliders,
  Cpu,
  Target,
  BarChart3,
  Calculator,
  Compass,
  ArrowRight
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

interface DashboardViewProps {
  transactions: Transaction[];
  healthMetrics: AccountHealthMetrics;
  onNavigate: (tab: NavigationTab) => void;
  onSelectTransaction: (txn: Transaction) => void;
  analyticsSummary?: AnalyticsSummary | null;
  trendsData?: TrendsResponse | null;
  patternsData?: PatternAnalyticsResponse | null;
  aiInsights?: AiInsightCard[] | null;
  selectedPeriod?: 'daily' | 'weekly' | 'monthly';
  onChangePeriod?: (period: 'daily' | 'weekly' | 'monthly') => void;
  isLoading?: boolean;
  isAuthenticated?: boolean;
  onOpenAuth?: () => void;
}

const CustomChartTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-xl bg-white/95 dark:bg-[#07132B]/95 backdrop-blur-md border border-slate-200/90 dark:border-white/[0.12] p-3 shadow-xl text-xs font-sans min-w-[170px]">
        <div className="font-semibold text-slate-700 dark:text-slate-300 mb-1.5 pb-1 border-b border-slate-100 dark:border-white/[0.08]">
          {label}
        </div>
        <div className="space-y-1.5">
          {payload.map((entry: any, index: number) => {
            const name =
              entry.name === 'volume'
                ? 'Gross Volume'
                : entry.name === 'fee'
                ? 'PayPal Fee'
                : entry.name === 'upperConfidence'
                ? 'Upper Bound'
                : entry.name;
            return (
              <div key={`item-${index}`} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-[11px]">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                  <span>{name}</span>
                </div>
                <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-white text-[11px]">
                  ${Number(entry.value).toFixed(2)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  return null;
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  transactions,
  healthMetrics,
  onNavigate,
  onSelectTransaction,
  analyticsSummary,
  trendsData,
  patternsData,
  aiInsights,
  selectedPeriod = 'daily',
  onChangePeriod,
  isLoading = false,
  isAuthenticated = false,
  onOpenAuth
}) => {
  const [tableStatusFilter, setTableStatusFilter] = useState<string>('ALL');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [filteredSummary, setFilteredSummary] = useState<AnalyticsSummary | null>(null);
  const [summaryFilterError, setSummaryFilterError] = useState<string | null>(null);

  // --- Phase 7 State ---
  // Period-over-period comparison state
  const [comparisonPeriod, setComparisonPeriod] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('monthly');
  const [periodComparison, setPeriodComparison] = useState<PeriodComparisonResponse | null>(null);
  const [isComparisonLoading, setIsComparisonLoading] = useState<boolean>(false);

  // Revenue Forecasting state
  const [forecastMode, setForecastMode] = useState<'historical' | 'forecast'>('historical');
  const [forecastHorizon, setForecastHorizon] = useState<number>(7);
  const [forecastData, setForecastData] = useState<RevenueForecastResponse | null>(null);
  const [isForecastLoading, setIsForecastLoading] = useState<boolean>(false);

  // Decision Intelligence Action Center
  const [decisions, setDecisions] = useState<DecisionIntelligenceItem[]>([]);
  const [isDecisionsLoading, setIsDecisionsLoading] = useState<boolean>(false);

  // Decision Scenario Simulator
  const [simVolumeGrowth, setSimVolumeGrowth] = useState<number>(20);
  const [simAvgTicket, setSimAvgTicket] = useState<number>(1180);
  const [simCrossBorder, setSimCrossBorder] = useState<number>(35);
  const [simTier, setSimTier] = useState<string>('standard');
  const [simResult, setSimResult] = useState<DecisionScenarioResponse | null>(null);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);

  // Fetch comparison data when authenticated
  useEffect(() => {
    if (!authStorage.getToken()) {
      setPeriodComparison(null);
      return;
    }
    let isMounted = true;
    setIsComparisonLoading(true);
    api.getPeriodComparison(comparisonPeriod)
      .then((res) => {
        if (isMounted) setPeriodComparison(res);
      })
      .catch((err) => console.warn('Period comparison fetch error:', err))
      .finally(() => {
        if (isMounted) setIsComparisonLoading(false);
      });
    return () => { isMounted = false; };
  }, [comparisonPeriod, transactions.length, analyticsSummary]);

  // Fetch forecast data when forecast mode is active and authenticated
  useEffect(() => {
    if (!authStorage.getToken()) {
      setForecastData(null);
      return;
    }
    let isMounted = true;
    if (forecastMode === 'forecast') {
      setIsForecastLoading(true);
      api.getRevenueForecast(selectedPeriod, forecastHorizon)
        .then((res) => {
          if (isMounted) setForecastData(res);
        })
        .catch((err) => console.warn('Forecast fetch error:', err))
        .finally(() => {
          if (isMounted) setIsForecastLoading(false);
        });
    }
    return () => { isMounted = false; };
  }, [forecastMode, selectedPeriod, forecastHorizon, transactions.length, analyticsSummary]);

  // Fetch Decision Intelligence recommendations when authenticated
  useEffect(() => {
    if (!authStorage.getToken()) {
      setDecisions([]);
      return;
    }
    let isMounted = true;
    setIsDecisionsLoading(true);
    api.getDecisionIntelligence()
      .then((res) => {
        if (isMounted) setDecisions(res);
      })
      .catch((err) => console.warn('Decision intelligence fetch error:', err))
      .finally(() => {
        if (isMounted) setIsDecisionsLoading(false);
      });
    return () => { isMounted = false; };
  }, [transactions.length, analyticsSummary]);

  // Run scenario simulation when authenticated
  useEffect(() => {
    if (!authStorage.getToken()) {
      setSimResult(null);
      return;
    }
    let isMounted = true;
    setIsSimulating(true);
    api.simulateDecisionScenario({
      volumeGrowthPct: simVolumeGrowth,
      targetAverageTicket: simAvgTicket,
      crossBorderPct: simCrossBorder,
      paymentTier: simTier
    })
      .then((res) => {
        if (isMounted) setSimResult(res);
      })
      .catch((err) => console.warn('Scenario simulation error:', err))
      .finally(() => {
        if (isMounted) setIsSimulating(false);
      });
    return () => { isMounted = false; };
  }, [simVolumeGrowth, simAvgTicket, simCrossBorder, simTier, transactions.length, analyticsSummary]);

  // Compute metrics (prioritize date-filtered summary or backend AnalyticsSummary)
  const activeSummary = filteredSummary ?? analyticsSummary;
  const totalTransactions = activeSummary?.totalTransactions ?? transactions.length;
  const totalVolume = activeSummary?.grossPaymentVolume ?? transactions.reduce((acc, curr) => acc + (curr.status !== 'DENIED' && curr.txnType !== 'expense' ? curr.amount : 0), 0);
  const totalFees = activeSummary?.totalFees ?? transactions.reduce((acc, curr) => acc + (curr.actualFee ?? curr.estimatedFee ?? 0), 0);
  const totalNetReceived = activeSummary?.totalNetReceived ?? transactions.reduce((acc, curr) => acc + (curr.status === 'COMPLETED' && curr.txnType !== 'expense' ? curr.netAmount : 0), 0);
  const totalExpenses = activeSummary?.totalExpenses ?? transactions.reduce((acc, curr) => acc + (curr.txnType === 'expense' && curr.status !== 'DENIED' ? curr.amount : 0), 0);
  const netCashFlow = activeSummary?.netCashFlow ?? (totalNetReceived - totalExpenses);
  const anomalyCount = activeSummary?.riskMetrics.anomalyCount ?? transactions.filter(t => t.isAnomaly).length;
  const confirmedCoverage = activeSummary?.confirmedFeeCoveragePct ?? (transactions.length > 0 ? Math.round((transactions.filter(t => t.actualFee !== undefined && t.actualFee !== null).length / transactions.length) * 1000) / 10 : 0);
  const growthRate = trendsData?.summary ? trendsData.summary.growthRatePct : null;

  const handleApplyDateFilter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dateFrom && !dateTo) {
      setFilteredSummary(null);
      setSummaryFilterError(null);
      return;
    }
    if (!isAuthenticated) {
      setSummaryFilterError('Sign in to query server-side date range analytics.');
      return;
    }
    setSummaryFilterError(null);
    try {
      const res = await api.getAnalyticsSummary(dateFrom || undefined, dateTo || undefined);
      setFilteredSummary(res);
    } catch (err: any) {
      setSummaryFilterError(err?.message || 'Invalid date filter.');
    }
  };

  // Chart data from backend trends or forecast (never fabricate Mon-Sun synthetic arrays)
  const chartData = forecastMode === 'forecast' && forecastData?.data && forecastData.data.length > 0
    ? forecastData.data.map((d) => ({
        day: d.periodLabel,
        volume: d.volume,
        fee: d.fees,
        net: d.net,
        isForecast: d.isForecast,
        lowerConfidence: d.lowerConfidence,
        upperConfidence: d.upperConfidence
      }))
    : trendsData?.data && trendsData.data.length > 0
    ? trendsData.data
    : [];

  // Filter transactions for recent ledger table
  const filteredRecentTransactions = transactions.filter((txn) => {
    if (tableStatusFilter === 'ALL') return true;
    return txn.status === tableStatusFilter;
  });

  return (
    <div className="space-y-6">
      {/* PayPal Sandbox Merchant Banner */}
      <div className="bg-gradient-to-r from-[#002875] via-[#00457C] to-[#001C64] text-white border border-[#002C8A] rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-md">
        <div className="flex items-start gap-3.5">
          <div className="p-2.5 rounded-xl bg-white/15 text-white backdrop-blur-sm border border-white/20 shrink-0 mt-0.5 shadow-sm">
            <PayPalLogo size="sm" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-extrabold tracking-tight text-white">
                Finova AI – Decision Intelligence & Analytics Engine
              </span>
              <span className="text-[10px] uppercase font-extrabold tracking-wider px-2 py-0.5 rounded-full bg-[#FFC439] text-[#001435]">
                Commercial Tier 3.49% + $0.49
              </span>
              {activeSummary && (
                <span className="text-[10px] uppercase font-extrabold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/30">
                  {activeSummary.sourceBreakdown.sandbox.count} Sandbox Captures Verified
                </span>
              )}
            </div>
            <p className="text-xs text-blue-100 mt-1 leading-relaxed max-w-2xl">
              Advanced financial intelligence layer: period-over-period comparisons, predictive Holt linear revenue forecasting with confidence intervals, evidence-based decision guidance, and mathematical scenario modeling.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <DataSourceBadge source="sandbox" size="sm" />
          <DataSourceBadge source="synthetic" size="sm" />
        </div>
      </div>

      {/* Analytics Date-Range Filter & Cash Flow Summary Bar */}
      <div className="fintech-card p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <form onSubmit={handleApplyDateFilter} className="flex flex-wrap items-center gap-2 text-xs">
          <label htmlFor="dash-date-from" className="font-semibold text-slate-600 dark:text-[#8EA1C7]">From:</label>
          <input
            id="dash-date-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="py-1.5 px-2.5 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#18366E] text-slate-800 dark:text-white"
          />
          <label htmlFor="dash-date-to" className="font-semibold text-slate-600 dark:text-[#8EA1C7]">To:</label>
          <input
            id="dash-date-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="py-1.5 px-2.5 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#18366E] text-slate-800 dark:text-white"
          />
          <button
            type="submit"
            className="px-3.5 py-1.5 rounded-full bg-[#0070BA] hover:bg-[#005EA6] text-white font-bold"
          >
            Apply Range
          </button>
          {(dateFrom || dateTo || filteredSummary) && (
            <button
              type="button"
              onClick={() => {
                setDateFrom('');
                setDateTo('');
                setFilteredSummary(null);
                setSummaryFilterError(null);
              }}
              className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-[#0E2046] text-slate-700 dark:text-white font-semibold"
            >
              Clear
            </button>
          )}
          {summaryFilterError && <span className="text-rose-600 text-[11px] font-semibold">{summaryFilterError}</span>}
        </form>

        <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
          <div>
            <span className="text-slate-500 dark:text-[#7E96C4] font-sans mr-1">Expenses:</span>
            <span className="font-bold text-rose-600 dark:text-rose-400">-${totalExpenses.toFixed(2)}</span>
          </div>
          <div>
            <span className="text-slate-500 dark:text-[#7E96C4] font-sans mr-1">Net Cash Flow:</span>
            <span className={`font-bold ${netCashFlow >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
              ${netCashFlow.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Primary KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Gross Payment Volume"
          value={isLoading && transactions.length === 0 ? '...' : `$${totalVolume.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          subtitle={`${totalTransactions} transactions recorded`}
          icon={DollarSign}
          accentColor="blue"
          change={growthRate !== null ? { value: `${growthRate >= 0 ? '+' : ''}${growthRate}%`, isPositive: growthRate >= 0 } : undefined}
        />
        <StatCard
          title="PayPal Transaction Fees"
          value={`$${totalFees.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          subtitle={`${confirmedCoverage}% confirmed via PayPal capture`}
          icon={Percent}
          accentColor="amber"
          badge={
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-[#FFC439] border border-amber-500/30 font-bold">
              {confirmedCoverage > 50 ? 'Actual Fee Match' : 'Estimated'}
            </span>
          }
        />
        <StatCard
          title="Net Settled Balance"
          value={`$${totalNetReceived.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          subtitle="Available in merchant balance"
          icon={Wallet}
          accentColor="emerald"
        />
        <StatCard
          title="Seller Health Standing"
          value={`${healthMetrics.healthScore}/100`}
          subtitle={`Dispute Rate: ${healthMetrics.disputeRate}% (Max 1%)`}
          icon={Activity}
          accentColor="cyan"
          badge={
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-[#0070BA]/15 text-[#0070BA] dark:text-[#38BDF8] border border-[#0070BA]/30 font-bold">
              Isolation Forest
            </span>
          }
        />
      </div>

      {/* --- PHASE 7: MULTI-PERIOD COMPARISON & PERFORMANCE INTELLIGENCE --- */}
      <div className="bg-white dark:bg-[#081329] border border-slate-200 dark:border-[#162F64] rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#0070BA]/10 text-[#0070BA] dark:text-[#38BDF8]">
              <Compass className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                  Period Performance Intelligence
                </h2>
                {periodComparison && (
                  <span className={`text-[10px] uppercase font-mono px-2 py-0.5 rounded-full font-extrabold border ${
                    periodComparison.trendDirection === 'GROWTH'
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                      : periodComparison.trendDirection === 'DECLINE'
                      ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30'
                      : 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30'
                  }`}>
                    {periodComparison.trendDirection}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-[#7E96C4]">
                Period-over-period comparative metrics: gross volume, net revenue, fees, and ticket sizes
              </p>
            </div>
          </div>

          {/* Period selector */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#050C1C] p-1 rounded-xl border border-slate-200 dark:border-[#18366E] text-xs">
            {(['daily', 'weekly', 'monthly', 'yearly'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setComparisonPeriod(p)}
                className={`px-3 py-1 rounded-lg font-bold capitalize transition-all ${
                  comparisonPeriod === p
                    ? 'bg-[#0070BA] text-white shadow-sm'
                    : 'text-slate-600 dark:text-[#7E96C4] hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {isComparisonLoading ? (
          <div className="py-6 text-center text-xs text-slate-400">Loading period comparison...</div>
        ) : periodComparison ? (
          <div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-3">
              {/* Gross Volume Delta */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#162F64]">
                <div className="text-[10px] uppercase text-slate-400 font-bold mb-1">Gross Volume</div>
                <div className="text-sm font-mono font-bold text-slate-900 dark:text-white">
                  ${periodComparison.metrics.grossVolume.current.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <div className={`text-[10px] font-bold mt-1 flex items-center gap-1 ${
                  periodComparison.metrics.grossVolume.deltaPct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                }`}>
                  {periodComparison.metrics.grossVolume.deltaPct >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  <span>{periodComparison.metrics.grossVolume.deltaPct >= 0 ? '+' : ''}{periodComparison.metrics.grossVolume.deltaPct}%</span>
                </div>
              </div>

              {/* Net Revenue Delta */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#162F64]">
                <div className="text-[10px] uppercase text-slate-400 font-bold mb-1">Net Settled</div>
                <div className="text-sm font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  ${periodComparison.metrics.netRevenue.current.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <div className={`text-[10px] font-bold mt-1 flex items-center gap-1 ${
                  periodComparison.metrics.netRevenue.deltaPct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                }`}>
                  {periodComparison.metrics.netRevenue.deltaPct >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  <span>{periodComparison.metrics.netRevenue.deltaPct >= 0 ? '+' : ''}{periodComparison.metrics.netRevenue.deltaPct}%</span>
                </div>
              </div>

              {/* Fees Paid Delta */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#162F64]">
                <div className="text-[10px] uppercase text-slate-400 font-bold mb-1">Fees Deducted</div>
                <div className="text-sm font-mono font-bold text-[#B45309] dark:text-[#FFC439]">
                  ${periodComparison.metrics.feesPaid.current.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <div className={`text-[10px] font-bold mt-1 flex items-center gap-1 ${
                  periodComparison.metrics.feesPaid.deltaPct <= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                }`}>
                  <span>{periodComparison.metrics.feesPaid.deltaPct >= 0 ? '+' : ''}{periodComparison.metrics.feesPaid.deltaPct}% vs prev</span>
                </div>
              </div>

              {/* Refund Volume */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#162F64]">
                <div className="text-[10px] uppercase text-slate-400 font-bold mb-1">Refund Volume</div>
                <div className="text-sm font-mono font-bold text-slate-900 dark:text-white">
                  ${periodComparison.metrics.refundAmount.current.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  Prev: ${periodComparison.metrics.refundAmount.previous.toFixed(2)}
                </div>
              </div>

              {/* Payment Success Rate */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#162F64]">
                <div className="text-[10px] uppercase text-slate-400 font-bold mb-1">Success Ratio</div>
                <div className="text-sm font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {periodComparison.metrics.successRate.current.toFixed(1)}%
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  Decline: {periodComparison.metrics.failureRate.current.toFixed(1)}%
                </div>
              </div>

              {/* Average Ticket Size */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#162F64]">
                <div className="text-[10px] uppercase text-slate-400 font-bold mb-1">Average Ticket</div>
                <div className="text-sm font-mono font-bold text-slate-900 dark:text-white">
                  ${periodComparison.metrics.averageTicket.current.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  Prev: ${periodComparison.metrics.averageTicket.previous.toFixed(2)}
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[#0070BA]/5 dark:bg-[#0070BA]/10 border border-[#0070BA]/20 text-xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-[#0070BA] shrink-0" />
                <span className="text-slate-700 dark:text-slate-200">{periodComparison.summaryText}</span>
              </div>
              <span className="text-[10px] font-mono text-slate-500 shrink-0">
                {periodComparison.currentPeriodLabel} vs {periodComparison.previousPeriodLabel}
              </span>
            </div>
          </div>
        ) : null}
      </div>

      {/* Status Breakdown Bar */}
      {analyticsSummary && (
        <div className="bg-white dark:bg-[#081329] border border-slate-200 dark:border-[#162F64] rounded-2xl p-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#0070BA] dark:text-[#38BDF8]" />
              <span className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">
                Transaction Status Intelligence
              </span>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-[#7E96C4]">
              Ledger Settlement Classification
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40">
              <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400 text-xs font-bold mb-1">
                <span className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Completed</span>
                <span className="font-mono">{analyticsSummary.statusBreakdown.COMPLETED?.count || 0}</span>
              </div>
              <div className="text-xs font-mono font-bold text-slate-900 dark:text-white">
                ${(analyticsSummary.statusBreakdown.COMPLETED?.volume || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5">Settled to balance</div>
            </div>

            <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40">
              <div className="flex items-center justify-between text-amber-700 dark:text-amber-400 text-xs font-bold mb-1">
                <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Pending</span>
                <span className="font-mono">{analyticsSummary.statusBreakdown.PENDING?.count || 0}</span>
              </div>
              <div className="text-xs font-mono font-bold text-slate-900 dark:text-white">
                ${(analyticsSummary.statusBreakdown.PENDING?.volume || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">Authorization held</div>
            </div>

            <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/40">
              <div className="flex items-center justify-between text-blue-700 dark:text-blue-400 text-xs font-bold mb-1">
                <span className="flex items-center gap-1"><RotateCcw className="w-3.5 h-3.5" /> Refunded</span>
                <span className="font-mono">{analyticsSummary.statusBreakdown.REFUNDED?.count || 0}</span>
              </div>
              <div className="text-xs font-mono font-bold text-slate-900 dark:text-white">
                ${(analyticsSummary.statusBreakdown.REFUNDED?.volume || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-blue-600 dark:text-blue-400 mt-0.5">Returned to buyer</div>
            </div>

            <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800/40">
              <div className="flex items-center justify-between text-rose-700 dark:text-rose-400 text-xs font-bold mb-1">
                <span className="flex items-center gap-1"><Ban className="w-3.5 h-3.5" /> Denied</span>
                <span className="font-mono">{analyticsSummary.statusBreakdown.DENIED?.count || 0}</span>
              </div>
              <div className="text-xs font-mono font-bold text-slate-900 dark:text-white">
                ${(analyticsSummary.statusBreakdown.DENIED?.volume || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-rose-600 dark:text-rose-400 mt-0.5">Blocked by rules</div>
            </div>

            <div className="p-2.5 rounded-xl bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800/40">
              <div className="flex items-center justify-between text-orange-700 dark:text-orange-400 text-xs font-bold mb-1">
                <span className="flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> Disputed</span>
                <span className="font-mono">{analyticsSummary.statusBreakdown.DISPUTED?.count || 0}</span>
              </div>
              <div className="text-xs font-mono font-bold text-slate-900 dark:text-white">
                ${(analyticsSummary.statusBreakdown.DISPUTED?.volume || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-orange-600 dark:text-orange-400 mt-0.5">Resolution Center</div>
            </div>
          </div>
        </div>
      )}

      {/* Critical Security & Anomaly Notification */}
      {anomalyCount > 0 && (
        <div className="rounded-2xl border border-rose-300 dark:border-rose-900/60 bg-rose-50 dark:bg-gradient-to-r dark:from-rose-950/50 dark:via-[#0A142C] dark:to-[#0A142C] p-4 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30">
              <AlertTriangle className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-extrabold text-rose-950 dark:text-rose-200">
                  {anomalyCount} Unusual Transaction Patterns Flagged
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-200 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800 font-bold">
                  Seller Alert
                </span>
              </div>
              <p className="text-xs text-rose-800/80 dark:text-[#9BB0D6] mt-1">
                Finova flagged transactions with velocity spikes (order values deviating 3x from baseline), disposable customer emails, or high-risk origin IPs.
              </p>
            </div>
          </div>
          <button
            onClick={() => onNavigate('transactions')}
            className="group btn-press shrink-0 px-4 py-2 rounded-full bg-rose-600 hover:bg-rose-700 dark:bg-rose-500/20 dark:hover:bg-rose-500/30 text-white dark:text-rose-300 border border-transparent dark:border-rose-500/40 text-xs font-bold flex items-center gap-1.5 shadow-sm"
          >
            <span>Review Anomaly Ledger</span>
            <ChevronRight className="m-arrow w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* --- PREDICTIVE FORECASTING & CHARTS (PHASE 7 INTEGRATED) --- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Transaction Flow & Forecast Chart (2 cols) */}
        <div className="lg:col-span-2 rounded-2xl bg-white dark:bg-[#081329] border border-slate-200 dark:border-[#162F64] p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                  {forecastMode === 'forecast' ? 'Predictive Revenue Forecast & Error Bands' : 'PayPal Volume & Fee Trajectory'}
                </h2>
                {forecastMode === 'forecast' && (
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#0070BA]/15 text-[#0070BA] dark:text-[#38BDF8] border border-[#0070BA]/30">
                    Holt's Linear (α=0.3, β=0.1)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-[#7E96C4]">
                {forecastMode === 'forecast'
                  ? `Statistical projection (${forecastHorizon} periods) with 80% / 95% confidence intervals`
                  : 'Aggregated gross payments vs commercial fee deductions'}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Mode Toggle: Historical vs Forecast */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#050C1C] p-1 rounded-xl border border-slate-200 dark:border-[#18366E] text-xs">
                <button
                  onClick={() => setForecastMode('historical')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                    forecastMode === 'historical'
                      ? 'bg-[#0070BA] text-white shadow-sm'
                      : 'text-slate-600 dark:text-[#7E96C4]'
                  }`}
                >
                  Historical
                </button>
                <button
                  onClick={() => setForecastMode('forecast')}
                  className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 transition-all ${
                    forecastMode === 'forecast'
                      ? 'bg-[#003087] text-white shadow-sm'
                      : 'text-slate-600 dark:text-[#7E96C4]'
                  }`}
                >
                  <Cpu className="w-3 h-3" />
                  <span>Forecast +{forecastHorizon}</span>
                </button>
              </div>

              {/* Interactive Period Switcher */}
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#050C1C] p-1 rounded-xl border border-slate-200 dark:border-[#18366E] text-xs">
                {(['daily', 'weekly', 'monthly'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => onChangePeriod && onChangePeriod(p)}
                    className={`px-2.5 py-1 rounded-lg font-bold capitalize transition-all ${
                      selectedPeriod === p
                        ? 'bg-slate-800 dark:bg-slate-700 text-white shadow-sm'
                        : 'text-slate-600 dark:text-[#7E96C4]'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Forecast Summary Badges when active */}
          {forecastMode === 'forecast' && forecastData && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 p-3 rounded-xl bg-sky-50/60 dark:bg-[#0B1A3A]/50 border border-sky-200/80 dark:border-[#18366E] text-xs">
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-bold">Projected Gross Volume</span>
                <div className="text-sm font-mono font-bold text-slate-900 dark:text-white">
                  ${forecastData.projectedTotalVolume.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-bold">Projected Fees</span>
                <div className="text-sm font-mono font-bold text-[#B45309] dark:text-[#FFC439]">
                  ${forecastData.projectedTotalFees.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-bold">Projected Net Revenue</span>
                <div className="text-sm font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  ${forecastData.projectedTotalNet.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-4 text-xs mb-3">
            <div className="flex items-center gap-1.5 text-slate-700 dark:text-white font-bold">
              <span className="w-2.5 h-2.5 rounded-full bg-[#0070BA]"></span>
              <span>{forecastMode === 'forecast' ? 'Volume (Actual / Proj)' : 'Gross Volume ($)'}</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-700 dark:text-white font-bold">
              <span className="w-2.5 h-2.5 rounded-full bg-[#E5A800] dark:bg-[#FFC439]"></span>
              <span>PayPal Fee ($)</span>
            </div>
            {forecastMode === 'forecast' && (
              <div className="flex items-center gap-1.5 text-[#0070BA] dark:text-[#38BDF8] font-bold">
                <span className="w-2.5 h-2.5 rounded-full bg-[#0070BA] opacity-70"></span>
                <span>Confidence Error Band</span>
              </div>
            )}
          </div>

          <div className="h-64 w-full">
            {chartData.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 dark:border-[#18366E] text-center p-6">
                <BarChart3 className="w-7 h-7 text-slate-400 mb-2" />
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">No transaction trend data yet</p>
                <p className="text-[11px] text-slate-500 dark:text-[#7E96C4] mt-1">
                  Add a transaction or simulate a PayPal Sandbox checkout to visualize real volume and fee trajectories.
                </p>
              </div>
            ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="paypalBlueGlow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0070BA" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#0070BA" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="paypalYellowGlow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#FFC439" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#FFC439" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="confidenceBandGlow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366F1" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#6366F1" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#CBD5E1" opacity={0.3} vertical={false} />
                <XAxis dataKey="day" stroke="#64748B" fontSize={11} tickLine={false} />
                <YAxis stroke="#64748B" fontSize={11} tickLine={false} tickFormatter={(val) => `$${val}`} />
                <Tooltip content={<CustomChartTooltip />} />
                {forecastMode === 'forecast' && (
                  <Area
                    type="monotone"
                    dataKey="upperConfidence"
                    name="upperConfidence"
                    stroke="#6366F1"
                    strokeDasharray="4 4"
                    strokeWidth={1}
                    fillOpacity={1}
                    fill="url(#confidenceBandGlow)"
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="volume"
                  name="volume"
                  stroke={forecastMode === 'forecast' ? '#6366F1' : '#0070BA'}
                  strokeWidth={2.5}
                  strokeDasharray={forecastMode === 'forecast' ? '3 3' : undefined}
                  fillOpacity={1}
                  fill="url(#paypalBlueGlow)"
                />
                <Area
                  type="monotone"
                  dataKey="fee"
                  name="fee"
                  stroke="#E5A800"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#paypalYellowGlow)"
                />
              </AreaChart>
            </ResponsiveContainer>
            )}
          </div>

          {forecastMode === 'forecast' && (
            <div className="mt-3 p-2.5 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#162F64] text-[11px] text-slate-500 dark:text-[#7E96C4] flex items-center gap-2">
              <Info className="w-3.5 h-3.5 text-[#0070BA] shrink-0" />
              <span>
                Forecast Model: Mathematical projections based on historical transaction velocity and exponential smoothing. Estimates do not guarantee future PayPal captures.
              </span>
            </div>
          )}
        </div>

        {/* AI-Generated Real-time Insights (1 col) */}
        <div className="rounded-2xl bg-white dark:bg-[#081329] border border-slate-200 dark:border-[#162F64] p-5 flex flex-col justify-between shadow-sm">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-[#0070BA]/15 text-[#0070BA]">
                  <Sparkles className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">Transaction Intelligence</h2>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#0070BA]/15 text-[#0070BA] dark:text-[#38BDF8] border border-[#0070BA]/30 font-bold">
                Finova AI Engine
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-[#7E96C4] mb-3">
              Evidence-based fee audits, conversion spread reductions, and risk defense.
            </p>

            <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
              {aiInsights && aiInsights.length > 0 ? (
                aiInsights.map((insight) => (
                  <div
                    key={insight.id}
                    className={`p-3.5 rounded-xl border text-xs ${
                      insight.severity === 'critical'
                        ? 'bg-rose-50/60 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/50'
                        : insight.severity === 'warning'
                        ? 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50'
                        : 'bg-slate-50 dark:bg-[#050C1C] border-slate-200 dark:border-[#162F64]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className={`font-bold ${
                        insight.severity === 'critical'
                          ? 'text-rose-700 dark:text-rose-400'
                          : insight.severity === 'warning'
                          ? 'text-[#B45309] dark:text-[#FFC439]'
                          : 'text-[#0070BA] dark:text-[#38BDF8]'
                      }`}>
                        {insight.title}
                      </span>
                      {insight.potentialSavings && (
                        <span className="shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-bold">
                          {insight.potentialSavings}
                        </span>
                      )}
                    </div>
                    <p className="text-slate-600 dark:text-[#9BB0D6] leading-relaxed mb-2">
                      {insight.summary}
                    </p>
                    {insight.evidence && insight.evidence.length > 0 && (
                      <div className="text-[11px] space-y-1 mb-2 pt-2 border-t border-slate-200/60 dark:border-[#162F64]/60">
                        {insight.evidence.map((ev, idx) => (
                          <div key={idx} className="text-slate-500 dark:text-[#7E96C4] flex items-start gap-1">
                            <span className="text-[#0070BA]">•</span>
                            <span>{ev}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="p-2 rounded-lg bg-white/70 dark:bg-[#081329]/80 text-[11px] text-slate-700 dark:text-slate-200 font-medium">
                      <span className="font-bold text-[#0070BA] dark:text-[#38BDF8]">Action: </span>
                      {insight.recommendation}
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#162F64] text-xs">
                  <div className="flex items-center gap-1.5 text-[#0070BA] dark:text-[#38BDF8] font-bold mb-1">
                    <span>💡 Foreign Currency Conversion Spread</span>
                  </div>
                  <p className="text-slate-600 dark:text-[#9BB0D6] leading-relaxed">
                    Foreign currencies represent over 14% of your total payment volume. Retaining multi-currency balances in your PayPal merchant account saves approximately 3.5% on wholesale conversion spreads.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-200 dark:border-[#162F64] flex items-center justify-between">
            <span className="text-[11px] text-slate-500 dark:text-[#7E96C4]">Need deep settlement breakdown?</span>
            <button
              onClick={() => onNavigate('ai-assistant')}
              className="text-xs font-bold text-[#0070BA] dark:text-[#38BDF8] hover:underline flex items-center gap-1 transition-colors"
            >
              <span>Ask Finova Assistant</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* --- PHASE 7: INTELLIGENT DECISION ENGINE ACTION CENTER --- */}
      <div className="rounded-2xl bg-white dark:bg-[#081329] border border-slate-200 dark:border-[#162F64] p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Target className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                  Intelligent Decision Engine
                </h2>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                  {decisions.length} Actionable Recommendations
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-[#7E96C4]">
                Evidence-backed strategic directives with observations, supporting financial metrics, and impact assessment
              </p>
            </div>
          </div>
        </div>

        {isDecisionsLoading ? (
          <div className="py-6 text-center text-xs text-slate-400">Generating decision recommendations...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {decisions.map((dec) => (
              <div
                key={dec.id}
                className="p-4 rounded-xl border border-slate-200 dark:border-[#162F64] bg-slate-50/50 dark:bg-[#050C1C] flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full uppercase font-bold bg-[#0070BA]/10 text-[#0070BA] dark:text-[#38BDF8]">
                      {dec.category.replace('_', ' ')}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400 font-bold">
                      {dec.confidence}% Confidence
                    </span>
                  </div>

                  <h3 className="text-xs font-extrabold text-slate-900 dark:text-white mb-2">
                    {dec.title}
                  </h3>

                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Observation</span>
                      <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-[11px]">{dec.observation}</p>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Supporting Evidence</span>
                      <p className="text-slate-500 dark:text-[#7E96C4] font-mono text-[10px]">{dec.supportingData}</p>
                    </div>

                    <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px]">
                      <span className="font-bold text-amber-700 dark:text-amber-300 block mb-0.5">Financial Impact:</span>
                      <span className="text-slate-700 dark:text-slate-200">{dec.financialImpact}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-slate-200 dark:border-[#162F64]">
                  <div className="p-2.5 rounded-lg bg-[#0070BA]/10 border border-[#0070BA]/20 text-[11px] mb-2">
                    <span className="font-bold text-[#0070BA] dark:text-[#38BDF8] block mb-0.5">Recommended Action:</span>
                    <span className="text-slate-800 dark:text-slate-100">{dec.recommendedAction}</span>
                  </div>
                  <div className="text-[10px] text-slate-400 italic">
                    Limitation: {dec.limitations}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* --- PHASE 7: INTERACTIVE DECISION SCENARIO SIMULATOR --- */}
      <div className="rounded-2xl bg-white dark:bg-[#081329] border border-slate-200 dark:border-[#162F64] p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#0070BA]/10 text-[#0070BA] dark:text-[#38BDF8]">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                  Decision Scenario Simulator
                </h2>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#0070BA]/15 text-[#0070BA] dark:text-[#38BDF8] border border-[#0070BA]/30">
                  Deterministic Math Engine
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-[#7E96C4]">
                Model volume scaling, ticket adjustments, international exposure, and fee tier migrations
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Controls (5 cols) */}
          <div className="lg:col-span-5 space-y-4 p-4 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#162F64]">
            {/* Volume Growth Slider */}
            <div>
              <div className="flex justify-between text-xs font-bold mb-1">
                <span className="text-slate-700 dark:text-slate-200">Volume Scaling Adjustment</span>
                <span className="font-mono text-[#0070BA] dark:text-[#38BDF8]">
                  {simVolumeGrowth >= 0 ? '+' : ''}{simVolumeGrowth}%
                </span>
              </div>
              <input
                type="range"
                min="-30"
                max="100"
                step="5"
                value={simVolumeGrowth}
                onChange={(e) => setSimVolumeGrowth(Number(e.target.value))}
                className="w-full accent-[#0070BA] cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                <span>-30%</span>
                <span>Baseline (0%)</span>
                <span>+100%</span>
              </div>
            </div>

            {/* Average Ticket Size Slider */}
            <div>
              <div className="flex justify-between text-xs font-bold mb-1">
                <span className="text-slate-700 dark:text-slate-200">Average Basket Ticket</span>
                <span className="font-mono text-[#0070BA] dark:text-[#38BDF8]">${simAvgTicket}</span>
              </div>
              <input
                type="range"
                min="50"
                max="2500"
                step="25"
                value={simAvgTicket}
                onChange={(e) => setSimAvgTicket(Number(e.target.value))}
                className="w-full accent-[#0070BA] cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                <span>$50</span>
                <span>$1,180 (Baseline)</span>
                <span>$2,500</span>
              </div>
            </div>

            {/* Cross Border Exposure Slider */}
            <div>
              <div className="flex justify-between text-xs font-bold mb-1">
                <span className="text-slate-700 dark:text-slate-200">International / Cross-Border Share</span>
                <span className="font-mono text-[#0070BA] dark:text-[#38BDF8]">{simCrossBorder}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={simCrossBorder}
                onChange={(e) => setSimCrossBorder(Number(e.target.value))}
                className="w-full accent-[#0070BA] cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                <span>0% (Domestic only)</span>
                <span>44.4% (Current)</span>
                <span>100%</span>
              </div>
            </div>

            {/* Payment Tier Selector */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                PayPal Fee Processing Tier
              </label>
              <select
                value={simTier}
                onChange={(e) => setSimTier(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#081329] border border-slate-200 dark:border-[#162F64] text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#0070BA]"
              >
                <option value="standard">Standard Commercial (3.49% + $0.49)</option>
                <option value="micropayments">Micropayments (4.99% + $0.09)</option>
                <option value="qr_code">QR Code In-Person (1.90% + $0.10)</option>
                <option value="charity">Non-Profit / Charity (1.99% + $0.49)</option>
              </select>
            </div>
          </div>

          {/* Simulation Output Cards (7 cols) */}
          <div className="lg:col-span-7 flex flex-col justify-between space-y-4">
            {simResult ? (
              <div className="space-y-4">
                {/* Baseline vs Projected Comparison */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#162F64]">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                      Current Baseline
                    </div>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Gross Volume:</span>
                        <span className="font-mono font-bold text-slate-900 dark:text-white">
                          ${simResult.baseline.grossVolume.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">PayPal Fees:</span>
                        <span className="font-mono font-bold text-[#B45309] dark:text-[#FFC439]">
                          ${simResult.baseline.totalFees.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Net Settled:</span>
                        <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          ${simResult.baseline.netRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Effective Rate:</span>
                        <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                          {simResult.baseline.effectiveRate}%
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-sky-50/60 dark:bg-[#0B1A3A]/50 border border-sky-200/80 dark:border-[#18366E]">
                    <div className="text-[10px] font-bold text-[#0070BA] dark:text-[#38BDF8] uppercase tracking-wider mb-2">
                      Simulated Projections
                    </div>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Gross Volume:</span>
                        <span className="font-mono font-bold text-slate-900 dark:text-white">
                          ${simResult.projected.grossVolume.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">PayPal Fees:</span>
                        <span className="font-mono font-bold text-[#B45309] dark:text-[#FFC439]">
                          ${simResult.projected.totalFees.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Net Settled:</span>
                        <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          ${simResult.projected.netRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Effective Rate:</span>
                        <span className="font-mono font-bold text-[#0070BA] dark:text-[#38BDF8]">
                          {simResult.projected.effectiveRate}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Net Variance Summary Card */}
                <div className={`p-3.5 rounded-xl border flex items-center justify-between ${
                  simResult.variance.isNetProfitable
                    ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40'
                    : 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/40'
                }`}>
                  <div className="flex items-center gap-2.5">
                    <div className={`p-2 rounded-lg ${
                      simResult.variance.isNetProfitable
                        ? 'bg-emerald-500 text-white'
                        : 'bg-rose-500 text-white'
                    }`}>
                      {simResult.variance.isNetProfitable ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white">
                        Net Revenue Variance Delta
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Volume Delta: {simResult.variance.volumeDelta >= 0 ? '+' : ''}${simResult.variance.volumeDelta.toLocaleString('en-US', { minimumFractionDigits: 2 })} | Fee Delta: {simResult.variance.feeDelta >= 0 ? '+' : ''}${simResult.variance.feeDelta.toFixed(2)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-base font-mono font-extrabold ${
                      simResult.variance.isNetProfitable ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                    }`}>
                      {simResult.variance.netDelta >= 0 ? '+' : ''}${simResult.variance.netDelta.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                    <span className="text-[10px] uppercase font-bold text-slate-400">Net Merchant Impact</span>
                  </div>
                </div>

                {/* Mathematical Assumptions */}
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Assumptions in this model:</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {simResult.assumptions.map((asmp, i) => (
                      <div key={i} className="text-[11px] text-slate-600 dark:text-slate-300 flex items-start gap-1">
                        <span className="text-[#0070BA]">•</span>
                        <span>{asmp}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="text-[10px] text-slate-400 italic pt-2 border-t border-slate-100 dark:border-[#162F64]">
              {simResult?.disclaimer || "Projections are mathematical estimates and not PayPal guarantees."}
            </div>
          </div>
        </div>
      </div>

      {/* Spending and Revenue Pattern Analytics (Currencies, Rails, Ticket Brackets) */}
      {patternsData && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Currency Distribution Card */}
          <div className="rounded-2xl bg-white dark:bg-[#081329] border border-slate-200 dark:border-[#162F64] p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-[#0070BA] dark:text-[#38BDF8]" />
                <h3 className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">
                  Currency Distribution
                </h3>
              </div>
              <span className="text-[10px] text-slate-500 dark:text-[#7E96C4]">Portfolio Share</span>
            </div>
            <div className="space-y-3">
              {patternsData.currencyDistribution.map((c) => (
                <div key={c.currency} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800 dark:text-slate-200">{c.currency}</span>
                    <span className="font-mono text-slate-600 dark:text-[#9BB0D6]">
                      {c.volume.toLocaleString('en-US', { minimumFractionDigits: 2 })} ({c.percentage}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-[#050C1C] h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        c.currency === 'USD'
                          ? 'bg-[#0070BA]'
                          : c.currency === 'EUR'
                          ? 'bg-[#FFC439]'
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, c.percentage)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>{c.count} orders</span>
                    <span>Fees: ${c.totalFees.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Payment Method / Rail Distribution Card */}
          <div className="rounded-2xl bg-white dark:bg-[#081329] border border-slate-200 dark:border-[#162F64] p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-[#0070BA] dark:text-[#38BDF8]" />
                <h3 className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">
                  Payment Rail Share
                </h3>
              </div>
              <span className="text-[10px] text-slate-500 dark:text-[#7E96C4]">Checkout Rails</span>
            </div>
            <div className="space-y-3">
              {patternsData.paymentRailDistribution.map((rail) => (
                <div key={rail.method} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800 dark:text-slate-200">{rail.method}</span>
                    <span className="font-mono text-slate-600 dark:text-[#9BB0D6]">
                      ${rail.volume.toLocaleString('en-US', { minimumFractionDigits: 2 })} ({rail.percentage}%)
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-[#050C1C] h-2 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#0070BA] to-[#38BDF8]"
                      style={{ width: `${Math.min(100, rail.percentage)}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-slate-400 text-right">
                    {rail.count} transactions
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Order Basket Ticket Brackets */}
          <div className="rounded-2xl bg-white dark:bg-[#081329] border border-slate-200 dark:border-[#162F64] p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <PieChartIcon className="w-4 h-4 text-[#0070BA] dark:text-[#38BDF8]" />
                <h3 className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">
                  Ticket Size Brackets
                </h3>
              </div>
              <span className="text-[10px] text-slate-500 dark:text-[#7E96C4]">Basket Values</span>
            </div>
            <div className="space-y-2.5">
              {patternsData.ticketBrackets.map((bracket) => (
                <div
                  key={bracket.bracket}
                  className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200/60 dark:border-[#162F64]/60 text-xs"
                >
                  <div>
                    <div className="font-bold text-slate-800 dark:text-slate-200">{bracket.bracket}</div>
                    <div className="text-[10px] text-slate-400">{bracket.count} orders</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-bold text-slate-900 dark:text-white">
                      ${bracket.volume.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-[10px] text-[#0070BA] dark:text-[#38BDF8] font-bold">
                      {bracket.percentage}% volume
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Recent PayPal Transactions Table with Status Filters */}
      <div className="rounded-2xl bg-white dark:bg-[#081329] border border-slate-200 dark:border-[#162F64] p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <span>Recent PayPal Sandbox Transactions</span>
              <span className="text-xs font-normal text-slate-500 dark:text-[#7E96C4]">
                ({filteredRecentTransactions.length} of {transactions.length} records shown)
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-[#7E96C4]">
              Tracking PayPal Order IDs, gross amounts, actual capture deductions, and seller risk
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Quick Status Filter Chips */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#050C1C] p-1 rounded-xl border border-slate-200 dark:border-[#18366E] text-xs">
              {(['ALL', 'COMPLETED', 'PENDING', 'DENIED', 'REFUNDED'] as const).map((st) => (
                <button
                  key={st}
                  onClick={() => setTableStatusFilter(st)}
                  className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all ${
                    tableStatusFilter === st
                      ? 'bg-[#0070BA] text-white shadow-sm'
                      : 'text-slate-600 dark:text-[#7E96C4] hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            <button
              onClick={() => onNavigate('transactions')}
              className="text-xs font-bold px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#0E2046] dark:hover:bg-[#142D62] text-[#003087] dark:text-white border border-slate-200 dark:border-[#20438A] flex items-center gap-1.5 transition-colors"
            >
              <span>Full Ledger</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-[#050C1C] text-slate-600 dark:text-[#7E96C4] uppercase tracking-wider font-semibold border-b border-slate-200 dark:border-[#162F64]">
              <tr>
                <th className="py-3 px-3">Transaction / Order</th>
                <th className="py-3 px-3">Buyer</th>
                <th className="py-3 px-3">Gross Amount</th>
                <th className="py-3 px-3">PayPal Fee</th>
                <th className="py-3 px-3">Net Settled</th>
                <th className="py-3 px-3">Status</th>
                <th className="py-3 px-3">Seller Protection / Risk</th>
                <th className="py-3 px-3">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#132854] font-medium">
              {filteredRecentTransactions.slice(0, 8).map((txn) => (
                <tr
                  key={txn.id}
                  onClick={() => onSelectTransaction(txn)}
                  className="hover:bg-slate-50 dark:hover:bg-[#0E214A] transition-colors cursor-pointer group"
                >
                  <td className="py-3.5 px-3">
                    <div className="font-mono text-slate-900 dark:text-white group-hover:text-[#0070BA] dark:group-hover:text-[#38BDF8] transition-colors font-bold">
                      {txn.id}
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-[#7E96C4] font-mono">
                      Order: {txn.paypalOrderId || 'Direct API'}
                    </div>
                  </td>
                  <td className="py-3.5 px-3">
                    <div className="text-slate-900 dark:text-slate-100 font-bold">{txn.customerName}</div>
                    <div className="text-[11px] text-slate-500 dark:text-[#7E96C4] truncate max-w-[150px]">
                      {txn.customerEmail}
                    </div>
                  </td>
                  <td className="py-3.5 px-3 font-mono font-bold text-slate-900 dark:text-white">
                    {txn.amount.toFixed(2)} {txn.currency}
                  </td>
                  <td className="py-3.5 px-3 font-mono text-[#B45309] dark:text-[#FFC439] font-bold">
                    -${(txn.actualFee ?? txn.estimatedFee).toFixed(2)}
                    {txn.actualFee ? (
                      <span className="ml-1 text-[9px] uppercase px-1 py-0.2 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold">
                        Actual
                      </span>
                    ) : (
                      <span className="ml-1 text-[9px] uppercase px-1 py-0.2 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                        Est
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-3 font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                    ${txn.netAmount.toFixed(2)}
                  </td>
                  <td className="py-3.5 px-3">
                    <StatusBadge status={txn.status} size="sm" />
                  </td>
                  <td className="py-3.5 px-3">
                    <div className="flex items-center gap-1.5">
                      <RiskBadge level={txn.riskLevel} score={txn.riskScore} size="sm" />
                      {txn.isAnomaly && (
                        <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" title="Anomaly flagged by Finova" />
                      )}
                    </div>
                  </td>
                  <td className="py-3.5 px-3">
                    <DataSourceBadge source={txn.dataSource} size="sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
