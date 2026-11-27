import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Category, FixedExpense, Transaction } from '../types/finance';
import { DEFAULT_CATEGORIES, DEFAULT_FIXED_EXPENSES } from '../data/seedData';
import {
  FIXED_EXPENSE_SCHEDULE_START,
  applyFixedExpenseUpdateForMonth,
  buildAutoFixedTransactionId,
  computePendingAutoFixedTransactions,
  findFixedExpenseTransactionInMonth,
  formatMonthStartEuropeanDate,
  isAutoFixedTransaction,
  resolveFixedExpenseForMonth,
  resolveFixedExpenseTarget,
  sanitizeMonthlyAmountMap,
} from './fixedExpenseSchedule';

const BASE_HIPOTECA: FixedExpense = {
  id: 'fixed-hipoteca',
  name: 'Hipoteca',
  categoryId: 'vivienda',
  amount: 850,
  dueDate: '2027-11-05',
  notes: 'Cuota mensual de la hipoteca',
  amountSchedule: { '2026-10': 850 },
};

describe('Fixed Expense Schedule (Oct 2026 -> Maturity, Forward-Only Edits, Manual Pre-Oct 2026)', () => {
  it('repeats the exact same amount from Octubre 2026 every month until the maturity month inclusive', () => {
    const oct2026 = resolveFixedExpenseForMonth(BASE_HIPOTECA, 2026, 9);
    const nov2026 = resolveFixedExpenseForMonth(BASE_HIPOTECA, 2026, 10);
    const dec2026 = resolveFixedExpenseForMonth(BASE_HIPOTECA, 2026, 11);
    const jun2027 = resolveFixedExpenseForMonth(BASE_HIPOTECA, 2027, 5);
    const nov2027 = resolveFixedExpenseForMonth(BASE_HIPOTECA, 2027, 10); // maturity month

    for (const res of [oct2026, nov2026, dec2026, jun2027, nov2027]) {
      assert.equal(res.status, 'scheduled');
      assert.equal(res.amount, 850);
      assert.equal(res.effectiveFromMonth, FIXED_EXPENSE_SCHEDULE_START);
    }
  });

  it('marks months strictly after the maturity date month as expired with null amount', () => {
    const dec2027 = resolveFixedExpenseForMonth(BASE_HIPOTECA, 2027, 11);
    const jan2028 = resolveFixedExpenseForMonth(BASE_HIPOTECA, 2028, 0);

    assert.equal(dec2027.status, 'expired');
    assert.equal(dec2027.amount, null);
    assert.equal(jan2028.status, 'expired');
    assert.equal(jan2028.amount, null);
  });

  it('preserves previous months when modifying an amount in a later month and applies new amount forward until maturity', () => {
    // Modify in Diciembre 2026 from 850 -> 910
    const afterDecEdit = applyFixedExpenseUpdateForMonth(BASE_HIPOTECA, {
      year: 2026,
      monthIndex: 11, // Diciembre 2026
      amount: 910,
      dueDate: BASE_HIPOTECA.dueDate,
      notes: BASE_HIPOTECA.notes,
    });

    // Previous months (Oct & Nov 2026) MUST stay 850
    assert.equal(resolveFixedExpenseForMonth(afterDecEdit, 2026, 9).amount, 850);
    assert.equal(resolveFixedExpenseForMonth(afterDecEdit, 2026, 10).amount, 850);

    // Dec 2026 and forward up to maturity MUST become 910
    assert.equal(resolveFixedExpenseForMonth(afterDecEdit, 2026, 11).amount, 910);
    assert.equal(resolveFixedExpenseForMonth(afterDecEdit, 2027, 0).amount, 910);
    assert.equal(resolveFixedExpenseForMonth(afterDecEdit, 2027, 10).amount, 910);

    // Second edit in Marzo 2027 from 910 -> 945
    const afterMarEdit = applyFixedExpenseUpdateForMonth(afterDecEdit, {
      year: 2027,
      monthIndex: 2, // Marzo 2027
      amount: 945,
      dueDate: afterDecEdit.dueDate,
      notes: afterDecEdit.notes,
    });

    assert.equal(resolveFixedExpenseForMonth(afterMarEdit, 2026, 9).amount, 850);
    assert.equal(resolveFixedExpenseForMonth(afterMarEdit, 2026, 10).amount, 850);
    assert.equal(resolveFixedExpenseForMonth(afterMarEdit, 2026, 11).amount, 910);
    assert.equal(resolveFixedExpenseForMonth(afterMarEdit, 2027, 1).amount, 910);
    assert.equal(resolveFixedExpenseForMonth(afterMarEdit, 2027, 2).amount, 945);
    assert.equal(resolveFixedExpenseForMonth(afterMarEdit, 2027, 10).amount, 945);
    assert.equal(resolveFixedExpenseForMonth(afterMarEdit, 2027, 11).status, 'expired');
  });

  it('anchors 2026-10 automatically when upgrading a legacy FixedExpense without amountSchedule', () => {
    const legacy: FixedExpense = {
      id: 'fixed-prestamos',
      name: 'Préstamos',
      categoryId: 'prestamos',
      amount: 245,
      dueDate: '2029-11-15',
    };

    // Edit in Enero 2027 to 260
    const updated = applyFixedExpenseUpdateForMonth(legacy, {
      year: 2027,
      monthIndex: 0,
      amount: 260,
      dueDate: legacy.dueDate,
    });

    assert.equal(resolveFixedExpenseForMonth(updated, 2026, 9).amount, 245);
    assert.equal(resolveFixedExpenseForMonth(updated, 2026, 10).amount, 245);
    assert.equal(resolveFixedExpenseForMonth(updated, 2026, 11).amount, 245);
    assert.equal(resolveFixedExpenseForMonth(updated, 2027, 0).amount, 260);
    assert.equal(resolveFixedExpenseForMonth(updated, 2028, 5).amount, 260);
  });

  it('requires manual amounts for months strictly before Octubre 2026 and isolates edits to that single month', () => {
    const aug2026 = resolveFixedExpenseForMonth(BASE_HIPOTECA, 2026, 7);
    const sep2026 = resolveFixedExpenseForMonth(BASE_HIPOTECA, 2026, 8);

    assert.equal(aug2026.status, 'manual_pending');
    assert.equal(aug2026.amount, null);
    assert.equal(sep2026.status, 'manual_pending');
    assert.equal(sep2026.amount, null);

    // User manually enters 790 for Agosto 2026
    const withAugManual = applyFixedExpenseUpdateForMonth(BASE_HIPOTECA, {
      year: 2026,
      monthIndex: 7, // Agosto 2026
      amount: 790,
      dueDate: BASE_HIPOTECA.dueDate,
      notes: BASE_HIPOTECA.notes,
    });

    assert.equal(resolveFixedExpenseForMonth(withAugManual, 2026, 7).status, 'manual_set');
    assert.equal(resolveFixedExpenseForMonth(withAugManual, 2026, 7).amount, 790);

    // Julio 2026 and Septiembre 2026 remain manual_pending; Octubre 2026 stays 850
    assert.equal(resolveFixedExpenseForMonth(withAugManual, 2026, 6).status, 'manual_pending');
    assert.equal(resolveFixedExpenseForMonth(withAugManual, 2026, 8).status, 'manual_pending');
    assert.equal(resolveFixedExpenseForMonth(withAugManual, 2026, 9).amount, 850);
  });

  it('uses an existing paid transaction amount in pre-Oct 2026 months when no manual override is stored yet', () => {
    const sepTx: Transaction[] = [
      {
        id: 'tx-202609-03',
        type: 'expense',
        amount: 830,
        title: 'Hipoteca',
        categoryId: 'vivienda',
        date: '2026-09-05',
        addedBy: 'partnerB',
        fixedExpenseId: 'fixed-hipoteca',
        createdAt: '2026-09-05T09:00:00.000Z',
        updatedAt: '2026-09-05T09:00:00.000Z',
      },
    ];

    const sepRes = resolveFixedExpenseForMonth(BASE_HIPOTECA, 2026, 8, sepTx);
    assert.equal(sepRes.status, 'manual_set');
    assert.equal(sepRes.amount, 830);
    assert.equal(sepRes.isPaid, true);
  });

  it('sanitizes invalid keys and non-positive values in monthly amount maps', () => {
    const cleaned = sanitizeMonthlyAmountMap({
      '2026-10': 850.555,
      '2026-13': 100, // invalid month
      'not-a-date': 200,
      '2026-11': -50,
      '2026-12': 0,
      '2027-01': 900,
    });

    assert.deepEqual(cleaned, {
      '2026-10': 850.56,
      '2027-01': 900,
    });
  });
});

