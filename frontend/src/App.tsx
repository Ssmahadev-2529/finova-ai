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
  User
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
import { CostOptimizerView } from './views/CostOptimizerView';
import { ScamShieldView } from './views/ScamShieldView';
import { AccountHealthView } from './views/AccountHealthView';
import { AiAssistantView } from './views/AiAssistantView';
import { SettingsView } from './views/SettingsView';
import { SimulatePaymentModal } from './components/common/SimulatePaymentModal';
import { AuthModal } from './components/common/AuthModal';
import { CheckCircle2 } from 'lucide-react';
import { api, authStorage } from './services/api';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<NavigationTab>('dashboard');
  const [isMobileOpen, setIsMobileOpen] = useState<boolean>(false);
  const [transactions, setTransactions] = useState<Transaction[]>(INITIAL_TRANSACTIONS);
  const [healthMetrics, setHealthMetrics] = useState<AccountHealthMetrics>(MOCK_ACCOUNT_HEALTH);
  const [settings, setSettings] = useState<MerchantSettings>(INITIAL_SETTINGS);
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [activeDataSourceFilter, setActiveDataSourceFilter] = useState<'all' | DataSourceType>('all');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
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
  }, [selectedPeriod]);

  // Load backend data on startup only when a session token is present
  useEffect(() => {
    const fetchBackendData = async () => {
      if (!authStorage.getToken()) {
        return;
      }

      const user = await api.getCurrentUser();
      if (!user) {
        return;
      }
      setCurrentUser(user);

      try {
        const txns = await api.getTransactions();
        if (txns && txns.length > 0) {
          setTransactions(txns);
        }
      } catch {
        console.warn('Backend unavailable, using initial dataset.');
      }

      try {
        const health = await api.getHealthMetrics();
        if (health) {
          setHealthMetrics(health);
        }
      } catch {
        // use default metrics
      }

      await fetchAnalyticsData('daily');
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
  };

  // Handler for refreshing data
  const handleRefreshData = async () => {
    setIsRefreshing(true);
    try {
      const txns = await api.getTransactions();
      if (txns && txns.length > 0) {
        setTransactions(txns);
      }
      const health = await api.getHealthMetrics();
      if (health) {
        setHealthMetrics(health);
      }
      await fetchAnalyticsData(selectedPeriod);
      showToast('Live PayPal Sandbox transactions & intelligence synchronized with database.');
    } catch {
      showToast('Transactions synchronized (local mode).');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Handler for resetting demo data
  const handleResetDemoData = () => {
    setTransactions(INITIAL_TRANSACTIONS);
    setHealthMetrics(MOCK_ACCOUNT_HEALTH);
    showToast('Synthetic demonstration dataset reset to default state.');
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] dark:bg-[#030816] fintech-ambient-bg text-slate-800 dark:text-slate-100 flex transition-colors duration-200">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-2xl glass-surface text-[#003087] dark:text-[#38BDF8] text-xs font-semibold shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
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
        />

        {/* Content View Container */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
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
            />
          )}

          {currentTab === 'transactions' && (
            <TransactionsView
              key={`txns-${currentUser?.id ?? 'anon'}`}
              transactions={displayedTransactions}
              selectedTransaction={selectedTransaction}
              onSelectTransaction={(txn) => setSelectedTransaction(txn)}
              onSimulateNewPayment={() => setIsSimulateModalOpen(true)}
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
              onUpdateSettings={(newSettings) => {
                setSettings(newSettings);
                showToast('Settings saved successfully.');
              }}
              onResetDemoData={handleResetDemoData}
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
