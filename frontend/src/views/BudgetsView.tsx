import React, { useState, useEffect, useCallback } from 'react';
import {
  BudgetUtilizationItem,
  FinancialCategory,
  FinancialBudget
} from '../types';
import { api, authStorage } from '../services/api';
import {
  Target,
  Plus,
  Trash2,
  Edit3,
  AlertTriangle,
  CheckCircle2,
  Tag,
  RefreshCw,
  X,
  Lock
} from 'lucide-react';

interface BudgetsViewProps {
  onOpenAuth?: () => void;
  onDataUpdated?: () => void;
}

export const BudgetsView: React.FC<BudgetsViewProps> = ({ onOpenAuth, onDataUpdated }) => {
  const [utilization, setUtilization] = useState<BudgetUtilizationItem[]>([]);
  const [categories, setCategories] = useState<FinancialCategory[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => Boolean(authStorage.getToken()));

  // Budget Form State
  const [showBudgetModal, setShowBudgetModal] = useState<boolean>(false);
  const [editingBudget, setEditingBudget] = useState<FinancialBudget | null>(null);
  const [budgetCategory, setBudgetCategory] = useState<string>('Cloud Infrastructure');
  const [budgetLimit, setBudgetLimit] = useState<string>('500');
  const [budgetCurrency, setBudgetCurrency] = useState<string>('USD');
  const [budgetPeriod, setBudgetPeriod] = useState<'weekly' | 'monthly' | 'quarterly'>('monthly');
  const [budgetAlertPct, setBudgetAlertPct] = useState<string>('80');
  const [savingBudget, setSavingBudget] = useState<boolean>(false);

  // Category Form State
  const [editingCategory, setEditingCategory] = useState<FinancialCategory | null>(null);
  const [catName, setCatName] = useState<string>('');
  const [catKind, setCatKind] = useState<'income' | 'expense' | 'both'>('expense');
  const [catColor, setCatColor] = useState<string>('#0070BA');
  const [savingCategory, setSavingCategory] = useState<boolean>(false);

  // Confirm Delete Dialog State
  const [pendingDelete, setPendingDelete] = useState<{ type: 'budget' | 'category'; id: string; label: string } | null>(null);

  const loadData = useCallback(async () => {
    const hasToken = Boolean(authStorage.getToken());
    setIsAuthenticated(hasToken);
    if (!hasToken) {
      setUtilization([]);
      setCategories([]);
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const [utilRes, catRes] = await Promise.all([
        api.getBudgetUtilization(),
        api.getCategories(),
      ]);
      setUtilization(utilRes.budgets || []);
      setCategories(catRes || []);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to load budgets and categories.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowBudgetModal(false);
        setPendingDelete(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const openCreateBudget = () => {
    setEditingBudget(null);
    setBudgetCategory(categories[0]?.name || 'Cloud Infrastructure');
    setBudgetLimit('500');
    setBudgetCurrency('USD');
    setBudgetPeriod('monthly');
    setBudgetAlertPct('80');
    setErrorMsg(null);
    setShowBudgetModal(true);
  };

  const openEditBudget = (item: BudgetUtilizationItem) => {
    setEditingBudget(item);
    setBudgetCategory(item.category);
    setBudgetLimit(String(item.limitAmount));
    setBudgetCurrency(item.currency);
    setBudgetPeriod(item.period);
    setBudgetAlertPct(String(item.alertThresholdPct));
    setErrorMsg(null);
    setShowBudgetModal(true);
  };

  const handleSaveBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    const limitNum = Number(budgetLimit);
    const alertNum = Number(budgetAlertPct);
    if (!budgetCategory.trim()) {
      setErrorMsg('Budget category is required.');
      return;
    }
    if (!Number.isFinite(limitNum) || limitNum <= 0) {
      setErrorMsg('Budget limit must be greater than zero.');
      return;
    }
    if (!Number.isInteger(alertNum) || alertNum < 10 || alertNum > 100) {
      setErrorMsg('Alert threshold must be a whole percentage between 10 and 100.');
      return;
    }

    setSavingBudget(true);
    setErrorMsg(null);
    try {
      if (editingBudget) {
        await api.updateBudget(editingBudget.id, {
          category: budgetCategory.trim(),
          limitAmount: limitNum,
          period: budgetPeriod,
          alertThresholdPct: alertNum,
        });
      } else {
        await api.createBudget({
          category: budgetCategory.trim(),
          limitAmount: limitNum,
          currency: budgetCurrency,
          period: budgetPeriod,
          alertThresholdPct: alertNum,
        });
      }
      setShowBudgetModal(false);
      await loadData();
      onDataUpdated?.();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to save budget.');
    } finally {
      setSavingBudget(false);
    }
  };

  const handleStartEditCategory = (cat: FinancialCategory) => {
    setEditingCategory(cat);
    setCatName(cat.name);
    setCatKind(cat.kind);
    setCatColor(cat.color || '#0070BA');
    setErrorMsg(null);
  };

  const handleCancelEditCategory = () => {
    setEditingCategory(null);
    setCatName('');
    setCatKind('expense');
    setCatColor('#0070BA');
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) {
      setErrorMsg('Category name cannot be empty.');
      return;
    }
    setSavingCategory(true);
    setErrorMsg(null);
    try {
      if (editingCategory) {
        await api.updateCategory(editingCategory.id, {
          name: catName.trim(),
          kind: catKind,
          color: catColor,
        });
        setEditingCategory(null);
      } else {
        await api.createCategory({
          name: catName.trim(),
          kind: catKind,
          color: catColor,
        });
      }
      setCatName('');
      setCatKind('expense');
      setCatColor('#0070BA');
      await loadData();
      onDataUpdated?.();
    } catch (err: any) {
      setErrorMsg(err?.message || (editingCategory ? 'Failed to update category.' : 'Failed to create category.'));
    } finally {
      setSavingCategory(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setErrorMsg(null);
    try {
      if (pendingDelete.type === 'budget') {
        await api.deleteBudget(pendingDelete.id);
      } else {
        await api.deleteCategory(pendingDelete.id);
        if (editingCategory?.id === pendingDelete.id) {
          handleCancelEditCategory();
        }
      }
      setPendingDelete(null);
      await loadData();
      onDataUpdated?.();
    } catch (err: any) {
      setErrorMsg(err?.message || `Failed to delete ${pendingDelete.type}.`);
      setPendingDelete(null);
    }
  };

  const fmtAmount = (amt: number, curr: string) =>
    curr === 'JPY'
      ? `¥${Math.round(amt).toLocaleString('en-US')} JPY`
      : `${amt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${curr}`;

  if (!isAuthenticated) {
    return (
      <div className="fintech-card p-8 text-center space-y-4">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-[#0070BA]/10 text-[#0070BA] flex items-center justify-center">
          <Lock className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
          Sign In to Manage Tenant Budgets & Expense Categories
        </h2>
        <p className="text-xs text-slate-600 dark:text-[#8EA1C7] max-w-md mx-auto">
          Multi-currency expense budgets (including Payment Fees tracking across USD, EUR, GBP, and JPY) and custom ledger categories are persisted securely per authenticated merchant account.
        </p>
        {onOpenAuth && (
          <button
            onClick={onOpenAuth}
            className="px-6 py-2.5 rounded-full bg-[#0070BA] hover:bg-[#005EA6] text-white text-xs font-bold shadow-sm transition-all btn-press"
          >
            Sign In / Create Merchant Account
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <Target className="w-5 h-5 text-[#0070BA]" />
            <span>Budgets, Spend Controls & Categories</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-[#7E96C4]">
            Track rolling 7-day, 30-day, and 90-day spending and PayPal fee limits across currencies in real time.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={loadData}
            disabled={loading}
            aria-label="Refresh budgets and categories"
            className="px-3.5 py-2 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-[#0B1A3A] dark:hover:bg-[#112654] text-slate-700 dark:text-white text-xs font-bold flex items-center gap-1.5 border border-slate-200 dark:border-[#1E3B78] transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={openCreateBudget}
            className="px-5 py-2 rounded-full bg-[#0070BA] hover:bg-[#005EA6] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all btn-press"
          >
            <Plus className="w-4 h-4" />
            <span>New Budget</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div role="alert" className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-200 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Budgets Grid */}
      <div className="fintech-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Active Spending & Fee Budgets</h3>
          <span className="text-[11px] font-mono text-slate-500 dark:text-[#7E96C4]">
            {utilization.length} configured
          </span>
        </div>

        {loading && utilization.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500 dark:text-[#7E96C4]">Loading budget utilization...</div>
        ) : utilization.length === 0 ? (
          <div className="py-10 text-center space-y-2 border border-dashed border-slate-200 dark:border-[#1A356D] rounded-2xl">
            <p className="text-xs font-semibold text-slate-600 dark:text-[#8EA1C7]">
              No budgets configured yet.
            </p>
            <p className="text-[11px] text-slate-400">
              Create a budget for expense categories (e.g. "Software SaaS") or PayPal costs ("Payment Fees").
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {utilization.map((b) => {
              const barPct = Math.min(100, Math.max(0, b.utilizationPct));
              const barClass =
                b.status === 'EXCEEDED'
                  ? 'bg-rose-500'
                  : b.status === 'WARNING'
                  ? 'bg-amber-500'
                  : 'bg-emerald-500';
              const badgeClass =
                b.status === 'EXCEEDED'
                  ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                  : b.status === 'WARNING'
                  ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                  : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';

              return (
                <div
                  key={b.id}
                  className="p-4 rounded-2xl bg-slate-50/70 dark:bg-[#050C1C] border border-slate-200/90 dark:border-[#162F64] space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-extrabold text-slate-900 dark:text-white">{b.category}</span>
                        <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-slate-200/70 dark:bg-[#0E2046] text-slate-600 dark:text-[#9BB0D6]">
                          {b.period}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-[#7E96C4] mt-0.5">
                        Alert threshold at {b.alertThresholdPct}%
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${badgeClass}`}>
                        {b.status} ({b.utilizationPct.toFixed(1)}%)
                      </span>
                      <button
                        onClick={() => openEditBudget(b)}
                        aria-label={`Edit budget ${b.category}`}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-[#0070BA] hover:bg-white dark:hover:bg-[#0B1A3A] transition-colors"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setPendingDelete({ type: 'budget', id: b.id, label: b.category })}
                        aria-label={`Delete budget ${b.category}`}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-white dark:hover:bg-[#0B1A3A] transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-[#0E2046] overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${barClass}`} style={{ width: `${barPct}%` }} />
                  </div>

                  <div className="flex justify-between text-xs font-mono">
                    <span className="text-slate-700 dark:text-slate-200 font-bold">
                      Spent: {fmtAmount(b.spentAmount, b.currency)}
                    </span>
                    <span className="text-slate-500 dark:text-[#7E96C4]">
                      Limit: {fmtAmount(b.limitAmount, b.currency)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Categories Section */}
      <div className="fintech-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Tag className="w-4 h-4 text-[#0070BA]" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Custom Ledger Categories</h3>
        </div>

        <form onSubmit={handleCreateCategory} className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[180px]">
            <label htmlFor="new-cat-name" className="block text-[11px] font-semibold text-slate-600 dark:text-[#8EA1C7] mb-1">
              Category Name
            </label>
            <input
              id="new-cat-name"
              type="text"
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              placeholder="e.g. Marketing Ads, Payment Fees"
              className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#18366E] text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#0070BA]"
            />
          </div>

          <div className="w-36">
            <label htmlFor="new-cat-kind" className="block text-[11px] font-semibold text-slate-600 dark:text-[#8EA1C7] mb-1">
              Type
            </label>
            <select
              id="new-cat-kind"
              value={catKind}
              onChange={(e) => setCatKind(e.target.value as 'income' | 'expense' | 'both')}
              className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#18366E] text-xs text-slate-800 dark:text-white focus:outline-none focus:border-[#0070BA]"
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
              <option value="both">Both</option>
            </select>
          </div>

          <div>
            <label htmlFor="new-cat-color" className="block text-[11px] font-semibold text-slate-600 dark:text-[#8EA1C7] mb-1">
              Tag Color
            </label>
            <input
              id="new-cat-color"
              type="color"
              value={catColor}
              onChange={(e) => setCatColor(e.target.value)}
              className="h-9 w-12 rounded-xl border border-slate-200 dark:border-[#18366E] bg-transparent cursor-pointer"
            />
          </div>

          <button
            type="submit"
            disabled={savingCategory}
            className="px-4 py-2 rounded-full bg-slate-900 hover:bg-slate-800 dark:bg-[#0070BA] dark:hover:bg-[#005EA6] text-white text-xs font-bold transition-colors disabled:opacity-50"
          >
            {savingCategory ? (editingCategory ? 'Saving...' : 'Adding...') : (editingCategory ? 'Save Category' : 'Add Category')}
          </button>
          {editingCategory && (
            <button
              type="button"
              onClick={handleCancelEditCategory}
              className="px-4 py-2 rounded-full border border-slate-200 dark:border-[#18366E] text-slate-600 dark:text-[#A3B8E0] text-xs font-bold hover:bg-slate-50 dark:hover:bg-[#091834] transition-colors"
            >
              Cancel Edit
            </button>
          )}
        </form>

        <div className="flex flex-wrap gap-2 pt-2">
          {categories.length === 0 ? (
            <span className="text-xs text-slate-400">No custom categories saved yet.</span>
          ) : (
            categories.map((cat) => (
              <div
                key={cat.id}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-[#050C1C] border border-slate-200 dark:border-[#18366E] text-xs"
              >
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color || '#0070BA' }} />
                <span className="font-semibold text-slate-800 dark:text-white">{cat.name}</span>
                <span className="text-[10px] font-mono uppercase text-slate-500 dark:text-[#7E96C4]">{cat.kind}</span>
                <button
                  type="button"
                  onClick={() => handleStartEditCategory(cat)}
                  aria-label={`Edit category ${cat.name}`}
                  className="text-slate-400 hover:text-[#0070BA] transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setPendingDelete({ type: 'category', id: cat.id, label: cat.name })}
                  aria-label={`Delete category ${cat.name}`}
                  className="text-slate-400 hover:text-rose-600 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Create/Edit Budget Dialog */}
      {showBudgetModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="budget-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        >
          <div className="bg-white dark:bg-[#071126] border border-slate-200 dark:border-white/[0.12] rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-[#162F64]">
              <h3 id="budget-dialog-title" className="text-sm font-extrabold text-slate-900 dark:text-white">
                {editingBudget ? 'Update Spending Budget' : 'Create Spending Budget'}
              </h3>
              <button
                type="button"
                aria-label="Close budget modal"
                onClick={() => setShowBudgetModal(false)}
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveBudget} className="space-y-3 text-xs">
              <div>
                <label htmlFor="budget-cat-input" className="block font-semibold text-slate-700 dark:text-[#8EA1C7] mb-1">
                  Category (use "Payment Fees" to track PayPal processing fees)
                </label>
                <input
                  id="budget-cat-input"
                  type="text"
                  required
                  value={budgetCategory}
                  onChange={(e) => setBudgetCategory(e.target.value)}
                  className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#18366E] text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="budget-limit-input" className="block font-semibold text-slate-700 dark:text-[#8EA1C7] mb-1">
                    Limit Amount
                  </label>
                  <input
                    id="budget-limit-input"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={budgetLimit}
                    onChange={(e) => setBudgetLimit(e.target.value)}
                    className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#18366E] text-slate-900 dark:text-white font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="budget-currency-select" className="block font-semibold text-slate-700 dark:text-[#8EA1C7] mb-1">
                    Currency
                  </label>
                  <select
                    id="budget-currency-select"
                    disabled={Boolean(editingBudget)}
                    value={budgetCurrency}
                    onChange={(e) => setBudgetCurrency(e.target.value)}
                    className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#18366E] text-slate-900 dark:text-white disabled:opacity-60"
                  >
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                    <option value="CAD">CAD</option>
                    <option value="AUD">AUD</option>
                    <option value="JPY">JPY</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="budget-period-select" className="block font-semibold text-slate-700 dark:text-[#8EA1C7] mb-1">
                    Rolling Window
                  </label>
                  <select
                    id="budget-period-select"
                    value={budgetPeriod}
                    onChange={(e) => setBudgetPeriod(e.target.value as 'weekly' | 'monthly' | 'quarterly')}
                    className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#18366E] text-slate-900 dark:text-white"
                  >
                    <option value="weekly">Weekly (7d)</option>
                    <option value="monthly">Monthly (30d)</option>
                    <option value="quarterly">Quarterly (90d)</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="budget-alert-input" className="block font-semibold text-slate-700 dark:text-[#8EA1C7] mb-1">
                    Alert Threshold (%)
                  </label>
                  <input
                    id="budget-alert-input"
                    type="number"
                    min="10"
                    max="100"
                    required
                    value={budgetAlertPct}
                    onChange={(e) => setBudgetAlertPct(e.target.value)}
                    className="w-full py-2 px-3 rounded-xl bg-slate-50 dark:bg-[#050C1C] border border-slate-200 dark:border-[#18366E] text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowBudgetModal(false)}
                  className="px-4 py-2 rounded-full bg-slate-100 dark:bg-[#0E2046] text-slate-700 dark:text-white font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingBudget}
                  className="px-5 py-2 rounded-full bg-[#0070BA] hover:bg-[#005EA6] text-white font-bold disabled:opacity-50"
                >
                  {savingBudget ? 'Saving...' : editingBudget ? 'Save Changes' : 'Create Budget'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {pendingDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-delete-budget-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        >
          <div className="bg-white dark:bg-[#071126] border border-slate-200 dark:border-white/[0.12] rounded-3xl w-full max-w-sm p-6 shadow-2xl space-y-4">
            <h3 id="confirm-delete-budget-title" className="text-sm font-extrabold text-slate-900 dark:text-white">
              Delete {pendingDelete.type === 'budget' ? 'Budget' : 'Category'}?
            </h3>
            <p className="text-xs text-slate-600 dark:text-[#8EA1C7]">
              Are you sure you want to permanently remove <strong>{pendingDelete.label}</strong>? Existing transactions remain intact.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="px-4 py-2 rounded-full bg-slate-100 dark:bg-[#0E2046] text-slate-700 dark:text-white text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="px-4 py-2 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Confirm Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
