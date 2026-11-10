export type NavigationTab = 
  | 'dashboard' 
  | 'transactions' 
  | 'cost-optimizer' 
  | 'scam-shield' 
  | 'account-health' 
  | 'ai-assistant' 
  | 'settings';

export type DataSourceType = 'sandbox' | 'synthetic';

export type TransactionStatus = 'COMPLETED' | 'PENDING' | 'REFUNDED' | 'DENIED' | 'DISPUTED';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type PaymentMethod = 'PayPal Wallet' | 'Credit/Debit Card' | 'Venmo' | 'Pay in 4';

export interface Transaction {
  id: string;
  paypalOrderId?: string;
  customerName: string;
  customerEmail: string;
  amount: number;
  currency: string;
  status: TransactionStatus;
  date: string;
  estimatedFee: number;
  actualFee?: number;
  netAmount: number;
  paymentMethod: PaymentMethod;
  country: string;
  riskScore: number; // 0 - 100
  riskLevel: RiskLevel;
  isAnomaly: boolean;
  anomalyReason?: string;
  dataSource: DataSourceType;
}

export interface ScamAnalysisResult {
  id: string;
  timestamp: string;
  targetType: 'message' | 'url' | 'email' | 'sms' | 'whatsapp' | 'payment_request' | 'notification';
  inputSnippet: string;
  riskScore: number; // 0 - 100
  riskLevel: RiskLevel;
  confidence: number; // 0 - 100
  threatCategory?: string;
  channel?: string;
  indicators: {
    category: string;
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    evidenceSnippet?: string;
  }[];
  safeActions: string[];
  safeInspectionDetails?: {
    rawUrl?: string;
    domain?: string;
    protocol?: string;
    topLevelDomain?: string;
    isVerifiedPayPalDomain?: boolean;
    hasPunycode?: boolean;
    isIpAddress?: boolean;
    isShortener?: boolean;
    suspiciousKeywordsFound?: string[];
    threatSignals?: string[];
  };
  dataSource: DataSourceType;
  disclaimer?: string;
}

export interface ThreatDistributionResponse {
  totalScans: number;
  distribution: {
    CRITICAL: { count: number; percentage: number };
    HIGH: { count: number; percentage: number };
    MEDIUM: { count: number; percentage: number };
    LOW: { count: number; percentage: number };
  };
  averageRiskScore: number;
  threatIndicatorsFound: number;
}

export interface FeeCalculationRequest {
  amount: number;
  sourceCurrency: string;
  targetCurrency: string;
  isInternational: boolean;
  paymentMethod: 'standard_merchant' | 'qr_code' | 'micropayments' | 'charity';
}

export interface FeeCalculationResult {
  grossAmount: number;
  fixedFee: number;
  percentageFee: number;
  estimatedTotalFee: number;
  estimatedNetReceived: number;
  effectiveFeeRate: number; // e.g. 3.49%
  currencyConversionCost: number;
  exchangeRateUsed: number;
  comparisons: {
    method: string;
    fee: number;
    savings: number;
    recommended: boolean;
  }[];
  aiAdvice: string[];
}

export interface AnomalyEvent {
  id: string;
  transactionId: string;
  date: string;
  customerName: string;
  amount: number;
  currency: string;
  status: string;
  riskScore: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  reason: string;
  isolationScore?: number;
}

export interface RiskIndicatorItem {
  id: string;
  name: string;
  value: number;
  unit: string;
  benchmark: string;
  status: string;
  severity: 'healthy' | 'warning' | 'critical';
  description: string;
}

export interface EarlyWarningAlert {
  id: string;
  title: string;
  triggerMetric: string;
  severity: 'info' | 'warning' | 'critical';
  consequence: string;
  mitigation: string;
}

export interface HealthScoreBreakdown {
  baseScore: number;
  disputeDeduction: number;
  refundDeduction: number;
  failureDeduction: number;
  anomalyDeduction: number;
  volatilityDeduction: number;
  finalScore: number;
}

export interface BehaviorMetrics {
  totalTransactions: number;
  totalVolume: number;
  averageAmount: number;
  medianAmount: number;
  stdAmount: number;
  maxAmount: number;
  completedCount: number;
  deniedCount: number;
  refundedCount: number;
  disputedCount: number;
  pendingCount: number;
  successRate: number;
  failureRate: number;
  refundRate: number;
  disputeRate: number;
  velocityPerDay: number;
  volumeVolatility: number;
  internationalRatio: number;
  currencyDistribution: Record<string, number>;
}

