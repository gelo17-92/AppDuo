import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAccountBalance,
  calculateAnnualSummary,
  calculateCategoryBreakdown,
  calculateMonthlySummary,
  calculatePartnerActivity,
  calculateSavingsGoalProgress,
  filterTransactionsByQuery,
  filterTransactionsByTitle,
  filterTransactionsByYear,
  formatEUR,
  getCategoryTransactionsForMonth,
  getMonthlySavingsHistory,
  isFixedExpensePaidInMonth,
  parseAmountInput,
  resolveTransactionDefaultDate,
  resolveTransactionTitle,
  sortCategoriesAlphabetically,
} from './financeMath';
import {
  DEFAULT_CATEGORIES,
  DEFAULT_FIXED_EXPENSES,
  SEED_TRANSACTIONS,
} from '../data/seedData';
import type { Transaction } from '../types/finance';

test('parseAmountInput handles European commas, thousands dots, negative balances when allowed, and invalid inputs', () => {
  assert.equal(parseAmountInput('32,40'), 32.4);
  assert.equal(parseAmountInput('32.40'), 32.4);
  assert.equal(parseAmountInput('1.234,56'), 1234.56);
  assert.equal(parseAmountInput('45 €'), 45);
  assert.equal(parseAmountInput('0'), null);
  assert.equal(parseAmountInput('0', { allowZeroOrNegative: true }), 0);
  assert.equal(parseAmountInput('-150,25', { allowZeroOrNegative: true }), -150.25);
  assert.equal(parseAmountInput('-10'), null);
  assert.equal(parseAmountInput('abc'), null);
  assert.equal(parseAmountInput(''), null);
});

test('formatEUR formats European currency consistently', () => {
  assert.equal(formatEUR(32.4), '32,40 €');
  assert.equal(formatEUR(1234.5), '1.234,50 €');
  assert.equal(formatEUR(-50.1), '-50,10 €');
  assert.equal(formatEUR(120, { showSign: true }), '+120,00 €');
  assert.equal(formatEUR(0), '0,00 €');
});

test('calculateSavingsGoalProgress handles negative, partial, exact 20%, and exceeded goals', () => {
  // Partial: income 1000, expenses 900 -> saved 100 (10%), goal 200 (20%) -> 50% progress
  const partial = calculateSavingsGoalProgress(1000, 900, 20);
  assert.equal(partial.targetAmount, 200);
  assert.equal(partial.savedAmount, 100);
  assert.equal(partial.actualRate, 10);
  assert.equal(partial.progressPercent, 50);
  assert.equal(partial.achieved, false);
  assert.equal(partial.remainingToGoal, 100);

  // Exact 20%: income 2000, expenses 1600 -> saved 400 -> 100% achieved
  const exact = calculateSavingsGoalProgress(2000, 1600, 20);
  assert.equal(exact.achieved, true);
  assert.equal(exact.progressPercent, 100);
  assert.equal(exact.remainingToGoal, 0);

  // Exceeded: income 2000, expenses 1000 -> saved 1000 (50%) -> clamped bar 100%
  const exceeded = calculateSavingsGoalProgress(2000, 1000, 20);
  assert.equal(exceeded.achieved, true);
  assert.equal(exceeded.actualRate, 50);
  assert.equal(exceeded.progressPercent, 100);

  // Negative savings: income 1000, expenses 1200 -> saved -200 -> 0% progress
  const negative = calculateSavingsGoalProgress(1000, 1200, 20);
  assert.equal(negative.achieved, false);
  assert.equal(negative.progressPercent, 0);
  assert.equal(negative.remainingToGoal, 400);
});

test('calculateAccountBalance accumulates initial balance + historical incomes - expenses up to selected month', () => {
  const txs: Transaction[] = [
    {
      id: 'oct-inc',
      type: 'income',
      amount: 1000,
      title: 'Ingreso octubre',
      categoryId: 'nomina',
      date: '2026-10-05',
      addedBy: 'partnerA',
      createdAt: '2026-10-05T10:00:00Z',
      updatedAt: '2026-10-05T10:00:00Z',
    },
    {
      id: 'oct-exp',
      type: 'expense',
      amount: 350,
      title: 'Gasto octubre',
      categoryId: 'vivienda',
      date: '2026-10-10',
      addedBy: 'partnerB',
      createdAt: '2026-10-10T10:00:00Z',
      updatedAt: '2026-10-10T10:00:00Z',
    },
    {
      id: 'nov-exp',
      type: 'expense',
      amount: 150,
      title: 'Gasto noviembre',
      categoryId: 'supermercado',
      date: '2026-11-03',
      addedBy: 'partnerA',
      createdAt: '2026-11-03T10:00:00Z',
      updatedAt: '2026-11-03T10:00:00Z',
    },
  ];

  assert.equal(calculateAccountBalance(txs, 500, 2026, 9), 1150);
  assert.equal(calculateAccountBalance(txs, 500, 2026, 10), 1000);
});

