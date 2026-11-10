import React from 'react';
import { NavigationTab } from '../../types';
import {
  LayoutDashboard,
  Receipt,
  Target,
  Calculator,
  ShieldAlert,
  Activity,
  Bot,
  Settings,
  Code2,
  CheckCircle2,
  ChevronRight
} from 'lucide-react';
import { PayPalLogo } from '../common/PayPalLogo';

interface SidebarProps {
  currentTab: NavigationTab;
  onSelectTab: (tab: NavigationTab) => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  isMobileOpen,
  onCloseMobile
}) => {
  const navItems: { id: NavigationTab; label: string; icon: React.ElementType; badge?: string }[] = [
    { id: 'dashboard', label: 'Overview Dashboard', icon: LayoutDashboard },
    { id: 'transactions', label: 'Transactions & Ledger', icon: Receipt, badge: 'Live REST' },
    { id: 'budgets', label: 'Budgets & Categories', icon: Target, badge: 'FX Aware' },
    { id: 'cost-optimizer', label: 'PayPal Fee Optimizer', icon: Calculator },
    { id: 'scam-shield', label: 'Payment Scam Shield', icon: ShieldAlert, badge: 'AI Guard' },
    { id: 'account-health', label: 'Seller Account Health', icon: Activity },
    { id: 'ai-assistant', label: 'PayPal Financial AI', icon: Bot, badge: 'Assistant' },
    { id: 'settings', label: 'Account & API Settings', icon: Settings },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={onCloseMobile}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-white dark:bg-[#050C1F] border-r border-slate-200/90 dark:border-white/[0.08] flex flex-col transition-all duration-300 ease-in-out lg:translate-x-0 ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header: PayPal + Finova AI */}
        <div className="h-16 flex items-center px-5 border-b border-slate-200/80 dark:border-white/[0.08] gap-3 bg-slate-50/70 dark:bg-[#030917]/70 backdrop-blur-md">
          <PayPalLogo size="md" />
          <div className="leading-tight">
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-base tracking-tight text-[#003087] dark:text-white font-sans">
                PayPal
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[#0070BA]/10 text-[#0070BA] dark:text-[#38BDF8] border border-[#0070BA]/25 font-mono">
                FINOVA
              </span>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-[#8EA1C7] font-semibold tracking-wider uppercase">
              Financial Intelligence
            </p>
          </div>
        </div>

        {/* PayPal Sandbox Environment Status Badge */}
        <div className="mx-3.5 my-3 p-3 rounded-xl bg-slate-50 dark:bg-[#081329] border border-slate-200/90 dark:border-white/[0.08] flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </div>
            <div>
              <div className="text-[11px] font-bold text-slate-800 dark:text-slate-200 tracking-wide">
                Sandbox Connected
              </div>
              <div className="text-[10px] text-slate-500 dark:text-[#7E96C4] font-mono">
                REST v2 • US Tier
              </div>
            </div>
          </div>
          <span className="text-[9px] font-bold font-mono px-2 py-0.5 rounded-full bg-slate-200/80 dark:bg-[#0F224A] text-slate-700 dark:text-[#93C5FD] border border-slate-300/80 dark:border-[#1E3E85]">
            TEST
          </span>
        </div>

        {/* Navigation Section */}
        <div className="px-3 py-2 flex-1 space-y-1 overflow-y-auto">
          <div className="px-3 pb-2 pt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-[#647EA8]">
            Merchant Center
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onSelectTab(item.id);
                  onCloseMobile();
                }}
                className={`w-full group btn-press flex items-center justify-between px-3.5 py-2.5 rounded-full text-xs font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-[#003087] dark:bg-[#0070BA] text-white shadow-sm shadow-[#003087]/25 font-semibold'
                    : 'text-[#001435]/75 dark:text-[#9BB0D6] hover:text-[#003087] dark:hover:text-white hover:bg-[#F5F7FA] dark:hover:bg-[#0B1A3A]/70'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon
                    className={`w-4 h-4 transition-transform group-hover:scale-105 ${
                      isActive ? 'text-white' : 'text-slate-400 dark:text-[#6881B0]'
                    }`}
                  />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-100 dark:bg-[#0E2045] text-[#0070BA] dark:text-[#38BDF8] border border-slate-200 dark:border-[#1B3A72]'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* PayPal Developer Resources Card */}
        <div className="p-3.5 border-t border-slate-200/80 dark:border-white/[0.08] bg-slate-50/50 dark:bg-[#030917]/50">
          <div className="p-3 rounded-xl bg-white dark:bg-[#071126] border border-slate-200/90 dark:border-white/[0.06] text-xs space-y-1.5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Code2 className="w-3.5 h-3.5 text-[#0070BA] dark:text-[#38BDF8]" />
                <span>Orders API v2</span>
              </span>
              <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-mono flex items-center gap-0.5 font-bold">
                <CheckCircle2 className="w-2.5 h-2.5" />
                Live Hook
              </span>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-[#7E96C4] leading-relaxed">
              Official capture reconciliation with instant fee transparency and seller protection tracking.
            </p>
          </div>
        </div>
      </aside>
    </>
  );
};
