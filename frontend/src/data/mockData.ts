import { Transaction, ScamAnalysisResult, AccountHealthMetrics, ChatMessage, MerchantSettings } from '../types';

export const INITIAL_TRANSACTIONS: Transaction[] = [
  {
    id: 'TXN-984210',
    paypalOrderId: '7W2984102948214M',
    customerName: 'Marcus Vance',
    customerEmail: 'm.vance@techcorp.io',
    amount: 1250.00,
    currency: 'USD',
    status: 'COMPLETED',
    date: '2026-11-02 18:24',
    estimatedFee: 43.98,
    actualFee: 43.98,
    netAmount: 1206.02,
    paymentMethod: 'Credit/Debit Card',
    country: 'United States',
    riskScore: 12,
    riskLevel: 'LOW',
    isAnomaly: false,
    dataSource: 'sandbox'
  },
  {
    id: 'TXN-984209',
    paypalOrderId: '3K4981023910398A',
    customerName: 'Elena Rostova',
    customerEmail: 'elena.rostova@euronet.de',
    amount: 840.50,
    currency: 'EUR',
    status: 'COMPLETED',
    date: '2026-11-02 16:15',
    estimatedFee: 37.82,
    actualFee: 37.82,
    netAmount: 802.68,
    paymentMethod: 'PayPal Wallet',
    country: 'Germany',
    riskScore: 18,
    riskLevel: 'LOW',
    isAnomaly: false,
    dataSource: 'sandbox'
  },
  {
    id: 'TXN-984208',
    paypalOrderId: '8P1092830192831B',
    customerName: 'Anonymous Buyer',
    customerEmail: 'temp_user_9921@sharklasers.com',
    amount: 4890.00,
    currency: 'USD',
    status: 'PENDING',
    date: '2026-11-02 14:02',
    estimatedFee: 171.16,
    actualFee: undefined,
    netAmount: 4718.84,
    paymentMethod: 'Credit/Debit Card',
    country: 'Nigeria',
    riskScore: 84,
    riskLevel: 'CRITICAL',
    isAnomaly: true,
    anomalyReason: 'Order value 7.8x above historical 30-day average from untrusted disposable domain',
    dataSource: 'synthetic'
  },
  {
    id: 'TXN-984207',
    paypalOrderId: '1L9028301923841C',
    customerName: 'Aiden Brooks',
    customerEmail: 'abrooks@studioapex.co',
    amount: 195.00,
    currency: 'USD',
    status: 'COMPLETED',
    date: '2026-11-02 11:45',
    estimatedFee: 7.31,
    actualFee: 7.31,
    netAmount: 187.69,
    paymentMethod: 'Venmo',
    country: 'United States',
    riskScore: 8,
    riskLevel: 'LOW',
    isAnomaly: false,
    dataSource: 'sandbox'
  },
  {
    id: 'TXN-984206',
    paypalOrderId: '5M1029384719203D',
    customerName: 'Chao Zhang',
    customerEmail: 'czhang@pacificventures.sg',
    amount: 2450.00,
    currency: 'USD',
    status: 'COMPLETED',
    date: '2026-11-01 22:30',
    estimatedFee: 110.25,
    actualFee: 110.25,
    netAmount: 2339.75,
    paymentMethod: 'PayPal Wallet',
    country: 'Singapore',
    riskScore: 22,
    riskLevel: 'LOW',
    isAnomaly: false,
    dataSource: 'sandbox'
  },
  {
    id: 'TXN-984205',
    paypalOrderId: '9Z3847291038472E',
    customerName: 'Unknown Billing Corp',
    customerEmail: 'accounts-settle@quick-verify-paypal.cc',
    amount: 3200.00,
    currency: 'USD',
    status: 'DENIED',
    date: '2026-11-01 19:12',
    estimatedFee: 112.18,
    actualFee: 0,
    netAmount: 0,
    paymentMethod: 'Credit/Debit Card',
    country: 'Russia',
    riskScore: 92,
    riskLevel: 'CRITICAL',
    isAnomaly: true,
    anomalyReason: 'High-risk origin IP, flagged fraudulent BIN range, spoofed email domain',
    dataSource: 'synthetic'
  },
  {
    id: 'TXN-984204',
    paypalOrderId: '2R8392018374829F',
    customerName: 'Sophia Lindqvist',
    customerEmail: 'sophia@nordicdesign.se',
    amount: 430.00,
    currency: 'EUR',
    status: 'COMPLETED',
    date: '2026-11-01 14:05',
    estimatedFee: 19.35,
    actualFee: 19.35,
    netAmount: 410.65,
    paymentMethod: 'PayPal Wallet',
    country: 'Sweden',
    riskScore: 15,
    riskLevel: 'LOW',
    isAnomaly: false,
    dataSource: 'sandbox'
  },
  {
    id: 'TXN-984203',
    paypalOrderId: '6T3829102938475G',
    customerName: 'Liam O’Connor',
    customerEmail: 'liam@celticsolutions.ie',
    amount: 620.00,
    currency: 'GBP',
    status: 'COMPLETED',
    date: '2026-10-31 17:50',
    estimatedFee: 26.35,
    actualFee: 26.35,
    netAmount: 593.65,
    paymentMethod: 'Credit/Debit Card',
    country: 'United Kingdom',
    riskScore: 19,
    riskLevel: 'LOW',
    isAnomaly: false,
    dataSource: 'sandbox'
  },
  {
    id: 'TXN-984202',
    paypalOrderId: '4X1928374659201H',
    customerName: 'David Miller',
    customerEmail: 'dmiller@fastgoods.net',
    amount: 145.00,
    currency: 'USD',
    status: 'REFUNDED',
    date: '2026-10-31 10:18',
    estimatedFee: 5.56,
    actualFee: 0.30, // PayPal keeps fixed fee on refund in some flows
    netAmount: -145.00,
    paymentMethod: 'PayPal Wallet',
    country: 'United States',
    riskScore: 42,
    riskLevel: 'MEDIUM',
    isAnomaly: true,
    anomalyReason: 'Rapid buyer refund dispute initiated within 12 minutes of completion',
    dataSource: 'synthetic'
  },
  {
    id: 'TXN-984201',
    paypalOrderId: '7V3829102837462J',
    customerName: 'Amara Okafor',
    customerEmail: 'amara.okafor@lagostrade.ng',
    amount: 85.00,
    currency: 'USD',
    status: 'COMPLETED',
    date: '2026-10-30 20:30',
    estimatedFee: 3.47,
    actualFee: 3.47,
    netAmount: 81.53,
    paymentMethod: 'Credit/Debit Card',
    country: 'Nigeria',
    riskScore: 35,
    riskLevel: 'MEDIUM',
    isAnomaly: false,
    dataSource: 'sandbox'
  },
  {
    id: 'TXN-984200',
    paypalOrderId: '3W1928374651928K',
    customerName: 'Julien Mercier',
    customerEmail: 'j.mercier@atelierlyon.fr',
    amount: 1680.00,
    currency: 'EUR',
    status: 'COMPLETED',
    date: '2026-10-30 15:40',
    estimatedFee: 75.60,
    actualFee: 75.60,
    netAmount: 1604.40,
    paymentMethod: 'PayPal Wallet',
    country: 'France',
    riskScore: 14,
    riskLevel: 'LOW',
    isAnomaly: false,
    dataSource: 'sandbox'
  },
  {
    id: 'TXN-984199',
    paypalOrderId: '8M2918273645192L',
    customerName: 'Crypto Payouts LLC',
    customerEmail: 'instant-relay@crypto-p2p-clearing.xyz',
    amount: 6500.00,
    currency: 'USD',
    status: 'DISPUTED',
    date: '2026-10-29 09:14',
    estimatedFee: 227.85,
    actualFee: 227.85,
    netAmount: 0,
    paymentMethod: 'Credit/Debit Card',
    country: 'Cyprus',
    riskScore: 88,
    riskLevel: 'CRITICAL',
    isAnomaly: true,
    anomalyReason: 'Chargeback filed by issuing bank claiming unauthorized card access',
    dataSource: 'synthetic'
  }
];

