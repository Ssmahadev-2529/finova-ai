import React from 'react';
import { DataSourceType } from '../../types';
import { Database, Cpu } from 'lucide-react';

interface DataSourceBadgeProps {
  source: DataSourceType;
  showIcon?: boolean;
  size?: 'sm' | 'md';
}

export const DataSourceBadge: React.FC<DataSourceBadgeProps> = ({ 
  source, 
  showIcon = true,
  size = 'md' 
}) => {
  const isSandbox = source === 'sandbox';
  const sizeClasses = size === 'sm' ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1';

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold rounded-full border transition-colors ${sizeClasses} ${
        isSandbox
          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200/90 dark:border-emerald-700/50 shadow-sm'
          : 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-800 dark:text-indigo-300 border-indigo-200/90 dark:border-indigo-700/50 shadow-sm'
      }`}
      title={
        isSandbox
          ? 'Live PayPal Developer Sandbox API data'
          : 'Synthetic demonstration dataset generated for sandbox testing'
      }
    >
      {showIcon && (
        isSandbox ? (
          <Database className={size === 'sm' ? 'w-2.5 h-2.5 text-emerald-600 dark:text-emerald-400' : 'w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400'} />
        ) : (
          <Cpu className={size === 'sm' ? 'w-2.5 h-2.5 text-indigo-600 dark:text-indigo-400' : 'w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400'} />
        )
      )}
      <span>{isSandbox ? 'PayPal Sandbox (Live)' : 'Synthetic Demo Data'}</span>
    </span>
  );
};
