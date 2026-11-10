import React, { useState, useEffect, useCallback } from 'react';
import {
  Transaction,
  TransactionStatus,
  FinancialCategory
} from '../types';
import { DataSourceBadge } from '../components/common/DataSourceBadge';
import { RiskBadge } from '../components/common/RiskBadge';
import { StatusBadge } from '../components/common/StatusBadge';
import { PayPalLogo } from '../components/common/PayPalLogo';
import { api } from '../services/api';
import {
  Search,
  Download,
  AlertTriangle,
  X,
  CreditCard,
  User,
  Globe,
  Calendar,
  Sparkles,
  ShieldCheck,
  Plus,
  Edit3,
  Trash2,
  RotateCcw,
  RefreshCw,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

interface TransactionsViewProps {
  transactions: Transaction[];
  selectedTransaction: Transaction | null;
  onSelectTransaction: (txn: Transaction | null) => void;
  onSimulateNewPayment: () => void;
  onTransactionsChanged?: () => Promise<void> | void;
  isAuthenticated?: boolean;
  onNotify?: (msg: string) => void;
}

export const TransactionsView: React.FC<TransactionsViewProps> = ({
  transactions,
  selectedTransaction,
  onSelectTransaction,
  onSimulateNewPayment,
  onTransactionsChanged,
  isAuthenticated = false,
  onNotify
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [riskFilter, setRiskFilter] = useState<string>('ALL');
  const [anomalyOnly, setAnomalyOnly] = useState<boolean>(false);
  const [sourceFilter, setSourceFilter] = useState<string>('ALL');
  const [txnTypeFilter, setTxnTypeFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'created_at' | 'amount' | 'date' | 'risk_score'>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState<number>(1);
  const pageSize = 10;

  // Categories for Add/Edit
  const [categories, setCategories] = useState<FinancialCategory[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Add/Edit Manual Transaction Modal
  const [showFormModal, setShowFormModal] = useState<boolean>(false);
  const [editingTxn, setEditingTxn] = useState<Transaction | null>(null);
  const [fCustomerName, setFCustomerName] = useState<string>('');
  const [fCustomerEmail, setFCustomerEmail] = useState<string>('ledger@finova.local');
  const [fAmount, setFAmount] = useState<string>('100.00');
  const [fCurrency, setFCurrency] = useState<string>('USD');
  const [fStatus, setFStatus] = useState<TransactionStatus>('COMPLETED');
  const [fTxnType, setFTxnType] = useState<'income' | 'expense'>('income');
  const [fCategory, setFCategory] = useState<string>('Payment');
  const [fCountry, setFCountry] = useState<string>('United States');
  const [fNotes, setFNotes] = useState<string>('');
  const [fSaving, setFSaving] = useState<boolean>(false);

  // Confirmation modal for Delete or PayPal Refund
  const [confirmAction, setConfirmAction] = useState<{
    kind: 'delete' | 'refund';
    txn: Transaction;
  } | null>(null);
  const [actionInFlight, setActionInFlight] = useState<boolean>(false);

  const loadCategories = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const cats = await api.getCategories();
      setCategories(cats);
    } catch {
      // non-fatal
    }
  }, [isAuthenticated]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmAction) setConfirmAction(null);
        else if (showFormModal) setShowFormModal(false);
        else if (selectedTransaction) onSelectTransaction(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [confirmAction, showFormModal, selectedTransaction, onSelectTransaction]);

  // Filter + Sort transactions cleanly
  const filteredTransactions = transactions
    .filter((txn) => {
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        txn.id.toLowerCase().includes(query) ||
        txn.customerName.toLowerCase().includes(query) ||
        txn.customerEmail.toLowerCase().includes(query) ||
        (txn.category && txn.category.toLowerCase().includes(query)) ||
        (txn.paypalOrderId && txn.paypalOrderId.toLowerCase().includes(query));

      if (!matchesSearch) return false;
      if (statusFilter !== 'ALL' && txn.status !== statusFilter) return false;
      if (riskFilter !== 'ALL' && txn.riskLevel !== riskFilter) return false;
      if (anomalyOnly && !txn.isAnomaly) return false;
      if (sourceFilter !== 'ALL' && txn.dataSource !== sourceFilter) return false;
      if (txnTypeFilter !== 'ALL' && (txn.txnType || 'income') !== txnTypeFilter) return false;
      return true;
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'amount') cmp = a.amount - b.amount;
      else if (sortBy === 'risk_score') cmp = a.riskScore - b.riskScore;
      else cmp = (a.date || '').localeCompare(b.date || '');
      return sortDir === 'asc' ? cmp : -cmp;
    });

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedRows = filteredTransactions.slice((safePage - 1) * pageSize, safePage * pageSize);

  const openAddModal = () => {
    setEditingTxn(null);
    setFCustomerName('');
    setFCustomerEmail('ledger@finova.local');
    setFAmount('100.00');
    setFCurrency('USD');
    setFStatus('COMPLETED');
    setFTxnType('income');
    setFCategory(categories[0]?.name || 'Sales');
    setFCountry('United States');
    setFNotes('');
    setActionError(null);
    setShowFormModal(true);
  };

  const openEditModal = (txn: Transaction) => {
    setEditingTxn(txn);
    setFCustomerName(txn.customerName);
    setFCustomerEmail(txn.customerEmail);
    setFAmount(String(txn.amount));
    setFCurrency(txn.currency);
    setFStatus(txn.status);
    setFTxnType(txn.txnType || 'income');
    setFCategory(txn.category || 'Payment');
    setFCountry(txn.country || 'United States');
    setFNotes(txn.notes || '');
    setActionError(null);
    setShowFormModal(true);
  };

  const isSettledPayPal = (txn: Transaction) =>
    Boolean((txn.paypalCaptureId || txn.paypalOrderId) && txn.dataSource === 'sandbox');

  const handleSaveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const amtNum = Number(fAmount);
    if (!fCustomerName.trim()) {
      setActionError('Customer / Counterparty name is required.');
      return;
    }
    if (!Number.isFinite(amtNum) || amtNum <= 0) {
      setActionError('Amount must be greater than zero.');
      return;
    }
    setFSaving(true);
    setActionError(null);
    try {
      if (editingTxn) {
        const payload = isSettledPayPal(editingTxn)
          ? {
              customerName: fCustomerName.trim(),
              category: fCategory.trim() || 'Payment',
              notes: fNotes.trim(),
            }
          : {
              customerName: fCustomerName.trim(),
              amount: amtNum,
              currency: fCurrency,
              status: fStatus,
              category: fCategory.trim() || 'Payment',
              txnType: fTxnType,
              notes: fNotes.trim(),
            };
        const updated = await api.updateTransaction(editingTxn.id, payload);
        if (selectedTransaction?.id === updated.id) onSelectTransaction(updated);
        onNotify?.(`Updated transaction ${updated.id}.`);
      } else {
        const created = await api.createManualTransaction({
          customerName: fCustomerName.trim(),
          customerEmail: fCustomerEmail.trim() || 'ledger@finova.local',
          amount: amtNum,
          currency: fCurrency,
          status: fStatus,
          category: fCategory.trim() || 'Payment',
          txnType: fTxnType,
          country: fCountry,
          notes: fNotes.trim() || undefined,
        });
        onNotify?.(`Added ${created.txnType} entry ${created.id}.`);
      }
      setShowFormModal(false);
      await onTransactionsChanged?.();
    } catch (err: any) {
      setActionError(err?.message || 'Failed to save transaction.');
    } finally {
      setFSaving(false);
    }
  };

  const handleConfirmDestructive = async () => {
    if (!confirmAction) return;
    setActionInFlight(true);
    setActionError(null);
    try {
      if (confirmAction.kind === 'delete') {
        await api.deleteTransaction(confirmAction.txn.id);
        onSelectTransaction(null);
        onNotify?.(`Deleted transaction ${confirmAction.txn.id}.`);
      } else {
        const res = await api.refundPayPalTransaction(confirmAction.txn.id);
        onSelectTransaction(res.transaction);
        onNotify?.(`PayPal capture refunded (${res.transaction.id}).`);
      }
      setConfirmAction(null);
      await onTransactionsChanged?.();
    } catch (err: any) {
      setActionError(err?.message || `Failed to ${confirmAction.kind} transaction.`);
      setConfirmAction(null);
    } finally {
      setActionInFlight(false);
    }
  };

  const handleSyncPayPal = async (txn: Transaction) => {
    if (!txn.paypalOrderId) return;
    setActionError(null);
    try {
      const synced = await api.syncPayPalOrder(txn.paypalOrderId);
      onNotify?.(`Synced PayPal order ${synced.orderId}: ${synced.status}`);
      await onTransactionsChanged?.();
    } catch (err: any) {
      setActionError(err?.message || 'Unable to sync PayPal order status.');
    }
  };

  const handleExportCsv = async () => {
    if (!isAuthenticated) {
      setActionError('Sign in to export tenant ledger CSV.');
      return;
    }
    setIsExporting(true);
    setActionError(null);
    try {
      const blob = await api.exportTransactionsCsv({
        status: statusFilter,
        risk: riskFilter,
        source: sourceFilter,
        txnType: txnTypeFilter,
        search: searchQuery,
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'finova_transactions_export.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      onNotify?.('Exported formula-safe ledger CSV.');
    } catch (err: any) {
      setActionError(err?.message || 'CSV export failed.');
    } finally {
      setIsExporting(false);
    }
  };

  const fmtCurr = (amt: number, curr: string) =>
    curr === 'JPY' ? `¥${Math.round(amt).toLocaleString('en-US')} JPY` : `${amt.toFixed(2)} ${curr}`;

  return (
    <div className="space-y-6">
      {/* Header Controls & Actions */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <span>PayPal Merchant Activity & Fee Ledger</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-[#7E96C4]">
            Auditing official PayPal Developer Sandbox captures, manual ledger entries, CSV exports, and Seller Protection eligibility.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          {isAuthenticated && (
            <>
              <button
                onClick={openAddModal}
                className="px-4 py-2.5 rounded-full bg-[#0070BA] hover:bg-[#005EA6] text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all btn-press"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Entry</span>
              </button>
              <button
                onClick={handleExportCsv}
                disabled={isExporting}
                aria-label="Export transactions as CSV"
                className="px-4 py-2.5 rounded-full bg-white hover:bg-slate-100 dark:bg-[#081329] dark:hover:bg-[#0E2046] text-slate-800 dark:text-white border border-slate-200 dark:border-[#1B3A72] font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5 text-[#0070BA]" />
                <span>{isExporting ? 'Exporting...' : 'Export CSV'}</span>
              </button>
            </>
          )}

          {/* Authentic PayPal Yellow Checkout Trigger Button */}
          <button
            onClick={onSimulateNewPayment}
            className="flex-1 md:flex-initial px-5 py-2.5 rounded-full bg-[#FFC439] hover:bg-[#F2BA36] active:scale-[0.99] text-[#001435] font-extrabold text-xs flex items-center justify-center gap-2 shadow-sm transition-all"
          >
            <PayPalLogo size="sm" />
            <span>Simulate PayPal Checkout</span>
          </button>
        </div>
      </div>

      {actionError && (
        <div role="alert" className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-200 flex items-center justify-between gap-2">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} aria-label="Dismiss error">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="fintech-card p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Search Input (4 cols) */}
          <div className="md:col-span-4 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              aria-label="Search transactions"
              placeholder="Search ID, PayPal Order #, Buyer or Category..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#18366E] text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-[#0070BA]"
            />
          </div>

          {/* Status Dropdown (2 cols) */}
          <div className="md:col-span-2">
            <select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#18366E] text-xs text-slate-800 dark:text-white focus:outline-none focus:border-[#0070BA]"
            >
              <option value="ALL">All Statuses</option>
              <option value="COMPLETED">Completed</option>
              <option value="PENDING">Pending</option>
              <option value="REFUNDED">Refunded</option>
              <option value="DENIED">Denied</option>
              <option value="DISPUTED">Disputed</option>
            </select>
          </div>

          {/* Risk Level Dropdown (2 cols) */}
          <div className="md:col-span-2">
            <select
              aria-label="Filter by risk level"
              value={riskFilter}
              onChange={(e) => {
                setRiskFilter(e.target.value);
                setPage(1);
              }}
              className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#18366E] text-xs text-slate-800 dark:text-white focus:outline-none focus:border-[#0070BA]"
            >
              <option value="ALL">All Risk Levels</option>
              <option value="LOW">Low Risk</option>
              <option value="MEDIUM">Medium Risk</option>
              <option value="HIGH">High Risk</option>
              <option value="CRITICAL">Critical Risk</option>
            </select>
          </div>

          {/* Type Dropdown (2 cols) */}
          <div className="md:col-span-2">
            <select
              aria-label="Filter by entry type"
              value={txnTypeFilter}
              onChange={(e) => {
                setTxnTypeFilter(e.target.value);
                setPage(1);
              }}
              className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#18366E] text-xs text-slate-800 dark:text-white focus:outline-none focus:border-[#0070BA]"
            >
              <option value="ALL">All Types</option>
              <option value="income">Income Only</option>
              <option value="expense">Expense Only</option>
            </select>
          </div>

          {/* Sort Selector (2 cols) */}
          <div className="md:col-span-2">
            <select
              aria-label="Sort transactions"
              value={`${sortBy}:${sortDir}`}
              onChange={(e) => {
                const [col, dir] = e.target.value.split(':');
                setSortBy(col as any);
                setSortDir(dir as 'asc' | 'desc');
              }}
              className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#18366E] text-xs text-slate-800 dark:text-white focus:outline-none focus:border-[#0070BA]"
            >
              <option value="created_at:desc">Newest First</option>
              <option value="created_at:asc">Oldest First</option>
              <option value="amount:desc">Highest Amount</option>
              <option value="amount:asc">Lowest Amount</option>
              <option value="risk_score:desc">Highest Risk</option>
            </select>
          </div>
        </div>

        {/* Quick Toggles */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-[#162F64] text-xs">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={anomalyOnly}
                onChange={(e) => {
                  setAnomalyOnly(e.target.checked);
                  setPage(1);
                }}
                className="rounded bg-slate-100 dark:bg-[#050C1C] border-slate-300 dark:border-[#18366E] text-[#0070BA] focus:ring-0 focus:ring-offset-0"
              />
              <span className="text-slate-700 dark:text-[#9BB0D6] font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                Anomalies Only ({transactions.filter(t => t.isAnomaly).length})
              </span>
            </label>

            <select
              aria-label="Filter by source"
              value={sourceFilter}
              onChange={(e) => {
                setSourceFilter(e.target.value);
                setPage(1);
              }}
              className="py-1 px-2.5 rounded-lg bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#18366E] text-[11px] text-slate-700 dark:text-white"
            >
              <option value="ALL">All Sources</option>
              <option value="sandbox">PayPal Sandbox</option>
              <option value="synthetic">Manual / Synthetic</option>
            </select>
          </div>

          <div className="text-slate-500 dark:text-[#7E96C4]">
            Showing <span className="text-slate-900 dark:text-white font-bold">{filteredTransactions.length}</span> of {transactions.length} records
          </div>
        </div>
      </div>

      {/* Main Ledger Table */}
      <div className="fintech-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-[#050C1C] text-slate-600 dark:text-[#7E96C4] uppercase tracking-wider font-semibold border-b border-slate-200 dark:border-[#162F64]">
              <tr>
                <th className="py-3 px-4">Transaction / Order ID</th>
                <th className="py-3 px-4">Counterparty & Category</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Gross Amount</th>
                <th className="py-3 px-4">Fee (Est / Actual)</th>
                <th className="py-3 px-4">Net Settled</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Risk / Anomaly</th>
                <th className="py-3 px-4">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#132854] font-medium">
              {pagedRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500 dark:text-[#7E96C4]">
                    {transactions.length === 0
                      ? 'Your ledger has no transactions yet. Add a manual entry or simulate a PayPal checkout to begin.'
                      : 'No transactions match your current search and filter criteria.'}
                  </td>
                </tr>
              ) : (
                pagedRows.map((txn) => (
                  <tr
                    key={txn.id}
                    tabIndex={0}
                    role="button"
                    aria-label={`Inspect transaction ${txn.id}`}
                    onClick={() => onSelectTransaction(txn)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectTransaction(txn);
                      }
                    }}
                    className="hover:bg-slate-50 dark:hover:bg-[#0E214A] focus:outline-none focus:bg-blue-50/70 dark:focus:bg-[#0E214A] transition-colors cursor-pointer group"
                  >
                    <td className="py-3.5 px-4">
                      <div className="font-mono text-slate-900 dark:text-white group-hover:text-[#0070BA] dark:group-hover:text-[#38BDF8] transition-colors font-bold">
                        {txn.id}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-[#7E96C4] font-mono">
                        {txn.paypalOrderId || 'Manual / Ledger'}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="text-slate-900 dark:text-slate-100 font-bold flex items-center gap-1.5">
                        <span>{txn.customerName}</span>
                        {txn.txnType === 'expense' && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-mono">
                            EXPENSE
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-[#7E96C4] truncate max-w-[160px]">
                        {txn.category || 'Payment'} • {txn.customerEmail}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 dark:text-[#7E96C4] whitespace-nowrap">
                      {txn.date}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white">
                      {fmtCurr(txn.amount, txn.currency)}
                    </td>
                    <td className="py-3.5 px-4 font-mono">
                      <span className="text-[#B45309] dark:text-[#FFC439] font-bold">
                        -{fmtCurr(txn.actualFee ?? txn.estimatedFee, txn.currency)}
                      </span>
                      <div className="text-[10px] text-slate-400">
                        {txn.actualFee !== undefined && txn.actualFee !== null ? 'Confirmed' : 'Estimated'}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                      {fmtCurr(txn.netAmount, txn.currency)}
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge status={txn.status} size="sm" />
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5">
                        <RiskBadge level={txn.riskLevel} score={txn.riskScore} size="sm" />
                        {txn.isAnomaly && (
                          <span
                            className="p-1 rounded bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/30"
                            title={txn.anomalyReason || 'Statistical Anomaly Flag'}
                          >
                            <AlertTriangle className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <DataSourceBadge source={txn.dataSource} size="sm" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="p-3.5 border-t border-slate-200 dark:border-[#162F64] flex items-center justify-between text-xs bg-slate-50/50 dark:bg-[#050C1C]">
            <span className="text-slate-500 dark:text-[#7E96C4]">
              Page <strong>{safePage}</strong> of <strong>{totalPages}</strong>
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Previous page"
                className="px-3 py-1 rounded-lg bg-white dark:bg-[#081329] border border-slate-200 dark:border-[#18366E] disabled:opacity-40 flex items-center gap-1 font-semibold"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Prev</span>
              </button>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                aria-label="Next page"
                className="px-3 py-1 rounded-lg bg-white dark:bg-[#081329] border border-slate-200 dark:border-[#18366E] disabled:opacity-40 flex items-center gap-1 font-semibold"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Transaction Details Modal (PayPal Receipt + Controls) */}
      {selectedTransaction && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="txn-detail-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
        >
          <div className="bg-white dark:bg-[#071126] border border-slate-200/90 dark:border-white/[0.12] rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl">
            <div className="p-5 border-b border-slate-200/80 dark:border-white/[0.08] flex items-center justify-between bg-slate-50/70 dark:bg-[#040A18]/70">
              <div className="flex items-center gap-3">
                <PayPalLogo size="md" showWordmark={true} />
                <div className="border-l border-slate-300 dark:border-white/[0.1] pl-3">
                  <div className="flex items-center gap-2">
                    <h3 id="txn-detail-title" className="text-sm font-bold text-slate-900 dark:text-white font-mono tabular-nums">
                      {selectedTransaction.id}
                    </h3>
                    <DataSourceBadge source={selectedTransaction.dataSource} size="sm" />
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-[#7E96C4]">
                    PayPal Order ID: <span className="font-mono text-slate-800 dark:text-white font-bold">{selectedTransaction.paypalOrderId || 'Manual Entry'}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => onSelectTransaction(null)}
                aria-label="Close transaction receipt"
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 dark:hover:text-white dark:hover:bg-white/10 transition-colors btn-press"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-3 gap-3 p-4 rounded-2xl bg-slate-50/80 dark:bg-[#040B1A] border border-slate-200/80 dark:border-white/[0.06] text-center">
                <div>
                  <div className="text-[10px] font-bold text-slate-500 dark:text-[#7E96C4] uppercase tracking-wider">Gross Order Amount</div>
                  <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                    {fmtCurr(selectedTransaction.amount, selectedTransaction.currency)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-[#B45309] dark:text-[#FFC439] uppercase tracking-wider">PayPal Processing Fee</div>
                  <div className="text-xl font-bold font-mono tabular-nums text-[#B45309] dark:text-[#FFC439] mt-0.5">
                    -{fmtCurr(selectedTransaction.actualFee ?? selectedTransaction.estimatedFee, selectedTransaction.currency)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Net Settled</div>
                  <div className="text-xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-0.5">
                    {fmtCurr(selectedTransaction.netAmount, selectedTransaction.currency)}
                  </div>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-[#042416] border border-emerald-200 dark:border-[#059669]/60 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-emerald-800 dark:text-[#34D399] font-bold">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-[#10B981]" />
                  <span>PayPal Seller Protection:</span>
                  <span className="font-semibold text-slate-800 dark:text-white">Eligible (Requires tracking verification)</span>
                </div>
                <span className="text-[10px] text-emerald-700 dark:text-[#34D399] font-mono font-bold">Protected</span>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#162F64] space-y-2">
                  <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-[#0070BA]" />
                    <span>Counterparty & Category</span>
                  </div>
                  <div>
                    <div className="text-slate-900 dark:text-slate-100 font-bold">{selectedTransaction.customerName}</div>
                    <div className="text-slate-500 dark:text-[#7E96C4] font-mono text-[11px]">{selectedTransaction.customerEmail}</div>
                    <div className="text-slate-500 dark:text-[#7E96C4] mt-1 flex items-center gap-1">
                      <Globe className="w-3 h-3 text-slate-400" />
                      <span>{selectedTransaction.country} • {selectedTransaction.category || 'Payment'}</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#162F64] space-y-2">
                  <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-[#0070BA]" />
                    <span>Funding Source & Timestamp</span>
                  </div>
                  <div>
                    <div className="text-slate-900 dark:text-slate-100 font-bold">{selectedTransaction.paymentMethod}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <StatusBadge status={selectedTransaction.status} size="sm" />
                    </div>
                    <div className="text-slate-500 dark:text-[#7E96C4] text-[11px] mt-1 flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      <span>{selectedTransaction.date}</span>
                    </div>
                  </div>
                </div>
              </div>

              {selectedTransaction.notes && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#162F64] text-xs text-slate-700 dark:text-slate-200">
                  <strong>Notes:</strong> {selectedTransaction.notes}
                </div>
              )}

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#162F64] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#0070BA]" />
                    <span>Finova AI Risk Score & Anomaly Diagnosis</span>
                  </span>
                  <RiskBadge level={selectedTransaction.riskLevel} score={selectedTransaction.riskScore} size="sm" />
                </div>

                {selectedTransaction.isAnomaly ? (
                  <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-800 dark:text-rose-200 mt-2">
                    <div className="font-bold flex items-center gap-1.5 mb-1">
                      <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                      <span>Anomaly Triggered:</span>
                    </div>
                    <p className="text-[11px] text-rose-700 dark:text-[#9BB0D6] leading-relaxed">
                      {selectedTransaction.anomalyReason}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-[#7E96C4] leading-relaxed pt-1">
                    Normal order parameters. Conforms to historical checkout velocity with no elevated chargeback risks.
                  </p>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 dark:border-[#162F64] bg-slate-50 dark:bg-[#040C1D] flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {isAuthenticated && (
                  <>
                    <button
                      type="button"
                      onClick={() => openEditModal(selectedTransaction)}
                      className="px-3.5 py-2 rounded-xl bg-white dark:bg-[#081329] border border-slate-200 dark:border-[#1B3A72] text-xs font-bold text-slate-800 dark:text-white flex items-center gap-1.5 hover:border-[#0070BA]"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-[#0070BA]" />
                      <span>Edit</span>
                    </button>

                    {selectedTransaction.paypalOrderId && selectedTransaction.dataSource === 'sandbox' && (
                      <button
                        type="button"
                        onClick={() => handleSyncPayPal(selectedTransaction)}
                        className="px-3.5 py-2 rounded-xl bg-white dark:bg-[#081329] border border-slate-200 dark:border-[#1B3A72] text-xs font-bold text-slate-800 dark:text-white flex items-center gap-1.5 hover:border-[#0070BA]"
                      >
                        <RefreshCw className="w-3.5 h-3.5 text-[#0070BA]" />
                        <span>Sync PayPal</span>
                      </button>
                    )}

                    {selectedTransaction.paypalCaptureId &&
                      selectedTransaction.dataSource === 'sandbox' &&
                      (selectedTransaction.status === 'COMPLETED' || selectedTransaction.status === 'REFUND_UNKNOWN') && (
                        <button
                          type="button"
                          onClick={() => setConfirmAction({ kind: 'refund', txn: selectedTransaction })}
                          className="px-3.5 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Refund Capture</span>
                        </button>
                      )}

                    {!isSettledPayPal(selectedTransaction) && (
                      <button
                        type="button"
                        onClick={() => setConfirmAction({ kind: 'delete', txn: selectedTransaction })}
                        className="px-3.5 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs font-bold text-rose-700 dark:text-rose-300 flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    )}
                  </>
                )}
              </div>

              <button
                onClick={() => onSelectTransaction(null)}
                className="px-5 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-[#0E2046] dark:hover:bg-[#142D62] text-slate-800 dark:text-white text-xs font-bold transition-colors"
              >
                Close Receipt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Transaction Modal */}
      {showFormModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="txn-form-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        >
          <div className="bg-white dark:bg-[#071126] border border-slate-200 dark:border-white/[0.12] rounded-3xl w-full max-w-lg p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-[#162F64]">
              <h3 id="txn-form-title" className="text-sm font-extrabold text-slate-900 dark:text-white">
                {editingTxn ? `Edit ${editingTxn.id}` : 'Add Manual Ledger Entry'}
              </h3>
              <button
                type="button"
                aria-label="Close transaction form"
                onClick={() => setShowFormModal(false)}
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {editingTxn && isSettledPayPal(editingTxn) && (
              <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-[11px] text-blue-800 dark:text-blue-200">
                Authoritative PayPal settled amount, currency, type, and status are locked; customer label, category, and notes remain editable.
              </div>
            )}

            <form onSubmit={handleSaveForm} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="txn-name" className="block font-semibold text-slate-700 dark:text-[#8EA1C7] mb-1">
                    Counterparty Name
                  </label>
                  <input
                    id="txn-name"
                    type="text"
                    required
                    value={fCustomerName}
                    onChange={(e) => setFCustomerName(e.target.value)}
                    className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#18366E] text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label htmlFor="txn-cat" className="block font-semibold text-slate-700 dark:text-[#8EA1C7] mb-1">
                    Category
                  </label>
                  <input
                    id="txn-cat"
                    type="text"
                    list="finova-category-options"
                    required
                    value={fCategory}
                    onChange={(e) => setFCategory(e.target.value)}
                    className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#18366E] text-slate-900 dark:text-white"
                  />
                  <datalist id="finova-category-options">
                    <option value="Sales" />
                    <option value="Software SaaS" />
                    <option value="Cloud Infrastructure" />
                    <option value="Payment Fees" />
                    <option value="Marketing" />
                    {categories.map((c) => (
                      <option key={c.id} value={c.name} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label htmlFor="txn-type" className="block font-semibold text-slate-700 dark:text-[#8EA1C7] mb-1">
                    Type
                  </label>
                  <select
                    id="txn-type"
                    disabled={Boolean(editingTxn && isSettledPayPal(editingTxn))}
                    value={fTxnType}
                    onChange={(e) => setFTxnType(e.target.value as 'income' | 'expense')}
                    className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#18366E] text-slate-900 dark:text-white disabled:opacity-50"
                  >
                    <option value="income">Income</option>
                    <option value="expense">Expense</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="txn-amount" className="block font-semibold text-slate-700 dark:text-[#8EA1C7] mb-1">
                    Amount
                  </label>
                  <input
                    id="txn-amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    disabled={Boolean(editingTxn && isSettledPayPal(editingTxn))}
                    value={fAmount}
                    onChange={(e) => setFAmount(e.target.value)}
                    className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#18366E] text-slate-900 dark:text-white font-mono disabled:opacity-50"
                  />
                </div>
                <div>
                  <label htmlFor="txn-currency" className="block font-semibold text-slate-700 dark:text-[#8EA1C7] mb-1">
                    Currency
                  </label>
                  <select
                    id="txn-currency"
                    disabled={Boolean(editingTxn && isSettledPayPal(editingTxn))}
                    value={fCurrency}
                    onChange={(e) => setFCurrency(e.target.value)}
                    className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#18366E] text-slate-900 dark:text-white disabled:opacity-50"
                  >
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                    <option value="CAD">CAD</option>
                    <option value="JPY">JPY</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="txn-status" className="block font-semibold text-slate-700 dark:text-[#8EA1C7] mb-1">
                    Status
                  </label>
                  <select
                    id="txn-status"
                    disabled={Boolean(editingTxn && isSettledPayPal(editingTxn))}
                    value={fStatus}
                    onChange={(e) => setFStatus(e.target.value as TransactionStatus)}
                    className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#18366E] text-slate-900 dark:text-white disabled:opacity-50"
                  >
                    <option value="COMPLETED">COMPLETED</option>
                    <option value="PENDING">PENDING</option>
                    <option value="REFUNDED">REFUNDED</option>
                    <option value="DENIED">DENIED</option>
                    <option value="DISPUTED">DISPUTED</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="txn-country" className="block font-semibold text-slate-700 dark:text-[#8EA1C7] mb-1">
                    Country
                  </label>
                  <input
                    id="txn-country"
                    type="text"
                    disabled={Boolean(editingTxn)}
                    value={fCountry}
                    onChange={(e) => setFCountry(e.target.value)}
                    className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#18366E] text-slate-900 dark:text-white disabled:opacity-50"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="txn-notes" className="block font-semibold text-slate-700 dark:text-[#8EA1C7] mb-1">
                  Notes
                </label>
                <textarea
                  id="txn-notes"
                  rows={2}
                  maxLength={500}
                  value={fNotes}
                  onChange={(e) => setFNotes(e.target.value)}
                  placeholder="Optional invoice reference or audit memo"
                  className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#18366E] text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  className="px-4 py-2 rounded-full bg-slate-100 dark:bg-[#0E2046] text-slate-700 dark:text-white font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={fSaving}
                  className="px-5 py-2 rounded-full bg-[#0070BA] hover:bg-[#005EA6] text-white font-bold disabled:opacity-50"
                >
                  {fSaving ? 'Saving...' : editingTxn ? 'Update Entry' : 'Save Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Dialog (Delete / Refund) */}
      {confirmAction && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="txn-confirm-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        >
          <div className="bg-white dark:bg-[#071126] border border-slate-200 dark:border-white/[0.12] rounded-3xl w-full max-w-sm p-6 shadow-2xl space-y-4">
            <h3 id="txn-confirm-title" className="text-sm font-extrabold text-slate-900 dark:text-white">
              {confirmAction.kind === 'delete' ? 'Delete Transaction Entry?' : 'Confirm PayPal Sandbox Refund?'}
            </h3>
            <p className="text-xs text-slate-600 dark:text-[#8EA1C7]">
              {confirmAction.kind === 'delete'
                ? `This permanently deletes ledger entry ${confirmAction.txn.id} (${confirmAction.txn.customerName}).`
                : `This issues a PayPal Sandbox refund for capture ${confirmAction.txn.paypalCaptureId} (${fmtCurr(confirmAction.txn.amount, confirmAction.txn.currency)}).`}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={actionInFlight}
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 rounded-full bg-slate-100 dark:bg-[#0E2046] text-slate-700 dark:text-white text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionInFlight}
                onClick={handleConfirmDestructive}
                className={`px-4 py-2 rounded-full text-white text-xs font-bold disabled:opacity-50 ${
                  confirmAction.kind === 'delete' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                {actionInFlight
                  ? 'Processing...'
                  : confirmAction.kind === 'delete'
                  ? 'Confirm Delete'
                  : 'Confirm Refund'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