test('calculateMonthlySummary and getMonthlySavingsHistory compute 20% goal progress across months', () => {
  const novSummary = calculateMonthlySummary(SEED_TRANSACTIONS, 2026, 10, 2450, 20);
  assert.equal(novSummary.totalIncome, 4730);
  assert.equal(novSummary.totalExpenses, 1998.7);
  assert.equal(novSummary.monthlyBalance, 2731.3);
  assert.equal(novSummary.savingsGoal.achieved, true);
  assert.equal(novSummary.savingsGoal.targetPercent, 20);

  // October has partial progress (~15.96% < 20%)
  const octSummary = calculateMonthlySummary(SEED_TRANSACTIONS, 2026, 9, 2450, 20);
  assert.equal(octSummary.savingsGoal.achieved, false);
  assert.ok(octSummary.savingsGoal.progressPercent > 70 && octSummary.savingsGoal.progressPercent < 90);

  const history = getMonthlySavingsHistory(SEED_TRANSACTIONS, 2026, 10, 3, 20);
  assert.equal(history.length, 3);
  assert.equal(history[0].label, 'Septiembre 2026');
  assert.equal(history[1].label, 'Octubre 2026');
  assert.equal(history[2].label, 'Noviembre 2026');
  assert.equal(history[0].progress.achieved, true);
  assert.equal(history[1].progress.achieved, false);
  assert.equal(history[2].progress.achieved, true);
});

test('isFixedExpensePaidInMonth identifies paid vs pending fixed household expenses', () => {
  const nov = SEED_TRANSACTIONS.filter((t) => t.date.startsWith('2026-11'));
  const hipoteca = DEFAULT_FIXED_EXPENSES.find((f) => f.id === 'fixed-hipoteca')!;
  const prestamos = DEFAULT_FIXED_EXPENSES.find((f) => f.id === 'fixed-prestamos')!;
  const seguro = DEFAULT_FIXED_EXPENSES.find((f) => f.id === 'fixed-seguro-hogar')!;

  assert.equal(isFixedExpensePaidInMonth(hipoteca, nov), true);
  assert.equal(isFixedExpensePaidInMonth(prestamos, nov), true);
  assert.equal(isFixedExpensePaidInMonth(seguro, nov), false);
});

test('calculateCategoryBreakdown and calculatePartnerActivity track both users incomes and expenses', () => {
  const nov = SEED_TRANSACTIONS.filter((t) => t.date.startsWith('2026-11'));
  const breakdown = calculateCategoryBreakdown(nov, DEFAULT_CATEGORIES);
  assert.ok(breakdown.length >= 6);
  assert.equal(breakdown[0].categoryId, 'prestamos');
  assert.equal(breakdown[0].name, 'Hipoteca y Préstamos');

  const activity = calculatePartnerActivity(nov);
  assert.equal(activity.partnerA.incomeTotal, 2450);
  assert.equal(activity.partnerB.incomeTotal, 2280);
  assert.ok(activity.partnerA.expenseTotal > 0);
  assert.ok(activity.partnerB.expenseTotal > 0);
});

test('filterTransactionsByQuery matches transaction names and categories accent-insensitively and with multiple words', () => {
  const nov = SEED_TRANSACTIONS.filter((t) => t.date.startsWith('2026-11'));

  // Search by transaction name (case & accent insensitive)
  const byName = filterTransactionsByQuery(nov, 'decoracion', DEFAULT_CATEGORIES);
  assert.equal(byName.length, 1);
  assert.equal(byName[0].title, 'Muebles / Decoración');

  // Search by category name (accent insensitive: "prestamos" -> "Hipoteca y Préstamos")
  const byCategory = filterTransactionsByQuery(nov, 'supermercado', DEFAULT_CATEGORIES);
  assert.equal(byCategory.length, 2);

  // Accent insensitive "nomina" matches "Nómina mensual" / category "Nómina"
  const byAccentFree = filterTransactionsByQuery(nov, 'nomina', DEFAULT_CATEGORIES);
  assert.equal(byAccentFree.length, 2);

  // Multi-word combining name + category
  const byMulti = filterTransactionsByQuery(nov, 'lidl super', DEFAULT_CATEGORIES);
  assert.equal(byMulti.length, 1);
  assert.equal(byMulti[0].title, 'Compra Lidl');

  // No match
  assert.equal(filterTransactionsByQuery(nov, 'inexistente', DEFAULT_CATEGORIES).length, 0);
});

