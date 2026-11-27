import type {
  BackupPayload,
  Category,
  FixedExpense,
  PartnerId,
  PartnerProfile,
  Transaction,
  TransactionType,
} from '../types/finance';
import { formatEuropeanDate, roundCents } from './financeMath';
import {
  FIXED_EXPENSE_SCHEDULE_START,
  sanitizeMonthlyAmountMap,
} from './fixedExpenseSchedule';

const VALID_TYPES: TransactionType[] = ['expense', 'income'];
const VALID_PARTNERS: PartnerId[] = ['partnerA', 'partnerB'];

export function getBackupFilename(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `finanzas-pareja-backup-${y}-${m}-${d}.json`;
}

export function getCsvFilename(year?: number, monthIndex?: number): string {
  if (typeof year === 'number' && typeof monthIndex === 'number') {
    const m = String(monthIndex + 1).padStart(2, '0');
    return `finanzas-pareja-${year}-${m}.csv`;
  }
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `finanzas-pareja-todos-${y}-${m}.csv`;
}

export function createBackupPayload(params: {
  transactions: Transaction[];
  categories: Category[];
  fixedExpenses: FixedExpense[];
  partners: Record<PartnerId, PartnerProfile>;
  allowedEmails: [string, string];
  initialBalance: number;
  savingsGoalPercent: number;
  exportedByEmail: string;
  now?: Date;
}): BackupPayload {
  const now = params.now ?? new Date();
  return {
    metadata: {
      appName: 'AppDuo Ingresos y Gastos',
      schemaVersion: 3,
      exportedAt: now.toISOString(),
      exportedByEmail: params.exportedByEmail,
      recordCount: params.transactions.length,
    },
    initialBalance: roundCents(params.initialBalance),
    savingsGoalPercent: params.savingsGoalPercent,
    allowedEmails: params.allowedEmails,
    partners: params.partners,
    categories: params.categories,
    fixedExpenses: params.fixedExpenses,
    transactions: params.transactions,
  };
}

export type BackupValidationResult =
  | {
      valid: true;
      data: {
        transactions: Transaction[];
        categories: Category[];
        fixedExpenses: FixedExpense[];
        initialBalance?: number;
        savingsGoalPercent?: number;
        exportedAt?: string;
      };
    }
  | {
      valid: false;
      error: string;
    };

function parseValidTransactionRecord(item: unknown): Transaction | null {
  if (!item || typeof item !== 'object') return null;
  const r = item as Record<string, unknown>;

  if (typeof r.id !== 'string' || !r.id.trim()) return null;
  if (!VALID_TYPES.includes(r.type as TransactionType)) return null;
  if (typeof r.amount !== 'number' || !Number.isFinite(r.amount) || r.amount <= 0) return null;
  if (typeof r.title !== 'string' || !r.title.trim()) return null;
  if (typeof r.categoryId !== 'string' || !r.categoryId.trim()) return null;
  if (typeof r.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) return null;

  const actor = r.addedBy ?? r.paidBy;
  if (!VALID_PARTNERS.includes(actor as PartnerId)) return null;

  return {
    id: r.id.trim(),
    type: r.type as TransactionType,
    amount: roundCents(r.amount),
    title: r.title.trim().slice(0, 120),
    categoryId: r.categoryId.trim(),
    date: r.date,
    addedBy: actor as PartnerId,
    fixedExpenseId: typeof r.fixedExpenseId === 'string' ? r.fixedExpenseId : undefined,
    notes: typeof r.notes === 'string' && r.notes.trim() ? r.notes.trim().slice(0, 300) : undefined,
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : new Date().toISOString(),
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : new Date().toISOString(),
  };
}

function isValidCategoryRecord(item: unknown): item is Category {
  if (!item || typeof item !== 'object') return false;
  const r = item as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    r.id.trim().length > 0 &&
    typeof r.name === 'string' &&
    r.name.trim().length > 0 &&
    typeof r.color === 'string'
  );
}

function isValidFixedExpenseRecord(item: unknown): item is FixedExpense {
  if (!item || typeof item !== 'object') return false;
  const r = item as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    r.id.trim().length > 0 &&
    typeof r.name === 'string' &&
    r.name.trim().length > 0 &&
    typeof r.amount === 'number' &&
    Number.isFinite(r.amount) &&
    r.amount > 0 &&
    typeof r.dueDate === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(r.dueDate)
  );
}

