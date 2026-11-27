import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBackupPayload,
  generateEuropeanCsv,
  getBackupFilename,
  mergeTransactions,
  validateBackupPayload,
} from './backupUtils';
import {
  DEFAULT_CATEGORIES,
  DEFAULT_FIXED_EXPENSES,
  DEFAULT_SETTINGS,
  SEED_TRANSACTIONS,
} from '../data/seedData';

test('getBackupFilename produces dated filename', () => {
  const d = new Date(2026, 10, 20);
  assert.equal(getBackupFilename(d), 'finanzas-pareja-backup-2026-11-20.json');
});

test('createBackupPayload and validateBackupPayload round-trip cleanly including fixedExpenses, savingsGoalPercent, and defaultConcepts', () => {
  const payload = createBackupPayload({
    transactions: SEED_TRANSACTIONS,
    categories: DEFAULT_CATEGORIES,
    fixedExpenses: DEFAULT_FIXED_EXPENSES,
    partners: DEFAULT_SETTINGS.partners,
    allowedEmails: DEFAULT_SETTINGS.allowedEmails,
    initialBalance: 2450,
    savingsGoalPercent: 20,
    exportedByEmail: 'angel2martinez92@gmail.com',
  });

  assert.equal(payload.metadata.schemaVersion, 3);
  assert.equal(payload.metadata.recordCount, SEED_TRANSACTIONS.length);
  assert.equal(payload.initialBalance, 2450);
  assert.equal(payload.savingsGoalPercent, 20);
  assert.equal(payload.fixedExpenses.length, 3);

  const validated = validateBackupPayload(JSON.parse(JSON.stringify(payload)));
  assert.equal(validated.valid, true);
  if (validated.valid) {
    assert.equal(validated.data.transactions.length, SEED_TRANSACTIONS.length);
    assert.equal(validated.data.categories.length, DEFAULT_CATEGORIES.length);
    assert.ok(validated.data.categories[0].defaultConcepts.length > 0);
    assert.equal(validated.data.fixedExpenses.length, 3);
    assert.equal(validated.data.initialBalance, 2450);
    assert.equal(validated.data.savingsGoalPercent, 20);
  }
});

test('validateBackupPayload migrates legacy paidBy backups and rejects malformed JSON', () => {
  const legacyValid = validateBackupPayload({
    transactions: [
      {
        id: 'legacy-1',
        type: 'expense',
        amount: 20,
        title: 'Compra antigua',
        categoryId: 'supermercado',
        date: '2026-11-10',
        paidBy: 'partnerB',
      },
    ],
  });
  assert.equal(legacyValid.valid, true);
  if (legacyValid.valid) {
    assert.equal(legacyValid.data.transactions[0].addedBy, 'partnerB');
  }

  const invalidDate = validateBackupPayload({
    transactions: [
      {
        id: 'bad-1',
        type: 'expense',
        amount: 20,
        title: 'Test',
        categoryId: 'ocio',
        date: '20/11/2026',
        addedBy: 'partnerA',
      },
    ],
  });
  assert.equal(invalidDate.valid, false);
});

test('mergeTransactions combines new records while deduplicating existing IDs', () => {
  const existing = SEED_TRANSACTIONS.slice(0, 3);
  const duplicate = SEED_TRANSACTIONS[1];
  const fresh = SEED_TRANSACTIONS[4];

  const result = mergeTransactions(existing, [duplicate, fresh]);
  assert.equal(result.addedCount, 1);
  assert.equal(result.skippedCount, 1);
  assert.equal(result.merged.length, 4);
  assert.ok(result.merged.some((t) => t.id === fresh.id));
});

test('generateEuropeanCsv uses UTF-8 BOM, semicolon delimiter, DD/MM/YYYY date, and comma EUR', () => {
  const csv = generateEuropeanCsv(
    SEED_TRANSACTIONS.slice(0, 4),
    DEFAULT_CATEGORIES,
    DEFAULT_SETTINGS.partners
  );
  assert.ok(csv.startsWith('\uFEFF'), 'Must begin with UTF-8 BOM for Excel');
  assert.ok(csv.includes('Fecha;Concepto;Tipo;Categoría;Registrado por;Importe (€);Notas'));
  assert.ok(csv.includes('06/11/2026;Compra semanal Mercadona;Gasto;Supermercado;Ángel;-164,80 €;'));
});
