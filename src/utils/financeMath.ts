import type {
  AnnualMonthPoint,
  AnnualSummary,
  Category,
  CategoryBreakdownItem,
  FixedExpense,
  MonthlySavingsPoint,
  MonthlySummary,
  PartnerActivityStats,
  SavingsGoalProgress,
  Transaction,
  TransactionType,
} from '../types/finance';

export const MONTHS_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
] as const;

export function roundCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Parses a user-entered monetary string supporting European comma ("32,40", "1.234,50")
 * and dot ("32.40") formats.
 */
export function parseAmountInput(
  raw: string,
  options?: { allowZeroOrNegative?: boolean }
): number | null {
  const cleaned = raw.trim().replace(/\s+/g, '').replace(/€/g, '');
  if (!cleaned) return null;

  const isNegative = cleaned.startsWith('-');
  if (isNegative && !options?.allowZeroOrNegative) return null;

  const unsigned = isNegative ? cleaned.slice(1) : cleaned;
  let normalized = unsigned;
  const hasComma = unsigned.includes(',');
  const hasDot = unsigned.includes('.');

  if (hasComma && hasDot) {
    const lastComma = unsigned.lastIndexOf(',');
    const lastDot = unsigned.lastIndexOf('.');
    if (lastComma > lastDot) {
      normalized = unsigned.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = unsigned.replace(/,/g, '');
    }
  } else if (hasComma) {
    const parts = unsigned.split(',');
    if (parts.length > 2) return null;
    normalized = unsigned.replace(',', '.');
  } else if (hasDot) {
    const parts = unsigned.split('.');
    if (parts.length > 2) {
      normalized = unsigned.replace(/\./g, '');
    }
  }

  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const num = Number(normalized) * (isNegative ? -1 : 1);
  if (!Number.isFinite(num)) return null;
  if (!options?.allowZeroOrNegative && num <= 0) return null;
  return roundCents(num);
}

/**
 * Deterministic European currency formatter: 1.234,50 €
 */
export function formatEUR(amount: number, options?: { showSign?: boolean }): string {
  const rounded = roundCents(amount);
  const isNegative = rounded < 0;
  const abs = Math.abs(rounded);
  const fixed = abs.toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  let prefix = '';
  if (isNegative) {
    prefix = '-';
  } else if (options?.showSign && rounded > 0) {
    prefix = '+';
  }

  return `${prefix}${withThousands},${decPart} €`;
}

export function formatMonthYear(year: number, monthIndex: number): string {
  const safeMonth = ((monthIndex % 12) + 12) % 12;
  return `${MONTHS_ES[safeMonth]} ${year}`;
}

export function formatLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Resolves the initial ISO date (YYYY-MM-DD) for a new transaction modal so that:
 * - When viewing the current live month, it defaults to today (live-synced).
 * - When viewing any past or future month, it defaults to the 1st of that viewed month
 *   so the native date calendar opens directly on the month being entered.
 */
export function resolveTransactionDefaultDate(
  selectedYear: number,
  selectedMonth: number,
  liveDate: Date
): string {
  if (
    selectedYear === liveDate.getFullYear() &&
    selectedMonth === liveDate.getMonth()
  ) {
    return formatLocalIsoDate(liveDate);
  }
  const month = String(selectedMonth + 1).padStart(2, '0');
  return `${selectedYear}-${month}-01`;
}

const ES_CATEGORY_COLLATOR = new Intl.Collator('es', {
  sensitivity: 'base',
  numeric: true,
});

/**
 * Returns a new array of categories sorted alphabetically according to Spanish collation
 * (accent- and case-insensitive), without mutating the source array.
 */
