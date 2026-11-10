import React, { useState, useEffect } from 'react';
import { User, SecurityAuditLog } from '../../types';
import { api } from '../../services/api';
import { PayPalLogo } from './PayPalLogo';
import {
  Lock,
  Mail,
  User as UserIcon,
  Building,
  Key,
  Shield,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  X,
  LogOut,
  RefreshCw,
  Clock,
  Eye,
  EyeOff
} from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  onAuthChange: (user: User | null) => void;
  initialResetToken?: string | null;
  onClearResetToken?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onAuthChange,
  initialResetToken,
  onClearResetToken
}) => {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'audit'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<SecurityAuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);

  useEffect(() => {
    if (isOpen && initialResetToken) {
      setMode('forgot');
      setResetToken(initialResetToken);
      setErrorMsg(null);
      setSuccessMsg('Reset link verified. Enter your new strong password below.');
    }
  }, [isOpen, initialResetToken]);

  useEffect(() => {
    if (!currentUser) {
      setAuditLogs([]);
      setMode((prev) => (prev === 'audit' ? 'login' : prev));
    }
  }, [currentUser]);

  useEffect(() => {
    if (isOpen && mode === 'audit' && currentUser) {
      loadAuditLogs();
    }
  }, [isOpen, mode, currentUser]);

  const loadAuditLogs = async () => {
    if (!currentUser) {
      setAuditLogs([]);
      return;
    }
    setAuditLoading(true);
    try {
      const logs = await api.getSecurityAuditLogs(20);
      setAuditLogs(logs);
    } catch {
      setAuditLogs([]);
    } finally {
      setAuditLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.login({ email, password });
      onAuthChange(res.user);
      setSuccessMsg(`Welcome back, ${res.user.fullName}! Authenticated with JWT session.`);
      setTimeout(() => {
        onClose();
        setSuccessMsg(null);
      }, 1500);
    } catch (err: any) {
      setErrorMsg(err.message || 'Login failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.register({
        email,
        password,
        fullName,
        businessName
      });
      onAuthChange(res.user);
      setSuccessMsg(`Account created successfully! Logged in as ${res.user.fullName}.`);
      setTimeout(() => {
        onClose();
        setSuccessMsg(null);
      }, 1500);
    } catch (err: any) {
      setErrorMsg(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.forgotPassword(email);
      setSuccessMsg(res.message);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to request password reset.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.resetPassword(resetToken, newPassword);
      setSuccessMsg(res.message);
      setResetToken('');
      setNewPassword('');
      onClearResetToken?.();
      setTimeout(() => {
        setMode('login');
        setSuccessMsg(null);
      }, 2000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update password.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);
    try {
      await api.logout();
      setAuditLogs([]);
      setMode('login');
      onAuthChange(null);
      setSuccessMsg('Logged out successfully. Token revoked.');
      setTimeout(() => {
        onClose();
        setSuccessMsg(null);
      }, 1000);
    } catch {
      setAuditLogs([]);
      setMode('login');
      onAuthChange(null);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
      <div className="fintech-card max-w-md w-full shadow-2xl overflow-hidden flex flex-col border border-slate-200/90 dark:border-white/[0.12]">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-[#002875] to-[#00457C] text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-white/15">
              <ShieldCheck className="w-5 h-5 text-[#FFC439]" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold tracking-tight">Finova Security & Authentication</h3>
              <p className="text-[10px] text-blue-100">Bcrypt Hashing • JWT Tokens • Access Isolation</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="flex border-b border-slate-200 dark:border-[#162F64] text-xs font-bold bg-slate-50 dark:bg-[#050C1C]">
          {currentUser ? (
            <>
              <button
                onClick={() => setMode('login')}
                className={`flex-1 py-2.5 text-center transition-colors ${
                  mode === 'login' ? 'text-[#0070BA] dark:text-[#38BDF8] border-b-2 border-[#0070BA]' : 'text-slate-500'
                }`}
              >
                Profile & Session
              </button>
              <button
                onClick={() => setMode('audit')}
                className={`flex-1 py-2.5 text-center transition-colors ${
                  mode === 'audit' ? 'text-[#0070BA] dark:text-[#38BDF8] border-b-2 border-[#0070BA]' : 'text-slate-500'
                }`}
              >
                Security Audit
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => { setMode('login'); setErrorMsg(null); setSuccessMsg(null); }}
                className={`flex-1 py-2.5 text-center transition-colors ${
                  mode === 'login' ? 'text-[#0070BA] dark:text-[#38BDF8] border-b-2 border-[#0070BA]' : 'text-slate-500'
                }`}
              >
                Log In
              </button>
              <button
                onClick={() => { setMode('register'); setErrorMsg(null); setSuccessMsg(null); }}
                className={`flex-1 py-2.5 text-center transition-colors ${
                  mode === 'register' ? 'text-[#0070BA] dark:text-[#38BDF8] border-b-2 border-[#0070BA]' : 'text-slate-500'
                }`}
              >
                Register
              </button>
            </>
          )}
        </div>

        {/* Status Alerts */}
        {errorMsg && (
          <div className="m-4 mb-0 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="m-4 mb-0 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-5 flex-1 overflow-y-auto max-h-[460px]">
          {/* 1. Authenticated User Profile view */}
          {currentUser && mode === 'login' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#162F64] space-y-2 text-xs">
                <div className="flex justify-between items-center pb-2 border-b border-slate-200 dark:border-[#162F64]">
                  <span className="text-slate-500">Merchant Status</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold font-mono">
                    Authenticated (JWT)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Full Name:</span>
                  <span className="font-bold text-slate-900 dark:text-white">{currentUser.fullName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Business:</span>
                  <span className="font-bold text-slate-900 dark:text-white">{currentUser.businessName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Email:</span>
                  <span className="font-mono text-slate-900 dark:text-white">{currentUser.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Account ID:</span>
                  <span className="font-mono text-slate-500">{currentUser.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Role:</span>
                  <span className="uppercase font-mono font-bold text-[#0070BA] dark:text-[#38BDF8]">{currentUser.role}</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-[#0070BA]/10 border border-[#0070BA]/20 text-[11px] text-slate-700 dark:text-slate-300">
                🔒 Data Isolation Active: All captured PayPal sandbox transactions and audit records are bound to your merchant account.
              </div>

              <button
                onClick={handleLogout}
                disabled={loading}
                className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors shadow-sm"
              >
                <LogOut className="w-4 h-4" />
                <span>Log Out (Revoke Token)</span>
              </button>
            </div>
          )}

          {/* 2. Login Form */}
          {!currentUser && mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">Merchant Email</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="merchant@example.com"
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#162F64] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0070BA]"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="font-bold text-slate-700 dark:text-slate-200">Password</label>
                  <button
                    type="button"
                    onClick={() => { setMode('forgot'); setErrorMsg(null); setSuccessMsg(null); }}
                    className="text-[11px] text-[#0070BA] dark:text-[#38BDF8] hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-9 pr-10 py-2 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#162F64] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0070BA]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl bg-[#0070BA] hover:bg-[#005EA6] text-white font-bold transition-colors shadow-sm flex items-center justify-center gap-2 mt-4"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                <span>Sign In Securely</span>
              </button>

              <div className="text-center text-[11px] text-slate-500 pt-2">
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => { setMode('register'); setErrorMsg(null); }}
                  className="font-bold text-[#0070BA] dark:text-[#38BDF8] hover:underline"
                >
                  Register here
                </button>
              </div>
            </form>
          )}

          {/* 3. Register Form */}
          {!currentUser && mode === 'register' && (
            <form onSubmit={handleRegister} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">Full Name</label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Jane Doe"
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#162F64] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0070BA]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">Business Name</label>
                <div className="relative">
                  <Building className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    required
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="Finova Commerce Ltd"
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#162F64] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0070BA]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">Email Address</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="merchant@example.com"
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#162F64] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0070BA]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-200 mb-1">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 8 chars, uppercase, lowercase, number"
                    className="w-full pl-9 pr-10 py-2 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#162F64] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0070BA]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Enforces bcrypt hashing (12 rounds) with continuous salted validation.
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl bg-[#0070BA] hover:bg-[#005EA6] text-white font-bold transition-colors shadow-sm flex items-center justify-center gap-2 mt-3"
              >
                {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                <span>Create Merchant Account</span>
              </button>
            </form>
          )}

          {/* 4. Forgot / Reset Password */}
          {mode === 'forgot' && (
            <div className="space-y-3.5 text-xs">
              {!resetToken ? (
                <>
                  <p className="text-slate-600 dark:text-[#9BB0D6]">
                    Enter your registered merchant email to receive a time-limited password reset link.
                  </p>
                  <form onSubmit={handleForgot} className="space-y-3">
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="merchant@example.com"
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#162F64] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0070BA]"
                    />
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-2 rounded-xl bg-[#0070BA] text-white font-bold transition-colors"
                    >
                      Send Reset Link
                    </button>
                  </form>
                </>
              ) : (
                <form onSubmit={handleResetPassword} className="space-y-3">
                  <p className="text-slate-600 dark:text-[#9BB0D6]">
                    Choose a strong new password (minimum 8 characters with uppercase, lowercase, and a digit).
                  </p>
                  <input
                    type="password"
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new strong password"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#162F64] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#0070BA]"
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2 rounded-xl bg-emerald-600 text-white font-bold"
                  >
                    Update Password
                  </button>
                </form>
              )}

              <div className="text-center pt-2">
                <button
                  onClick={() => {
                    setResetToken('');
                    onClearResetToken?.();
                    setMode('login');
                  }}
                  className="text-[11px] text-slate-500 hover:underline"
                >
                  Back to Sign In
                </button>
              </div>
            </div>
          )}

          {/* 5. Security Audit Log Viewer */}
          {mode === 'audit' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  Security Event Audit Ledger
                </span>
                <button
                  onClick={loadAuditLogs}
                  disabled={auditLoading}
                  className="text-[11px] text-[#0070BA] dark:text-[#38BDF8] flex items-center gap-1 font-bold"
                >
                  <RefreshCw className={`w-3 h-3 ${auditLoading ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>

              <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                {auditLogs.length > 0 ? (
                  auditLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#162F64] text-[11px]"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono font-bold text-slate-900 dark:text-white">
                          {log.action}
                        </span>
                        <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                          log.status === 'SUCCESS'
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                            : log.status === 'BLOCKED'
                            ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400'
                            : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                        }`}>
                          {log.status}
                        </span>
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                        <span>IP: {log.ipAddress || 'Internal'}</span>
                        <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-6 text-center text-xs text-slate-400">
                    No security audit logs recorded yet.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