export interface HealthModelMeta {
  algorithm: string;
  sampleSize: number;
  confidenceScore: number;
  mode: string;
  disclaimer: string;
}

export interface HealthSimulationRequest {
  additionalDisputes: number;
  additionalRefunds: number;
  additionalFailures: number;
  volumeSpikeMultiplier: number;
}

export interface HealthSimulationResponse {
  currentScore: number;
  currentTier: 'Healthy' | 'Stable' | 'Needs Attention' | 'High Concern';
  simulatedScore: number;
  simulatedTier: 'Healthy' | 'Stable' | 'Needs Attention' | 'High Concern';
  scoreDelta: number;
  isScoreDegraded: boolean;
  simulatedBreakdown: HealthScoreBreakdown;
  simulatedRiskIndicators: RiskIndicatorItem[];
  earlyWarnings: EarlyWarningAlert[];
  safetyMarginText: string;
  maxDisputesTolerated: number;
}

export interface AccountHealthMetrics {
  healthScore: number; // 0 - 100 (100 = perfectly healthy)
  healthTier?: 'Healthy' | 'Stable' | 'Needs Attention' | 'High Concern';
  healthStatus: 'Excellent' | 'Good' | 'Fair' | 'At Risk' | 'Needs Attention';
  disputeRate: number; // percentage
  refundRate: number;
  failureRate?: number;
  anomalyRatio: number;
  suddenSpikeDetected: boolean;
  isolationForestScore: number; // -1 to 1
  safetyMarginText?: string;
  maxDisputesTolerated?: number;
  scoreBreakdown?: HealthScoreBreakdown;
  behaviorMetrics?: BehaviorMetrics;
  riskIndicators?: RiskIndicatorItem[];
  detectedAnomalies?: AnomalyEvent[];
  earlyWarnings?: EarlyWarningAlert[];
  modelMeta?: HealthModelMeta;
  trends: {
    period: string;
    healthScore: number;
    transactionVolume: number;
    anomalyCount: number;
    disputeRate: number;
  }[];
  preventiveRecommendations: {
    id: string;
    title: string;
    severity: 'info' | 'warning' | 'critical';
    action: string;
    impact: string;
  }[];
  dataSource: DataSourceType;
}

export interface FinancialCardMetric {
  label: string;
  value: string;
  subtext?: string;
  accentColor?: 'emerald' | 'blue' | 'amber' | 'rose' | 'cyan';
}

export interface FinancialCardItem {
  id: string;
  title: string;
  subtitle: string;
  amount?: string;
  badge?: string;
  badgeColor?: 'emerald' | 'blue' | 'amber' | 'rose';
  detail?: string;
}

export interface FinancialSummaryCard {
  type: 'metric_summary' | 'transaction_spotlight' | 'transaction_list' | 'recommendation_list' | 'health_badge' | 'scam_summary';
  title: string;
  subtitle?: string;
  metrics?: FinancialCardMetric[];
  items?: FinancialCardItem[];
  actionHint?: string;
}

export interface AssistantChatResponse {
  reply: string;
  category: string;
  financialCard?: FinancialSummaryCard;
  suggestedFollowUps?: string[];
  context: {
    transactionsExamined: number;
    accountHealthScore: number;
    totalVolume?: number;
    totalFees?: number;
    netAmount?: number;
  };
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  timestamp: string;
  content: string;
  category?: 'fee_explanation' | 'fraud_check' | 'transaction_query' | 'policy_guidance' | 'revenue_query' | 'highest_fee' | 'cost_reduction' | 'performance_summary' | 'general';
  financialCard?: FinancialSummaryCard;
  suggestedFollowUps?: string[];
  contextData?: {
    relatedTransactionId?: string;
    relatedMetric?: string;
  };
}

export interface MerchantSettings {
  paypalClientId: string;
  paypalClientSecretMasked: string;
  sandboxMode: boolean;
  primaryCurrency: string;
  enableAnomalyAlerts: boolean;
  enableFeeOptimizationTips: boolean;
  disputeThresholdPercent: number;
  mockDataSourceActive: boolean;
}

// --- TRANSACTION INTELLIGENCE & REVENUE ANALYTICS CONTRACTS ---

export interface StatusMetric {
  count: number;
  volume: number;
  fees: number;
  net: number;
}