export function sortCategoriesAlphabetically(categories: Category[]): Category[] {
  return [...categories].sort((a, b) => {
    const cmp = ES_CATEGORY_COLLATOR.compare(a.name.trim(), b.name.trim());
    if (cmp !== 0) return cmp;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Resolves the movement title on save: uses the trimmed user-entered concept when provided,
 * or falls back to the selected category name when Concepto is left empty.
 */
export function resolveTransactionTitle(
  rawConcept: string,
  categoryName?: string | null
): string {
  const cleanConcept = rawConcept.trim();
  if (cleanConcept.length > 0) return cleanConcept;
  const cleanCategory = categoryName?.trim();
  return cleanCategory && cleanCategory.length > 0 ? cleanCategory : 'Otros';
}

export function formatEuropeanDate(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function formatDayHeading(isoDate: string, todayIso?: string): string {
  if (todayIso && isoDate === todayIso) {
    return `Hoy · ${formatEuropeanDate(isoDate)}`;
  }
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  const dateObj = new Date(Date.UTC(y, m - 1, d));
  const weekdays = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const wd = weekdays[dateObj.getUTCDay()];
  const monthShort = MONTHS_ES[m - 1].slice(0, 3);
  return `${wd}, ${d} ${monthShort}`;
}

export function filterTransactionsByMonth(
  transactions: Transaction[],
  year: number,
  monthIndex: number
): Transaction[] {
  const targetPrefix = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  return transactions.filter((tx) => tx.date.startsWith(targetPrefix));
}

export function filterTransactionsByYear(
  transactions: Transaction[],
  year: number
): Transaction[] {
  const targetPrefix = `${year}-`;
  return transactions.filter((tx) => tx.date.startsWith(targetPrefix));
}

/**
 * Calculates progress toward the monthly savings goal (default 20% of monthly income).
 */
export function calculateSavingsGoalProgress(
  totalIncome: number,
  totalExpenses: number,
  targetPercent = 20
): SavingsGoalProgress {
  const safeTargetPct = Math.max(1, Math.min(100, roundCents(targetPercent)));
  const savedAmount = roundCents(totalIncome - totalExpenses);
  const targetAmount = totalIncome > 0 ? roundCents((totalIncome * safeTargetPct) / 100) : 0;
  const actualRate = totalIncome > 0 ? roundCents((savedAmount / totalIncome) * 100) : 0;

  let progressPercent = 0;
  if (targetAmount > 0 && savedAmount > 0) {
    progressPercent = Math.min(100, roundCents((savedAmount / targetAmount) * 100));
  }

  const achieved = targetAmount > 0 && savedAmount >= targetAmount;
  const remainingToGoal = targetAmount > 0 ? Math.max(0, roundCents(targetAmount - savedAmount)) : 0;

  return {
    targetPercent: safeTargetPct,
    targetAmount,
    savedAmount,
    actualRate,
    progressPercent,
    achieved,
    remainingToGoal,
  };
}

/**
 * Calculates cumulative bank account balance up to the end of the selected month.
 */
export function calculateAccountBalance(
  transactions: Transaction[],
  initialBalance: number,
  upToYear: number,
  upToMonthIndex: number
): number {
  const lastDay = new Date(upToYear, upToMonthIndex + 1, 0).getDate();
  const cutoffDate = `${upToYear}-${String(upToMonthIndex + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  let running = initialBalance;
  for (const tx of transactions) {
    if (tx.date <= cutoffDate) {
      running += tx.type === 'income' ? tx.amount : -tx.amount;
    }
  }
  return roundCents(running);
}

/**
 * Calculates monthly inflows, outflows, monthly balance, 20% savings goal progress,
 * and running bank account balance.
 */
export function calculateMonthlySummary(
  transactions: Transaction[],
  year: number,
  monthIndex: number,
  initialBalance = 0,
  savingsGoalPercent = 20
): MonthlySummary {
  const monthly = filterTransactionsByMonth(transactions, year, monthIndex);

  let totalIncome = 0;
  let totalExpenses = 0;
  let incomeCount = 0;
  let expenseCount = 0;

  for (const tx of monthly) {
    if (tx.type === 'income') {
      totalIncome += tx.amount;
      incomeCount += 1;
    } else {
      totalExpenses += tx.amount;
      expenseCount += 1;
    }
  }

  totalIncome = roundCents(totalIncome);
  totalExpenses = roundCents(totalExpenses);
  const monthlyBalance = roundCents(totalIncome - totalExpenses);
  const savingsGoal = calculateSavingsGoalProgress(totalIncome, totalExpenses, savingsGoalPercent);
  const accountBalance = calculateAccountBalance(transactions, initialBalance, year, monthIndex);

  return {
    totalIncome,
    totalExpenses,
    monthlyBalance,
    savingsRate: savingsGoal.actualRate,
    savingsGoal,
    accountBalance,
    incomeCount,
    expenseCount,
    transactionCount: monthly.length,
  };
}

/**
 * Returns month-by-month savings goal history ending at (endYear, endMonthIndex) for N months.
 */
export function getMonthlySavingsHistory(
  transactions: Transaction[],
  endYear: number,
  endMonthIndex: number,
  monthsCount = 4,
  savingsGoalPercent = 20
): MonthlySavingsPoint[] {
  const points: MonthlySavingsPoint[] = [];

  for (let offset = monthsCount - 1; offset >= 0; offset--) {
    const totalMonths = endYear * 12 + endMonthIndex - offset;
    const year = Math.floor(totalMonths / 12);
    const monthIndex = ((totalMonths % 12) + 12) % 12;
    const monthly = filterTransactionsByMonth(transactions, year, monthIndex);

    let totalIncome = 0;
    let totalExpenses = 0;
    for (const tx of monthly) {
      if (tx.type === 'income') totalIncome += tx.amount;
      else totalExpenses += tx.amount;
    }
    totalIncome = roundCents(totalIncome);
    totalExpenses = roundCents(totalExpenses);

    points.push({
      year,
      monthIndex,
      label: formatMonthYear(year, monthIndex),
      shortLabel: `${MONTHS_ES[monthIndex].slice(0, 3)} ${String(year).slice(-2)}`,
      totalIncome,
      totalExpenses,
      progress: calculateSavingsGoalProgress(totalIncome, totalExpenses, savingsGoalPercent),
    });
  }

  return points;
}

/**
 * Aggregates full-year financial statistics across all 12 months (Enero–Diciembre)
 * including totals, monthly averages across active months, 20% savings goal adherence,
 * and standout months.
 */
export function calculateAnnualSummary(
  transactions: Transaction[],
  year: number,
  savingsGoalPercent = 20
): AnnualSummary {
  const yearlyTxs = filterTransactionsByYear(transactions, year);

  const incomeByMonth = new Array<number>(12).fill(0);
  const expenseByMonth = new Array<number>(12).fill(0);
  const countByMonth = new Array<number>(12).fill(0);

  let totalIncome = 0;
  let totalExpenses = 0;
  let incomeCount = 0;
  let expenseCount = 0;

  for (const tx of yearlyTxs) {
    const monthPart = Number(tx.date.slice(5, 7)) - 1;
    if (!Number.isInteger(monthPart) || monthPart < 0 || monthPart > 11) continue;

    countByMonth[monthPart] += 1;
    if (tx.type === 'income') {
      incomeByMonth[monthPart] += tx.amount;
      totalIncome += tx.amount;
      incomeCount += 1;
    } else {
      expenseByMonth[monthPart] += tx.amount;
      totalExpenses += tx.amount;
      expenseCount += 1;
    }
  }

  totalIncome = roundCents(totalIncome);
  totalExpenses = roundCents(totalExpenses);
  const annualBalance = roundCents(totalIncome - totalExpenses);
  const savingsGoal = calculateSavingsGoalProgress(totalIncome, totalExpenses, savingsGoalPercent);

  let activeMonthsCount = 0;
  let goalAchievedMonthsCount = 0;
  let monthsWithIncomeCount = 0;
  let bestSavingsMonth: AnnualMonthPoint | null = null;
  let highestExpenseMonth: AnnualMonthPoint | null = null;

  const monthlyPoints: AnnualMonthPoint[] = MONTHS_ES.map((monthName, monthIndex) => {
    const mIncome = roundCents(incomeByMonth[monthIndex]);
    const mExpenses = roundCents(expenseByMonth[monthIndex]);
    const netBalance = roundCents(mIncome - mExpenses);
    const mGoal = calculateSavingsGoalProgress(mIncome, mExpenses, savingsGoalPercent);
    const txCount = countByMonth[monthIndex];

    const point: AnnualMonthPoint = {
      monthIndex,
      monthName,
      shortLabel: monthName.slice(0, 3),
      totalIncome: mIncome,
      totalExpenses: mExpenses,
      netBalance,
      savingsGoal: mGoal,
      transactionCount: txCount,
    };

    if (txCount > 0) {
      activeMonthsCount += 1;
      if (!bestSavingsMonth || point.netBalance > bestSavingsMonth.netBalance) {
        bestSavingsMonth = point;
      }
      if (point.totalExpenses > 0 && (!highestExpenseMonth || point.totalExpenses > highestExpenseMonth.totalExpenses)) {
        highestExpenseMonth = point;
      }
    }

    if (mIncome > 0) {
      monthsWithIncomeCount += 1;
      if (mGoal.achieved) {
        goalAchievedMonthsCount += 1;
      }
    }

    return point;
  });

  const avgMonthlyIncome = activeMonthsCount > 0 ? roundCents(totalIncome / activeMonthsCount) : 0;
  const avgMonthlyExpense = activeMonthsCount > 0 ? roundCents(totalExpenses / activeMonthsCount) : 0;

  return {
    year,
    totalIncome,
    totalExpenses,
    annualBalance,
    savingsGoal,
    activeMonthsCount,
    avgMonthlyIncome,
    avgMonthlyExpense,
    goalAchievedMonthsCount,
    monthsWithIncomeCount,
    bestSavingsMonth,
    highestExpenseMonth,
    monthlyPoints,
    incomeCount,
    expenseCount,
    transactionCount: yearlyTxs.length,
  };
}

/**
 * Checks whether a fixed household expense has already been registered in the viewed month.
 */
export function isFixedExpensePaidInMonth(
  fixedExpense: FixedExpense,
  monthlyTransactions: Transaction[]
): boolean {
  const normalizedName = fixedExpense.name.trim().toLowerCase();
  return monthlyTransactions.some(
    (tx) =>
      tx.type === 'expense' &&
      (tx.fixedExpenseId === fixedExpense.id ||
        tx.title.trim().toLowerCase() === normalizedName)
  );
}

export function calculateCategoryBreakdown(
  monthlyTransactions: Transaction[],
  categories: Category[],
  type: TransactionType = 'expense'
): CategoryBreakdownItem[] {
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const totals = new Map<string, { total: number; count: number }>();

  let grandTotal = 0;
  for (const tx of monthlyTransactions) {
    if (tx.type !== type) continue;
    grandTotal += tx.amount;
    const prev = totals.get(tx.categoryId) ?? { total: 0, count: 0 };
    totals.set(tx.categoryId, {
      total: roundCents(prev.total + tx.amount),
      count: prev.count + 1,
    });
  }

  const items: CategoryBreakdownItem[] = [];
  for (const [categoryId, stats] of totals.entries()) {
    const cat = catMap.get(categoryId);
    items.push({
      categoryId,
      name: cat?.name ?? 'Otros',
      color: cat?.color ?? '#64748B',
      icon: cat?.icon ?? 'Tag',
      total: stats.total,
      percentage: grandTotal > 0 ? roundCents((stats.total / grandTotal) * 100) : 0,
      count: stats.count,
    });
  }

  return items.sort((a, b) => b.total - a.total);
}

/**
 * Returns all transactions for a specific category and movement type sorted newest-first,
 * used when expanding a category in Estadísticas to inspect its registered concepts.
 */
export function getCategoryTransactionsForMonth(
  monthlyTransactions: Transaction[],
  categoryId: string,
  type: TransactionType = 'expense'
): Transaction[] {
  return monthlyTransactions
    .filter((tx) => tx.type === type && tx.categoryId === categoryId)
    .sort((a, b) => {
      const dateCmp = b.date.localeCompare(a.date);
      if (dateCmp !== 0) return dateCmp;
      const createdCmp = b.createdAt.localeCompare(a.createdAt);
      if (createdCmp !== 0) return createdCmp;
      return b.amount - a.amount;
    });
}

export function calculatePartnerActivity(
  monthlyTransactions: Transaction[]
): PartnerActivityStats {
  const stats: PartnerActivityStats = {
    partnerA: { incomeTotal: 0, expenseTotal: 0, transactionCount: 0 },
    partnerB: { incomeTotal: 0, expenseTotal: 0, transactionCount: 0 },
  };

  for (const tx of monthlyTransactions) {
    const target = stats[tx.addedBy];
    if (!target) continue;
    target.transactionCount += 1;
    if (tx.type === 'income') {
      target.incomeTotal = roundCents(target.incomeTotal + tx.amount);
    } else {
      target.expenseTotal = roundCents(target.expenseTotal + tx.amount);
    }
  }

  return stats;
}

export interface DayGroup {
  date: string;
  transactions: Transaction[];
  dayExpenseTotal: number;
  dayIncomeTotal: number;
}

export function groupTransactionsByDay(transactions: Transaction[]): DayGroup[] {
  const sorted = [...transactions].sort((a, b) => {
    const dateDiff = b.date.localeCompare(a.date);
    if (dateDiff !== 0) return dateDiff;
    return b.createdAt.localeCompare(a.createdAt);
  });

  const groupsMap = new Map<string, DayGroup>();

  for (const tx of sorted) {
    let group = groupsMap.get(tx.date);
    if (!group) {
      group = {
        date: tx.date,
        transactions: [],
        dayExpenseTotal: 0,
        dayIncomeTotal: 0,
      };
      groupsMap.set(tx.date, group);
    }
    group.transactions.push(tx);
    if (tx.type === 'income') {
      group.dayIncomeTotal = roundCents(group.dayIncomeTotal + tx.amount);
    } else {
      group.dayExpenseTotal = roundCents(group.dayExpenseTotal + tx.amount);
    }
  }

  return Array.from(groupsMap.values());
}

/**
 * Normalizes text for accent- and case-insensitive Spanish search (e.g. "nomina" matches "Nómina").
 */
export function normalizeSearchText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Filters transactions in real time by transaction name (title), category name, notes, or author.
 * Supports accent-insensitive and multi-word queries.
 */
export function filterTransactionsByQuery(
  transactions: Transaction[],
  query: string,
  categories: Category[],
  partnerNames?: Record<string, string>
): Transaction[] {
  const normalized = normalizeSearchText(query);
  if (!normalized) return transactions;

  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return transactions;

  const catNameById = new Map(
    categories.map((c) => [c.id, normalizeSearchText(c.name)])
  );

  return transactions.filter((tx) => {
    const haystack = [
      normalizeSearchText(tx.title),
      catNameById.get(tx.categoryId) ?? '',
      normalizeSearchText(tx.notes ?? ''),
      partnerNames ? normalizeSearchText(partnerNames[tx.addedBy] ?? '') : '',
    ].join(' ');

    return tokens.every((token) => haystack.includes(token));
  });
}

/**
 * Filters transactions in real time based strictly on each movement's displayed title/concept
 * (falling back to the category name when the stored title is empty).
 * Accent- and case-insensitive with multi-word token support.
 */
export function filterTransactionsByTitle(
  transactions: Transaction[],
  query: string,
  categories: Category[]
): Transaction[] {
  const normalized = normalizeSearchText(query);
  if (!normalized) return transactions;

  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return transactions;

  const catNameById = new Map(categories.map((c) => [c.id, c.name]));

  return transactions.filter((tx) => {
    const effectiveTitle = normalizeSearchText(
      resolveTransactionTitle(tx.title, catNameById.get(tx.categoryId))
    );
    return tokens.every((token) => effectiveTitle.includes(token));
  });
}

