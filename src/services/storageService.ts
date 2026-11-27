import {
  DEFAULT_CATEGORIES,
  DEFAULT_FIXED_EXPENSES,
  DEFAULT_SETTINGS,
  SEED_TRANSACTIONS,
} from '../data/seedData';
import type { AppSettings, Category, FixedExpense, PartnerId, Transaction } from '../types/finance';

const STORAGE_KEYS = {
  transactions: 'duo_finanzas_transactions_v4',
  categories: 'duo_finanzas_categories_v4',
  fixedExpenses: 'duo_finanzas_fixed_expenses_v4',
  settings: 'duo_finanzas_settings_v4',
  sessionEmail: 'duo_finanzas_session_email_v4',
  cloudCachePrefix: 'duo_finanzas_cloud_cache_v4_',
  dismissedAutoFixedIds: 'duo_finanzas_dismissed_auto_fixed_v1',
} as const;

const SYNC_CHANNEL_NAME = 'duo_finanzas_sync_v4';

export type SyncScope = 'transactions' | 'categories' | 'fixedExpenses' | 'settings';

export function loadTransactions(): Transaction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.transactions);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.transactions, JSON.stringify(SEED_TRANSACTIONS));
      return SEED_TRANSACTIONS;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : SEED_TRANSACTIONS;
  } catch {
    return SEED_TRANSACTIONS;
  }
}

export function saveTransactions(transactions: Transaction[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.transactions, JSON.stringify(transactions));
    broadcastSync('transactions');
  } catch {
    // Ignore storage quota errors gracefully
  }
}

export function loadCategories(): Category[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.categories);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.categories, JSON.stringify(DEFAULT_CATEGORIES));
      return DEFAULT_CATEGORIES;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_CATEGORIES;
    return parsed.map((c: Category) => ({
      ...c,
      defaultConcepts: Array.isArray(c.defaultConcepts) ? c.defaultConcepts : [],
    }));
  } catch {
    return DEFAULT_CATEGORIES;
  }
}

export function saveCategories(categories: Category[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.categories, JSON.stringify(categories));
    broadcastSync('categories');
  } catch {
    // Ignore storage quota errors gracefully
  }
}

export function loadFixedExpenses(): FixedExpense[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.fixedExpenses);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.fixedExpenses, JSON.stringify(DEFAULT_FIXED_EXPENSES));
      return DEFAULT_FIXED_EXPENSES;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_FIXED_EXPENSES;
  } catch {
    return DEFAULT_FIXED_EXPENSES;
  }
}

export function saveFixedExpenses(fixedExpenses: FixedExpense[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.fixedExpenses, JSON.stringify(fixedExpenses));
    broadcastSync('fixedExpenses');
  } catch {
    // Ignore storage quota errors gracefully
  }
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.settings);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(DEFAULT_SETTINGS));
      return DEFAULT_SETTINGS;
    }
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      theme: parsed.theme === 'light' ? 'light' : 'dark',
      initialBalance:
        typeof parsed.initialBalance === 'number' && Number.isFinite(parsed.initialBalance)
          ? parsed.initialBalance
          : DEFAULT_SETTINGS.initialBalance,
      accountName:
        typeof parsed.accountName === 'string' && parsed.accountName.trim()
          ? parsed.accountName.trim()
          : DEFAULT_SETTINGS.accountName,
      savingsGoalPercent:
        typeof parsed.savingsGoalPercent === 'number' &&
        parsed.savingsGoalPercent >= 1 &&
        parsed.savingsGoalPercent <= 100
          ? parsed.savingsGoalPercent
          : DEFAULT_SETTINGS.savingsGoalPercent,
      allowedEmails:
        Array.isArray(parsed.allowedEmails) && parsed.allowedEmails.length === 2
          ? [String(parsed.allowedEmails[0]), String(parsed.allowedEmails[1])]
          : DEFAULT_SETTINGS.allowedEmails,
      partners:
        parsed.partners?.partnerA && parsed.partners?.partnerB
          ? parsed.partners
          : DEFAULT_SETTINGS.partners,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
    broadcastSync('settings');
  } catch {
    // Ignore storage quota errors gracefully
  }
}

export function loadSessionEmail(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.sessionEmail);
    return raw && raw.trim() ? raw.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

export function saveSessionEmail(email: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.sessionEmail, email.trim().toLowerCase());
  } catch {
    // Ignore storage quota errors gracefully
  }
}

export function clearSessionEmail(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.sessionEmail);
  } catch {
    // Ignore
  }
}

export function identifyPartnerByEmail(
  email: string,
  allowedEmails: [string, string]
): PartnerId | null {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === allowedEmails[0].trim().toLowerCase()) return 'partnerA';
  if (normalized === allowedEmails[1].trim().toLowerCase()) return 'partnerB';
  return null;
}

export function broadcastSync(scope: SyncScope): void {
  if (typeof BroadcastChannel === 'undefined') return;
  try {
    const channel = new BroadcastChannel(SYNC_CHANNEL_NAME);
    channel.postMessage({ scope, timestamp: Date.now() });
    channel.close();
  } catch {
    // BroadcastChannel unavailable in restricted contexts
  }
}

export function subscribeToCrossTabSync(onUpdate: (scope: SyncScope) => void): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => {};
  try {
    const channel = new BroadcastChannel(SYNC_CHANNEL_NAME);
    channel.onmessage = (event) => {
      const scope = event.data?.scope;
      if (
        scope === 'transactions' ||
        scope === 'categories' ||
        scope === 'fixedExpenses' ||
        scope === 'settings'
      ) {
        onUpdate(scope);
      }
    };
    return () => channel.close();
  } catch {
    return () => {};
  }
}

export function triggerFileDownload(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface CloudSnapshotCache {
  settings?: AppSettings;
  transactions?: Transaction[];
  categories?: Category[];
  fixedExpenses?: FixedExpense[];
  updatedAt: number;
}

export function loadCloudSnapshotCache(uid: string): CloudSnapshotCache | null {
  if (!uid) return null;
  try {
    const raw = localStorage.getItem(`${STORAGE_KEYS.cloudCachePrefix}${uid}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CloudSnapshotCache;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function saveCloudSnapshotCache(uid: string, patch: Partial<CloudSnapshotCache>): void {
  if (!uid) return;
  try {
    const existing = loadCloudSnapshotCache(uid) ?? { updatedAt: Date.now() };
    const next: CloudSnapshotCache = {
      ...existing,
      ...patch,
      updatedAt: Date.now(),
    };
    localStorage.setItem(`${STORAGE_KEYS.cloudCachePrefix}${uid}`, JSON.stringify(next));
  } catch {
    // Ignore storage quota errors gracefully
  }
}

export function clearCloudSnapshotCache(uid: string): void {
  if (!uid) return;
  try {
    localStorage.removeItem(`${STORAGE_KEYS.cloudCachePrefix}${uid}`);
  } catch {
    // Ignore
  }
}

export function loadDismissedAutoFixedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.dismissedAutoFixedIds);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((item): item is string => typeof item === 'string'));
  } catch {
    return new Set();
  }
}

export function dismissAutoFixedId(txId: string): void {
  if (!txId) return;
  try {
    const current = loadDismissedAutoFixedIds();
    current.add(txId);
    const bounded = Array.from(current).slice(-240);
    localStorage.setItem(STORAGE_KEYS.dismissedAutoFixedIds, JSON.stringify(bounded));
  } catch {
    // Ignore storage errors gracefully
  }
}
