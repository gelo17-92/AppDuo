export type PartnerId = 'partnerA' | 'partnerB';

export type TransactionType = 'expense' | 'income';

export type TabId = 'resumen' | 'movimientos' | 'estadisticas' | 'ajustes';

export interface PartnerProfile {
  id: PartnerId;
  name: string;
  email: string;
  initials: string;
  accentHex: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  type: 'expense' | 'income' | 'both';
  defaultConcepts: string[];
}

export interface FixedExpense {
  id: string;
  name: string;
  categoryId: string;
  amount: number;
  dueDate: string; // YYYY-MM-DD (maturity date; day-of-month is also payment day)
  notes?: string;
  /** Effective monthly amounts starting from 2026-10 (YYYY-MM -> EUR). Applies forward until maturity. */
  amountSchedule?: Record<string, number>;
  /** Manually entered monthly amounts for months before 2026-10 (YYYY-MM -> EUR). */
  manualMonthlyAmounts?: Record<string, number>;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  title: string;
  categoryId: string;
  date: string; // YYYY-MM-DD
  addedBy: PartnerId;
  fixedExpenseId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SavingsGoalProgress {
  targetPercent: number;
  targetAmount: number;
  savedAmount: number;
  actualRate: number;
  progressPercent: number; // 0..100 clamped for bar width
  achieved: boolean;
  remainingToGoal: number;
}

export interface MonthlySavingsPoint {
  year: number;
  monthIndex: number;
  label: string;
  shortLabel: string;
  totalIncome: number;
  totalExpenses: number;
  progress: SavingsGoalProgress;
}

export interface MonthlySummary {
  totalIncome: number;
  totalExpenses: number;
  monthlyBalance: number;
  savingsRate: number;
  savingsGoal: SavingsGoalProgress;
  accountBalance: number;
  incomeCount: number;
  expenseCount: number;
  transactionCount: number;
}

export interface AnnualMonthPoint {
  monthIndex: number;
  monthName: string;
  shortLabel: string;
  totalIncome: number;
  totalExpenses: number;
  netBalance: number;
  savingsGoal: SavingsGoalProgress;
  transactionCount: number;
}

export interface AnnualSummary {
  year: number;
  totalIncome: number;
  totalExpenses: number;
  annualBalance: number;
  savingsGoal: SavingsGoalProgress;
  activeMonthsCount: number;
  avgMonthlyIncome: number;
  avgMonthlyExpense: number;
  goalAchievedMonthsCount: number;
  monthsWithIncomeCount: number;
  bestSavingsMonth: AnnualMonthPoint | null;
  highestExpenseMonth: AnnualMonthPoint | null;
  monthlyPoints: AnnualMonthPoint[];
  incomeCount: number;
  expenseCount: number;
  transactionCount: number;
}

export interface CategoryBreakdownItem {
  categoryId: string;
  name: string;
  color: string;
  icon: string;
  total: number;
  percentage: number;
  count: number;
}

export interface PartnerActivityStats {
  partnerA: {
    incomeTotal: number;
    expenseTotal: number;
    transactionCount: number;
  };
  partnerB: {
    incomeTotal: number;
    expenseTotal: number;
    transactionCount: number;
  };
}

export interface BackupMetadata {
  appName: string;
  schemaVersion: number;
  exportedAt: string;
  exportedByEmail: string;
  recordCount: number;
}

export interface BackupPayload {
  metadata: BackupMetadata;
  initialBalance: number;
  savingsGoalPercent: number;
  allowedEmails: [string, string];
  partners: Record<PartnerId, PartnerProfile>;
  categories: Category[];
  fixedExpenses: FixedExpense[];
  transactions: Transaction[];
}

export interface AppSettings {
  theme: 'dark' | 'light';
  initialBalance: number;
  accountName: string;
  savingsGoalPercent: number;
  allowedEmails: [string, string];
  partners: Record<PartnerId, PartnerProfile>;
}