describe('Automatic Start-of-Month Fixed Expense Registration (Live Date)', () => {
  const SEGURO: FixedExpense = {
    id: 'fixed-seguro-hogar',
    name: 'Seguro de hogar',
    categoryId: 'prestamos',
    amount: 58.5,
    dueDate: '2026-11-28',
    notes: 'Recibo póliza vivienda',
    amountSchedule: { '2026-10': 58.5 },
  };

  it('auto-registers missing scheduled fixed expenses on the 1st of each reached month up to liveDate without duplicating already-paid items', () => {
    const existing: Transaction[] = [
      {
        id: 'tx-202610-03',
        type: 'expense',
        amount: 850,
        title: 'Hipoteca',
        categoryId: 'vivienda',
        date: '2026-10-05',
        addedBy: 'partnerB',
        fixedExpenseId: 'fixed-hipoteca',
        createdAt: '2026-10-05T09:00:00.000Z',
        updatedAt: '2026-10-05T09:00:00.000Z',
      },
      {
        id: 'tx-202611-03',
        type: 'expense',
        amount: 850,
        title: 'Hipoteca',
        categoryId: 'vivienda',
        date: '2026-11-05',
        addedBy: 'partnerB',
        fixedExpenseId: 'fixed-hipoteca',
        createdAt: '2026-11-05T08:15:00.000Z',
        updatedAt: '2026-11-05T08:15:00.000Z',
      },
    ];

    const pending = computePendingAutoFixedTransactions({
      fixedExpenses: [BASE_HIPOTECA, SEGURO],
      existingTransactions: existing,
      liveDate: new Date(2026, 10, 21), // 21 Nov 2026
      addedBy: 'partnerA',
    });

    // Only Seguro de hogar was missing in Oct & Nov 2026; Hipoteca was already paid
    assert.equal(pending.length, 2);
    assert.equal(pending[0].id, buildAutoFixedTransactionId('fixed-seguro-hogar', '2026-10'));
    assert.equal(pending[0].date, '2026-10-01');
    assert.equal(pending[0].amount, 58.5);
    assert.equal(isAutoFixedTransaction(pending[0]), true);

    assert.equal(pending[1].id, buildAutoFixedTransactionId('fixed-seguro-hogar', '2026-11'));
    assert.equal(pending[1].date, '2026-11-01');
    assert.equal(pending[1].amount, 58.5);
  });

  it('never registers pre-Oct 2026 months, future months beyond liveDate, or months past maturity', () => {
    // Live date before Oct 2026 -> nothing auto-registered
    const preOct = computePendingAutoFixedTransactions({
      fixedExpenses: [BASE_HIPOTECA, SEGURO],
      existingTransactions: [],
      liveDate: new Date(2026, 8, 15), // 15 Sep 2026
      addedBy: 'partnerA',
    });
    assert.equal(preOct.length, 0);

    // Live date is 1 Dec 2026:
    // - Hipoteca (due 2027-11-05) gets Oct, Nov, Dec 2026 (NOT Jan 2027)
    // - Seguro (due 2026-11-28) gets Oct & Nov 2026 ONLY (expired in Dec 2026!)
    const onDec1 = computePendingAutoFixedTransactions({
      fixedExpenses: [BASE_HIPOTECA, SEGURO],
      existingTransactions: [],
      liveDate: new Date(2026, 11, 1), // 1 Dec 2026
      addedBy: 'partnerA',
    });

    const hipotecaDates = onDec1
      .filter((t) => t.fixedExpenseId === 'fixed-hipoteca')
      .map((t) => t.date);
    const seguroDates = onDec1
      .filter((t) => t.fixedExpenseId === 'fixed-seguro-hogar')
      .map((t) => t.date);

    assert.deepEqual(hipotecaDates, ['2026-10-01', '2026-11-01', '2026-12-01']);
    assert.deepEqual(seguroDates, ['2026-10-01', '2026-11-01']);
  });

  it('uses forward-only scheduled amounts for each auto-registered month and honors dismissed IDs', () => {
    const editedHipoteca = applyFixedExpenseUpdateForMonth(BASE_HIPOTECA, {
      year: 2026,
      monthIndex: 11, // Diciembre 2026 -> 910 €
      amount: 910,
      dueDate: BASE_HIPOTECA.dueDate,
    });

    const dismissed = new Set<string>([
      buildAutoFixedTransactionId('fixed-hipoteca', '2026-10'),
    ]);

    const pending = computePendingAutoFixedTransactions({
      fixedExpenses: [editedHipoteca],
      existingTransactions: [],
      liveDate: new Date(2026, 11, 1), // 1 Dec 2026
      addedBy: 'partnerB',
      dismissedAutoIds: dismissed,
    });

    // Oct 2026 was explicitly dismissed by user -> skipped; Nov gets 850, Dec gets 910
    assert.deepEqual(
      pending.map((t) => ({ date: t.date, amount: t.amount })),
      [
        { date: '2026-11-01', amount: 850 },
        { date: '2026-12-01', amount: 910 },
      ]
    );
    assert.equal(formatMonthStartEuropeanDate('2026-12'), '01/12/2026');
  });

  it('maps Hipoteca, Préstamos, and Seguro de hogar to their exact categories and concepts (default & custom IDs)', () => {
    const [hipoteca, prestamos, seguro] = DEFAULT_FIXED_EXPENSES;

    const hipTarget = resolveFixedExpenseTarget(hipoteca, DEFAULT_CATEGORIES);
    assert.equal(hipTarget.categoryId, 'prestamos');
    assert.equal(hipTarget.categoryName, 'Hipoteca y Préstamos');
    assert.equal(hipTarget.concept, 'Hipoteca');

    const presTarget = resolveFixedExpenseTarget(prestamos, DEFAULT_CATEGORIES);
    assert.equal(presTarget.categoryId, 'prestamos');
    assert.equal(presTarget.categoryName, 'Hipoteca y Préstamos');
    assert.equal(presTarget.concept, 'Préstamo personal');

    const segTarget = resolveFixedExpenseTarget(seguro, DEFAULT_CATEGORIES);
    assert.equal(segTarget.categoryId, 'seguros');
    assert.equal(segTarget.categoryName, 'Seguros');
    assert.equal(segTarget.concept, 'Seguro Hogar');

    // Custom user-created Firestore category IDs with different casing/accents
    const customCategories: Category[] = [
      {
        id: 'cat-custom-hip-99',
        name: 'Hipoteca y Prestamos',
        icon: 'Landmark',
        color: '#0EA5E9',
        type: 'expense',
        defaultConcepts: ['Hipoteca', 'Préstamo personal'],
      },
      {
        id: 'cat-custom-seg-42',
        name: 'Seguros',
        icon: 'Shield',
        color: '#6366F1',
        type: 'expense',
        defaultConcepts: ['Seguro Hogar'],
      },
    ];

    const autoGenerated = computePendingAutoFixedTransactions({
      fixedExpenses: DEFAULT_FIXED_EXPENSES,
      existingTransactions: [],
      categories: customCategories,
      liveDate: new Date(2026, 9, 10), // Octubre 2026
      addedBy: 'partnerA',
    });

    const byFixed = new Map(autoGenerated.map((t) => [t.fixedExpenseId, t]));
    assert.equal(byFixed.get('fixed-hipoteca')?.categoryId, 'cat-custom-hip-99');
    assert.equal(byFixed.get('fixed-hipoteca')?.title, 'Hipoteca');
    assert.equal(byFixed.get('fixed-prestamos')?.categoryId, 'cat-custom-hip-99');
    assert.equal(byFixed.get('fixed-prestamos')?.title, 'Préstamo personal');
    assert.equal(byFixed.get('fixed-seguro-hogar')?.categoryId, 'cat-custom-seg-42');
    assert.equal(byFixed.get('fixed-seguro-hogar')?.title, 'Seguro Hogar');

    // Legacy & canonical title matching avoids duplicate auto-registration
    const manualSeguroTx: Transaction = {
      id: 'tx-manual-seg',
      type: 'expense',
      amount: 58.5,
      title: 'Seguro Hogar',
      categoryId: 'cat-custom-seg-42',
      date: '2026-10-03',
      addedBy: 'partnerB',
      createdAt: '2026-10-03T10:00:00.000Z',
      updatedAt: '2026-10-03T10:00:00.000Z',
    };
    assert.equal(findFixedExpenseTransactionInMonth(seguro, [manualSeguroTx])?.id, 'tx-manual-seg');
  });
});