export interface AnalyticsSummary {
  totalTransactions: number;
  grossPaymentVolume: number;
  completedVolume: number;
  totalNetReceived: number;
  totalFees: number;
  totalActualFees: number;
  totalEstimatedFees: number;
  confirmedFeeCoveragePct: number;
  averageTicketSize: number;
  statusBreakdown: Record<string, StatusMetric>;
  sourceBreakdown: {
    sandbox: { count: number; volume: number };
    synthetic: { count: number; volume: number };
  };
  riskMetrics: {
    anomalyCount: number;
    criticalCount: number;
    highCount: number;
    lowMediumCount: number;
    disputeRate: number;
    refundRate: number;
  };
}

export interface TrendPoint {
  periodKey: string;
  label: string;
  day: string; // compatibility with recharts
  volume: number;
  fee: number;
  net: number;
  count: number;
  anomalies: number;
  completed: number;
  pending: number;
  denied: number;
}

export interface TrendsResponse {
  period: 'daily' | 'weekly' | 'monthly';
  data: TrendPoint[];
  summary: {
    totalVolume: number;
    totalFees: number;
    netBalance: number;
    growthRatePct: number;
    dataPointCount: number;
  };
}

export interface CurrencyDistributionItem {
  currency: string;
  count: number;
  volume: number;
  usdEquivalent: number;
  percentage: number;
  totalFees: number;
}

export interface PaymentRailItem {
  method: string;
  count: number;
  volume: number;
  percentage: number;
}

export interface TicketBracketItem {
  bracket: string;
  count: number;
  volume: number;
  percentage: number;
  micropayEligible: boolean;
}

export interface PatternAnalyticsResponse {
  currencyDistribution: CurrencyDistributionItem[];
  paymentRailDistribution: PaymentRailItem[];
  ticketBrackets: TicketBracketItem[];
  geographicDistribution: {
    domesticVolume: number;
    domesticPct: number;
    internationalVolume: number;
    internationalPct: number;
  };
  statisticalBaseline?: {
    meanAmount: number;
    standardDeviation: number;
    outlierThreshold: number;
  };
  outliers: Array<{
    id: string;
    paypalOrderId?: string;
    amount: number;
    currency: string;
    status: string;
    customer: string;
    reason: string;
  }>;
}

export interface AiInsightCard {
  id: string;
  type: 'cost_optimization' | 'fraud_warning' | 'revenue_trend' | 'reconciliation';
  title: string;
  summary: string;
  evidence: string[];
  recommendation: string;
  potentialSavings?: string | null;
  severity: 'info' | 'warning' | 'critical' | 'success';
  dataSource: DataSourceType | 'hybrid';
  timestamp: string;
}

// --- ADVANCED AI COST OPTIMIZER CONTRACTS ---

export interface TierComparisonItem {
  tierId: string;
  name: string;
  description: string;
  totalFee: number;
  netReceived: number;
  effectiveRate: number;
  savingsVsCurrent: number;
  isCurrent: boolean;
  recommended: boolean;
}

export interface PredictedFeeResponse {
  grossAmount: number;
  sourceCurrency: string;
  targetCurrency: string;
  paymentTier: string;
  isInternational: boolean;
  isCurrencyConversion: boolean;
  breakdown: {
    basePercentage: number;
    basePercentageAmount: number;
    fixedFee: number;
    crossBorderPercentage: number;
    crossBorderAmount: number;
    conversionSpreadPercentage: number;
    conversionSpreadAmount: number;
    estimatedExchangeRate: number;
  };
  totalEstimatedFee: number;
  estimatedNetReceived: number;
  effectiveFeeRate: number;
  comparisons: TierComparisonItem[];
  disclaimer: string;
}

export interface CurrencyCostAnalysisItem {
  currency: string;
  transactionCount: number;
  grossVolume: number;
  totalFeesPaid: number;
  netReceived: number;
  effectiveFeeRate: number;
  reconciledActualFeeCount: number;
  conversionSpreadLossEst: number;
}

export interface HighFeeTransactionItem {
  id: string;
  paypalOrderId?: string;
  customer: string;
  amount: number;
  currency: string;
  fee: number;
  isActualFee: boolean;
  effectiveFeeRate: number;
  reasons: string[];
}

export interface MonthlyFeeTrendItem {
  month: string;
  grossVolume: number;
  feesPaid: number;
  transactionCount: number;
  effectiveFeeRate: number;
}

export interface HistoricalReconciliationItem {
  id: string;
  paypalOrderId?: string;
  amount: number;
  currency: string;
  estimatedFee: number;
  actualFee: number;
  variance: number;
  status: string;
  date: string;
}

