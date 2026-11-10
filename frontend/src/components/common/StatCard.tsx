import React from 'react';
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  change?: {
    value: string;
    isPositive: boolean;
  };
  accentColor?: 'cyan' | 'blue' | 'emerald' | 'amber' | 'rose' | 'purple';
  badge?: React.ReactNode;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  change,
  accentColor = 'blue',
  badge
}) => {
  const accentClasses = {
    cyan: 'border-[#00CFDE]/25 text-[#0070BA] dark:text-[#38BDF8] bg-[#00CFDE]/10',
    blue: 'border-[#0070BA]/25 text-[#003087] dark:text-[#38BDF8] bg-[#0070BA]/10',
    emerald: 'border-emerald-500/25 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10',
    amber: 'border-amber-500/25 text-amber-700 dark:text-amber-400 bg-amber-500/10',
    rose: 'border-rose-500/25 text-rose-700 dark:text-rose-400 bg-rose-500/10',
    purple: 'border-[#003087]/25 text-[#003087] dark:text-[#60CDFF] bg-[#003087]/10',
  }[accentColor];

  return (
    <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-[#071126] border border-slate-200/90 dark:border-white/[0.08] p-5 shadow-fintech-card dark:shadow-fintech-card-dark hover:-translate-y-0.5 hover:shadow-fintech-card-hover dark:hover:shadow-fintech-card-dark-hover transition-all duration-200">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-semibold text-slate-500 dark:text-[#8EA1C7] uppercase tracking-wider">
              {title}
            </span>
            {badge}
          </div>
          <div className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white font-mono tabular-nums mt-0.5">
            {value}
          </div>
          {subtitle && (
            <p className="text-xs text-slate-500 dark:text-[#7E96C4] mt-1">{subtitle}</p>
          )}
          {change && (
            <div className="flex items-center gap-1.5 mt-2.5 text-xs">
              <span
                className={`inline-flex items-center font-semibold px-1.5 py-0.5 rounded-md font-mono text-[11px] ${
                  change.isPositive
                    ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50'
                    : 'text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/50'
                }`}
              >
                {change.isPositive ? (
                  <TrendingUp className="w-3 h-3 mr-1" />
                ) : (
                  <TrendingDown className="w-3 h-3 mr-1" />
                )}
                {change.value}
              </span>
              <span className="text-slate-400 dark:text-slate-500 text-[11px]">vs prior period</span>
            </div>
          )}
        </div>
        <div className={`p-2.5 rounded-xl border ${accentClasses} shadow-sm`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
};
