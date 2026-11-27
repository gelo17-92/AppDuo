import type { Category, FixedExpense, Transaction } from '../types/finance';
import { roundCents } from './financeMath';

/**
 * First month (YYYY-MM) from which fixed household expenses automatically
 * carry their scheduled amount forward every month until their maturity date (dueDate).
 * Months strictly before this key require manually entered per-month amounts.
 */
export const FIXED_EXPENSE_SCHEDULE_START = '2026-10';

export const MAX_MONTHLY_AMOUNT_ENTRIES = 120;

export type FixedExpenseMonthStatus =
  | 'scheduled'
  | 'expired'
  | 'manual_set'
  | 'manual_pending';

export interface FixedExpenseMonthResolution {
  monthKey: string;
  status: FixedExpenseMonthStatus;
  amount: number | null;
  isPaid: boolean;
  paidTransaction: Transaction | null;
  effectiveFromMonth: string | null;
}

export function toYearMonthKey(year: number, monthIndex: number): string {
  const safeMonth = ((monthIndex % 12) + 12) % 12;
  return `${String(year).padStart(4, '0')}-${String(safeMonth + 1).padStart(2, '0')}`;
}

export function isValidYearMonthKey(key: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(key);
}

export function isPreScheduleMonth(year: number, monthIndex: number): boolean {
  return toYearMonthKey(year, monthIndex) < FIXED_EXPENSE_SCHEDULE_START;
}

export function getDueMonthKey(dueDate: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return null;
  const key = dueDate.slice(0, 7);
  return isValidYearMonthKey(key) ? key : null;
}

/**
 * Sanitizes a YYYY-MM -> EUR map, discarding invalid keys or non-positive numbers
 * and enforcing the bounded Firestore size cap (<= 120 entries).
 */
export function sanitizeMonthlyAmountMap(
  raw: unknown,
  filterKey?: (key: string) => boolean
): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

  const entries: Array<[string, number]> = [];
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!isValidYearMonthKey(k)) continue;
    if (filterKey && !filterKey(k)) continue;
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) continue;
    entries.push([k, roundCents(v)]);
  }

  entries.sort((a, b) => a[0].localeCompare(b[0]));
  const bounded =
    entries.length > MAX_MONTHLY_AMOUNT_ENTRIES
      ? entries.slice(entries.length - MAX_MONTHLY_AMOUNT_ENTRIES)
      : entries;

  const result: Record<string, number> = {};
  for (const [k, v] of bounded) {
    result[k] = v;
  }
  return result;
}

export interface FixedExpenseTargetResolution {
  categoryId: string;
  categoryName: string;
  concept: string;
  matchedCategory: Category | null;
}

function normalizeLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function findCategoryByMapping(
  categories: Category[],
  kind: 'hipoteca-prestamos' | 'seguros',
  fallbackId: string
): Category | null {
  const expenseCats = categories.filter((c) => c.type === 'expense' || c.type === 'both');
  const pool = expenseCats.length > 0 ? expenseCats : categories;

  if (kind === 'hipoteca-prestamos') {
    return (
      pool.find((c) => normalizeLabel(c.name) === 'hipoteca y prestamos') ??
      pool.find((c) => {
        const n = normalizeLabel(c.name);
        return n.includes('hipoteca') && n.includes('prestam');
      }) ??
      pool.find((c) => c.id === 'hipoteca-prestamos') ??
      pool.find((c) => c.id === 'prestamos') ??
      pool.find((c) => c.id === fallbackId) ??
      null
    );
  }

  return (
    pool.find((c) => normalizeLabel(c.name) === 'seguros') ??
    pool.find((c) => {
      const n = normalizeLabel(c.name);
      return n.startsWith('seguro') && !n.includes('prestam');
    }) ??
    pool.find((c) => c.id === 'seguros') ??
    pool.find((c) => c.id === fallbackId) ??
    null
  );
}

/**
 * Resolves the canonical Category and Concept (transaction title) for each fixed household expense:
 * - Hipoteca -> Categoría "Hipoteca y Préstamos", Concepto "Hipoteca"
 * - Préstamos -> Categoría "Hipoteca y Préstamos", Concepto "Préstamo personal"
 * - Seguro de hogar -> Categoría "Seguros", Concepto "Seguro Hogar"
 * Matches user-customized categories by name (accent-insensitive) so live Firestore accounts
 * with custom category IDs resolve accurately.
 */
