import React from 'react';
import { RiskLevel } from '../../types';
import { ShieldCheck, ShieldAlert, AlertTriangle, AlertOctagon } from 'lucide-react';

interface RiskBadgeProps {
  level: RiskLevel;
  score?: number;
  size?: 'sm' | 'md';
}

export const RiskBadge: React.FC<RiskBadgeProps> = ({ level, score, size = 'md' }) => {
  const sizeClasses = size === 'sm' ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1';

  const config = {
    LOW: {
      label: 'Low Risk',
      bg: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-400 border-emerald-200/90 dark:border-emerald-800/50',
      icon: ShieldCheck,
      dot: 'bg-emerald-500',
    },
    MEDIUM: {
      label: 'Medium Risk',
      bg: 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-400 border-amber-200/90 dark:border-amber-800/50',
      icon: AlertTriangle,
      dot: 'bg-amber-500',
    },
    HIGH: {
      label: 'High Risk',
      bg: 'bg-orange-50 dark:bg-orange-950/40 text-orange-800 dark:text-orange-400 border-orange-200/90 dark:border-orange-800/50',
      icon: ShieldAlert,
      dot: 'bg-orange-500',
    },
    CRITICAL: {
      label: 'Critical Risk',
      bg: 'bg-rose-50 dark:bg-rose-950/50 text-rose-800 dark:text-rose-300 border-rose-200/90 dark:border-rose-800/60 shadow-sm',
      icon: AlertOctagon,
      dot: 'bg-rose-500 animate-pulse',
    },
  }[level];

  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold rounded-full border ${config.bg} ${sizeClasses}`}
    >
      <Icon className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      <span>{config.label}</span>
      {score !== undefined && (
        <span className="font-mono tabular-nums opacity-90 text-[10px] ml-0.5 bg-black/5 dark:bg-white/10 px-1 py-0.5 rounded font-bold">
          {score}
        </span>
      )}
    </span>
  );
};