test('filterTransactionsByYear and calculateAnnualSummary compute full-year totals, averages, and standout months', () => {
  const txs2026 = filterTransactionsByYear(SEED_TRANSACTIONS, 2026);
  assert.equal(txs2026.length, SEED_TRANSACTIONS.length);

  const annual2026 = calculateAnnualSummary(SEED_TRANSACTIONS, 2026, 20);
  assert.equal(annual2026.year, 2026);
  assert.equal(annual2026.monthlyPoints.length, 12);
  assert.equal(annual2026.activeMonthsCount, 3); // Sep, Oct, Nov
  assert.equal(annual2026.totalIncome, 14190); // 4730 * 3
  assert.equal(annual2026.totalExpenses, 9563.7); // 1998.7 + 3975 + 3590
  assert.equal(annual2026.annualBalance, 4626.3);
  assert.equal(annual2026.avgMonthlyIncome, 4730);
  assert.equal(annual2026.avgMonthlyExpense, 3187.9);
  assert.equal(annual2026.monthsWithIncomeCount, 3);
  assert.equal(annual2026.goalAchievedMonthsCount, 2); // Sep & Nov achieved >= 20%
  assert.equal(annual2026.savingsGoal.achieved, true);
  assert.equal(annual2026.bestSavingsMonth?.monthName, 'Noviembre');
  assert.equal(annual2026.highestExpenseMonth?.monthName, 'Octubre');

  // Empty year returns clean zeroed summary without NaN
  const annual2024 = calculateAnnualSummary(SEED_TRANSACTIONS, 2024, 20);
  assert.equal(annual2024.transactionCount, 0);
  assert.equal(annual2024.activeMonthsCount, 0);
  assert.equal(annual2024.totalIncome, 0);
  assert.equal(annual2024.totalExpenses, 0);
  assert.equal(annual2024.avgMonthlyIncome, 0);
  assert.equal(annual2024.avgMonthlyExpense, 0);
  assert.equal(annual2024.bestSavingsMonth, null);
  assert.equal(annual2024.highestExpenseMonth, null);
});

test('resolveTransactionDefaultDate returns today in current month and 1st of viewed month in other months', () => {
  const liveNov23 = new Date(2026, 10, 23, 12, 0, 0); // 2026-11-23

  // Current month -> live today
  assert.equal(resolveTransactionDefaultDate(2026, 10, liveNov23), '2026-11-23');

  // Past month in same year -> 1st of that month so calendar opens in that month
  assert.equal(resolveTransactionDefaultDate(2026, 7, liveNov23), '2026-08-01');

  // Future month across year boundary -> 1st of January 2027
  assert.equal(resolveTransactionDefaultDate(2027, 0, liveNov23), '2027-01-01');

  // Same month in a different year -> 1st of November 2025 (not today!)
  assert.equal(resolveTransactionDefaultDate(2025, 10, liveNov23), '2025-11-01');
});

test('sortCategoriesAlphabetically sorts Spanish category names case- and accent-insensitively without mutating', () => {
  const expenses = DEFAULT_CATEGORIES.filter((c) => c.type === 'expense');
  const snapshotBefore = expenses.map((c) => c.id);
  const sorted = sortCategoriesAlphabetically(expenses);

  // Original array not mutated
  assert.deepEqual(
    expenses.map((c) => c.id),
    snapshotBefore
  );

  assert.deepEqual(
    sorted.map((c) => c.name),
    [
      'Hipoteca y Préstamos',
      'Hogar y Compras',
      'Ocio y Viajes',
      'Restaurantes',
      'Salud y Deporte',
      'Seguros',
      'Suministros',
      'Supermercado',
      'Transporte',
      'Vivienda',
    ]
  );

  // Accented & lowercase custom categories collate cleanly in Spanish
  const custom = sortCategoriesAlphabetically([
    { id: 'c1', name: 'Óptica', icon: 'Tag', color: '#000', type: 'expense', defaultConcepts: [] },
    { id: 'c2', name: 'Ocio', icon: 'Tag', color: '#000', type: 'expense', defaultConcepts: [] },
    { id: 'c3', name: 'Agua', icon: 'Tag', color: '#000', type: 'expense', defaultConcepts: [] },
    { id: 'c4', name: 'Árboles', icon: 'Tag', color: '#000', type: 'expense', defaultConcepts: [] },
  ]);
  assert.deepEqual(
    custom.map((c) => c.name),
    ['Agua', 'Árboles', 'Ocio', 'Óptica']
  );
});

