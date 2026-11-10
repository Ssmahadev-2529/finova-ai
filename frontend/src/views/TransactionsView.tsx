import React, { useState } from 'react';
import { Transaction, TransactionStatus, RiskLevel, DataSourceType } from '../types';
import { DataSourceBadge } from '../components/common/DataSourceBadge';
import { RiskBadge } from '../components/common/RiskBadge';
import { StatusBadge } from '../components/common/StatusBadge';
import { PayPalLogo } from '../components/common/PayPalLogo';
import {
  Search,
  Filter,
  Download,
  AlertTriangle,
  CheckCircle2,
  X,
  CreditCard,
  User,
  Mail,
  Globe,
  Calendar,
  Sparkles,
  ExternalLink,
  Info,
  DollarSign,
  ArrowRight,
  ShieldCheck,
  Receipt
} from 'lucide-react';

interface TransactionsViewProps {
  transactions: Transaction[];
  selectedTransaction: Transaction | null;
  onSelectTransaction: (txn: Transaction | null) => void;
  onSimulateNewPayment: () => void;
}

export const TransactionsView: React.FC<TransactionsViewProps> = ({
  transactions,
  selectedTransaction,
  onSelectTransaction,
  onSimulateNewPayment
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [riskFilter, setRiskFilter] = useState<string>('ALL');
  const [anomalyOnly, setAnomalyOnly] = useState<boolean>(false);
  const [sourceFilter, setSourceFilter] = useState<string>('ALL');

  // Filter transactions
  const filteredTransactions = transactions.filter((txn) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      txn.id.toLowerCase().includes(query) ||
      txn.customerName.toLowerCase().includes(query) ||
      txn.customerEmail.toLowerCase().includes(query) ||
      (txn.paypalOrderId && txn.paypalOrderId.toLowerCase().includes(query));

    if (!matchesSearch) return false;

    if (statusFilter !== 'ALL' && txn.status !== statusFilter) return false;
    if (riskFilter !== 'ALL' && txn.riskLevel !== riskFilter) return false;
    if (anomalyOnly && !txn.isAnomaly) return false;
    if (sourceFilter !== 'ALL' && txn.dataSource !== sourceFilter) return false;

    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header Controls & Actions */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <span>PayPal Merchant Activity & Fee Ledger</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-[#7E96C4]">
            Auditing official PayPal Developer Sandbox captures, standard commercial fees (3.49% + $0.49), and Seller Protection eligibility.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
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

      {/* Filter & Search Bar */}
      <div className="fintech-card p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Search Input (5 cols) */}
          <div className="md:col-span-5 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by Transaction ID, PayPal Order #, Buyer Name or Email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#18366E] text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-[#0070BA]"
            />
          </div>

          {/* Status Dropdown (2 cols) */}
          <div className="md:col-span-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
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
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value)}
              className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#18366E] text-xs text-slate-800 dark:text-white focus:outline-none focus:border-[#0070BA]"
            >
              <option value="ALL">All Risk Levels</option>
              <option value="LOW">Low Risk</option>
              <option value="MEDIUM">Medium Risk</option>
              <option value="HIGH">High Risk</option>
              <option value="CRITICAL">Critical Risk</option>
            </select>
          </div>

          {/* Data Source Dropdown (3 cols) */}
          <div className="md:col-span-3">
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#18366E] text-xs text-slate-800 dark:text-white focus:outline-none focus:border-[#0070BA]"
            >
              <option value="ALL">All Sources (Live + Synthetic)</option>
              <option value="sandbox">PayPal Sandbox Only</option>
              <option value="synthetic">Synthetic Demo Only</option>
            </select>
          </div>
        </div>

        {/* Quick Toggles */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-[#162F64] text-xs">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={anomalyOnly}
              onChange={(e) => setAnomalyOnly(e.target.checked)}
              className="rounded bg-slate-100 dark:bg-[#050C1C] border-slate-300 dark:border-[#18366E] text-[#0070BA] focus:ring-0 focus:ring-offset-0"
            />
            <span className="text-slate-700 dark:text-[#9BB0D6] font-semibold flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              Show Anomalies Only ({transactions.filter(t => t.isAnomaly).length})
            </span>
          </label>

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
                <th className="py-3 px-4">Buyer Details</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Gross Amount</th>
                <th className="py-3 px-4">PayPal Fee</th>
                <th className="py-3 px-4">Actual Fee</th>
                <th className="py-3 px-4">Net Settled</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Risk / Anomaly</th>
                <th className="py-3 px-4">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#132854] font-medium">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-500 dark:text-[#7E96C4]">
                    No transactions match your current search and filter criteria.
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((txn) => (
                  <tr
                    key={txn.id}
                    onClick={() => onSelectTransaction(txn)}
                    className="hover:bg-slate-50 dark:hover:bg-[#0E214A] transition-colors cursor-pointer group"
                  >
                    <td className="py-3.5 px-4">
                      <div className="font-mono text-slate-900 dark:text-white group-hover:text-[#0070BA] dark:group-hover:text-[#38BDF8] transition-colors font-bold">
                        {txn.id}
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-[#7E96C4] font-mono">
                        {txn.paypalOrderId || 'Direct REST API'}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="text-slate-900 dark:text-slate-100 font-bold">{txn.customerName}</div>
                      <div className="text-[11px] text-slate-500 dark:text-[#7E96C4] truncate max-w-[140px]">
                        {txn.customerEmail}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 dark:text-[#7E96C4] whitespace-nowrap">
                      {txn.date}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900 dark:text-white">
                      {txn.amount.toFixed(2)} {txn.currency}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[#B45309] dark:text-[#FFC439] font-bold">
                      -${txn.estimatedFee.toFixed(2)}
                    </td>
                    <td className="py-3.5 px-4 font-mono">
                      {txn.actualFee !== undefined ? (
                        <span className="text-slate-800 dark:text-slate-200">-${txn.actualFee.toFixed(2)}</span>
                      ) : (
                        <span className="text-slate-400 dark:text-[#6881B0] italic text-[11px]">Uncaptured</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                      ${txn.netAmount.toFixed(2)}
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
      </div>

      {/* Transaction Details Modal (PayPal Receipt Style) */}
      {selectedTransaction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 dark:bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#071126] border border-slate-200/90 dark:border-white/[0.12] rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-200/80 dark:border-white/[0.08] flex items-center justify-between bg-slate-50/70 dark:bg-[#040A18]/70">
              <div className="flex items-center gap-3">
                <PayPalLogo size="md" showWordmark={true} />
                <div className="border-l border-slate-300 dark:border-white/[0.1] pl-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono tabular-nums">
                      {selectedTransaction.id}
                    </h3>
                    <DataSourceBadge source={selectedTransaction.dataSource} size="sm" />
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-[#7E96C4]">
                    PayPal Order ID: <span className="font-mono text-slate-800 dark:text-white font-bold">{selectedTransaction.paypalOrderId || 'Direct REST API'}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => onSelectTransaction(null)}
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 dark:hover:text-white dark:hover:bg-white/10 transition-colors btn-press"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              {/* Amounts Summary Box */}
              <div className="grid grid-cols-3 gap-3 p-4 rounded-2xl bg-slate-50/80 dark:bg-[#040B1A] border border-slate-200/80 dark:border-white/[0.06] text-center">
                <div>
                  <div className="text-[10px] font-bold text-slate-500 dark:text-[#7E96C4] uppercase tracking-wider">Gross Order Amount</div>
                  <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                    {selectedTransaction.amount.toFixed(2)} {selectedTransaction.currency}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-[#B45309] dark:text-[#FFC439] uppercase tracking-wider">PayPal Processing Fee</div>
                  <div className="text-xl font-bold font-mono tabular-nums text-[#B45309] dark:text-[#FFC439] mt-0.5">
                    -${(selectedTransaction.actualFee ?? selectedTransaction.estimatedFee).toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Net Settled to Wallet</div>
                  <div className="text-xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-0.5">
                    ${selectedTransaction.netAmount.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* PayPal Seller Protection Badge */}
              <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-[#042416] border border-emerald-200 dark:border-[#059669]/60 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-emerald-800 dark:text-[#34D399] font-bold">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-[#10B981]" />
                  <span>PayPal Seller Protection:</span>
                  <span className="font-semibold text-slate-800 dark:text-white">Eligible (Requires tracking verification)</span>
                </div>
                <span className="text-[10px] text-emerald-700 dark:text-[#34D399] font-mono font-bold">Protected</span>
              </div>

              {/* Customer & Payment Method Metadata */}
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#162F64] space-y-2">
                  <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-[#0070BA]" />
                    <span>Buyer Profile</span>
                  </div>
                  <div>
                    <div className="text-slate-900 dark:text-slate-100 font-bold">{selectedTransaction.customerName}</div>
                    <div className="text-slate-500 dark:text-[#7E96C4] font-mono text-[11px]">{selectedTransaction.customerEmail}</div>
                    <div className="text-slate-500 dark:text-[#7E96C4] mt-1 flex items-center gap-1">
                      <Globe className="w-3 h-3 text-slate-400" />
                      <span>{selectedTransaction.country}</span>
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

              {/* Anomaly and Risk Analysis */}
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

            {/* Modal Actions */}
            <div className="p-4 border-t border-slate-200 dark:border-[#162F64] bg-slate-50 dark:bg-[#040C1D] flex items-center justify-end gap-3">
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
    </div>
  );
};