export const MOCK_SCAM_SAMPLES = [
  {
    title: 'Urgent PayPal Account Suspension Notice (Phishing Email)',
    type: 'email' as const,
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
    title: 'PayPal Overpayment & Refund Request (Message / SMS)',
    type: 'message' as const,
    content: `Hello merchant, I just sent you $1,500 via PayPal for item #4891. But my assistant accidentally overpaid you by $700 (invoice was only $800). Please immediately wire the $700 difference to my Zelle/Western Union account so I don't cancel the payment. Here is the confirmation receipt screenshot link: http://bit.ly/paypal-receipt-proof-7712`
  },
  {
    title: 'Suspicious Domain / URL Inspection',
    type: 'url' as const,
    content: `https://www.paypal-secure-login-gateway-service.biz/webapps/mpp/account-reauth?session=8491`
  },
  {
    title: 'Legitimate PayPal Payment Notification (Safe Baseline)',
    type: 'email' as const,
    content: `From: service@paypal.com
Subject: You received a payment of $120.00 USD from John Doe

Hello Merchant,
Good news! You've received a payment of $120.00 USD from John Doe (johndoe@example.com).
Transaction ID: 4T839201928374
View details in your official PayPal Activity Dashboard at paypal.com.
Thank you for using PayPal.`
  }
];

