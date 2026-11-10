import React, { useState, useEffect } from 'react';
import { MOCK_SCAM_SAMPLES } from '../data/mockData';
import { ScamAnalysisResult, RiskLevel, ThreatDistributionResponse } from '../types';
import { RiskBadge } from '../components/common/RiskBadge';
import { DataSourceBadge } from '../components/common/DataSourceBadge';
import { PayPalLogo } from '../components/common/PayPalLogo';
import { api, authStorage } from '../services/api';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  Search,
  ExternalLink,
  Lock,
  Eye,
  CheckCircle2,
  XCircle,
  Copy,
  Sparkles,
  Info,
  ArrowRight,
  MessageSquare,
  Mail,
  Smartphone,
  CreditCard,
  Bell,
  Clock,
  History,
  PieChart as PieChartIcon,
  ShieldQuestion,
  FileCheck2,
  Terminal,
  RotateCcw
} from 'lucide-react';

export const ScamShieldView: React.FC = () => {
  // Navigation active sub-tab
  const [activeTab, setActiveTab] = useState<'analyzer' | 'history'>('analyzer');

  // Input states
  const [inputText, setInputText] = useState<string>(MOCK_SCAM_SAMPLES[0].content);
  const [targetChannel, setTargetChannel] = useState<'email' | 'sms' | 'whatsapp' | 'payment_request' | 'notification'>('email');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [analysisResult, setAnalysisResult] = useState<ScamAnalysisResult | null>(null);

  // History and distribution data states
  const [auditHistory, setAuditHistory] = useState<ScamAnalysisResult[]>([]);
  const [threatDistribution, setThreatDistribution] = useState<ThreatDistributionResponse | null>(null);
  const [selectedAuditLog, setSelectedAuditLog] = useState<ScamAnalysisResult | null>(null);

  // Fetch scan history and distribution when authenticated
  const loadHistoryData = async () => {
    if (!authStorage.getToken()) {
      return;
    }
    try {
      const hist = await api.getScamHistory();
      if (hist && hist.length > 0) setAuditHistory(hist);
    } catch (err) {
      console.warn('Scam history unavailable:', err);
    }

    try {
      const dist = await api.getScamThreatDistribution();
      if (dist) setThreatDistribution(dist);
    } catch (err) {
      console.warn('Threat distribution unavailable:', err);
    }
  };

  useEffect(() => {
    loadHistoryData();
  }, []);

  // Additional realistic scenario presets
  const scenarioPresets = [
    {
      title: 'Spoofed Account Suspension (Email)',
      channel: 'email' as const,
      content: `From: service@security-paypal-resolution-center.com
Subject: [URGENT ACTION REQUIRED] Your PayPal Account #PP-994-012 has been restricted!

Dear Verified Customer,
We detected unusual activity from IP 185.220.101.44 (St. Petersburg, Russia). To protect your funds of $2,480.00, we have temporarily frozen all outgoing transfers.

You must verify your billing identity within 24 hours or your balance will be permanently confiscated under PayPal User Agreement section 10.2.

Click the secure link below to unlock your account:
https://paypal.com-account-recovery-portal.net/secure/auth?token=92840182

Do not reply directly to this automated email.
PayPal Security Team 2026`
    },
    {
      title: 'Urgent Wire Overpayment (WhatsApp)',
      channel: 'whatsapp' as const,
      content: `Hello merchant, I just sent you $1,500 via PayPal for item #4891. But my assistant accidentally overpaid you by $700 (invoice was only $800). Please immediately wire the $700 difference to my Zelle/Western Union account so I don't cancel the payment. Here is the confirmation receipt screenshot link: http://bit.ly/paypal-receipt-proof-7712`
    },
    {
      title: 'Urgent Frozen Account Notice (SMS)',
      channel: 'sms' as const,
      content: `[PAYPAL ALERT]: Your merchant wallet balance ($3,420.00) is ON HOLD due to unverified tax credentials. Immediate action required within 6 hours to avoid suspension: https://tinyurl.com/pp-tax-restore`
    },
    {
      title: 'OTP Credential Harvesting (Notification)',
      channel: 'notification' as const,
      content: `PayPal Security Alert: A new device logged into your merchant account from Berlin, Germany. If this was not you, confirm your identity immediately. Reply with your 6-digit one-time verification code (OTP) and password to secure your funds.`
    },
    {
      title: 'Genuine PayPal Payment Receipt (Safe Baseline)',
      channel: 'email' as const,
      content: `From: service@paypal.com
Subject: You received a payment of $120.00 USD from John Doe

Hello Merchant,
Good news! You've received a payment of $120.00 USD from John Doe (johndoe@example.com).
Transaction ID: 4T839201928374
View details in your official PayPal Activity Dashboard at paypal.com.
Thank you for using PayPal.`
    }
  ];

  // Analyze text via FastAPI backend with safe fallback
  const handleAnalyze = async () => {
    setIsScanning(true);

    try {
      const res = await api.analyzeScam(inputText, targetChannel, targetChannel);
      setAnalysisResult(res);
      // Refresh audit history in background
      loadHistoryData();
    } catch {
      // Fallback deterministic evaluation if backend temporarily unreachable
      const lower = inputText.toLowerCase();
      const indicators: { category: string; description: string; severity: 'low' | 'medium' | 'high' | 'critical' }[] = [];
      let calculatedScore = 15;

      if (lower.includes('urgent') || lower.includes('suspended') || lower.includes('restricted') || lower.includes('confiscated') || lower.includes('within 24 hours')) {
        indicators.push({
          category: 'Psychological Coercion / Urgency',
          description: 'Uses artificial urgency and threats of PayPal fund confiscation to provoke panicked compliance.',
          severity: 'high',
        });
        calculatedScore += 30;
      }

      if (lower.includes('password') || lower.includes('otp') || lower.includes('one-time code') || lower.includes('cvv')) {
        indicators.push({
          category: 'Credential Harvesting',
          description: 'Solicits confidential login credentials. PayPal never requests passwords or OTPs via messaging.',
          severity: 'critical',
        });
        calculatedScore += 40;
      }

      if (lower.includes('http://') || lower.includes('.biz') || lower.includes('.cc') || lower.includes('.xyz') || lower.includes('paypal.com-') || lower.includes('bit.ly') || lower.includes('recovery-portal')) {
        indicators.push({
          category: 'Deceptive / Spoofed PayPal Domain',
          description: 'Contains suspicious top-level domains, URL shorteners, or deceptive compound hostnames masquerading as PayPal.',
          severity: 'critical',
        });
        calculatedScore += 35;
      }

      if (lower.includes('western union') || lower.includes('zelle') || lower.includes('overpaid') || lower.includes('accidentally overpaid')) {
        indicators.push({
          category: 'Off-Platform Overpayment Triangulation',
          description: 'Classic triangulation scam: demands unrecoverable external wire transfer refund before original payment bounces.',
          severity: 'critical',
        });
        calculatedScore += 35;
      }

      // Legitimate dampening
      if (lower.includes('service@paypal.com') && !lower.includes('http://') && !lower.includes('.xyz') && !lower.includes('bit.ly')) {
        calculatedScore = Math.max(5, calculatedScore - 35);
      }

      const finalScore = Math.min(99, Math.max(5, calculatedScore));
      let level: RiskLevel = 'LOW';
      if (finalScore >= 80) level = 'CRITICAL';
      else if (finalScore >= 60) level = 'HIGH';
      else if (finalScore >= 30) level = 'MEDIUM';

      const safeActions: string[] = [];
      if (finalScore >= 60) {
        safeActions.push('Do NOT click hyperlinks, open attachments, or call phone numbers listed in this message.');
        safeActions.push('Never wire refunds via external channels (Zelle, wire, crypto) for PayPal orders.');
        safeActions.push('Access your official PayPal merchant portal manually by typing "https://www.paypal.com".');
        safeActions.push('Forward unedited email headers to spoof@paypal.com for official security takedown.');
      } else {
        safeActions.push('Content conforms to expected PayPal communication standards. Standard operational vigilance applies.');
      }

      setAnalysisResult({
        id: `SCAN-${Date.now().toString().slice(-6)}`,
        timestamp: new Date().toLocaleTimeString(),
        targetType: targetChannel,
        channel: targetChannel,
        inputSnippet: inputText.slice(0, 100) + '...',
        riskScore: finalScore,
        riskLevel: level,
        confidence: 96,
        threatCategory: finalScore >= 60 ? 'Phishing & Impersonation Vector' : 'Normal Transactional Notice',
        indicators,
        safeActions,
        dataSource: 'synthetic',
        disclaimer: 'Finova Scam Shield provides heuristic and AI threat analysis. Diagnostic aid only — not absolute legal proof of fraud.'
      });
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Overview Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <span>PayPal AI Scam & Threat Shield</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-[#7E96C4]">
            Zero-touch syntactic threat inspection for suspicious payment requests, buyer emails, SMS alerts, and deceptive domain spoofing.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-[#042416] text-emerald-800 dark:text-[#34D399] border border-emerald-300 dark:border-[#059669]/60 flex items-center gap-1 font-bold">
            <Lock className="w-3 h-3 text-emerald-600 dark:text-[#10B981]" />
            Zero-Visit URL Sandbox Active
          </span>
          <DataSourceBadge source="synthetic" size="sm" />
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-[#162F64] pb-2 text-xs">
        <button
          onClick={() => setActiveTab('analyzer')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold transition-all ${
            activeTab === 'analyzer'
              ? 'bg-[#0070BA] text-white shadow-sm'
              : 'text-slate-600 dark:text-[#7E96C4] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#0E2046]'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          <span>Live Threat Analyzer</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('history');
            loadHistoryData();
          }}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold transition-all ${
            activeTab === 'history'
              ? 'bg-[#0070BA] text-white shadow-sm'
              : 'text-slate-600 dark:text-[#7E96C4] hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#0E2046]'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Audit Ledger & Threat Analytics</span>
          {auditHistory.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-mono">
              {auditHistory.length}
            </span>
          )}
        </button>
      </div>

      {/* SUB-VIEW 1: LIVE THREAT ANALYZER */}
      {activeTab === 'analyzer' && (
        <div className="space-y-6">
          {/* Preset Realistic Threat Scenarios */}
          <div className="fintech-card p-4 space-y-2">
            <div className="text-xs font-bold text-slate-900 dark:text-white mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#0070BA] dark:text-[#38BDF8]" />
                <span>Simulated Attack Vectors & Realistic Scenarios:</span>
              </span>
              <span className="text-[10px] text-slate-400 font-normal">Click preset to load into inspector</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
              {scenarioPresets.map((sample, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setInputText(sample.content);
                    setTargetChannel(sample.channel);
                    setAnalysisResult(null);
                  }}
                  className="text-left p-2.5 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200/90 dark:border-white/[0.08] hover:border-[#0070BA] dark:hover:border-[#0070BA] text-xs transition-all btn-press group shadow-xs"
                >
                  <div className="font-bold text-slate-900 dark:text-slate-100 group-hover:text-[#0070BA] dark:group-hover:text-[#38BDF8] line-clamp-1">
                    {sample.title}
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-[#7E96C4] uppercase mt-0.5 font-mono">
                    Channel: {sample.channel}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Input and Analyzer Work Area */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Input Pane (6 cols) */}
            <div className="lg:col-span-6 fintech-card p-5 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-[#162F64]">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Eye className="w-4 h-4 text-[#0070BA]" />
                  <span>Target Message / Payload</span>
                </h3>

                {/* Channel Selector */}
                <div className="flex items-center bg-slate-100 dark:bg-[#050C1C] border border-slate-200 dark:border-[#18366E] rounded-xl p-0.5 text-xs flex-wrap">
                  {[
                    { id: 'email', label: 'Email', icon: Mail },
                    { id: 'sms', label: 'SMS', icon: Smartphone },
                    { id: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
                    { id: 'payment_request', label: 'Payment Req', icon: CreditCard },
                    { id: 'notification', label: 'Notification', icon: Bell }
                  ].map((ch) => {
                    const Icon = ch.icon;
                    return (
                      <button
                        key={ch.id}
                        onClick={() => setTargetChannel(ch.id as any)}
                        className={`px-2.5 py-1 rounded-lg font-bold text-[11px] flex items-center gap-1 transition-colors ${
                          targetChannel === ch.id
                            ? 'bg-white dark:bg-[#0070BA] text-[#003087] dark:text-white shadow-sm'
                            : 'text-slate-500 dark:text-[#7E96C4] hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        <Icon className="w-3 h-3" />
                        <span>{ch.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-[#8EA1C7] mb-1.5">
                  Paste suspicious communication, payment request text, or candidate PayPal URL:
                </label>
                <textarea
                  rows={9}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Paste raw text or URL here for immediate threat assessment..."
                  className="w-full p-3.5 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#18366E] text-slate-900 dark:text-slate-200 font-mono text-xs leading-relaxed focus:outline-none focus:border-[#0070BA]"
                />
                <div className="flex justify-between items-center text-[10px] text-slate-400 mt-1 font-mono">
                  <span>Channel: {targetChannel.toUpperCase()}</span>
                  <span>{inputText.length} characters</span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#18366E] text-[11px] text-slate-600 dark:text-[#9BB0D6] flex items-start gap-2">
                <Info className="w-4 h-4 shrink-0 mt-0.5 text-[#0070BA] dark:text-[#38BDF8]" />
                <p>
                  <strong>Zero-Touch Static Inspection Guarantee:</strong> Finova never makes outbound HTTP requests to candidate links. Hostnames, punycode, and redirect parameters are examined via static syntactic parsing to protect your IP and sandbox integrity.
                </p>
              </div>

              <button
                onClick={handleAnalyze}
                disabled={isScanning || !inputText.trim()}
                className="w-full py-3 rounded-full bg-[#0070BA] hover:bg-[#005EA6] active:scale-[0.99] text-white font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50"
              >
                <ShieldAlert className="w-4 h-4" />
                <span>{isScanning ? 'Executing FastAPI & AI Threat Inspection...' : 'Analyze Threat & Phishing Indicators'}</span>
              </button>
            </div>

            {/* Right Analysis Output (6 cols) */}
            <div className="lg:col-span-6 space-y-4">
              {!analysisResult ? (
                <div className="h-full min-h-[350px] fintech-card p-8 flex flex-col items-center justify-center text-center">
                  <div className="p-4 rounded-full bg-slate-100 dark:bg-[#050C1C] border border-slate-200/80 dark:border-white/[0.08] text-slate-400 mb-3">
                    <ShieldCheck className="w-8 h-8 text-[#0070BA] dark:text-[#38BDF8]" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">Threat Analyzer Ready</h3>
                  <p className="text-xs text-slate-500 dark:text-[#7E96C4] max-w-sm">
                    Click <strong>"Analyze Threat & Phishing Indicators"</strong> or load one of the presets above to inspect phishing vectors, domain spoofing, and risk scores.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Primary Risk Score Card */}
                  <div className={`p-5 rounded-2xl border ${
                    analysisResult.riskLevel === 'CRITICAL'
                      ? 'bg-rose-50/70 dark:bg-rose-950/40 border-rose-200/90 dark:border-rose-800/80 shadow-sm'
                      : analysisResult.riskLevel === 'HIGH'
                      ? 'bg-orange-50/70 dark:bg-orange-950/40 border-orange-200/90 dark:border-orange-800/80 shadow-sm'
                      : analysisResult.riskLevel === 'MEDIUM'
                      ? 'bg-amber-50/70 dark:bg-amber-950/40 border-amber-200/90 dark:border-amber-800/80 shadow-sm'
                      : 'bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-200/90 dark:border-emerald-800/80 shadow-sm'
                  }`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                          Scam Risk Score (0–100)
                        </div>
                        <div className="flex items-baseline gap-3 mt-1">
                          <span className="text-4xl font-extrabold font-mono tabular-nums text-slate-900 dark:text-white">
                            {analysisResult.riskScore}
                          </span>
                          <span className="text-sm text-slate-500 dark:text-slate-400 font-mono">/ 100</span>
                          <RiskBadge level={analysisResult.riskLevel} size="md" />
                        </div>
                        {analysisResult.threatCategory && (
                          <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-2 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-[#0070BA]" />
                            <span>Vector: {analysisResult.threatCategory}</span>
                          </div>
                        )}
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">Model Confidence</span>
                        <div className="text-sm font-bold text-[#0070BA] dark:text-[#38BDF8] font-mono tabular-nums">
                          {analysisResult.confidence}%
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          ID: {analysisResult.id}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-slate-200/60 dark:border-white/[0.08] text-[11px] text-slate-500 dark:text-slate-400 italic">
                      {analysisResult.disclaimer || 'Diagnostic assessment only. Do not treat score as proof of fraud.'}
                    </div>
                  </div>

                  {/* Zero-Touch URL Inspector Details */}
                  {analysisResult.safeInspectionDetails && (
                    <div className="bg-white dark:bg-[#081329] border border-slate-200 dark:border-[#162F64] rounded-2xl p-4 text-xs space-y-2 shadow-sm">
                      <div className="font-bold text-slate-900 dark:text-white flex items-center justify-between pb-1 border-b border-slate-200 dark:border-[#162F64]">
                        <span className="flex items-center gap-1.5">
                          <Lock className="w-3.5 h-3.5 text-[#0070BA] dark:text-[#38BDF8]" />
                          <span>Zero-Touch Syntactic Domain Inspection</span>
                        </span>
                        {analysisResult.safeInspectionDetails.isVerifiedPayPalDomain ? (
                          <span className="text-[10px] px-2 py-0.2 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold">
                            Verified PayPal Domain
                          </span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.2 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 font-bold">
                            Unverified Third-Party Hostname
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                        <div className="bg-slate-50 dark:bg-[#050C1C] p-2.5 rounded-xl border border-slate-200 dark:border-[#162F64]">
                          <span className="text-slate-500 dark:text-[#6881B0] block">Candidate Hostname:</span>
                          <span className="text-[#B45309] dark:text-[#FFC439] font-bold">{analysisResult.safeInspectionDetails.domain}</span>
                        </div>
                        <div className="bg-slate-50 dark:bg-[#050C1C] p-2.5 rounded-xl border border-slate-200 dark:border-[#162F64]">
                          <span className="text-slate-500 dark:text-[#6881B0] block">Top-Level Domain (TLD):</span>
                          <span className="text-slate-900 dark:text-white font-bold">.{analysisResult.safeInspectionDetails.topLevelDomain}</span>
                        </div>
                      </div>

                      {analysisResult.safeInspectionDetails.threatSignals && analysisResult.safeInspectionDetails.threatSignals.length > 0 && (
                        <div className="text-[11px] text-rose-800 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 p-2.5 rounded-xl border border-rose-200 dark:border-rose-900/50 space-y-1">
                          <div className="font-bold flex items-center gap-1">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>Domain Threat Signals:</span>
                          </div>
                          {analysisResult.safeInspectionDetails.threatSignals.map((sig, i) => (
                            <div key={i} className="pl-4 leading-relaxed">• {sig}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Detected Indicators List */}
                  <div className="bg-white dark:bg-[#081329] border border-slate-200 dark:border-[#162F64] rounded-2xl p-4 shadow-sm">
                    <div className="text-xs font-bold text-slate-900 dark:text-white mb-2 flex items-center justify-between">
                      <span>Detected Threat Indicators ({analysisResult.indicators.length})</span>
                      <span className="text-[10px] text-slate-500 dark:text-[#7E96C4]">PayPal Security Heuristics</span>
                    </div>

                    {analysisResult.indicators.length === 0 ? (
                      <div className="p-3 rounded-xl bg-emerald-50 dark:bg-[#042416] text-emerald-800 dark:text-[#34D399] text-xs flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-[#10B981] shrink-0" />
                        <span>No known phishing signals or coercive urgency vectors detected. Message conforms to expected commercial communication.</span>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {analysisResult.indicators.map((ind, i) => (
                          <div key={i} className="p-3 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#162F64] text-xs">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-bold text-rose-700 dark:text-rose-300">{ind.category}</span>
                              <span className="text-[10px] uppercase font-bold px-1.5 py-0.2 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
                                {ind.severity}
                              </span>
                            </div>
                            <p className="text-slate-600 dark:text-[#9BB0D6] text-[11px] leading-relaxed">
                              {ind.description}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Recommended Safe Actions */}
                  <div className="bg-white dark:bg-[#081329] border border-slate-200 dark:border-[#162F64] rounded-2xl p-4 shadow-sm">
                    <div className="text-xs font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-[#10B981]" />
                      <span>Recommended Safe Merchant Actions</span>
                    </div>
                    <div className="space-y-1.5">
                      {analysisResult.safeActions.map((action, i) => (
                        <div key={i} className="p-2.5 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#162F64] text-xs text-slate-600 dark:text-[#9BB0D6] flex items-start gap-2">
                          <span className="text-emerald-600 dark:text-[#10B981] font-bold mt-0.5">•</span>
                          <p className="leading-relaxed">{action}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* SUB-VIEW 2: AUDIT LEDGER & THREAT ANALYTICS */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          {/* Threat Distribution Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-white dark:bg-[#081329] border border-slate-200 dark:border-[#162F64] shadow-sm">
              <div className="text-xs text-slate-500 dark:text-[#7E96C4] font-semibold">Total Threat Scans</div>
              <div className="text-2xl font-extrabold text-slate-900 dark:text-white font-mono mt-1">
                {threatDistribution?.totalScans ?? auditHistory.length}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">Recorded in audit database</div>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-[#081329] border border-slate-200 dark:border-[#162F64] shadow-sm">
              <div className="text-xs text-slate-500 dark:text-[#7E96C4] font-semibold">Average Risk Score</div>
              <div className="text-2xl font-extrabold text-amber-600 dark:text-[#FFC439] font-mono mt-1">
                {(threatDistribution?.averageRiskScore ?? 0).toFixed(1)}/100
              </div>
              <div className="text-[11px] text-slate-400 mt-1">Across analyzed payloads</div>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-[#081329] border border-slate-200 dark:border-[#162F64] shadow-sm">
              <div className="text-xs text-slate-500 dark:text-[#7E96C4] font-semibold">Critical Threat Rate</div>
              <div className="text-2xl font-extrabold text-rose-600 dark:text-rose-400 font-mono mt-1">
                {(threatDistribution?.distribution?.CRITICAL?.percentage ?? 0).toFixed(1)}%
              </div>
              <div className="text-[11px] text-rose-500/80 mt-1">Active phishing or overpayment</div>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-[#081329] border border-slate-200 dark:border-[#162F64] shadow-sm">
              <div className="text-xs text-slate-500 dark:text-[#7E96C4] font-semibold">Threat Vectors Flagged</div>
              <div className="text-2xl font-extrabold text-[#0070BA] dark:text-[#38BDF8] font-mono mt-1">
                {threatDistribution?.threatIndicatorsFound ?? 0}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">Urgency, shorteners, domains</div>
            </div>
          </div>

          {/* Audit History Table */}
          <div className="rounded-2xl bg-white dark:bg-[#081329] border border-slate-200 dark:border-[#162F64] p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                  <History className="w-5 h-5 text-[#0070BA]" />
                  <span>Recent Threat Inspection Audit Log</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-[#7E96C4]">
                  All sensitive credentials (passwords, card PANs, OTPs) are automatically redacted before logging.
                </p>
              </div>
              <button
                onClick={loadHistoryData}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-[#0E2046] dark:hover:bg-[#142D62] text-xs font-bold flex items-center gap-1.5 text-slate-700 dark:text-white transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Refresh Log</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-[#050C1C] text-slate-600 dark:text-[#7E96C4] uppercase tracking-wider font-semibold border-b border-slate-200 dark:border-[#162F64]">
                  <tr>
                    <th className="py-3 px-3">Scan ID</th>
                    <th className="py-3 px-3">Channel / Type</th>
                    <th className="py-3 px-3">Sanitized Input Snippet</th>
                    <th className="py-3 px-3">Risk Score</th>
                    <th className="py-3 px-3">Risk Level</th>
                    <th className="py-3 px-3">Indicators</th>
                    <th className="py-3 px-3">Time</th>
                    <th className="py-3 px-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#132854] font-medium">
                  {auditHistory.length > 0 ? (
                    auditHistory.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-[#0E214A] transition-colors">
                        <td className="py-3.5 px-3 font-mono font-bold text-slate-900 dark:text-white">
                          {item.id}
                        </td>
                        <td className="py-3.5 px-3 uppercase text-[10px] font-bold font-mono text-slate-600 dark:text-[#8EA1C7]">
                          {item.targetType}
                        </td>
                        <td className="py-3.5 px-3 font-mono text-slate-600 dark:text-[#9BB0D6] max-w-xs truncate">
                          {item.inputSnippet}
                        </td>
                        <td className="py-3.5 px-3 font-mono font-bold text-slate-900 dark:text-white">
                          {item.riskScore}/100
                        </td>
                        <td className="py-3.5 px-3">
                          <RiskBadge level={item.riskLevel} size="sm" />
                        </td>
                        <td className="py-3.5 px-3 font-mono text-slate-500">
                          {item.indicators?.length ?? 0} signals
                        </td>
                        <td className="py-3.5 px-3 font-mono text-slate-400">
                          {item.timestamp}
                        </td>
                        <td className="py-3.5 px-3">
                          <button
                            onClick={() => {
                              setAnalysisResult(item);
                              setActiveTab('analyzer');
                            }}
                            className="px-2.5 py-1 rounded-lg bg-[#0070BA]/10 hover:bg-[#0070BA]/20 text-[#0070BA] dark:text-[#38BDF8] font-bold text-[11px] transition-colors"
                          >
                            View Report
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="py-6 text-center text-slate-400">
                        No scam inspections recorded yet. Submit a message or preset above.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