export function resolveFixedExpenseTarget(
  fixedExpense: FixedExpense,
  categories: Category[] = []
): FixedExpenseTargetResolution {
  const normName = normalizeLabel(fixedExpense.name);
  const byId = new Map(categories.map((c) => [c.id, c]));

  if (fixedExpense.id === 'fixed-hipoteca' || normName.includes('hipoteca')) {
    const matched = findCategoryByMapping(categories, 'hipoteca-prestamos', fixedExpense.categoryId);
    return {
      categoryId: matched?.id ?? 'prestamos',
      categoryName: matched?.name ?? 'Hipoteca y Préstamos',
      concept: 'Hipoteca',
      matchedCategory: matched,
    };
  }

  if (fixedExpense.id === 'fixed-prestamos' || normName.includes('prestam')) {
    const matched = findCategoryByMapping(categories, 'hipoteca-prestamos', fixedExpense.categoryId);
    return {
      categoryId: matched?.id ?? 'prestamos',
      categoryName: matched?.name ?? 'Hipoteca y Préstamos',
      concept: 'Préstamo personal',
      matchedCategory: matched,
    };
  }

  if (fixedExpense.id === 'fixed-seguro-hogar' || normName.includes('seguro')) {
    const matched = findCategoryByMapping(categories, 'seguros', fixedExpense.categoryId);
    return {
      categoryId: matched?.id ?? 'seguros',
      categoryName: matched?.name ?? 'Seguros',
      concept: 'Seguro Hogar',
      matchedCategory: matched,
    };
  }

  const matched = byId.get(fixedExpense.categoryId) ?? null;
  return {
    categoryId: fixedExpense.categoryId,
    categoryName: matched?.name ?? 'Otros',
    concept: fixedExpense.name.trim() || 'Gasto fijo',
    matchedCategory: matched,
  };
}

export function findFixedExpenseTransactionInMonth(
  fixedExpense: FixedExpense,
  monthlyTransactions: Transaction[]
): Transaction | null {
  const normalizedName = normalizeLabel(fixedExpense.name);
  const canonicalConcept = normalizeLabel(resolveFixedExpenseTarget(fixedExpense).concept);
  return (
    monthlyTransactions.find((tx) => {
      if (tx.type !== 'expense') return false;
      if (tx.fixedExpenseId === fixedExpense.id) return true;
      const normTitle = normalizeLabel(tx.title);
      return normTitle === normalizedName || normTitle === canonicalConcept;
    }) ?? null
  );
}

/**
 * Resolves the effective scheduled amount for a month >= FIXED_EXPENSE_SCHEDULE_START
 * (ignoring maturity expiration; used internally to preserve prior months on edit).
 */
export function getScheduledRateForMonth(
  fixedExpense: FixedExpense,
  monthKey: string
): { amount: number; effectiveFromMonth: string } {
  const schedule = sanitizeMonthlyAmountMap(
    fixedExpense.amountSchedule,
    (k) => k >= FIXED_EXPENSE_SCHEDULE_START
  );
  const sortedKeys = Object.keys(schedule).sort();

  let matchedKey: string | null = null;
  for (const key of sortedKeys) {
    if (key <= monthKey) {
      matchedKey = key;
    } else {
      break;
    }
  }

  if (matchedKey !== null) {
    return {
      amount: schedule[matchedKey],
      effectiveFromMonth: matchedKey,
    };
  }

  return {
    amount: roundCents(fixedExpense.amount),
    effectiveFromMonth: FIXED_EXPENSE_SCHEDULE_START,
  };
}

/**
 * Resolves a fixed household expense for a given viewed month:
 * - Months < 2026-10: manual per-month entry only (or already-paid tx amount in that month).
 * - Months > dueDate month: expired ('vencido'), amount is null.
 * - Months in [2026-10 .. dueDate month]: repeats the latest effective scheduled amount <= monthKey.
 */
export function resolveFixedExpenseForMonth(
  fixedExpense: FixedExpense,
  year: number,
  monthIndex: number,
  monthlyTransactions: Transaction[] = []
): FixedExpenseMonthResolution {
  const monthKey = toYearMonthKey(year, monthIndex);
  const paidTransaction = findFixedExpenseTransactionInMonth(fixedExpense, monthlyTransactions);
  const isPaid = Boolean(paidTransaction);

  // 1. Pre-October 2026: manual per-month amounts only
  if (monthKey < FIXED_EXPENSE_SCHEDULE_START) {
    const manualMap = sanitizeMonthlyAmountMap(
      fixedExpense.manualMonthlyAmounts,
      (k) => k < FIXED_EXPENSE_SCHEDULE_START
    );
    const manualAmount = manualMap[monthKey];
    if (typeof manualAmount === 'number' && manualAmount > 0) {
      return {
        monthKey,
        status: 'manual_set',
        amount: roundCents(manualAmount),
        isPaid,
        paidTransaction,
        effectiveFromMonth: null,
      };
    }

    if (paidTransaction) {
      return {
        monthKey,
        status: 'manual_set',
        amount: roundCents(paidTransaction.amount),
        isPaid: true,
        paidTransaction,
        effectiveFromMonth: null,
      };
    }

    return {
      monthKey,
      status: 'manual_pending',
      amount: null,
      isPaid: false,
      paidTransaction: null,
      effectiveFromMonth: null,
    };
  }

  // 2. Post-maturity check (after dueDate's month)
  const dueMonthKey = getDueMonthKey(fixedExpense.dueDate);
  if (dueMonthKey !== null && monthKey > dueMonthKey) {
    return {
      monthKey,
      status: 'expired',
      amount: null,
      isPaid,
      paidTransaction,
      effectiveFromMonth: null,
    };
  }

  // 3. Scheduled recurring period [2026-10 .. dueMonthKey]
  const { amount, effectiveFromMonth } = getScheduledRateForMonth(fixedExpense, monthKey);
  return {
    monthKey,
    status: 'scheduled',
    amount,
    isPaid,
    paidTransaction,
    effectiveFromMonth,
  };
}