export const MOCK_ACCOUNT_HEALTH: AccountHealthMetrics = {
  healthScore: 88,
  healthStatus: 'Good',
  disputeRate: 0.65, // 0.65% (below PayPal's 1.0% threshold)
  refundRate: 2.1,
  anomalyRatio: 4.8, // 4.8% flagged transactions
  suddenSpikeDetected: false,
  isolationForestScore: 0.74,
  trends: [
    { period: 'Week 1', healthScore: 94, transactionVolume: 18400, anomalyCount: 1, disputeRate: 0.2 },
    { period: 'Week 2', healthScore: 91, transactionVolume: 22100, anomalyCount: 2, disputeRate: 0.4 },
    { period: 'Week 3', healthScore: 82, transactionVolume: 34800, anomalyCount: 6, disputeRate: 0.9 },
    { period: 'Week 4', healthScore: 88, transactionVolume: 28900, anomalyCount: 3, disputeRate: 0.65 }
  ],
  preventiveRecommendations: [
    {
      id: 'REC-01',
      title: 'Dispute Rate Nearing 0.8% Warning Horizon',
      severity: 'warning',
      action: 'Implement mandatory tracking number uploads within 24 hours of checkout.',
      impact: 'Reduces "Item Not Received" disputes by up to 42% under PayPal Seller Protection.'
    },
    {
      id: 'REC-02',
      title: 'Sudden International Inflow from High-Risk IP Subnets',
      severity: 'critical',
      action: 'Enable 3D-Secure 2.0 / Cardholder Verification for foreign transactions exceeding $1,000.',
      impact: 'Shifts chargeback liability away from merchant to card issuer.'
    },
    {
      id: 'REC-03',
      title: 'Fee Optimization: High Proportion of Cross-Border Micropayments',
      severity: 'info',
      action: 'Apply for PayPal Micropayments tier (5% + $0.05) for basket sizes under $12.',
      impact: 'Estimated monthly cost savings: $240.00 USD.'
    }
  ],
  dataSource: 'synthetic'
};

export const INITIAL_CHAT_MESSAGES: ChatMessage[] = [
  {
    id: 'MSG-1',
    sender: 'assistant',
    timestamp: '10:00 AM',
    content: `Hello! I am your **Finova AI Financial Assistant**. 
    
I can explain your PayPal sandbox transaction fees, decode payment statuses, investigate anomaly alerts, and provide cost-optimization guidance.

*Note: I operate strictly in read-only mode and do not process transactions or alter account settings.*

How can I assist your merchant operations today?`,
    category: 'policy_guidance'
  }
];

export const INITIAL_SETTINGS: MerchantSettings = {
  paypalClientId: 'AZD-sandbox_client_id_live_test_mode_774910284',
  paypalClientSecretMasked: 'EMx*********************************9aK',
  sandboxMode: true,
  primaryCurrency: 'USD',
  enableAnomalyAlerts: true,
  enableFeeOptimizationTips: true,
  disputeThresholdPercent: 1.0,
  mockDataSourceActive: true
};
