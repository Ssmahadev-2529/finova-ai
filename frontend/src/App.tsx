import React, { useState, useEffect, useCallback } from 'react';
import {
  NavigationTab,
  Transaction,
  AccountHealthMetrics,
  MerchantSettings,
  DataSourceType,
  AnalyticsSummary,
  TrendsResponse,
  PatternAnalyticsResponse,
  AiInsightCard,
  User,
  SystemHealthResponse
} from './types';
import {
  INITIAL_TRANSACTIONS,
  MOCK_ACCOUNT_HEALTH,
  INITIAL_SETTINGS
} from './data/mockData';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { DashboardView } from './views/DashboardView';
import { TransactionsView } from './views/TransactionsView';
import { BudgetsView } from './views/BudgetsView';
import { CostOptimizerView } from './views/CostOptimizerView';
import { ScamShieldView } from './views/ScamShieldView';
import { AccountHealthView } from './views/AccountHealthView';
import { AiAssistantView } from './views/AiAssistantView';
import { SettingsView } from './views/SettingsView';
import { SimulatePaymentModal } from './components/common/SimulatePaymentModal';
import { AuthModal } from './components/common/AuthModal';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { api, authStorage } from './services/api';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<NavigationTab>('dashboard');
  const [isMobileOpen, setIsMobileOpen] = useState<boolean>(false);
  const [transactions, setTransactions] = useState<Transaction[]>(() =>
    authStorage.getToken() ? [] : INITIAL_TRANSACTIONS
  );
  const [healthMetrics, setHealthMetrics] = useState<AccountHealthMetrics>(MOCK_ACCOUNT_HEALTH);
  const [settings, setSettings] = useState<MerchantSettings>(INITIAL_SETTINGS);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [activeDataSourceFilter, setActiveDataSourceFilter] = useState<'all' | DataSourceType>('all');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [systemHealth, setSystemHealth] = useState<SystemHealthResponse | null>(null);
  const [isSimulateModalOpen, setIsSimulateModalOpen] = useState<boolean>(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [pendingResetToken, setPendingResetToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Transaction Intelligence & Analytics Engine State
  const [analyticsSummary, setAnalyticsSummary] = useState<AnalyticsSummary | null>(null);
  const [trendsData, setTrendsData] = useState<TrendsResponse | null>(null);
  const [patternsData, setPatternsData] = useState<PatternAnalyticsResponse | null>(null);
  const [aiInsights, setAiInsights] = useState<AiInsightCard[] | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  // Theme state: defaults to 'light'
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('finova_theme');
    return (saved as 'light' | 'dark') || 'light';
  });

  useEffect(() => {
    localStorage.setItem('finova_theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Securely extract password-reset token from URL fragment (#reset_token=...) and scrub URL immediately
  useEffect(() => {
    const rawHash = window.location.hash;
    if (!rawHash) return;
    const hashParams = new URLSearchParams(rawHash.replace(/^#/, ''));
    const tokenFromHash = hashParams.get('reset_token');
    if (tokenFromHash) {
      setPendingResetToken(tokenFromHash);
      setIsAuthModalOpen(true);
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
  }, []);

  // Load backend intelligence data
  const fetchAnalyticsData = useCallback(async (period: 'daily' | 'weekly' | 'monthly' = selectedPeriod) => {
    if (!authStorage.getToken()) return;
    try {
      const summary = await api.getAnalyticsSummary();
      if (summary) setAnalyticsSummary(summary);
    } catch (err) {
      console.warn('Analytics summary unavailable:', err);
    }

    try {
      const trends = await api.getAnalyticsTrends(period);
      if (trends) setTrendsData(trends);
    } catch (err) {
      console.warn('Trends unavailable:', err);
    }

    try {
      const patterns = await api.getAnalyticsPatterns();
      if (patterns) setPatternsData(patterns);
    } catch (err) {
      console.warn('Patterns unavailable:', err);
    }

    try {
      const insights = await api.getAnalyticsInsights();
      if (insights) setAiInsights(insights);
    } catch (err) {
      console.warn('AI insights unavailable:', err);
    }
  }, []);

  // Load backend system health & authenticated merchant data on startup
  useEffect(() => {
    api.getSystemHealth().then(setSystemHealth).catch(() => setSystemHealth(null));

    const fetchBackendData = async () => {
      const startupToken = authStorage.getToken();
      if (!startupToken) {
        return;
      }

      setIsLoadingData(true);
      setDataError(null);
      const user = await api.getCurrentUser();
      if (!user) {
        setIsLoadingData(false);
        // Only restore demo dataset if no newer authenticated session was established while /auth/me was in flight
        if (!authStorage.getToken() || authStorage.getToken() === startupToken) {
          setTransactions(INITIAL_TRANSACTIONS);
        }
        return;
      }
      setCurrentUser(user);

      try {
        const txns = await api.getTransactions();
        // Always reflect authoritative backend ledger even when empty (0 records)
        setTransactions(Array.isArray(txns) ? txns : []);
      } catch (err: any) {
        setDataError(err?.message || 'Unable to synchronize live merchant ledger.');
        setTransactions([]);
      }

      try {
        const health = await api.getHealthMetrics();
        if (health) {
          setHealthMetrics(health);
        }
      } catch {
        // surfaced via dataError if primary ledger also fails
      }

      await fetchAnalyticsData('daily');
      setIsLoadingData(false);
    };

    fetchBackendData();
  }, [fetchAnalyticsData]);

  // Reset sensitive user state if JWT expires or is revoked server-side
  useEffect(() => {
    const handleAuthExpired = () => {
      setCurrentUser(null);
      setSelectedTransaction(null);
      setTransactions(INITIAL_TRANSACTIONS);
      setHealthMetrics(MOCK_ACCOUNT_HEALTH);
      setAnalyticsSummary(null);
      setTrendsData(null);
      setPatternsData(null);
      setAiInsights(null);
      setDataError(null);
      showToast('Session expired or invalidated. Please sign in to access live merchant data.');
      setIsAuthModalOpen(true);
    };
    window.addEventListener('finova:auth-expired', handleAuthExpired);
    return () => window.removeEventListener('finova:auth-expired', handleAuthExpired);
  }, []);

  const handlePeriodChange = async (newPeriod: 'daily' | 'weekly' | 'monthly') => {
    setSelectedPeriod(newPeriod);
    try {
      const trends = await api.getAnalyticsTrends(newPeriod);
      if (trends) setTrendsData(trends);
    } catch (err) {
      console.warn('Failed to switch trend period:', err);
    }
  };

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Filtered transactions based on header data source selector
  const displayedTransactions = transactions.filter((t) => {
    if (activeDataSourceFilter === 'all') return true;
    return t.dataSource === activeDataSourceFilter;
  });

  // Handler for new payments (captures or simulations)
  const handleAddNewPayment = async (newTxn: Transaction) => {
    setTransactions((prev) => [newTxn, ...prev.filter(t => t.id !== newTxn.id)]);
    showToast(`Payment ${newTxn.id} ($${newTxn.amount.toFixed(2)}) captured and recorded in ledger!`);
    await fetchAnalyticsData(selectedPeriod);
    try {
      const health = await api.getHealthMetrics();
      if (health) setHealthMetrics(health);
    } catch {
      // non-fatal
    }
  };

  // Handler for refreshing data
  const handleRefreshData = async () => {
    setIsRefreshing(true);
    setDataError(null);
    api.getSystemHealth().then(setSystemHealth).catch(() => setSystemHealth(null));
    if (!authStorage.getToken()) {
      setIsRefreshing(false);
      showToast('Demo preview active. Sign in to sync live database records.');
      return;
    }
    try {
      const txns = await api.getTransactions();
      setTransactions(Array.isArray(txns) ? txns : []);
      const health = await api.getHealthMetrics();
      if (health) {
        setHealthMetrics(health);
      }
      await fetchAnalyticsData(selectedPeriod);
      showToast('Live PayPal Sandbox transactions & intelligence synchronized with database.');
    } catch (err: any) {
      setDataError(err?.message || 'Failed to synchronize backend data.');
      showToast('Backend synchronization failed. Check API health status.');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Handler for resetting demo data
  const handleResetDemoData = () => {
    if (currentUser) {
      handleRefreshData();
      return;
    }
    setTransactions(INITIAL_TRANSACTIONS);
    setHealthMetrics(MOCK_ACCOUNT_HEALTH);
    showToast('Synthetic demonstration dataset reset to default state.');
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#F5F7FA] dark:bg-[#030816] fintech-ambient-bg text-[#001435] dark:text-slate-100 flex transition-colors duration-200">
      {/* Toast Notification */}
      {toastMessage && (
        <div role="status" className="fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-2xl glass-surface text-[#003087] dark:text-[#38BDF8] text-xs font-semibold shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-[#0070BA] dark:text-[#38BDF8]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Navigation Sidebar */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={(tab) => setCurrentTab(tab)}
        isMobileOpen={isMobileOpen}
        onCloseMobile={() => setIsMobileOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        {/* Sticky Top Header */}
        <Header
          currentTab={currentTab}
          onToggleMobile={() => setIsMobileOpen(!isMobileOpen)}
          activeDataSourceFilter={activeDataSourceFilter}
          onSelectDataSourceFilter={(f) => setActiveDataSourceFilter(f)}
          onRefreshData={handleRefreshData}
          isRefreshing={isRefreshing}
          theme={theme}
          onToggleTheme={toggleTheme}
          currentUser={currentUser}
          onOpenAuth={() => setIsAuthModalOpen(true)}
          systemHealth={systemHealth}
        />

        {/* Content View Container */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {dataError && (
            <div role="alert" className="mb-4 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{dataError}</span>
              </div>
              <button
                onClick={handleRefreshData}
                className="px-3 py-1 rounded-full bg-rose-600 text-white text-[11px] font-bold shrink-0"
              >
                Retry Sync
              </button>
            </div>
          )}

          {!currentUser && (
            <div className="mb-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between gap-3">
              <span>
                <strong>Demo Preview Mode:</strong> Showing sample dataset. Sign in or register to create transactions, manage budgets, issue PayPal Sandbox orders/refunds, or run tenant-scoped AI audits.
              </span>
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="px-3.5 py-1.5 rounded-full bg-[#0070BA] text-white text-[11px] font-bold shrink-0 hover:bg-[#005EA6]"
              >
                Sign In
              </button>
            </div>
          )}

          {currentTab === 'dashboard' && (
            <DashboardView
              key={`dash-${currentUser?.id ?? 'anon'}`}
              transactions={displayedTransactions}
              healthMetrics={healthMetrics}
              onNavigate={(tab) => setCurrentTab(tab)}
              onSelectTransaction={(txn) => {
                setSelectedTransaction(txn);
                setCurrentTab('transactions');
              }}
              analyticsSummary={analyticsSummary}
              trendsData={trendsData}
              patternsData={patternsData}
              aiInsights={aiInsights}
              selectedPeriod={selectedPeriod}
              onChangePeriod={handlePeriodChange}
              isLoading={isLoadingData}
              isAuthenticated={Boolean(currentUser)}
              onOpenAuth={() => setIsAuthModalOpen(true)}
            />
          )}

          {currentTab === 'transactions' && (
            <TransactionsView
              key={`txns-${currentUser?.id ?? 'anon'}`}
              transactions={displayedTransactions}
              selectedTransaction={selectedTransaction}
              onSelectTransaction={(txn) => setSelectedTransaction(txn)}
              onSimulateNewPayment={() => setIsSimulateModalOpen(true)}
              onTransactionsChanged={handleRefreshData}
              isAuthenticated={Boolean(currentUser)}
              onNotify={showToast}
            />
          )}

          {currentTab === 'budgets' && (
            <BudgetsView
              key={`budgets-${currentUser?.id ?? 'anon'}`}
              onOpenAuth={() => setIsAuthModalOpen(true)}
              onDataUpdated={handleRefreshData}
            />
          )}

          {currentTab === 'cost-optimizer' && <CostOptimizerView key={`opt-${currentUser?.id ?? 'anon'}`} />}

          {currentTab === 'scam-shield' && <ScamShieldView key={`scam-${currentUser?.id ?? 'anon'}`} />}

          {currentTab === 'account-health' && (
            <AccountHealthView
              key={`health-${currentUser?.id ?? 'anon'}`}
              metrics={healthMetrics}
              transactions={displayedTransactions}
              onRefreshAudit={handleRefreshData}
            />
          )}

          {currentTab === 'ai-assistant' && (
            <AiAssistantView
              key={`ai-${currentUser?.id ?? 'anon'}`}
              transactions={displayedTransactions}
              healthMetrics={healthMetrics}
            />
          )}

          {currentTab === 'settings' && (
            <SettingsView
              settings={settings}
              currentUser={currentUser}
              systemHealth={systemHealth}
              onUserUpdated={(u) => {
                setCurrentUser(u);
                if (!u) {
                  setTransactions(INITIAL_TRANSACTIONS);
                  setAnalyticsSummary(null);
                }
              }}
              onOpenAuth={() => setIsAuthModalOpen(true)}
              onUpdateSettings={(newSettings) => {
                setSettings(newSettings);
                showToast('Settings saved successfully.');
              }}
              onResetDemoData={handleResetDemoData}
              onNotify={showToast}
            />
          )}
        </main>
      </div>

      {/* Simulate Sandbox Payment Modal */}
      <SimulatePaymentModal
        isOpen={isSimulateModalOpen}
        onClose={() => setIsSimulateModalOpen(false)}
        onSubmit={handleAddNewPayment}
      />

      {/* Security & Authentication Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        currentUser={currentUser}
        initialResetToken={pendingResetToken}
        onClearResetToken={() => setPendingResetToken(null)}
        onAuthChange={(u) => {
          setCurrentUser(u);
          if (u) {
            handleRefreshData();
            showToast(`Logged in as ${u.fullName} (${u.businessName}).`);
          } else {
            setSelectedTransaction(null);
            setTransactions(INITIAL_TRANSACTIONS);
            setHealthMetrics(MOCK_ACCOUNT_HEALTH);
            setAnalyticsSummary(null);
            setTrendsData(null);
            setPatternsData(null);
            setAiInsights(null);
            showToast('Logged out of merchant session.');
          }
        }}
      />
    </div>
  );
};

export default App;
