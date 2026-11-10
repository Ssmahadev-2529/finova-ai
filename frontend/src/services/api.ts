import {
  Transaction,
  PagedTransactionsResponse,
  ManualTransactionPayload,
  UpdateTransactionPayload,
  AccountHealthMetrics,
  ScamAnalysisResult,
  AnalyticsSummary,
  TrendsResponse,
  PatternAnalyticsResponse,
  AiInsightCard,
  PredictedFeeResponse,
  HistoricalCostAnalysis,
  CostRecommendation,
  ScenarioItemContract,
  ScenarioComparisonResult,
  ThreatDistributionResponse,
  AnomalyEvent,
  HealthSimulationRequest,
  HealthSimulationResponse,
  AssistantChatResponse,
  PeriodComparisonResponse,
  RevenueForecastResponse,
  DecisionIntelligenceItem,
  DecisionScenarioRequest,
  DecisionScenarioResponse,
  User,
  AuthResponse,
  SecurityAuditLog,
  FinancialCategory,
  FinancialBudget,
  BudgetUtilizationResponse,
  AiUsageSummary,
  SystemHealthResponse
} from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api/v1';

// Token Management
const TOKEN_KEY = 'finova_access_token';

export const authStorage = {
  getToken: (): string | null => localStorage.getItem(TOKEN_KEY),
  setToken: (token: string): void => localStorage.setItem(TOKEN_KEY, token),
  removeToken: (): void => localStorage.removeItem(TOKEN_KEY),
  getHeaders: (): Record<string, string> => {
    const token = localStorage.getItem(TOKEN_KEY);
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
};

function notifyIfUnauthorized(res: Response, requestToken: string | null): void {
  if (res.status === 401 && typeof window !== 'undefined') {
    if (requestToken && authStorage.getToken() === requestToken) {
      authStorage.removeToken();
      window.dispatchEvent(new CustomEvent('finova:auth-expired'));
    }
  }
}

async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const requestToken = authStorage.getToken();
  const mergedHeaders: Record<string, string> = {
    ...(requestToken ? { Authorization: `Bearer ${requestToken}` } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };
  const res = await fetch(url, { ...options, headers: mergedHeaders });
  notifyIfUnauthorized(res, requestToken);
  return res;
}

export const api = {
  // 1. Transactions API
  async getTransactions(status?: string, risk?: string, source?: string): Promise<Transaction[]> {
    const params = new URLSearchParams();
    if (status && status !== 'ALL') params.append('status', status);
    if (risk && risk !== 'ALL') params.append('risk', risk);
    if (source && source !== 'ALL') params.append('source', source);

    const res = await apiFetch(`${API_BASE}/transactions?${params.toString()}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      throw new Error(err.detail || `Failed to load transactions (HTTP ${res.status})`);
    }
    return await res.json();
  },

  async getTransactionsPaged(params: {
    page?: number;
    pageSize?: number;
    status?: string;
    risk?: string;
    source?: string;
    category?: string;
    txnType?: string;
    search?: string;
    sortBy?: string;
    sortDir?: 'asc' | 'desc';
    dateFrom?: string;
    dateTo?: string;
  } = {}): Promise<PagedTransactionsResponse> {
    const qs = new URLSearchParams();
    if (params.page) qs.append('page', String(params.page));
    if (params.pageSize) qs.append('page_size', String(params.pageSize));
    if (params.status && params.status !== 'ALL') qs.append('status', params.status);
    if (params.risk && params.risk !== 'ALL') qs.append('risk', params.risk);
    if (params.source && params.source !== 'ALL') qs.append('source', params.source);
    if (params.category && params.category !== 'ALL') qs.append('category', params.category);
    if (params.txnType && params.txnType !== 'ALL') qs.append('txn_type', params.txnType);
    if (params.search?.trim()) qs.append('search', params.search.trim());
    if (params.sortBy) qs.append('sort_by', params.sortBy);
    if (params.sortDir) qs.append('sort_dir', params.sortDir);
    if (params.dateFrom) qs.append('date_from', params.dateFrom);
    if (params.dateTo) qs.append('date_to', params.dateTo);

    const res = await apiFetch(`${API_BASE}/transactions/paged?${qs.toString()}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      throw new Error(err.detail || `Failed to load paged transactions (HTTP ${res.status})`);
    }
    return await res.json();
  },

  async createManualTransaction(payload: ManualTransactionPayload): Promise<Transaction> {
    const res = await apiFetch(`${API_BASE}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `Failed to create transaction: ${res.statusText}`);
    }
    return await res.json();
  },

  async updateTransaction(txnId: string, payload: UpdateTransactionPayload): Promise<Transaction> {
    const res = await apiFetch(`${API_BASE}/transactions/${encodeURIComponent(txnId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `Failed to update transaction: ${res.statusText}`);
    }
    return await res.json();
  },

  async deleteTransaction(txnId: string): Promise<{ status: string; id: string }> {
    const res = await apiFetch(`${API_BASE}/transactions/${encodeURIComponent(txnId)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `Failed to delete transaction: ${res.statusText}`);
    }
    return await res.json();
  },

  async exportTransactionsCsv(params: {
    status?: string;
    risk?: string;
    source?: string;
    category?: string;
    txnType?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
  } = {}): Promise<Blob> {
    const qs = new URLSearchParams();
    if (params.status && params.status !== 'ALL') qs.append('status', params.status);
    if (params.risk && params.risk !== 'ALL') qs.append('risk', params.risk);
    if (params.source && params.source !== 'ALL') qs.append('source', params.source);
    if (params.category && params.category !== 'ALL') qs.append('category', params.category);
    if (params.txnType && params.txnType !== 'ALL') qs.append('txn_type', params.txnType);
    if (params.search?.trim()) qs.append('search', params.search.trim());
    if (params.dateFrom) qs.append('date_from', params.dateFrom);
    if (params.dateTo) qs.append('date_to', params.dateTo);

    const res = await apiFetch(`${API_BASE}/transactions/export?${qs.toString()}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      throw new Error(err.detail || 'Failed to export transactions CSV');
    }
    return await res.blob();
  },

  async simulateTransaction(payload: {
    customerName: string;
    customerEmail: string;
    amount: number;
    currency: string;
    paymentMethod: string;
    country: string;
  }): Promise<Transaction> {
    const res = await apiFetch(`${API_BASE}/transactions/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `Failed to simulate payment: ${res.statusText}`);
    }
    return await res.json();
  },

  // 2. PayPal Sandbox REST API
  async getPayPalConfig(): Promise<{ clientId: string; mode: string; isConfigured: boolean }> {
    try {
      const res = await fetch(`${API_BASE}/paypal/config`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch {
      return { clientId: '', mode: 'sandbox', isConfigured: false };
    }
  },

  async createPayPalOrder(amount: number, currency: string = 'USD'): Promise<{ orderId: string }> {
    const res = await apiFetch(`${API_BASE}/paypal/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, currency }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to create PayPal order');
    }
    return await res.json();
  },

  async capturePayPalOrder(orderId: string): Promise<{ success: boolean; transaction: Transaction }> {
    const res = await apiFetch(`${API_BASE}/paypal/capture-order/${encodeURIComponent(orderId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to capture PayPal order');
    }
    return await res.json();
  },

  async syncPayPalOrder(orderId: string): Promise<{ orderId: string; status: string; amount: number; currency: string; source: string }> {
    const res = await apiFetch(`${API_BASE}/paypal/orders/${encodeURIComponent(orderId)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to sync PayPal order status');
    }
    return await res.json();
  },

  async refundPayPalTransaction(transactionId: string, reason: string = 'Merchant-initiated sandbox refund'): Promise<{ status: string; transaction: Transaction }> {
    const res = await apiFetch(`${API_BASE}/paypal/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionId, reason }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to refund PayPal capture');
    }
    return await res.json();
  },

  // 3. AI Modules API
  async getHealthMetrics(): Promise<AccountHealthMetrics> {
    try {
      const res = await apiFetch(`${API_BASE}/health/metrics`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('Health metrics backend unavailable, using local metrics:', err);
      throw err;
    }
  },

  async getHealthTimeline(): Promise<AnomalyEvent[]> {
    try {
      const res = await apiFetch(`${API_BASE}/health/timeline`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('Health timeline unavailable:', err);
      return [];
    }
  },

  async simulateHealthPattern(payload: HealthSimulationRequest): Promise<HealthSimulationResponse> {
    const res = await apiFetch(`${API_BASE}/health/simulate-pattern`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `Health simulation failed: ${res.statusText}`);
    }
    return await res.json();
  },

  async analyzeScam(text: string, targetType: string = 'email', channel: string = 'email'): Promise<ScamAnalysisResult> {
    const res = await apiFetch(`${API_BASE}/scam-shield/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, targetType, channel }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `Failed to analyze scam: ${res.statusText}`);
    }
    return await res.json();
  },

  async getScamHistory(): Promise<ScamAnalysisResult[]> {
    try {
      const res = await apiFetch(`${API_BASE}/scam-shield/history`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn('Scam history unavailable:', err);
      return [];
    }
  },

  async getScamThreatDistribution(): Promise<ThreatDistributionResponse> {
    const res = await apiFetch(`${API_BASE}/scam-shield/threat-distribution`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch threat distribution`);
    return await res.json();
  },

  async chatWithAssistant(message: string, history?: { sender: string; content: string }[]): Promise<AssistantChatResponse> {
    const res = await apiFetch(`${API_BASE}/assistant/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, history }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `AI assistant error: ${res.statusText}`);
    }
    return await res.json();
  },

  async calculateFees(payload: {
    amount: number;
    sourceCurrency: string;
    targetCurrency: string;
    isInternational: boolean;
    paymentMethod: string;
  }): Promise<PredictedFeeResponse> {
    const res = await apiFetch(`${API_BASE}/optimizer/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Fee calculation failed: ${res.statusText}`);
    return await res.json();
  },

  async getCostHistoricalAnalysis(): Promise<HistoricalCostAnalysis> {
    const res = await apiFetch(`${API_BASE}/optimizer/historical-analysis`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch historical fee analysis`);
    return await res.json();
  },

  async getCostRecommendations(): Promise<CostRecommendation[]> {
    const res = await apiFetch(`${API_BASE}/optimizer/recommendations`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch cost recommendations`);
    return await res.json();
  },

  async compareCostScenarios(scenarios: ScenarioItemContract[]): Promise<ScenarioComparisonResult> {
    const res = await apiFetch(`${API_BASE}/optimizer/compare-scenarios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenarios }),
    });
    if (!res.ok) throw new Error(`Scenario comparison failed: ${res.statusText}`);
    return await res.json();
  },

  // 4. Transaction Intelligence & Revenue Analytics API
  async getAnalyticsSummary(dateFrom?: string, dateTo?: string): Promise<AnalyticsSummary> {
    const qs = new URLSearchParams();
    if (dateFrom) qs.append('date_from', dateFrom);
    if (dateTo) qs.append('date_to', dateTo);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    const res = await apiFetch(`${API_BASE}/analytics/summary${suffix}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      throw new Error(err.detail || `Failed to fetch analytics summary`);
    }
    return await res.json();
  },

  async getAnalyticsTrends(period: 'daily' | 'weekly' | 'monthly' = 'daily'): Promise<TrendsResponse> {
    const res = await apiFetch(`${API_BASE}/analytics/trends?period=${period}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch analytics trends`);
    return await res.json();
  },

  async getAnalyticsPatterns(): Promise<PatternAnalyticsResponse> {
    const res = await apiFetch(`${API_BASE}/analytics/patterns`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch pattern analytics`);
    return await res.json();
  },

  async getAnalyticsInsights(): Promise<AiInsightCard[]> {
    const res = await apiFetch(`${API_BASE}/analytics/insights`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch AI insights`);
    return await res.json();
  },

  // 5. Decision Intelligence & Predictive Analytics (Phase 7)
  async getPeriodComparison(period: 'daily' | 'weekly' | 'monthly' | 'yearly' = 'monthly'): Promise<PeriodComparisonResponse> {
    const res = await apiFetch(`${API_BASE}/analytics/comparison?period=${period}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch period comparison`);
    return await res.json();
  },

  async getRevenueForecast(period: 'daily' | 'weekly' | 'monthly' = 'daily', horizon: number = 7): Promise<RevenueForecastResponse> {
    const res = await apiFetch(`${API_BASE}/analytics/forecast?period=${period}&horizon=${horizon}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch revenue forecast`);
    return await res.json();
  },

  async getDecisionIntelligence(): Promise<DecisionIntelligenceItem[]> {
    const res = await apiFetch(`${API_BASE}/analytics/decision-intelligence`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch decision intelligence`);
    return await res.json();
  },

  async simulateDecisionScenario(payload: DecisionScenarioRequest): Promise<DecisionScenarioResponse> {
    const res = await apiFetch(`${API_BASE}/analytics/simulate-scenario`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Scenario simulation failed: ${res.statusText}`);
    return await res.json();
  },

  // 6. Security, Authentication & Reliability (Phase 8)
  async register(payload: { email: string; password: string; fullName: string; businessName: string }): Promise<AuthResponse> {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Registration failed');
    }
    const data: AuthResponse = await res.json();
    authStorage.setToken(data.accessToken);
    return data;
  },

  async login(payload: { email: string; password: string }): Promise<AuthResponse> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Login failed');
    }
    const data: AuthResponse = await res.json();
    authStorage.setToken(data.accessToken);
    return data;
  },

  async logout(): Promise<void> {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authStorage.getHeaders() }
      });
    } finally {
      authStorage.removeToken();
    }
  },

  async getCurrentUser(): Promise<User | null> {
    const token = authStorage.getToken();
    if (!token) return null;
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        if (res.status === 401 && authStorage.getToken() === token) {
          authStorage.removeToken();
        }
        return null;
      }
      return await res.json();
    } catch {
      return null;
    }
  },

  async forgotPassword(email: string): Promise<{ status: string; message: string }> {
    const res = await fetch(`${API_BASE}/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to initiate password reset');
    }
    return await res.json();
  },

  async resetPassword(resetToken: string, newPassword: string): Promise<{ status: string; message: string }> {
    const res = await fetch(`${API_BASE}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resetToken, newPassword }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Password reset failed');
    }
    return await res.json();
  },

  async getSecurityAuditLogs(limit: number = 50): Promise<SecurityAuditLog[]> {
    const res = await apiFetch(`${API_BASE}/auth/audit-logs?limit=${limit}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch security audit logs`);
    return await res.json();
  },

  async updateProfile(payload: { fullName: string; businessName: string }): Promise<User> {
    const res = await apiFetch(`${API_BASE}/auth/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to update merchant profile');
    }
    return await res.json();
  },

  async changePassword(payload: { currentPassword: string; newPassword: string }): Promise<{ status: string; message: string }> {
    const res = await apiFetch(`${API_BASE}/auth/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to change password');
    }
    return await res.json();
  },

  // 7. Categories, Budgets & AI Usage Telemetry
  async getCategories(): Promise<FinancialCategory[]> {
    const res = await apiFetch(`${API_BASE}/categories`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      throw new Error(err.detail || 'Failed to fetch categories');
    }
    return await res.json();
  },

  async createCategory(payload: { name: string; kind?: 'income' | 'expense' | 'both'; color?: string }): Promise<FinancialCategory> {
    const res = await apiFetch(`${API_BASE}/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to create category');
    }
    return await res.json();
  },

  async updateCategory(
    catId: string,
    payload: { name?: string; kind?: 'income' | 'expense' | 'both'; color?: string }
  ): Promise<FinancialCategory> {
    const res = await apiFetch(`${API_BASE}/categories/${encodeURIComponent(catId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to update category');
    }
    return await res.json();
  },

  async deleteCategory(catId: string): Promise<{ status: string; id: string }> {
    const res = await apiFetch(`${API_BASE}/categories/${encodeURIComponent(catId)}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to delete category');
    }
    return await res.json();
  },

  async getBudgets(): Promise<FinancialBudget[]> {
    const res = await apiFetch(`${API_BASE}/budgets`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      throw new Error(err.detail || 'Failed to fetch budgets');
    }
    return await res.json();
  },

  async createBudget(payload: {
    category: string;
    limitAmount: number;
    currency?: string;
    period?: 'weekly' | 'monthly' | 'quarterly';
    alertThresholdPct?: number;
  }): Promise<FinancialBudget> {
    const res = await apiFetch(`${API_BASE}/budgets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to create budget');
    }
    return await res.json();
  },

  async updateBudget(
    budgetId: string,
    payload: { category?: string; limitAmount?: number; period?: 'weekly' | 'monthly' | 'quarterly'; alertThresholdPct?: number }
  ): Promise<FinancialBudget> {
    const res = await apiFetch(`${API_BASE}/budgets/${encodeURIComponent(budgetId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to update budget');
    }
    return await res.json();
  },

  async deleteBudget(budgetId: string): Promise<{ status: string; id: string }> {
    const res = await apiFetch(`${API_BASE}/budgets/${encodeURIComponent(budgetId)}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Failed to delete budget');
    }
    return await res.json();
  },

  async getBudgetUtilization(): Promise<BudgetUtilizationResponse> {
    const res = await apiFetch(`${API_BASE}/budgets/utilization`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      throw new Error(err.detail || 'Failed to load budget utilization');
    }
    return await res.json();
  },

  async getAiUsage(): Promise<AiUsageSummary> {
    const res = await apiFetch(`${API_BASE}/assistant/usage`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      throw new Error(err.detail || 'Failed to fetch AI usage summary');
    }
    return await res.json();
  },

  async getSystemHealth(): Promise<SystemHealthResponse> {
    const baseHost = API_BASE.replace('/api/v1', '');
    const res = await fetch(`${baseHost}/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: System health check failed`);
    return await res.json();
  }
};