/**
 * Applies an edit made while viewing (year, monthIndex) to a FixedExpense:
 * - For months < 2026-10: writes ONLY manualMonthlyAmounts[monthKey], leaving all other months untouched.
 * - For months >= 2026-10: anchors previous baseline at 2026-10 if missing so earlier months NEVER change,
 *   and applies the new amount from monthKey forward up to the maturity date.
 */
export function applyFixedExpenseUpdateForMonth(
  existing: FixedExpense,
  params: {
    year: number;
    monthIndex: number;
    amount: number | null;
    dueDate: string;
    notes?: string;
  }
): FixedExpense {
  const monthKey = toYearMonthKey(params.year, params.monthIndex);
  const nextSchedule = sanitizeMonthlyAmountMap(
    existing.amountSchedule,
    (k) => k >= FIXED_EXPENSE_SCHEDULE_START
  );
  const nextManual = sanitizeMonthlyAmountMap(
    existing.manualMonthlyAmounts,
    (k) => k < FIXED_EXPENSE_SCHEDULE_START
  );

  let nextFallbackAmount = roundCents(existing.amount);

  if (monthKey < FIXED_EXPENSE_SCHEDULE_START) {
    if (params.amount !== null && Number.isFinite(params.amount) && params.amount > 0) {
      nextManual[monthKey] = roundCents(params.amount);
    }
  } else if (params.amount !== null && Number.isFinite(params.amount) && params.amount > 0) {
    const newRounded = roundCents(params.amount);
    const currentEffective = getScheduledRateForMonth(existing, monthKey).amount;

    // Anchor 2026-10 with the previous baseline amount BEFORE adding a later month's change
    // so October 2026 .. (monthKey - 1) remain completely unaltered.
    if (
      monthKey > FIXED_EXPENSE_SCHEDULE_START &&
      nextSchedule[FIXED_EXPENSE_SCHEDULE_START] === undefined
    ) {
      nextSchedule[FIXED_EXPENSE_SCHEDULE_START] = roundCents(existing.amount);
    }

    if (newRounded !== currentEffective || Object.keys(nextSchedule).length === 0) {
      nextSchedule[monthKey] = newRounded;
    }

    // Keep top-level amount synced with the latest scheduled rate (or baseline)
    const sortedKeys = Object.keys(nextSchedule).sort();
    if (sortedKeys.length > 0) {
      nextFallbackAmount = nextSchedule[sortedKeys[sortedKeys.length - 1]];
    } else {
      nextFallbackAmount = newRounded;
    }
  }

  const trimmedNotes = params.notes?.trim();

  const updated: FixedExpense = {
    ...existing,
    amount: nextFallbackAmount,
    dueDate: params.dueDate,
    notes: trimmedNotes ? trimmedNotes : undefined,
    amountSchedule: sanitizeMonthlyAmountMap(
      nextSchedule,
      (k) => k >= FIXED_EXPENSE_SCHEDULE_START
    ),
    manualMonthlyAmounts: sanitizeMonthlyAmountMap(
      nextManual,
      (k) => k < FIXED_EXPENSE_SCHEDULE_START
    ),
  };

  return updated;
}

export const AUTO_FIXED_TX_PREFIX = 'tx-auto-fixed-';

export function buildAutoFixedTransactionId(fixedExpenseId: string, monthKey: string): string {
  const safeFixedId = fixedExpenseId.replace(/[^a-zA-Z0-9_-]/g, '-');
  return `${AUTO_FIXED_TX_PREFIX}${safeFixedId}-${monthKey}`;
}

export function isAutoFixedTransaction(tx: Transaction | null | undefined): boolean {
  return Boolean(tx && tx.id.startsWith(AUTO_FIXED_TX_PREFIX));
}

export function formatMonthStartEuropeanDate(monthKey: string): string {
  if (!isValidYearMonthKey(monthKey)) return '';
  const [year, month] = monthKey.split('-');
  return `01/${month}/${year}`;
}