test('resolveTransactionTitle uses trimmed concept when present and falls back to category name when empty', () => {
  assert.equal(resolveTransactionTitle('  Compra Mercadona  ', 'Supermercado'), 'Compra Mercadona');
  assert.equal(resolveTransactionTitle('', 'Restaurantes'), 'Restaurantes');
  assert.equal(resolveTransactionTitle('   ', 'Hipoteca y Préstamos'), 'Hipoteca y Préstamos');
  assert.equal(resolveTransactionTitle('', ''), 'Otros');
  assert.equal(resolveTransactionTitle('   ', undefined), 'Otros');
});

test('filterTransactionsByTitle filters movements strictly by title/concept accent-insensitively', () => {
  const nov = SEED_TRANSACTIONS.filter((t) => t.date.startsWith('2026-11'));

  // Accent-insensitive title match ("decoracion" -> "Muebles / Decoración")
  const byTitle = filterTransactionsByTitle(nov, 'decoracion', DEFAULT_CATEGORIES);
  assert.equal(byTitle.length, 1);
  assert.equal(byTitle[0].title, 'Muebles / Decoración');

  // Multi-word title match
  const byMulti = filterTransactionsByTitle(nov, 'compra lidl', DEFAULT_CATEGORIES);
  assert.equal(byMulti.length, 1);
  assert.equal(byMulti[0].title, 'Compra Lidl');

  // Does NOT match unrelated title merely because its category is "Restaurantes"
  const byCategoryOnly = filterTransactionsByTitle(nov, 'restaurantes', DEFAULT_CATEGORIES);
  assert.equal(byCategoryOnly.length, 0);

  // DOES match when a movement was saved with empty concept so its displayed title IS "Restaurantes"
  const emptyConceptTx: Transaction = {
    id: 'tx-empty-concept',
    type: 'expense',
    amount: 25,
    title: '',
    categoryId: 'restaurantes',
    date: '2026-11-21',
    addedBy: 'partnerA',
    createdAt: '2026-11-21T10:00:00.000Z',
    updatedAt: '2026-11-21T10:00:00.000Z',
  };
  const matchedFallback = filterTransactionsByTitle(
    [...nov, emptyConceptTx],
    'restaurantes',
    DEFAULT_CATEGORIES
  );
  assert.equal(matchedFallback.length, 1);
  assert.equal(matchedFallback[0].id, 'tx-empty-concept');
});

test('calculateCategoryBreakdown supports income type and getCategoryTransactionsForMonth returns sorted category concepts', () => {
  const nov = SEED_TRANSACTIONS.filter((t) => t.date.startsWith('2026-11'));

  const incomeBreakdown = calculateCategoryBreakdown(nov, DEFAULT_CATEGORIES, 'income');
  assert.equal(incomeBreakdown.length, 1);
  assert.equal(incomeBreakdown[0].categoryId, 'nomina');
  assert.equal(incomeBreakdown[0].name, 'Nómina');
  assert.equal(incomeBreakdown[0].total, 4730);
  assert.equal(incomeBreakdown[0].percentage, 100);
  assert.equal(incomeBreakdown[0].count, 2);

  const prestamosConcepts = getCategoryTransactionsForMonth(nov, 'prestamos', 'expense');
  assert.equal(prestamosConcepts.length, 2);
  assert.deepEqual(
    prestamosConcepts.map((t) => t.title),
    ['Préstamo personal', 'Hipoteca']
  );

  const nominaConcepts = getCategoryTransactionsForMonth(nov, 'nomina', 'income');
  assert.equal(nominaConcepts.length, 2);
  assert.equal(nominaConcepts.reduce((sum, t) => sum + t.amount, 0), 4730);
  // Expenses for income category should be empty
  assert.equal(getCategoryTransactionsForMonth(nov, 'nomina', 'expense').length, 0);
});
