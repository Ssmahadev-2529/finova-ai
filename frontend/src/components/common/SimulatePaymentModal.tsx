import React, { useState, useEffect, useRef } from 'react';
import { Transaction, PaymentMethod } from '../../types';
import { X, CreditCard, DollarSign, User, Mail, Globe, Sparkles, CheckCircle2, ShieldCheck, Lock, AlertCircle, ExternalLink } from 'lucide-react';
import { PayPalLogo } from './PayPalLogo';
import { api, authStorage } from '../../services/api';

interface SimulatePaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (newTxn: Transaction) => void;
}

declare global {
  interface Window {
    paypal?: any;
  }
}

export const SimulatePaymentModal: React.FC<SimulatePaymentModalProps> = ({
  isOpen,
  onClose,
  onSubmit
}) => {
  const [customerName, setCustomerName] = useState('Sarah Jenkins (Sandbox Buyer)');
  const [customerEmail, setCustomerEmail] = useState('sb-buyer-9912@personal.example.com');
  const [amount, setAmount] = useState<number>(240.00);
  const [currency, setCurrency] = useState('USD');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('PayPal Wallet');
  const [country, setCountry] = useState('United States');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const [paypalConfig, setPaypalConfig] = useState<{ clientId: string; isConfigured: boolean }>({
    clientId: '',
    isConfigured: false
  });
  const paypalButtonContainerRef = useRef<HTMLDivElement>(null);

  // Load backend PayPal configuration
  useEffect(() => {
    if (isOpen) {
      api.getPayPalConfig().then((cfg) => {
        setPaypalConfig({
          clientId: cfg.clientId,
          isConfigured: cfg.isConfigured
        });
      });
    }
  }, [isOpen]);

  // Dynamically render PayPal JS SDK Buttons if credentials are configured
  useEffect(() => {
    if (!isOpen || !paypalConfig.isConfigured || !paypalConfig.clientId) return;

    const scriptId = 'paypal-sdk-script';
    let script = document.getElementById(scriptId) as HTMLScriptElement;

    const renderButtons = () => {
      if (window.paypal && paypalButtonContainerRef.current) {
        paypalButtonContainerRef.current.innerHTML = '';
        try {
          window.paypal.Buttons({
            style: {
              layout: 'vertical',
              color: 'gold',
              shape: 'pill',
              label: 'paypal'
            },
            createOrder: async () => {
              if (!authStorage.getToken()) {
                const msg = 'Authentication required: Please sign in first to create a PayPal Sandbox order.';
                setErrorMessage(msg);
                throw new Error(msg);
              }
              setIsProcessing(true);
              setErrorMessage(null);
              try {
                const res = await api.createPayPalOrder(amount, currency);
                return res.orderId;
              } catch (err: any) {
                setIsProcessing(false);
                setErrorMessage(err.message || 'Failed to create PayPal order');
                throw err;
              }
            },
            onApprove: async (data: any) => {
              try {
                const res = await api.capturePayPalOrder(data.orderID);
                setIsProcessing(false);
                onSubmit(res.transaction);
                onClose();
              } catch (err: any) {
                setIsProcessing(false);
                setErrorMessage(err.message || 'Failed to capture payment');
              }
            },
            onError: (err: any) => {
              setIsProcessing(false);
              setErrorMessage('PayPal Sandbox checkout was cancelled or failed.');
              console.error('PayPal Checkout error:', err);
            }
          }).render(paypalButtonContainerRef.current);
        } catch (e) {
          console.warn('Could not mount PayPal SDK buttons:', e);
        }
      }
    };

    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = `https://www.paypal.com/sdk/js?client-id=${paypalConfig.clientId}&currency=${currency}&intent=capture`;
      script.async = true;
      script.onload = renderButtons;
      document.body.appendChild(script);
    } else {
      renderButtons();
    }
  }, [isOpen, paypalConfig, amount, currency]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Direct backend simulated capture (works even if PayPal credentials haven't been entered in .env yet)
  const handleDirectSimulate = async (selectedMethod: PaymentMethod) => {
    if (!authStorage.getToken()) {
      setErrorMessage('Authentication required: Please sign in first to simulate or capture a payment.');
      return;
    }
    if (!customerName.trim()) {
      setErrorMessage('Sandbox buyer name is required.');
      return;
    }
    if (!customerEmail.trim() || !customerEmail.includes('@')) {
      setErrorMessage('A valid buyer email address is required.');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setErrorMessage('Order amount must be greater than zero.');
      return;
    }
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const newTxn = await api.simulateTransaction({
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim(),
        amount,
        currency,
        paymentMethod: selectedMethod,
        country
      });

      onSubmit(newTxn);
      setIsProcessing(false);
      onClose();
    } catch (err: any) {
      setIsProcessing(false);
      setErrorMessage(err.message || 'Simulation error');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="PayPal Sandbox Checkout Simulator"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/80 backdrop-blur-md animate-in fade-in"
    >
      <div className="bg-white dark:bg-[#071126] border border-slate-200/90 dark:border-white/[0.12] rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl">
        {/* PayPal Sandbox Header */}
        <div className="p-5 border-b border-slate-200/80 dark:border-white/[0.08] flex items-center justify-between bg-slate-50/70 dark:bg-[#040A18]/70">
          <div className="flex items-center gap-2.5">
            <PayPalLogo size="md" showWordmark={true} />
            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-[#FFC439]/20 text-[#001435] dark:text-[#FFC439] border border-[#FFC439]/40 font-mono">
              SANDBOX REST API v2
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close checkout simulator modal"
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200 dark:hover:text-white dark:hover:bg-white/10 transition-colors btn-press"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          <div className="text-center pb-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-[#7E96C4]">
              PayPal Developer Sandbox Checkout
            </div>
            <div className="text-3xl font-extrabold text-slate-900 dark:text-white font-mono mt-1">
              ${amount.toFixed(2)} <span className="text-sm text-[#0070BA] dark:text-[#38BDF8]">{currency}</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-[#8EA1C7] mt-0.5">
              Standard commercial processing: 3.49% + $0.49 USD
            </p>
          </div>

          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Input Fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#8EA1C7] mb-1">
                Order Amount ($)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xs">$</span>
                <input
                  type="number"
                  step="0.50"
                  min="1"
                  value={amount}
                  onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                  className="w-full py-2 pl-7 pr-3 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#18366E] text-slate-900 dark:text-white font-mono text-sm font-bold focus:outline-none focus:border-[#0070BA]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#8EA1C7] mb-1">
                Currency
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#18366E] text-xs text-slate-800 dark:text-white focus:outline-none focus:border-[#0070BA]"
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
                <option value="CAD">CAD ($)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#8EA1C7] mb-1">
                Sandbox Buyer Name
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#18366E] text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#0070BA]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#8EA1C7] mb-1">
                Sandbox Buyer Email
              </label>
              <input
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#18366E] text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#0070BA]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-700 dark:text-[#8EA1C7] mb-1">
              Billing Origin Country
            </label>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#18366E] text-xs text-slate-800 dark:text-white focus:outline-none focus:border-[#0070BA]"
            >
              <option value="United States">United States (Domestic)</option>
              <option value="Germany">Germany (International +1.5%)</option>
              <option value="United Kingdom">United Kingdom (International +1.5%)</option>
              <option value="Canada">Canada (International +1.5%)</option>
              <option value="Singapore">Singapore (International +1.5%)</option>
              <option value="Nigeria">Nigeria (International +1.5%)</option>
            </select>
          </div>

          {/* Live PayPal SDK Buttons Container (if configured) */}
          {paypalConfig.isConfigured && (
            <div className="pt-2 space-y-2">
              <div className="text-[11px] font-bold text-center text-slate-500 dark:text-[#8EA1C7] uppercase tracking-wider flex items-center justify-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>Live PayPal Sandbox Smart Buttons:</span>
              </div>
              <div ref={paypalButtonContainerRef} className="min-h-[90px] pt-1" />
            </div>
          )}

          {/* Direct Instant Capture Buttons */}
          <div className="pt-2 space-y-2.5">
            <div className="text-[11px] font-bold text-center text-slate-500 dark:text-[#8EA1C7] uppercase tracking-wider">
              {paypalConfig.isConfigured ? 'Or Test With Instant Sandbox Capture:' : 'Process Sandbox Order via Backend API:'}
            </div>

            <button
              type="button"
              disabled={isProcessing}
              onClick={() => handleDirectSimulate('PayPal Wallet')}
              className="w-full py-3 px-4 rounded-full bg-[#FFC439] hover:bg-[#F2BA36] active:scale-[0.99] text-[#001435] font-extrabold text-sm flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50"
            >
              <PayPalLogo size="sm" />
              <span>{isProcessing ? 'Capturing via FastAPI Backend...' : 'Pay with PayPal (Instant Capture)'}</span>
            </button>

            <button
              type="button"
              disabled={isProcessing}
              onClick={() => handleDirectSimulate('Venmo')}
              className="w-full py-2.5 px-4 rounded-full bg-[#008CFF] hover:bg-[#0074D9] active:scale-[0.99] text-white font-bold text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-sm"
            >
              <span>Venmo Sandbox Checkout</span>
            </button>

            <button
              type="button"
              disabled={isProcessing}
              onClick={() => handleDirectSimulate('Credit/Debit Card')}
              className="w-full py-2.5 px-4 rounded-full bg-slate-900 hover:bg-black text-white dark:bg-[#1A253C] dark:hover:bg-[#22314E] border border-slate-700 dark:border-[#2B4370] font-semibold text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-sm"
            >
              <CreditCard className="w-3.5 h-3.5 text-[#38BDF8]" />
              <span>Debit or Credit Card</span>
            </button>
          </div>

          <div className="pt-2 text-[10px] text-center text-slate-400 dark:text-[#6B85B5] flex items-center justify-center gap-1">
            <Lock className="w-3 h-3 text-[#10B981]" />
            <span>Server-side order capture with actual fee and anomaly logging in SQLite/PostgreSQL.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
