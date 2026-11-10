import React from 'react';
import { NavigationTab, DataSourceType, User } from '../../types';
import { Menu, RefreshCw, Sun, Moon, ShieldCheck, UserCheck } from 'lucide-react';

interface HeaderProps {
  currentTab: NavigationTab;
  onToggleMobile: () => void;
  activeDataSourceFilter: 'all' | DataSourceType;
  onSelectDataSourceFilter: (filter: 'all' | DataSourceType) => void;
  onRefreshData: () => void;
  isRefreshing: boolean;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  currentUser?: User | null;
  onOpenAuth?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onToggleMobile,
  activeDataSourceFilter,
  onSelectDataSourceFilter,
  onRefreshData,
  isRefreshing,
  theme,
  onToggleTheme,
  currentUser,
  onOpenAuth
}) => {
  const tabTitles: Record<NavigationTab, { title: string; subtitle: string }> = {
    dashboard: {
      title: 'Merchant Command Center',
      subtitle: 'Real-time PayPal sandbox transactions, volume metrics, and risk monitoring',
    },
    transactions: {
      title: 'Activity & Fee Audit Ledger',
      subtitle: 'Complete ledger with estimated vs actual PayPal fees and anomaly flags',
    },
    'cost-optimizer': {
      title: 'PayPal Commercial Fee Optimizer',
      subtitle: 'PayPal fee estimator, cross-currency calculator, and transaction cost intelligence',
    },
    'scam-shield': {
      title: 'AI Payment Scam & Phishing Shield',
      subtitle: 'Zero-touch message, URL, and invoice vulnerability analyzer with 0-100 risk scoring',
    },
    'account-health': {
      title: 'Account Health & Anomaly Predictor',
      subtitle: 'Isolation Forest anomaly detection, chargeback thresholds, and preventive health scoring',
    },
    'ai-assistant': {
      title: 'Finova AI Financial Support Agent',
      subtitle: 'Context-aware financial advisor powered by Gemini for dispute guidance and fee audits',
    },
    settings: {
      title: 'Sandbox REST & Webhook Settings',
      subtitle: 'PayPal Sandbox REST credentials, webhook endpoints, and AI thresholds',
    },
  };

  const currentInfo = tabTitles[currentTab] || {
    title: 'Merchant Intelligence',
    subtitle: 'Payment Security Platform',
  };

  return (
    <header className="sticky top-0 z-30 h-16 bg-white/85 dark:bg-[#040A18]/85 backdrop-blur-md border-b border-slate-200/80 dark:border-white/[0.08] px-4 sm:px-6 flex items-center justify-between transition-colors">
      {/* Left: Mobile trigger & Titles */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleMobile}
          className="lg:hidden p-2 rounded-xl bg-slate-100 dark:bg-[#0B1A3A] border border-slate-200 dark:border-white/[0.08] text-slate-600 dark:text-[#8EA1C7] hover:text-[#003087] dark:hover:text-white btn-press"
          aria-label="Toggle mobile menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <span>{currentInfo.title}</span>
            <span className="hidden sm:inline-flex items-center text-[9px] font-semibold px-2 py-0.5 rounded-full bg-[#0070BA]/10 text-[#0070BA] dark:text-[#38BDF8] border border-[#0070BA]/25 font-mono">
              PayPal REST v2
            </span>
          </h1>
          <p className="hidden md:block text-[11px] text-slate-500 dark:text-[#7E96C4]">
            {currentInfo.subtitle}
          </p>
        </div>
      </div>

      {/* Right: Sandbox Controls, Theme Switcher & Merchant Profile */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Data Source Filter Segmented Control */}
        <div className="hidden sm:flex items-center bg-slate-100 dark:bg-[#07132B] border border-slate-200/90 dark:border-white/[0.08] rounded-xl p-0.5 text-xs">
          <button
            onClick={() => onSelectDataSourceFilter('all')}
            className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
              activeDataSourceFilter === 'all'
                ? 'bg-white dark:bg-[#0070BA] text-slate-900 dark:text-white shadow-sm font-semibold'
                : 'text-slate-500 dark:text-[#8EA1C7] hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            All Data
          </button>
          <button
            onClick={() => onSelectDataSourceFilter('sandbox')}
            className={`px-2.5 py-1 rounded-lg font-medium flex items-center gap-1.5 transition-all ${
              activeDataSourceFilter === 'sandbox'
                ? 'bg-emerald-50 dark:bg-[#042416] text-emerald-700 dark:text-[#34D399] border border-emerald-300/80 dark:border-[#059669]/60 shadow-sm font-semibold'
                : 'text-slate-500 dark:text-[#8EA1C7] hover:text-emerald-600 dark:hover:text-emerald-400'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            PayPal Sandbox
          </button>
          <button
            onClick={() => onSelectDataSourceFilter('synthetic')}
            className={`px-2.5 py-1 rounded-lg font-medium flex items-center gap-1.5 transition-all ${
              activeDataSourceFilter === 'synthetic'
                ? 'bg-indigo-50 dark:bg-[#1E1B4B] text-indigo-700 dark:text-[#A5B4FC] border border-indigo-200 dark:border-[#4338CA]/60 shadow-sm font-semibold'
                : 'text-slate-500 dark:text-[#8EA1C7] hover:text-indigo-600 dark:hover:text-indigo-400'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
            Synthetic Demo
          </button>
        </div>

        {/* Theme Switcher Toggle (Light / Dark) */}
        <button
          onClick={onToggleTheme}
          className="p-2 rounded-xl bg-slate-100 dark:bg-[#07132B] border border-slate-200/90 dark:border-white/[0.08] text-slate-600 dark:text-[#FFC439] hover:bg-slate-200 dark:hover:bg-[#0F2248] transition-all btn-press"
          title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Theme`}
          aria-label="Toggle theme"
        >
          {theme === 'light' ? (
            <Moon className="w-4 h-4 text-[#003087]" />
          ) : (
            <Sun className="w-4 h-4 text-[#FFC439]" />
          )}
        </button>

        {/* Sync / Refresh Button */}
        <button
          onClick={onRefreshData}
          disabled={isRefreshing}
          className="p-2 rounded-xl bg-slate-100 dark:bg-[#07132B] border border-slate-200/90 dark:border-white/[0.08] text-slate-600 dark:text-[#8EA1C7] hover:text-[#0070BA] dark:hover:text-[#38BDF8] transition-all btn-press"
          title="Refresh PayPal sandbox events & ledger"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#0070BA]' : ''}`} />
        </button>

        {/* PayPal Sandbox Merchant Account Pill / Auth Trigger */}
        <button
          onClick={onOpenAuth}
          className="flex items-center gap-2 pl-2 border-l border-slate-200 dark:border-white/[0.08] hover:opacity-90 transition-opacity text-left btn-press"
          title={currentUser ? `Logged in as ${currentUser.email}` : "Click to log in or register"}
        >
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-xs shadow-sm ${
            currentUser
              ? 'bg-emerald-600 border border-emerald-400'
              : 'bg-[#003087] border border-[#0079C1]'
          }`}>
            {currentUser ? currentUser.fullName.slice(0, 2).toUpperCase() : 'PP'}
          </div>
          <div className="hidden xl:block text-left">
            <div className="text-xs font-semibold text-slate-800 dark:text-white leading-tight flex items-center gap-1">
              <span>{currentUser ? currentUser.businessName : 'Sandbox Merchant'}</span>
              {currentUser && <ShieldCheck className="w-3 h-3 text-emerald-500" />}
            </div>
            <div className="text-[10px] text-[#0070BA] dark:text-[#38BDF8] font-mono leading-tight">
              {currentUser ? currentUser.email : 'sb-biz@paypal.test'}
            </div>
          </div>
        </button>
      </div>
    </header>
  );
};