export interface HistoricalCostAnalysis {
  reconciliation: {
    totalTransactions: number;
    reconciledCount: number;
    totalEstimatedFees: number;
    totalActualFees: number;
    variance: number;
    accuracyPct: number;
  };
  currencyAnalysis: CurrencyCostAnalysisItem[];
  highFeeTransactions: HighFeeTransactionItem[];
  monthlyFeeTrends: MonthlyFeeTrendItem[];
  recentReconciliations: HistoricalReconciliationItem[];
}

export interface CostRecommendation {
  id: string;
  category: string;
  title: string;
  description: string;
  financialImpact: string;
  effectiveSavingsPerOrder: string;
  actionSteps: string[];
  severity: 'high' | 'medium' | 'info';
  verifiedPolicySource: string;
}

export interface ScenarioItemContract {
  id: string;
  name: string;
  amount: number;
  sourceCurrency?: string;
  targetCurrency?: string;
  isInternational?: boolean;
  paymentTier?: string;
}

export interface ScenarioComparisonResult {
  scenarios: Array<{
    scenarioId: string;
    scenarioName: string;
    amount: number;
    sourceCurrency: string;
    targetCurrency: string;
    paymentTier: string;
    totalFee: number;
    netReceived: number;
    effectiveFeeRate: number;
    varianceVsBest: number;
  }>;
  recommendedScenario: {
    scenarioId: string;
    scenarioName: string;
    amount: number;
    totalFee: number;
    netReceived: number;
    effectiveFeeRate: number;
  } | null;
}

// --- ADVANCED FINANCIAL ANALYTICS & DECISION INTELLIGENCE (PHASE 7) ---

export interface ComparisonMetric {
  current: number;
  previous: number;
  delta: number;
  deltaPct: number;
}

export interface PeriodComparisonResponse {
  period: 'daily' | 'weekly' | 'monthly' | 'yearly';
  currentPeriodLabel: string;
  previousPeriodLabel: string;
  metrics: {
    grossVolume: ComparisonMetric;
    netRevenue: ComparisonMetric;
    feesPaid: ComparisonMetric;
    refundAmount: ComparisonMetric;
    successRate: ComparisonMetric;
    failureRate: ComparisonMetric;
    averageTicket: ComparisonMetric;
  };
  trendDirection: 'GROWTH' | 'DECLINE' | 'STABLE';
  summaryText: string;
}

export interface RevenueForecastPoint {
  periodLabel: string;
  volume: number;
  fees: number;
  net: number;
  isForecast: boolean;
  lowerConfidence: number;
  upperConfidence: number;
}

export interface RevenueForecastResponse {
  period: 'daily' | 'weekly' | 'monthly';
  horizon: number;
  algorithm: string;
  confidenceLevel: number;
  seasonalPatternDetected: boolean;
  data: RevenueForecastPoint[];
  projectedTotalVolume: number;
  projectedTotalFees: number;
  projectedTotalNet: number;
  disclaimer: string;
}

export interface DecisionIntelligenceItem {
  id: string;
  title: string;
  category: string;
  severity: 'info' | 'warning' | 'critical' | 'success';
  observation: string;
  supportingData: string;
  financialImpact: string;
  recommendedAction: string;
  confidence: number;
  limitations: string;
}

export interface DecisionScenarioRequest {
  volumeGrowthPct: number;
  targetAverageTicket?: number;
  crossBorderPct?: number;
  paymentTier: string;
}

export interface DecisionScenarioResponse {
  parameters: {
    volumeGrowthPct: number;
    targetAverageTicket: number;
    crossBorderPct: number;
    paymentTier: string;
  };
  baseline: {
    grossVolume: number;
    totalFees: number;
    netRevenue: number;
    effectiveRate: number;
    transactionCount: number;
  };
  projected: {
    grossVolume: number;
    totalFees: number;
    netRevenue: number;
    effectiveRate: number;
    transactionCount: number;
  };
  variance: {
    volumeDelta: number;
    feeDelta: number;
    netDelta: number;
    effectiveRateDelta: number;
    isNetProfitable: boolean;
  };
  assumptions: string[];
  disclaimer: string;
}

// --- PHASE 8: SECURITY, AUTHENTICATION & RELIABILITY ---

export interface User {
  id: string;
  email: string;
  fullName: string;
  businessName: string;
  isActive: boolean;
  role: string;
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  tokenType: string;
  user: User;
}

export interface SecurityAuditLog {
  id: string;
  userId: string | null;
  action: string;
  ipAddress: string | null;
  userAgent: string | null;
  status: 'SUCCESS' | 'FAILURE' | 'BLOCKED' | 'NOTICE';
  details: Record<string, any>;
  timestamp: string;
}