/**
 * Enumerates every YYYY-MM key from startMonthKey to endMonthKey inclusive.
 * Capped safely at 240 months (20 years) to prevent runaway iteration.
 */
export function enumerateYearMonthKeys(startMonthKey: string, endMonthKey: string): string[] {
  if (!isValidYearMonthKey(startMonthKey) || !isValidYearMonthKey(endMonthKey)) {
    return [];
  }
  if (startMonthKey > endMonthKey) return [];

  const [startYear, startMonthNum] = startMonthKey.split('-').map(Number);
  const [endYear, endMonthNum] = endMonthKey.split('-').map(Number);

  const startOrd = startYear * 12 + (startMonthNum - 1);
  const endOrd = endYear * 12 + (endMonthNum - 1);
  const cappedEnd = Math.min(endOrd, startOrd + 239);

  const result: string[] = [];
  for (let ord = startOrd; ord <= cappedEnd; ord++) {
    const y = Math.floor(ord / 12);
    const m = ord % 12;
    result.push(toYearMonthKey(y, m));
  }
  return result;
}

export interface ComputeAutoFixedTransactionsParams {
  fixedExpenses: FixedExpense[];
  existingTransactions: Transaction[];
  categories?: Category[];
  liveDate: Date;
  addedBy: 'partnerA' | 'partnerB';
  dismissedAutoIds?: ReadonlySet<string>;
  nowIso?: string;
}

/**
 * Computes any missing automatic start-of-month (YYYY-MM-01) fixed expense payments
 * for all reached scheduled months from FIXED_EXPENSE_SCHEDULE_START (2026-10)
 * through the current live calendar month (inclusive).
 *
 * Guarantees:
 * - Never generates payments for pre-Oct 2026 manual months.
 * - Never generates payments for future months (> liveDate's YYYY-MM).
 * - Never generates payments after a fixed expense's maturity date month.
 * - Never duplicates an already-paid fixed expense (by fixedExpenseId or title).
 * - Never resurrects an automatic payment whose ID is in dismissedAutoIds.
 */
export function computePendingAutoFixedTransactions(
  params: ComputeAutoFixedTransactionsParams
): Transaction[] {
  const {
    fixedExpenses,
    existingTransactions,
    categories = [],
    liveDate,
    addedBy,
    dismissedAutoIds,
    nowIso,
  } = params;

  if (fixedExpenses.length === 0 || Number.isNaN(liveDate.getTime())) {
    return [];
  }

  const liveMonthKey = toYearMonthKey(liveDate.getFullYear(), liveDate.getMonth());
  if (liveMonthKey < FIXED_EXPENSE_SCHEDULE_START) {
    return [];
  }

  const monthsToCheck = enumerateYearMonthKeys(FIXED_EXPENSE_SCHEDULE_START, liveMonthKey);
  if (monthsToCheck.length === 0) return [];

  const existingIds = new Set<string>();
  const txsByMonth = new Map<string, Transaction[]>();

  for (const tx of existingTransactions) {
    existingIds.add(tx.id);
    const mk = tx.date.slice(0, 7);
    const list = txsByMonth.get(mk);
    if (list) {
      list.push(tx);
    } else {
      txsByMonth.set(mk, [tx]);
    }
  }

  const timestampIso = nowIso ?? liveDate.toISOString();
  const pending: Transaction[] = [];

  for (const monthKey of monthsToCheck) {
    const [year, monthNum] = monthKey.split('-').map(Number);
    const monthIndex = monthNum - 1;
    const monthTxs = txsByMonth.get(monthKey) ?? [];

    for (const fixed of fixedExpenses) {
      const autoId = buildAutoFixedTransactionId(fixed.id, monthKey);
      if (existingIds.has(autoId)) continue;
      if (dismissedAutoIds?.has(autoId)) continue;

      const resolution = resolveFixedExpenseForMonth(fixed, year, monthIndex, monthTxs);
      if (
        resolution.status !== 'scheduled' ||
        resolution.isPaid ||
        resolution.amount === null ||
        resolution.amount <= 0
      ) {
        continue;
      }

      const target = resolveFixedExpenseTarget(fixed, categories);
      const generated: Transaction = {
        id: autoId,
        type: 'expense',
        amount: roundCents(resolution.amount),
        title: target.concept,
        categoryId: target.categoryId,
        date: `${monthKey}-01`,
        addedBy,
        fixedExpenseId: fixed.id,
        notes: fixed.notes?.trim() ? fixed.notes.trim() : 'Registro automático mensual',
        createdAt: timestampIso,
        updatedAt: timestampIso,
      };

      pending.push(generated);
      existingIds.add(autoId);
      monthTxs.push(generated);
      txsByMonth.set(monthKey, monthTxs);
    }
  }

  return pending;
}
