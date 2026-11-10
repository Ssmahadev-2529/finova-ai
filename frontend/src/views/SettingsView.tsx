import React, { useState, useEffect } from 'react';
import { MerchantSettings, User, SystemHealthResponse } from '../types';
import { PayPalLogo } from '../components/common/PayPalLogo';
import { api } from '../services/api';
import {
  Shield,
  Sliders,
  Database,
  CheckCircle2,
  RotateCcw,
  Lock,
  Save,
  UserCheck,
  Key,
  Activity,
  AlertTriangle
} from 'lucide-react';

interface SettingsViewProps {
  settings: MerchantSettings;
  currentUser?: User | null;
  systemHealth?: SystemHealthResponse | null;
  onUserUpdated?: (user: User | null) => void;
  onOpenAuth?: () => void;
  onUpdateSettings: (newSettings: MerchantSettings) => void;
  onResetDemoData: () => void;
  onNotify?: (msg: string) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  currentUser,
  systemHealth,
  onUserUpdated,
  onOpenAuth,
  onUpdateSettings,
  onResetDemoData,
  onNotify
}) => {
  const [formData, setFormData] = useState<MerchantSettings>(settings);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  // Authenticated Merchant Profile Form
  const [fullName, setFullName] = useState<string>(currentUser?.fullName || '');
  const [businessName, setBusinessName] = useState<string>(currentUser?.businessName || '');
  const [profileSaving, setProfileSaving] = useState<boolean>(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Password Change Form
  const [currentPassword, setCurrentPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [pwSaving, setPwSaving] = useState<boolean>(false);
  const [pwError, setPwError] = useState<string | null>(null);

  useEffect(() => {
    setFullName(currentUser?.fullName || '');
    setBusinessName(currentUser?.businessName || '');
  }, [currentUser]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSettings(formData);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !businessName.trim()) {
      setProfileError('Full name and business name cannot be blank.');
      return;
    }
    setProfileSaving(true);
    setProfileError(null);
    try {
      const updated = await api.updateProfile({
        fullName: fullName.trim(),
        businessName: businessName.trim(),
      });
      onUserUpdated?.(updated);
      onNotify?.('Merchant profile saved to database.');
    } catch (err: any) {
      setProfileError(err?.message || 'Failed to update profile.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPwError('New password and confirmation do not match.');
      return;
    }
    if (newPassword.length < 10) {
      setPwError('New password must be at least 10 characters and include uppercase, lowercase, digit, and special character.');
      return;
    }
    setPwSaving(true);
    setPwError(null);
    try {
      await api.changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      onUserUpdated?.(null);
      onNotify?.('Password changed and existing sessions revoked. Please sign in with your new password.');
      onOpenAuth?.();
    } catch (err: any) {
      setPwError(err?.message || 'Failed to change password.');
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Overview Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <span>Merchant Account, Security & API Settings</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-[#7E96C4]">
            Manage your merchant profile, password security, PayPal sandbox status, and AI threshold preferences.
          </p>
        </div>

        {saveSuccess && (
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 dark:bg-[#042416] text-emerald-800 dark:text-[#34D399] border border-emerald-300 dark:border-[#059669]/60 text-xs font-bold animate-in fade-in shadow-sm">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-[#10B981]" />
            <span>Settings Saved Successfully</span>
          </div>
        )}
      </div>

      {/* Section A: Live System Health & Backend Services */}
      <div className="fintech-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#0070BA]" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Backend Infrastructure Telemetry</h3>
          </div>
          <span
            className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full border ${
              systemHealth?.status === 'HEALTHY'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
            }`}
          >
            {systemHealth ? `${systemHealth.status} • DB: ${systemHealth.database || 'OK'} • Redis: ${systemHealth.redis || 'Memory Fallback'}` : 'Backend Unreachable'}
          </span>
        </div>
      </div>

      {/* Section B: Authenticated Account Profile & Password Change */}
      {currentUser ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <form onSubmit={handleSaveProfile} className="fintech-card p-5 space-y-3 text-xs">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-200/80 dark:border-white/[0.08]">
              <UserCheck className="w-4 h-4 text-[#0070BA]" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Merchant Profile</h3>
            </div>

            {profileError && (
              <div role="alert" className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-200 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{profileError}</span>
              </div>
            )}

            <div>
              <label htmlFor="prof-email" className="block font-semibold text-slate-700 dark:text-[#8EA1C7] mb-1">
                Account Email
              </label>
              <input
                id="prof-email"
                type="email"
                disabled
                value={currentUser.email}
                className="w-full py-2 px-3 rounded-xl bg-slate-100 dark:bg-[#040B1A] border border-slate-200 dark:border-[#18366E] text-slate-500 font-mono"
              />
            </div>

            <div>
              <label htmlFor="prof-fullname" className="block font-semibold text-slate-700 dark:text-[#8EA1C7] mb-1">
                Full Name
              </label>
              <input
                id="prof-fullname"
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#18366E] text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label htmlFor="prof-biz" className="block font-semibold text-slate-700 dark:text-[#8EA1C7] mb-1">
                Business Name
              </label>
              <input
                id="prof-biz"
                type="text"
                required
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#18366E] text-slate-900 dark:text-white"
              />
            </div>

            <button
              type="submit"
              disabled={profileSaving}
              className="w-full py-2.5 rounded-full bg-[#0070BA] hover:bg-[#005EA6] text-white font-bold disabled:opacity-50"
            >
              {profileSaving ? 'Updating Profile...' : 'Update Merchant Profile'}
            </button>
          </form>

          <form onSubmit={handleChangePassword} className="fintech-card p-5 space-y-3 text-xs">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-200/80 dark:border-white/[0.08]">
              <Key className="w-4 h-4 text-[#0070BA]" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Change Account Password</h3>
            </div>

            {pwError && (
              <div role="alert" className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-200 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>{pwError}</span>
              </div>
            )}

            <div>
              <label htmlFor="cur-pw" className="block font-semibold text-slate-700 dark:text-[#8EA1C7] mb-1">
                Current Password
              </label>
              <input
                id="cur-pw"
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#18366E] text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label htmlFor="new-pw" className="block font-semibold text-slate-700 dark:text-[#8EA1C7] mb-1">
                New Strong Password
              </label>
              <input
                id="new-pw"
                type="password"
                required
                minLength={10}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="10+ chars, upper, lower, digit, symbol"
                className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#18366E] text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label htmlFor="conf-pw" className="block font-semibold text-slate-700 dark:text-[#8EA1C7] mb-1">
                Confirm New Password
              </label>
              <input
                id="conf-pw"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#18366E] text-slate-900 dark:text-white"
              />
            </div>

            <button
              type="submit"
              disabled={pwSaving}
              className="w-full py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 dark:bg-[#0E2046] text-white font-bold disabled:opacity-50"
            >
              {pwSaving ? 'Updating Password...' : 'Change Password & Rotate Tokens'}
            </button>
          </form>
        </div>
      ) : (
        <div className="fintech-card p-5 flex items-center justify-between gap-4 text-xs">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">Merchant Account Authentication</h3>
            <p className="text-slate-500 dark:text-[#7E96C4] mt-0.5">
              Sign in to edit your profile, rotate passwords, and inspect per-account security audit logs.
            </p>
          </div>
          {onOpenAuth && (
            <button
              type="button"
              onClick={onOpenAuth}
              className="px-4 py-2 rounded-full bg-[#0070BA] text-white font-bold shrink-0"
            >
              Sign In / Register
            </button>
          )}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Section 1: Server-Managed PayPal Sandbox Credentials */}
        <div className="fintech-card p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200/80 dark:border-white/[0.08]">
            <div className="flex items-center gap-2.5">
              <PayPalLogo size="sm" />
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">PayPal Developer Sandbox REST Integration</h3>
                <p className="text-xs text-slate-500 dark:text-[#7E96C4]">Credentials & Webhook ID are strictly managed server-side via FastAPI environment variables</p>
              </div>
            </div>
            <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-[#0070BA]/10 text-[#0070BA] dark:text-[#38BDF8] border border-[#0070BA]/25 font-bold font-mono">
              REST v2 Sandbox
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200/80 dark:border-white/[0.06] flex items-start gap-2.5 text-xs">
            <Lock className="w-4 h-4 text-[#0070BA] dark:text-[#10B981] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-bold text-slate-900 dark:text-white">Server-Side Credential Isolation Active</div>
              <p className="text-[11px] text-slate-500 dark:text-[#7E96C4]">
                PayPal Client Secret and Webhook ID never leave the backend container (<code className="text-slate-700 dark:text-slate-300">PAYPAL_CLIENT_SECRET</code>, <code className="text-slate-700 dark:text-slate-300">PAYPAL_WEBHOOK_ID</code>). The frontend receives only the public PayPal Client ID from <code className="text-slate-700 dark:text-slate-300">GET /api/v1/paypal/config</code>.
              </p>
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
              <p className="text-xs text-slate-500 dark:text-[#7E96C4]">Configure local alert display thresholds for chargeback monitoring</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-800 dark:text-white mb-1">
                <label htmlFor="dispute-horizon-range">Dispute Alert Horizon:</label>
                <span className="font-mono text-[#B45309] dark:text-[#FFC439] font-bold">{formData.disputeThresholdPercent}%</span>
              </div>
              <input
                id="dispute-horizon-range"
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
                  className="rounded bg-white dark:bg-[#081329] border-slate-300 dark:border-[#18366E] text-[#0070BA] h-4 w-4"
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
                  className="rounded bg-white dark:bg-[#081329] border-slate-300 dark:border-[#18366E] text-[#0070BA] h-4 w-4"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Section 3: Security Posture */}
        <div className="fintech-card p-5 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-200/80 dark:border-white/[0.08]">
            <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Enterprise Security & Compliance Posture</h3>
              <p className="text-xs text-slate-500 dark:text-[#7E96C4]">Active application hardening, cryptographic tokens, and rate limiting status</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200/80 dark:border-white/[0.06] flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-slate-900 dark:text-white block">Bcrypt Password Hashing</span>
                <span className="text-[11px] text-slate-500 dark:text-[#7E96C4]">Cost factor 12 with constant-time verification</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200/80 dark:border-white/[0.06] flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-slate-900 dark:text-white block">Cryptographic JWT Sessions</span>
                <span className="text-[11px] text-slate-500 dark:text-[#7E96C4]">HS256 with JTI revocation + atomic token version rotation</span>
              </div>
            </div>
          </div>
        </div>

        {/* Section 4: Demonstration Reset (unauthenticated preview only) */}
        {!currentUser && (
          <div className="fintech-card p-5 space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-200/80 dark:border-white/[0.08]">
              <div className="p-1.5 rounded-lg bg-sky-50 text-[#0070BA] dark:bg-[#0070BA]/20 dark:text-[#38BDF8]">
                <Database className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Demonstration Dataset Reset</h3>
                <p className="text-xs text-slate-500 dark:text-[#7E96C4]">Restore initial sample preview transactions and health metrics</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-3.5 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200/80 dark:border-white/[0.06]">
              <div>
                <span className="text-xs font-bold text-slate-900 dark:text-white block">
                  Reset Sample Preview Dataset
                </span>
                <span className="text-[11px] text-slate-500 dark:text-[#7E96C4]">
                  Restores original local sample transactions for demo evaluation
                </span>
              </div>
              <button
                type="button"
                onClick={onResetDemoData}
                className="px-4 py-2 rounded-full bg-slate-200 hover:bg-slate-300 dark:bg-[#0E2046] dark:hover:bg-[#142D62] text-slate-800 dark:text-white border border-slate-300 dark:border-[#20438A] text-xs font-bold flex items-center gap-1.5 transition-all btn-press"
              >
                <RotateCcw className="w-3.5 h-3.5 text-[#0070BA] dark:text-[#38BDF8]" />
                <span>Reset Demo</span>
              </button>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="submit"
            className="px-6 py-2.5 rounded-full bg-[#0070BA] hover:bg-[#005EA6] active:scale-[0.99] text-white font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-sm transition-all btn-press"
          >
            <Save className="w-4 h-4" />
            <span>Save Preferences</span>
          </button>
        </div>
      </form>
    </div>
  );
};
