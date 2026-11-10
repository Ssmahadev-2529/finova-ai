import React, { useState, useRef, useEffect } from 'react';
import {
  ChatMessage,
  Transaction,
  AccountHealthMetrics,
  FinancialSummaryCard,
  AssistantChatResponse
} from '../types';
import { INITIAL_CHAT_MESSAGES } from '../data/mockData';
import { PayPalLogo } from '../components/common/PayPalLogo';
import { api } from '../services/api';
import {
  Bot,
  User,
  Send,
  Sparkles,
  Shield,
  HelpCircle,
  FileText,
  DollarSign,
  AlertTriangle,
  RotateCcw,
  Lock,
  ChevronRight,
  TrendingUp,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Trash2
} from 'lucide-react';

interface AiAssistantViewProps {
  transactions: Transaction[];
  healthMetrics: AccountHealthMetrics;
}

export const AiAssistantView: React.FC<AiAssistantViewProps> = ({
  transactions,
  healthMetrics
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    return [
      {
        id: 'MSG-INIT',
        sender: 'assistant',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        content: `Hello! I am your **Finova AI Financial Support Agent**.

I have direct, real-time read-only access to your **PayPal Sandbox transaction ledger** (${transactions.length} records), cost calculations, account health metrics (Standing: ${healthMetrics.healthScore}/100), and Scam Shield threat intelligence.

You can ask me questions about your revenue, transaction fee breakdowns, failed checkouts, detected anomalies, or cost-saving opportunities.`,
        financialCard: {
          type: 'metric_summary',
          title: 'Connected Merchant Ledger Snapshot',
          subtitle: 'Live PayPal Sandbox Database',
          metrics: [
            { label: 'Total Orders', value: `${transactions.length}`, subtext: 'Verified ledger records', accentColor: 'blue' },
            { label: 'Account Health', value: `${healthMetrics.healthScore}/100`, subtext: healthMetrics.healthTier || healthMetrics.healthStatus, accentColor: 'emerald' },
            { label: 'Dispute Rate', value: `${healthMetrics.disputeRate}%`, subtext: '1.00% max ceiling', accentColor: 'amber' },
            { label: 'Security Guardrail', value: 'Read-Only', subtext: 'Zero funds movement', accentColor: 'emerald' }
          ],
          actionHint: 'Click any suggested financial prompt below to start.'
        },
        suggestedFollowUps: [
          'What is my total revenue this month?',
          'How much did I pay in transaction fees?',
          'Show my failed transactions.'
        ]
      }
    ];
  });

  const [inputPrompt, setInputPrompt] = useState<string>('');
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Suggested Phase 6 quick prompts
  const suggestedPrompts = [
    {
      title: 'Total Revenue This Month',
      prompt: 'What is my total revenue this month?',
      icon: DollarSign
    },
    {
      title: 'Transaction Fees Paid',
      prompt: 'How much did I pay in transaction fees?',
      icon: CreditCard
    },
    {
      title: 'Highest Fee Transaction',
      prompt: 'Which transaction had the highest fee?',
      icon: TrendingUp
    },
    {
      title: 'Why Net Amount is Lower',
      prompt: 'Why is my net received amount lower?',
      icon: HelpCircle
    },
    {
      title: 'Failed Transactions',
      prompt: 'Show my failed transactions.',
      icon: AlertCircle
    },
    {
      title: 'Unusual Activity Detected',
      prompt: 'What unusual activity was detected?',
      icon: AlertTriangle
    },
    {
      title: 'Reduce Processing Costs',
      prompt: 'How can I reduce payment-processing costs?',
      icon: Sparkles
    },
    {
      title: 'Monthly Performance Summary',
      prompt: 'Summarize my financial performance this month.',
      icon: FileText
    }
  ];

  const handleSendMessage = async (textToSend?: string) => {
    const query = textToSend || inputPrompt;
    if (!query.trim()) return;

    const userMsg: ChatMessage = {
      id: `USER-${Date.now()}`,
      sender: 'user',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      content: query
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputPrompt('');
    setIsTyping(true);

    try {
      // Build lightweight conversation history for backend context
      const historyPayload = messages.slice(-4).map((m) => ({
        sender: m.sender,
        content: m.content
      }));

      // Query FastAPI backend AI Financial Support Agent
      const res: AssistantChatResponse = await api.chatWithAssistant(query, historyPayload);

      const assistantMsg: ChatMessage = {
        id: `ASST-${Date.now()}`,
        sender: 'assistant',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        content: res.reply + (res.groundingSource ? `\n\n_Source: ${res.groundingSource}${res.retrievedSources?.length ? ` (${res.retrievedSources.slice(0, 3).join(', ')})` : ''}_` : ''),
        category: (res.category as any) || 'general',
        financialCard: res.financialCard,
        suggestedFollowUps: res.suggestedFollowUps
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      // Graceful fallback using local ledger if backend is temporarily disconnected
      const lower = query.toLowerCase();
      let responseText = '';
      let card: FinancialSummaryCard | undefined;

      const grossVol = transactions.reduce((acc, t) => acc + (t.amount || 0), 0);
      const totalFees = transactions.reduce((acc, t) => acc + (t.actualFee || t.estimatedFee || 0), 0);
      const netReceived = grossVol - totalFees;
      const failed = transactions.filter((t) => t.status === 'DENIED');

      if (lower.includes('revenue') || lower.includes('sales')) {
        responseText = `### 📊 Total Revenue Summary\n\n- **Gross Payment Volume:** **$${grossVol.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD**\n- **Total Transactions:** **${transactions.length}**\n- **Net Received:** **$${netReceived.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD**\n\n*Computed deterministically from ${transactions.length} recorded PayPal transactions.*`;
        card = {
          type: 'metric_summary',
          title: 'Monthly Revenue Overview',
          metrics: [
            { label: 'Gross Volume', value: `$${grossVol.toFixed(2)}`, accentColor: 'blue' },
            { label: 'Net Settled', value: `$${netReceived.toFixed(2)}`, accentColor: 'emerald' },
            { label: 'Total Fees', value: `$${totalFees.toFixed(2)}`, accentColor: 'amber' }
          ]
        };
      } else if (lower.includes('fee')) {
        responseText = `### 💳 Transaction Fees Audit\n\nYou paid **$${totalFees.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD** in total PayPal processing fees across ${transactions.length} transactions.\n- **Effective Fee Rate:** **${((totalFees / Math.max(1, grossVol)) * 100).toFixed(2)}%**\n- **Standard US Rate:** 3.49% + $0.49 per transaction.`;
      } else if (lower.includes('failed') || lower.includes('denied')) {
        responseText = `### 🚫 Failed Transactions (${failed.length} found)\n\n` + (failed.length > 0 ? failed.map(f => `- **${f.id}**: $${f.amount.toFixed(2)} from ${f.customerName} (${f.status})`).join('\n') : 'No failed transactions detected.');
      } else {
        responseText = `I have audited your inquiry against your active PayPal Sandbox ledger.\n\n- **Active Orders:** ${transactions.length}\n- **Gross Volume:** $${grossVol.toFixed(2)} USD\n- **Account Health:** ${healthMetrics.healthScore}/100 (${healthMetrics.healthStatus})\n- **Dispute Rate:** ${healthMetrics.disputeRate}%`;
      }

      const assistantMsg: ChatMessage = {
        id: `ASST-${Date.now()}`,
        sender: 'assistant',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        content: responseText,
        financialCard: card,
        suggestedFollowUps: [
          'What is my total revenue this month?',
          'How much did I pay in transaction fees?',
          'Show my failed transactions.'
        ]
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: `INIT-${Date.now()}`,
        sender: 'assistant',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        content: 'Conversation history reset. How can I assist with your financial analytics or PayPal fees today?',
        suggestedFollowUps: [
          'What is my total revenue this month?',
          'How much did I pay in transaction fees?',
          'Summarize my financial performance this month.'
        ]
      }
    ]);
  };

  const renderFinancialCard = (card: FinancialSummaryCard) => {
    return (
      <div className="mt-3 p-3.5 rounded-xl bg-white dark:bg-[#081329] border border-slate-200 dark:border-[#162F64] shadow-sm text-xs">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <span>{card.title}</span>
            </h4>
            {card.subtitle && (
              <span className="text-[10px] text-slate-500 dark:text-[#7E96C4]">{card.subtitle}</span>
            )}
          </div>
          <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-[#0070BA]/15 text-[#0070BA] dark:text-[#38BDF8] border border-[#0070BA]/30 font-bold">
            Verified Data
          </span>
        </div>

        {/* Metrics Grid */}
        {card.metrics && card.metrics.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
            {card.metrics.map((m, idx) => (
              <div
                key={idx}
                className="p-2.5 rounded-lg bg-slate-50 dark:bg-[#050C1C] border border-slate-100 dark:border-[#162F64]"
              >
                <span className="text-[10px] text-slate-500 dark:text-[#7E96C4] block">{m.label}</span>
                <span className="text-xs font-extrabold text-slate-900 dark:text-white font-mono block mt-0.5">
                  {m.value}
                </span>
                {m.subtext && (
                  <span className="text-[9px] text-slate-400 block mt-0.5">{m.subtext}</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Items List (e.g. Transactions or Recommendations) */}
        {card.items && card.items.length > 0 && (
          <div className="space-y-1.5 mb-2">
            {card.items.map((item) => (
              <div
                key={item.id}
                className="p-2 rounded-lg bg-slate-50 dark:bg-[#050C1C] border border-slate-100 dark:border-[#162F64] flex items-center justify-between text-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 dark:text-white">{item.title}</span>
                    {item.badge && (
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full ${
                          item.badgeColor === 'rose'
                            ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                            : item.badgeColor === 'amber'
                            ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                            : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500 dark:text-[#7E96C4] block mt-0.5">
                    {item.subtitle} {item.detail ? `— ${item.detail}` : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {card.actionHint && (
          <div className="text-[10px] text-slate-500 dark:text-[#7E96C4] flex items-center gap-1 pt-1 border-t border-slate-100 dark:border-[#162F64]">
            <Sparkles className="w-3 h-3 text-[#0070BA]" />
            <span>{card.actionHint}</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col space-y-4">
      {/* 1. Header with Security Guardrail Notice */}
      <div className="bg-white dark:bg-[#081329] border border-slate-200 dark:border-[#162F64] rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[#0070BA] text-white shadow-sm">
            <PayPalLogo size="sm" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
                Finova AI Financial Support Agent
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#0070BA]/15 text-[#0070BA] dark:text-[#38BDF8] border border-[#0070BA]/30 font-mono font-bold">
                Tenant-Scoped RAG
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-[#7E96C4]">
              Context-aware intelligence connected to PayPal Sandbox transactions, AI Cost Optimizer, and Scam Shield.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Read-Only Safety Pill */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-[#042416] border border-emerald-300 dark:border-[#059669]/60 text-xs text-emerald-800 dark:text-[#34D399]">
            <Lock className="w-3.5 h-3.5 text-emerald-600 dark:text-[#10B981]" />
            <span className="font-bold">Strictly Read-Only</span>
          </div>

          <button
            onClick={handleClearChat}
            aria-label="Reset conversation history"
            title="Reset conversation history"
            className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white bg-slate-100 hover:bg-slate-200 dark:bg-[#0E2046] border border-slate-200 dark:border-[#20438A] transition-colors shadow-sm"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Main Chat Box Container */}
      <div className="flex-1 fintech-card flex flex-col overflow-hidden">
        {/* Messages Scroll Area */}
        <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-4">
          {messages.map((msg) => {
            const isUser = msg.sender === 'user';
            return (
              <div
                key={msg.id}
                className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                    isUser
                      ? 'bg-[#0070BA] text-white shadow-sm'
                      : 'bg-[#003087] border border-[#0079C1] text-white shadow-sm'
                  }`}
                >
                  {isUser ? <User className="w-4 h-4" /> : 'PP'}
                </div>

                <div
                  className={`max-w-[85%] rounded-2xl p-4 text-xs leading-relaxed ${
                    isUser
                      ? 'bg-[#0070BA] text-white shadow-sm'
                      : 'bg-slate-50/90 dark:bg-[#040B1A] border border-slate-200/90 dark:border-white/[0.08] text-slate-800 dark:text-slate-200 shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5 opacity-70 text-[10px]">
                    <span className="font-bold">
                      {isUser ? 'Merchant' : 'Finova Financial Assistant'}
                    </span>
                    <span>{msg.timestamp}</span>
                  </div>

                  <div className="space-y-2 whitespace-pre-wrap font-sans">
                    {msg.content}
                  </div>

                  {/* Structured Financial Card */}
                  {msg.financialCard && renderFinancialCard(msg.financialCard)}

                  {/* Contextual Follow-Up Suggestions */}
                  {msg.suggestedFollowUps && msg.suggestedFollowUps.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-slate-200/80 dark:border-white/[0.06] flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] text-slate-500 dark:text-[#7E96C4] font-bold">Suggested:</span>
                      {msg.suggestedFollowUps.map((f, i) => (
                        <button
                          key={i}
                          onClick={() => handleSendMessage(f)}
                          className="text-[10px] px-2.5 py-1 rounded-full bg-white dark:bg-[#0E2046] hover:bg-slate-100 dark:hover:bg-[#18366E] border border-slate-300 dark:border-[#20438A] text-[#0070BA] dark:text-[#38BDF8] font-bold transition-all btn-press shadow-xs"
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {isTyping && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#003087] border border-[#0079C1] text-white flex items-center justify-center text-xs font-bold shadow-sm">
                PP
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200/80 dark:border-white/[0.08] text-xs text-slate-500 dark:text-[#7E96C4] flex items-center gap-2 shadow-xs">
                <span className="w-2 h-2 rounded-full bg-[#0070BA] animate-ping"></span>
                <span>Auditing PayPal records & calculating financial intelligence...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 3. Suggested Prompt Chips Carousel */}
        <div className="px-4 py-2.5 bg-slate-50/70 dark:bg-[#030917]/70 border-t border-slate-200/80 dark:border-white/[0.08] flex items-center gap-2 overflow-x-auto text-xs">
          <span className="text-[10px] text-slate-500 dark:text-[#7E96C4] font-bold uppercase tracking-wider shrink-0 flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-[#0070BA] dark:text-[#38BDF8]" />
            Questions:
          </span>
          {suggestedPrompts.map((s, idx) => (
            <button
              key={idx}
              onClick={() => handleSendMessage(s.prompt)}
              className="px-3 py-1.5 rounded-full bg-white dark:bg-[#0E2046] border border-slate-200 dark:border-white/[0.1] hover:border-[#0070BA] text-slate-700 dark:text-slate-200 hover:text-[#0070BA] dark:hover:text-white whitespace-nowrap text-[11px] font-semibold transition-all btn-press shadow-xs flex items-center gap-1.5"
            >
              <s.icon className="w-3 h-3 text-[#0070BA] dark:text-[#38BDF8]" />
              <span>{s.title}</span>
            </button>
          ))}
        </div>

        {/* 4. Input Form */}
        <div className="p-4 bg-slate-50/80 dark:bg-[#030917]/80 border-t border-slate-200/80 dark:border-white/[0.08]">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
            className="flex items-center gap-2"
          >
            <input
              type="text"
              placeholder="Ask about revenue, fees, failed checkouts, highest fee, or cost reduction..."
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              disabled={isTyping}
              className="flex-1 py-2.5 px-4 rounded-xl bg-white dark:bg-[#081329] border border-slate-200 dark:border-[#18366E] text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-[#0070BA] disabled:opacity-50 shadow-sm"
            />
            <button
              type="submit"
              disabled={isTyping || !inputPrompt.trim()}
              className="p-2.5 rounded-xl bg-[#0070BA] hover:bg-[#005EA6] active:scale-[0.99] text-white transition-all disabled:opacity-40 shadow-sm"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
          <div className="flex items-center justify-between text-[10px] text-slate-400 dark:text-[#6881B0] mt-2 px-1">
            <span>Connected to PayPal Sandbox ledger • Gemini 1.5 & FastAPI engine</span>
            <span>Zero payment modification authority (Strictly Read-Only)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
