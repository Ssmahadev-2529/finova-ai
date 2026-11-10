import React, { useState } from 'react';
import { MerchantSettings } from '../types';
import { PayPalLogo } from '../components/common/PayPalLogo';
import {
  Settings,
  Key,
  Shield,
  Sliders,
  Database,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Lock,
  ExternalLink,
  Save,
  Code2
} from 'lucide-react';
import { DataSourceBadge } from '../components/common/DataSourceBadge';

interface SettingsViewProps {
  settings: MerchantSettings;
  onUpdateSettings: (newSettings: MerchantSettings) => void;
  onResetDemoData: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onUpdateSettings,
  onResetDemoData
}) => {
  const [formData, setFormData] = useState<MerchantSettings>(settings);
  const [showSecret, setShowSecret] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSettings(formData);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Overview Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <span>PayPal Developer Sandbox & AI Settings</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-[#7E96C4]">
            Configure REST API credentials from developer.paypal.com, webhook listener URLs, and fraud sensitivity.
          </p>
        </div>

        {saveSuccess && (
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 dark:bg-[#042416] text-emerald-800 dark:text-[#34D399] border border-emerald-300 dark:border-[#059669]/60 text-xs font-bold animate-in fade-in shadow-sm">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-[#10B981]" />
            <span>Settings Saved Successfully</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Section 1: PayPal Sandbox Credentials */}
        <div className="fintech-card p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200/80 dark:border-white/[0.08]">
            <div className="flex items-center gap-2.5">
              <PayPalLogo size="sm" />
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">PayPal Developer Sandbox REST Credentials</h3>
                <p className="text-xs text-slate-500 dark:text-[#7E96C4]">App: Finova_Merchant_Intelligence (Sandbox)</p>
              </div>
            </div>
            <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-[#0070BA]/10 text-[#0070BA] dark:text-[#38BDF8] border border-[#0070BA]/25 font-bold font-mono">
              REST v2 Sandbox
            </span>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-[#8EA1C7] mb-1">
                PayPal Sandbox Client ID
              </label>
              <input
                type="text"
                value={formData.paypalClientId}
                onChange={(e) => setFormData({ ...formData, paypalClientId: e.target.value })}
                className="w-full py-2.5 px-3.5 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200/90 dark:border-white/[0.08] text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-[#0070BA] transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-[#8EA1C7] mb-1">
                PayPal Client Secret (Masked)
              </label>
              <div className="relative">
                <input
                  type={showSecret ? 'text' : 'password'}
                  value={formData.paypalClientSecretMasked}
                  onChange={(e) => setFormData({ ...formData, paypalClientSecretMasked: e.target.value })}
                  className="w-full py-2.5 pl-3.5 pr-10 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200/90 dark:border-white/[0.08] text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-[#0070BA] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white"
                >
                  {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-[#6B85B5] mt-1 flex items-center gap-1">
                <Lock className="w-3 h-3 text-[#0070BA] dark:text-[#10B981]" />
                <span>Client secrets are never saved in frontend storage. In Stage 2 they reside strictly in FastAPI backend <code className="text-slate-700 dark:text-slate-300">.env</code>.</span>
              </p>
            </div>

            {/* Sandbox Mode Toggle */}
            <div className="pt-2">
              <label className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200/80 dark:border-white/[0.06] cursor-pointer">
                <div>
                  <span className="text-xs font-bold text-slate-900 dark:text-white block">
                    PayPal Sandbox Target Environment
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-[#7E96C4]">
                    Directs all authorization and capture payloads to <code className="text-[#0070BA] dark:text-[#38BDF8]">api-m.sandbox.paypal.com</code>
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={formData.sandboxMode}
                  onChange={(e) => setFormData({ ...formData, sandboxMode: e.target.checked })}
                  className="rounded bg-white dark:bg-[#081329] border-slate-300 dark:border-[#18366E] text-[#0070BA] focus:ring-0 focus:ring-offset-0 h-4 w-4"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Section 2: AI Anomaly & Fraud Thresholds */}
        <div className="fintech-card p-5 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-200/80 dark:border-white/[0.08]">
            <div className="p-1.5 rounded-lg bg-[#0070BA]/10 text-[#0070BA]">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">PayPal Dispute & Anomaly Thresholds</h3>
              <p className="text-xs text-slate-500 dark:text-[#7E96C4]">Configure sensitivity for Isolation Forest and chargeback ratios</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-800 dark:text-white mb-1">
                <span>Dispute Alert Horizon:</span>
                <span className="font-mono text-[#B45309] dark:text-[#FFC439] font-bold">{formData.disputeThresholdPercent}%</span>
              </div>
              <input
                type="range"
                min="0.2"
                max="2.0"
                step="0.1"
                value={formData.disputeThresholdPercent}
                onChange={(e) => setFormData({ ...formData, disputeThresholdPercent: parseFloat(e.target.value) })}
                className="w-full accent-[#0070BA]"
              />
              <div className="flex justify-between text-[10px] text-slate-500 dark:text-[#7E96C4]">
                <span>0.2% (Strict Alert)</span>
                <span>1.0% (PayPal Standard Seller Review Ceiling)</span>
                <span>2.0% (High Risk)</span>
              </div>
            </div>

            <div className="space-y-2">
              <label className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200/80 dark:border-white/[0.06] cursor-pointer">
                <div>
                  <span className="text-xs font-bold text-slate-900 dark:text-white block">
                    Anomaly & Velocity Alerts
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-[#7E96C4]">
                    Flag transactions with abnormal order values or rapid sequential refund disputes
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={formData.enableAnomalyAlerts}
                  onChange={(e) => setFormData({ ...formData, enableAnomalyAlerts: e.target.checked })}
                  className="rounded bg-white dark:bg-[#081329] border-slate-300 dark:border-[#18366E] text-[#0070BA] focus:ring-0 focus:ring-offset-0 h-4 w-4"
                />
              </label>

              <label className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200/80 dark:border-white/[0.06] cursor-pointer">
                <div>
                  <span className="text-xs font-bold text-slate-900 dark:text-white block">
                    PayPal Fee Optimization Prompts
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-[#7E96C4]">
                    Automatically identify orders eligible for micropayments (5% + $0.05) or localized payment rails
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={formData.enableFeeOptimizationTips}
                  onChange={(e) => setFormData({ ...formData, enableFeeOptimizationTips: e.target.checked })}
                  className="rounded bg-white dark:bg-[#081329] border-slate-300 dark:border-[#18366E] text-[#0070BA] focus:ring-0 focus:ring-offset-0 h-4 w-4"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Section 3: Security & Platform Reliability Controls */}
        <div className="fintech-card p-5 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-200/80 dark:border-white/[0.08]">
            <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Enterprise Security & Compliance Posture</h3>
              <p className="text-xs text-slate-500 dark:text-[#7E96C4]">Continuous application hardening, data protection, and rate limiting status</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200/80 dark:border-white/[0.06] flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-slate-900 dark:text-white block">Bcrypt Password Hashing</span>
                <span className="text-[11px] text-slate-500 dark:text-[#7E96C4]">Cost factor 12 with salted continuous constant-time verification</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200/80 dark:border-white/[0.06] flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-slate-900 dark:text-white block">Cryptographic JWT Sessions</span>
                <span className="text-[11px] text-slate-500 dark:text-[#7E96C4]">HMAC-SHA256 with unique JTI server-side revocation blacklist</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200/80 dark:border-white/[0.06] flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-slate-900 dark:text-white block">Rate Limiting & Brute Force Defense</span>
                <span className="text-[11px] text-slate-500 dark:text-[#7E96C4]">Sliding window active: 20 Auth req/min, 120 API req/min</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200/80 dark:border-white/[0.06] flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-slate-900 dark:text-white block">AI Security & Redaction Envelope</span>
                <span className="text-[11px] text-slate-500 dark:text-[#7E96C4]">Prompt injection defense and automated PAN credit card redaction</span>
              </div>
            </div>
          </div>
        </div>

        {/* Section 4: Demonstration Data Management */}
        <div className="fintech-card p-5 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-200/80 dark:border-white/[0.08]">
            <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Demonstration & Ledger Reset</h3>
              <p className="text-xs text-slate-500 dark:text-[#7E96C4]">Restore initial synthetic transactions and health metrics</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-3.5 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200/80 dark:border-white/[0.06]">
            <div>
              <span className="text-xs font-bold text-slate-900 dark:text-white block">
                Reset Synthetic Demonstration Dataset
              </span>
              <span className="text-[11px] text-slate-500 dark:text-[#7E96C4]">
                Restores original sample PayPal Sandbox orders, phishing scenarios, and health scores
              </span>
            </div>
            <button
              type="button"
              onClick={onResetDemoData}
              className="px-4 py-2 rounded-full bg-slate-200 hover:bg-slate-300 dark:bg-[#0E2046] dark:hover:bg-[#142D62] text-slate-800 dark:text-white border border-slate-300 dark:border-[#20438A] text-xs font-bold flex items-center gap-1.5 transition-all btn-press"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#0070BA] dark:text-[#38BDF8]" />
              <span>Reset Ledger</span>
            </button>
          </div>
        </div>

        {/* Action Save Button */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="submit"
            className="px-6 py-2.5 rounded-full bg-[#0070BA] hover:bg-[#005EA6] active:scale-[0.99] text-white font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-sm transition-all btn-press"
          >
            <Save className="w-4 h-4" />
            <span>Save Configuration</span>
          </button>
        </div>
      </form>
    </div>
  );
};
