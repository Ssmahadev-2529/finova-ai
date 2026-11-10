import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from '../App';
import { TransactionsView } from '../views/TransactionsView';
import { BudgetsView } from '../views/BudgetsView';
import { CostOptimizerView } from '../views/CostOptimizerView';
import { ScamShieldView } from '../views/ScamShieldView';
import { SettingsView } from '../views/SettingsView';
import { AuthModal } from '../components/common/AuthModal';
import { SimulatePaymentModal } from '../components/common/SimulatePaymentModal';
import { INITIAL_SETTINGS, INITIAL_TRANSACTIONS } from '../data/mockData';
import { api, authStorage } from '../services/api';
import type { Transaction, User } from '../types';

describe('Finova AI Frontend Production Integrity & UI Suite', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('App shows empty tenant ledger when authenticated user has 0 transactions instead of leaking demo rows', async () => {
    authStorage.setToken('fake-jwt-token');
    const emptyUser: User = {
      id: 'USR-EMPTY',
      email: 'new-merchant@finova.test',
      fullName: 'New Merchant',
      businessName: 'Zero Txns Shop',
      isActive: true,
      role: 'merchant',
      createdAt: '2026-11-10T00:00:00Z',
    };

    vi.spyOn(api, 'getSystemHealth').mockResolvedValue({ status: 'HEALTHY', database: 'OK', redis: 'MEMORY' });
    vi.spyOn(api, 'getCurrentUser').mockResolvedValue(emptyUser);
    vi.spyOn(api, 'getTransactions').mockResolvedValue([]);
    vi.spyOn(api, 'getHealthMetrics').mockResolvedValue({
      healthScore: 100,
      healthStatus: 'Excellent',
      healthTier: 'Healthy',
      disputeRate: 0,
      refundRate: 0,
      failureRate: 0,
      anomalyRatio: 0,
      suddenSpikeDetected: false,
      isolationForestScore: 0.9,
      trends: [],
      preventiveRecommendations: [],
      dataSource: 'sandbox',
    });
    vi.spyOn(api, 'getAnalyticsSummary').mockResolvedValue({
      totalTransactions: 0,
      grossPaymentVolume: 0,
      completedVolume: 0,
      totalNetReceived: 0,
      totalIncome: 0,
      totalExpenses: 0,
      netCashFlow: 0,
      totalFees: 0,
      totalActualFees: 0,
      totalEstimatedFees: 0,
      confirmedFeeCoveragePct: 0,
      averageTicketSize: 0,
      statusBreakdown: {},
      sourceBreakdown: { sandbox: { count: 0, volume: 0 }, synthetic: { count: 0, volume: 0 } },
      riskMetrics: { anomalyCount: 0, criticalCount: 0, highCount: 0, lowMediumCount: 0, disputeRate: 0, refundRate: 0 },
    });
    vi.spyOn(api, 'getAnalyticsTrends').mockResolvedValue({ period: 'daily', data: [], summary: { totalVolume: 0, totalFees: 0, netBalance: 0, growthRatePct: 0, dataPointCount: 0 } });
    vi.spyOn(api, 'getAnalyticsPatterns').mockResolvedValue({
      currencyDistribution: [],
      paymentRailDistribution: [],
      ticketBrackets: [],
      geographicDistribution: { domesticVolume: 0, domesticPct: 100, internationalVolume: 0, internationalPct: 0 },
      statisticalBaseline: { meanAmount: 0, standardDeviation: 0, outlierThreshold: 0 },
      outliers: [],
    });
    vi.spyOn(api, 'getAnalyticsInsights').mockResolvedValue([]);
    vi.spyOn(api, 'getPeriodComparison').mockResolvedValue({
      period: 'monthly',
      currentPeriodLabel: '2026-11',
      previousPeriodLabel: 'Previous',
      metrics: {
        grossVolume: { current: 0, previous: 0, delta: 0, deltaPct: 0 },
        netRevenue: { current: 0, previous: 0, delta: 0, deltaPct: 0 },
        feesPaid: { current: 0, previous: 0, delta: 0, deltaPct: 0 },
        refundAmount: { current: 0, previous: 0, delta: 0, deltaPct: 0 },
        successRate: { current: 100, previous: 100, delta: 0, deltaPct: 0 },
        failureRate: { current: 0, previous: 0, delta: 0, deltaPct: 0 },
        averageTicket: { current: 0, previous: 0, delta: 0, deltaPct: 0 },
      },
      trendDirection: 'STABLE',
      summaryText: 'Empty ledger.',
    });
    vi.spyOn(api, 'getDecisionIntelligence').mockResolvedValue([]);
    vi.spyOn(api, 'simulateDecisionScenario').mockRejectedValue(new Error('empty'));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Zero Txns Shop')).toBeInTheDocument();
    });
    expect(screen.getByText('0 transactions recorded')).toBeInTheDocument();
    expect(screen.queryByText('Marcus Vance')).not.toBeInTheDocument();
    expect(screen.getByText('No transaction trend data yet')).toBeInTheDocument();
  });

  it('TransactionsView creates manual entries and asks confirmation before deleting manual rows', async () => {
    const manualTxn: Transaction = {
      id: 'TXN-MAN12345',
      customerName: 'Figma Pro',
      customerEmail: 'billing@figma.com',
      amount: 45,
      currency: 'USD',
      status: 'COMPLETED',
      date: '2026-11-10 10:00',
      estimatedFee: 0,
      netAmount: 45,
      paymentMethod: 'Credit/Debit Card',
      country: 'United States',
      riskScore: 10,
      riskLevel: 'LOW',
      isAnomaly: false,
      dataSource: 'synthetic',
      category: 'Software SaaS',
      txnType: 'expense',
    };

    vi.spyOn(api, 'getCategories').mockResolvedValue([]);
    const createSpy = vi.spyOn(api, 'createManualTransaction').mockResolvedValue(manualTxn);
    const deleteSpy = vi.spyOn(api, 'deleteTransaction').mockResolvedValue({ status: 'DELETED', id: manualTxn.id });
    const changedSpy = vi.fn();

    render(
      <TransactionsView
        transactions={[manualTxn]}
        selectedTransaction={manualTxn}
        onSelectTransaction={() => {}}
        onSimulateNewPayment={() => {}}
        onTransactionsChanged={changedSpy}
        isAuthenticated={true}
      />
    );

    // Delete flow opens accessible confirmation modal first alongside detail modal
    fireEvent.click(screen.getByRole('button', { name: /Delete/i }));
    expect(screen.getAllByRole('dialog').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Delete Transaction Entry?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Confirm Delete/i }));
    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith('TXN-MAN12345');
    });

    // Add manual entry modal validates and posts cleanly
    fireEvent.click(screen.getByRole('button', { name: /Add Entry/i }));
    fireEvent.change(screen.getByLabelText('Counterparty Name'), { target: { value: 'AWS Hosting' } });
    fireEvent.change(screen.getByLabelText('Amount'), { target: { value: '88.50' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Entry/i }));

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalled();
    });
  });

  it('TransactionsView protects settled PayPal captures from amount edits and shows Refund action', () => {
    const settled = INITIAL_TRANSACTIONS[0];
    vi.spyOn(api, 'getCategories').mockResolvedValue([]);
    const settledSandbox: Transaction = { ...settled, paypalCaptureId: 'CAP-123', dataSource: 'sandbox' };

    render(
      <TransactionsView
        transactions={[settledSandbox]}
        selectedTransaction={settledSandbox}
        onSelectTransaction={() => {}}
        onSimulateNewPayment={() => {}}
        isAuthenticated={true}
      />
    );

    expect(screen.getByRole('button', { name: /Refund Capture/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Delete$/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Edit$/i }));
    expect(screen.getByLabelText('Amount')).toBeDisabled();
  });

  it('BudgetsView prompts sign-in when unauthenticated and renders utilization + budget creation when authenticated', async () => {
    const { rerender } = render(<BudgetsView />);
    expect(screen.getByText(/Sign In to Manage Tenant Budgets/i)).toBeInTheDocument();

    authStorage.setToken('fake-jwt');
    vi.spyOn(api, 'getCategories').mockResolvedValue([
      { id: 'CAT-1', userId: 'U1', name: 'Payment Fees', kind: 'expense', color: '#0070BA' },
    ]);
    vi.spyOn(api, 'getBudgetUtilization').mockResolvedValue({
      totalBudgets: 1,
      budgets: [
        {
          id: 'BUD-1',
          userId: 'U1',
          category: 'Payment Fees',
          limitAmount: 500,
          currency: 'USD',
          period: 'monthly',
          alertThresholdPct: 80,
          spentAmount: 425,
          remainingAmount: 75,
          utilizationPct: 85.0,
          status: 'WARNING',
        },
      ],
    });

    const updateCategorySpy = vi.spyOn(api, 'updateCategory').mockResolvedValue({
      id: 'CAT-1',
      userId: 'U1',
      name: 'Merchant Fees',
      kind: 'both',
      color: '#0070BA',
    });

    rerender(<BudgetsView key="auth-budgets" />);
    await waitFor(() => {
      expect(screen.getByText('WARNING (85.0%)')).toBeInTheDocument();
    });
    expect(screen.getByText(/Spent: 425\.00 USD/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Edit category Payment Fees' }));
    const catInput = screen.getByLabelText('Category Name');
    fireEvent.change(catInput, { target: { value: 'Merchant Fees' } });
    fireEvent.click(screen.getByRole('button', { name: /Save Category/i }));
    await waitFor(() => {
      expect(updateCategorySpy).toHaveBeenCalledWith('CAT-1', expect.objectContaining({ name: 'Merchant Fees' }));
    });
  });

  it('CostOptimizerView and ScamShieldView render zeroed non-fake defaults without authentication', () => {
    render(<CostOptimizerView />);
    fireEvent.click(screen.getByText('Estimated vs Actual Capture Audit'));
    expect(screen.queryByText('$18.26')).not.toBeInTheDocument();
    expect(screen.queryByText('$547.45')).not.toBeInTheDocument();
    expect(screen.getAllByText('$0.00').length).toBeGreaterThan(0);

    render(<ScamShieldView />);
    fireEvent.click(screen.getByText(/Audit Ledger/i));
    expect(screen.queryByText('62.4/100')).not.toBeInTheDocument();
    expect(screen.queryByText('40.0%')).not.toBeInTheDocument();
    expect(screen.getByText('0.0/100')).toBeInTheDocument();
  });

  it('SettingsView enforces password match and 10+ character validation and saves merchant profile', async () => {
    const user: User = {
      id: 'USR-1',
      email: 'owner@finova.io',
      fullName: 'Alex Owner',
      businessName: 'Apex Retail',
      isActive: true,
      role: 'merchant',
      createdAt: '2026-11-10T00:00:00Z',
    };

    const profileSpy = vi.spyOn(api, 'updateProfile').mockResolvedValue({
      ...user,
      fullName: 'Alex Updated',
    });

    render(
      <SettingsView
        settings={INITIAL_SETTINGS}
        currentUser={user}
        systemHealth={{ status: 'HEALTHY', database: 'OK', redis: 'MEMORY' }}
        onUpdateSettings={() => {}}
        onResetDemoData={() => {}}
      />
    );

    fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: 'Alex Updated' } });
    fireEvent.click(screen.getByRole('button', { name: /Update Merchant Profile/i }));
    await waitFor(() => {
      expect(profileSpy).toHaveBeenCalledWith({ fullName: 'Alex Updated', businessName: 'Apex Retail' });
    });

    fireEvent.change(screen.getByLabelText('Current Password'), { target: { value: 'OldPass123!' } });
    fireEvent.change(screen.getByLabelText('New Strong Password'), { target: { value: 'short' } });
    fireEvent.change(screen.getByLabelText('Confirm New Password'), { target: { value: 'mismatch' } });
    fireEvent.click(screen.getByRole('button', { name: /Change Password & Rotate Tokens/i }));
    expect(screen.getByText('New password and confirmation do not match.')).toBeInTheDocument();
  });

  it('AuthModal and SimulatePaymentModal implement accessible dialogs and Escape dismissal', () => {
    const onCloseAuth = vi.fn();
    render(
      <AuthModal
        isOpen={true}
        onClose={onCloseAuth}
        currentUser={null}
        onAuthChange={() => {}}
      />
    );
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCloseAuth).toHaveBeenCalled();

    const onCloseSim = vi.fn();
    render(
      <SimulatePaymentModal
        isOpen={true}
        onClose={onCloseSim}
        onSubmit={() => {}}
      />
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCloseSim).toHaveBeenCalled();
  });
});