export function validateBackupPayload(raw: unknown): BackupValidationResult {
  if (!raw || typeof raw !== 'object') {
    return { valid: false, error: 'El archivo no contiene un objeto JSON válido.' };
  }

  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.transactions)) {
    return {
      valid: false,
      error: 'Estructura inválida: falta la lista obligatoria "transactions".',
    };
  }

  const validTransactions: Transaction[] = [];
  for (let i = 0; i < obj.transactions.length; i++) {
    const parsed = parseValidTransactionRecord(obj.transactions[i]);
    if (!parsed) {
      return {
        valid: false,
        error: `Registro #${i + 1} inválido en "transactions" (verifica importe, fecha YYYY-MM-DD, tipo y usuario).`,
      };
    }
    validTransactions.push(parsed);
  }

  const validCategories: Category[] = Array.isArray(obj.categories)
    ? obj.categories.filter(isValidCategoryRecord).map((c) => {
        const rawConcepts = (c as unknown as Record<string, unknown>).defaultConcepts;
        return {
          id: c.id.trim(),
          name: c.name.trim(),
          icon: typeof c.icon === 'string' ? c.icon : 'Tag',
          color: c.color,
          type:
            c.type === 'income' || c.type === 'expense' || c.type === 'both'
              ? c.type
              : 'expense',
          defaultConcepts: Array.isArray(rawConcepts)
            ? rawConcepts.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
            : [],
        };
      })
    : [];

  const validFixedExpenses: FixedExpense[] = Array.isArray(obj.fixedExpenses)
    ? obj.fixedExpenses.filter(isValidFixedExpenseRecord).map((f) => {
        const rawRec = f as unknown as Record<string, unknown>;
        const amountSchedule = sanitizeMonthlyAmountMap(
          rawRec.amountSchedule,
          (k) => k >= FIXED_EXPENSE_SCHEDULE_START
        );
        const manualMonthlyAmounts = sanitizeMonthlyAmountMap(
          rawRec.manualMonthlyAmounts,
          (k) => k < FIXED_EXPENSE_SCHEDULE_START
        );
        return {
          id: f.id.trim(),
          name: f.name.trim(),
          categoryId: typeof f.categoryId === 'string' ? f.categoryId : 'vivienda',
          amount: roundCents(f.amount),
          dueDate: f.dueDate,
          notes: typeof f.notes === 'string' ? f.notes : undefined,
          ...(Object.keys(amountSchedule).length > 0 ? { amountSchedule } : {}),
          ...(Object.keys(manualMonthlyAmounts).length > 0 ? { manualMonthlyAmounts } : {}),
        };
      })
    : [];

  const metadata = obj.metadata as Record<string, unknown> | undefined;
  const initialBalance =
    typeof obj.initialBalance === 'number' && Number.isFinite(obj.initialBalance)
      ? roundCents(obj.initialBalance)
      : undefined;
  const savingsGoalPercent =
    typeof obj.savingsGoalPercent === 'number' &&
    obj.savingsGoalPercent >= 1 &&
    obj.savingsGoalPercent <= 100
      ? roundCents(obj.savingsGoalPercent)
      : undefined;

  return {
    valid: true,
    data: {
      transactions: validTransactions,
      categories: validCategories,
      fixedExpenses: validFixedExpenses,
      initialBalance,
      savingsGoalPercent,
      exportedAt: typeof metadata?.exportedAt === 'string' ? metadata.exportedAt : undefined,
    },
  };
}

export function mergeTransactions(
  existing: Transaction[],
  incoming: Transaction[]
): {
  merged: Transaction[];
  addedCount: number;
  skippedCount: number;
} {
  const existingIds = new Set(existing.map((tx) => tx.id));
  const additions: Transaction[] = [];
  let skippedCount = 0;

  for (const tx of incoming) {
    if (existingIds.has(tx.id)) {
      skippedCount += 1;
    } else {
      existingIds.add(tx.id);
      additions.push(tx);
    }
  }

  return {
    merged: [...additions, ...existing],
    addedCount: additions.length,
    skippedCount,
  };
}

function escapeCsvCell(value: string): string {
  if (value.includes(';') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatEuropeanCsvNumber(value: number): string {
  return `${roundCents(value).toFixed(2).replace('.', ',')} €`;
}

export function generateEuropeanCsv(
  transactions: Transaction[],
  categories: Category[],
  partners: Record<PartnerId, PartnerProfile>
): string {
  const catMap = new Map(categories.map((c) => [c.id, c.name]));

  const headers = [
    'Fecha',
    'Concepto',
    'Tipo',
    'Categoría',
    'Registrado por',
    'Importe (€)',
    'Notas',
  ];

  const sorted = [...transactions].sort((a, b) => b.date.localeCompare(a.date));

  const rows = sorted.map((tx) => {
    const signedAmount = tx.type === 'income' ? tx.amount : -tx.amount;
    return [
      formatEuropeanDate(tx.date),
      tx.title,
      tx.type === 'income' ? 'Ingreso' : 'Gasto',
      catMap.get(tx.categoryId) ?? tx.categoryId,
      partners[tx.addedBy]?.name ?? tx.addedBy,
      formatEuropeanCsvNumber(signedAmount),
      tx.notes ?? '',
    ]
      .map(escapeCsvCell)
      .join(';');
  });

  return `\uFEFF${headers.map(escapeCsvCell).join(';')}\r\n${rows.join('\r\n')}`;
}
