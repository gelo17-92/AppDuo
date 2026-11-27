import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  DEFAULT_ALLOWED_EMAILS,
  DEFAULT_CATEGORIES,
  DEFAULT_FIXED_EXPENSES,
  DEFAULT_SETTINGS,
  SEED_TRANSACTIONS,
} from '../data/seedData';
import type {
  AppSettings,
  Category,
  FixedExpense,
  PartnerId,
  Transaction,
} from '../types/finance';
import {
  AUTHORIZED_COUPLE_EMAILS,
  AUTHORIZED_PARTNERS,
  SHARED_COUPLE_HOUSEHOLD_ID,
  resolveAuthorizedPartner,
} from '../utils/authPolicy';
import { roundCents } from '../utils/financeMath';
import {
  FIXED_EXPENSE_SCHEDULE_START,
  sanitizeMonthlyAmountMap,
} from '../utils/fixedExpenseSchedule';
import { db, handleFirestoreError, OperationType } from '../firebase';

export { SHARED_COUPLE_HOUSEHOLD_ID };

export interface CloudHouseholdContext {
  householdId: string;
  ownerUid: string;
  allowedEmails: [string, string];
  partnerSlot: PartnerId;
  userTheme: 'dark' | 'light';
}

function sanitizeId(raw: string, fallbackPrefix: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 120);
  return cleaned.length > 0 ? cleaned : `${fallbackPrefix}-${Date.now()}`;
}

function sanitizeHex(hex: string, fallback = '#10B981'): string {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : fallback;
}

function sanitizeDateStr(date: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10);
}

function computeInitials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((w) => w[0] ?? '')
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'US'
  );
}

function timestampToIso(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}

/**
 * Resolves (and bootstraps on first login) the user's private profile and shared household in Firestore.
 * Strictly maps angel2martinez92@gmail.com (partnerA) and silviamsg27@gmail.com (partnerB)
 * to the single shared couple household (duo-angel-silvia).
 */
export async function ensureUserAndHousehold(user: User): Promise<CloudHouseholdContext> {
  const uid = user.uid;
  const email = (user.email ?? '').trim().toLowerCase();
  const partnerMatch = resolveAuthorizedPartner(email);

  if (!partnerMatch) {
    throw new Error(`Cuenta no autorizada: ${email || 'desconocida'}`);
  }

  const { householdId, partnerSlot, defaultName, accentHex } = partnerMatch;
  const userPath = `users/${uid}`;
  const householdPath = `households/${householdId}`;

  // 1. Ensure private user profile doc (/users/{uid})
  let userTheme: 'dark' | 'light' = 'dark';
  try {
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      await setDoc(userRef, {
        uid,
        email,
        name: defaultName,
        initials: computeInitials(defaultName),
        accentHex,
        theme: 'dark',
        householdId,
        partnerSlot,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const data = userSnap.data();
      if (data.theme === 'light' || data.theme === 'dark') {
        userTheme = data.theme;
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }

  // 2. Ensure shared household doc (/households/{householdId})
  let ownerUid = uid;
  let allowedEmails: [string, string] = [
    AUTHORIZED_COUPLE_EMAILS[0],
    AUTHORIZED_COUPLE_EMAILS[1],
  ];

  try {
    const hhRef = doc(db, 'households', householdId);
    const hhSnap = await getDoc(hhRef);

    if (!hhSnap.exists()) {
      const partnerAName = AUTHORIZED_PARTNERS.partnerA.name;
      const partnerBName = AUTHORIZED_PARTNERS.partnerB.name;

      // Step 2a: Create household doc FIRST so subcollection rules' exists()/get() succeed
      await setDoc(hhRef, {
        accountName: DEFAULT_SETTINGS.accountName,
        initialBalance: DEFAULT_SETTINGS.initialBalance,
        savingsGoalPercent: DEFAULT_SETTINGS.savingsGoalPercent,
        ownerUid: uid,
        memberUids: [uid],
        allowedEmails,
        partnerAUid: partnerSlot === 'partnerA' ? uid : '',
        partnerBUid: partnerSlot === 'partnerB' ? uid : '',
        partnerAName,
        partnerBName,
        partnerAInitials: computeInitials(partnerAName),
        partnerBInitials: computeInitials(partnerBName),
        partnerAAccent: AUTHORIZED_PARTNERS.partnerA.accentHex,
        partnerBAccent: AUTHORIZED_PARTNERS.partnerB.accentHex,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Step 2b: Seed initial categories, fixed expenses, and sample transactions in small batches
      // (8 ops per batch keeps Firestore Security Rules well below the 20-lookup per-batch cap)
      const seedOps: Array<(b: ReturnType<typeof writeBatch>) => void> = [];

      for (const cat of DEFAULT_CATEGORIES) {
        const safeCatId = sanitizeId(cat.id, 'cat');
        seedOps.push((b) =>
          b.set(doc(db, 'households', householdId, 'categories', safeCatId), {
            id: safeCatId,
            householdId,
            ownerUid: uid,
            allowedEmails,
            name: cat.name.slice(0, 60),
            icon: cat.icon.slice(0, 40),
            color: sanitizeHex(cat.color),
            type: cat.type,
            defaultConcepts: cat.defaultConcepts.slice(0, 20).map((s) => s.slice(0, 80)),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          })
        );
      }

      for (const fixed of DEFAULT_FIXED_EXPENSES) {
        const safeFixedId = sanitizeId(fixed.id, 'fixed');
        const safeSchedule = sanitizeMonthlyAmountMap(
          fixed.amountSchedule,
          (k) => k >= FIXED_EXPENSE_SCHEDULE_START
        );
        const safeManual = sanitizeMonthlyAmountMap(
          fixed.manualMonthlyAmounts,
          (k) => k < FIXED_EXPENSE_SCHEDULE_START
        );
        const fixedPayload: Record<string, unknown> = {
          id: safeFixedId,
          householdId,
          ownerUid: uid,
          allowedEmails,
          name: fixed.name.slice(0, 60),
          categoryId: sanitizeId(fixed.categoryId, 'vivienda'),
          amount: roundCents(fixed.amount),
          dueDate: sanitizeDateStr(fixed.dueDate),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (fixed.notes) {
          fixedPayload.notes = fixed.notes.slice(0, 300);
        }
        if (Object.keys(safeSchedule).length > 0) {
          fixedPayload.amountSchedule = safeSchedule;
        }
        if (Object.keys(safeManual).length > 0) {
          fixedPayload.manualMonthlyAmounts = safeManual;
        }
        seedOps.push((b) =>
          b.set(doc(db, 'households', householdId, 'fixedExpenses', safeFixedId), fixedPayload)
        );
      }

      for (const tx of SEED_TRANSACTIONS) {
        const safeTxId = sanitizeId(tx.id, 'tx');
        const txPayload: Record<string, unknown> = {
          id: safeTxId,
          householdId,
          ownerUid: uid,
          authorUid: uid,
          allowedEmails,
          type: tx.type,
          amount: roundCents(tx.amount),
          title: tx.title.slice(0, 120),
          categoryId: sanitizeId(tx.categoryId, 'otros'),
          date: sanitizeDateStr(tx.date),
          addedBy: tx.addedBy,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (tx.fixedExpenseId) {
          txPayload.fixedExpenseId = sanitizeId(tx.fixedExpenseId, 'fixed');
        }
        if (tx.notes) {
          txPayload.notes = tx.notes.slice(0, 300);
        }
        seedOps.push((b) =>
          b.set(doc(db, 'households', householdId, 'transactions', safeTxId), txPayload)
        );
      }

      for (let i = 0; i < seedOps.length; i += 8) {
        const batch = writeBatch(db);
        for (const fn of seedOps.slice(i, i + 8)) fn(batch);
        await batch.commit();
      }
    } else {
      const data = hhSnap.data();
      ownerUid = String(data.ownerUid ?? uid);
      if (Array.isArray(data.allowedEmails) && data.allowedEmails.length >= 2) {
        allowedEmails = [String(data.allowedEmails[0]), String(data.allowedEmails[1])];
      }

      // Claim unbound partner slot on first sign-in for the second partner
      const existingMembers: string[] = Array.isArray(data.memberUids) ? data.memberUids : [];
      if (partnerSlot === 'partnerA' && !data.partnerAUid) {
        const nextMembers = existingMembers.includes(uid)
          ? existingMembers
          : [...existingMembers, uid].slice(0, 2);
        await updateDoc(hhRef, {
          partnerAUid: uid,
          memberUids: nextMembers,
          updatedAt: serverTimestamp(),
        });
      } else if (partnerSlot === 'partnerB' && !data.partnerBUid) {
        const nextMembers = existingMembers.includes(uid)
          ? existingMembers
          : [...existingMembers, uid].slice(0, 2);
        await updateDoc(hhRef, {
          partnerBUid: uid,
          memberUids: nextMembers,
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, householdPath);
  }

  return {
    householdId,
    ownerUid,
    allowedEmails,
    partnerSlot,
    userTheme,
  };
}

export function subscribeHouseholdSettings(
  householdId: string,
  currentTheme: 'dark' | 'light',
  onChange: (settings: AppSettings) => void
): Unsubscribe {
  const path = `households/${householdId}`;
  return onSnapshot(
    doc(db, 'households', householdId),
    (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      const emails: [string, string] =
        Array.isArray(d.allowedEmails) && d.allowedEmails.length >= 2
          ? [String(d.allowedEmails[0]), String(d.allowedEmails[1])]
          : DEFAULT_ALLOWED_EMAILS;

      onChange({
        theme: currentTheme,
        accountName: String(d.accountName ?? DEFAULT_SETTINGS.accountName),
        initialBalance: typeof d.initialBalance === 'number' ? d.initialBalance : 0,
        savingsGoalPercent: typeof d.savingsGoalPercent === 'number' ? d.savingsGoalPercent : 20,
        allowedEmails: emails,
        partners: {
          partnerA: {
            id: 'partnerA',
            name: String(d.partnerAName ?? AUTHORIZED_PARTNERS.partnerA.name),
            email: emails[0],
            initials: String(d.partnerAInitials ?? AUTHORIZED_PARTNERS.partnerA.initials),
            accentHex: String(d.partnerAAccent ?? AUTHORIZED_PARTNERS.partnerA.accentHex),
          },
          partnerB: {
            id: 'partnerB',
            name: String(d.partnerBName ?? AUTHORIZED_PARTNERS.partnerB.name),
            email: emails[1],
            initials: String(d.partnerBInitials ?? AUTHORIZED_PARTNERS.partnerB.initials),
            accentHex: String(d.partnerBAccent ?? AUTHORIZED_PARTNERS.partnerB.accentHex),
          },
        },
      });
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

export function subscribeTransactions(
  householdId: string,
  userEmail: string,
  onChange: (txs: Transaction[]) => void
): Unsubscribe {
  const path = `households/${householdId}/transactions`;
  const q = query(
    collection(db, 'households', householdId, 'transactions'),
    where('allowedEmails', 'array-contains', userEmail.trim().toLowerCase())
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items: Transaction[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          type: d.type === 'income' ? 'income' : 'expense',
          amount: typeof d.amount === 'number' ? roundCents(d.amount) : 0,
          title: String(d.title ?? ''),
          categoryId: String(d.categoryId ?? 'otros'),
          date: String(d.date ?? ''),
          addedBy: d.addedBy === 'partnerB' ? 'partnerB' : 'partnerA',
          fixedExpenseId: typeof d.fixedExpenseId === 'string' ? d.fixedExpenseId : undefined,
          notes: typeof d.notes === 'string' ? d.notes : undefined,
          createdAt: timestampToIso(d.createdAt),
          updatedAt: timestampToIso(d.updatedAt),
        };
      });
      onChange(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeCategories(
  householdId: string,
  userEmail: string,
  onChange: (cats: Category[]) => void
): Unsubscribe {
  const path = `households/${householdId}/categories`;
  const q = query(
    collection(db, 'households', householdId, 'categories'),
    where('allowedEmails', 'array-contains', userEmail.trim().toLowerCase())
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items: Category[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          name: String(d.name ?? 'Otros'),
          icon: String(d.icon ?? 'Tag'),
          color: String(d.color ?? '#64748B'),
          type: d.type === 'income' || d.type === 'both' ? d.type : 'expense',
          defaultConcepts: Array.isArray(d.defaultConcepts)
            ? d.defaultConcepts.filter((s): s is string => typeof s === 'string')
            : [],
        };
      });
      onChange(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export function subscribeFixedExpenses(
  householdId: string,
  userEmail: string,
  onChange: (items: FixedExpense[]) => void
): Unsubscribe {
  const path = `households/${householdId}/fixedExpenses`;
  const q = query(
    collection(db, 'households', householdId, 'fixedExpenses'),
    where('allowedEmails', 'array-contains', userEmail.trim().toLowerCase())
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const order = ['fixed-hipoteca', 'fixed-prestamos', 'fixed-seguro-hogar'];
      const items: FixedExpense[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        const amountSchedule = sanitizeMonthlyAmountMap(
          d.amountSchedule,
          (k) => k >= FIXED_EXPENSE_SCHEDULE_START
        );
        const manualMonthlyAmounts = sanitizeMonthlyAmountMap(
          d.manualMonthlyAmounts,
          (k) => k < FIXED_EXPENSE_SCHEDULE_START
        );
        return {
          id: docSnap.id,
          name: String(d.name ?? ''),
          categoryId: String(d.categoryId ?? 'vivienda'),
          amount: typeof d.amount === 'number' ? roundCents(d.amount) : 0,
          dueDate: String(d.dueDate ?? ''),
          notes: typeof d.notes === 'string' ? d.notes : undefined,
          ...(Object.keys(amountSchedule).length > 0 ? { amountSchedule } : {}),
          ...(Object.keys(manualMonthlyAmounts).length > 0 ? { manualMonthlyAmounts } : {}),
        };
      });
      items.sort((a, b) => {
        const ia = order.indexOf(a.id);
        const ib = order.indexOf(b.id);
        if (ia !== -1 && ib !== -1) return ia - ib;
        return a.name.localeCompare(b.name);
      });
      onChange(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function upsertTransactionInCloud(
  ctx: CloudHouseholdContext,
  currentUid: string,
  tx: Transaction,
  isUpdate: boolean
): Promise<void> {
  const safeId = sanitizeId(tx.id, 'tx');
  const path = `households/${ctx.householdId}/transactions/${safeId}`;
  const ref = doc(db, 'households', ctx.householdId, 'transactions', safeId);

  try {
    if (isUpdate) {
      const updatePayload: Record<string, unknown> = {
        type: tx.type,
        amount: roundCents(tx.amount),
        title: tx.title.trim().slice(0, 120),
        categoryId: sanitizeId(tx.categoryId, 'otros'),
        date: sanitizeDateStr(tx.date),
        updatedAt: serverTimestamp(),
      };
      if (tx.notes && tx.notes.trim()) {
        updatePayload.notes = tx.notes.trim().slice(0, 300);
      }
      if (tx.fixedExpenseId) {
        updatePayload.fixedExpenseId = sanitizeId(tx.fixedExpenseId, 'fixed');
      }
      await updateDoc(ref, updatePayload);
    } else {
      const createPayload: Record<string, unknown> = {
        id: safeId,
        householdId: ctx.householdId,
        ownerUid: ctx.ownerUid,
        authorUid: currentUid,
        allowedEmails: ctx.allowedEmails,
        type: tx.type,
        amount: roundCents(tx.amount),
        title: tx.title.trim().slice(0, 120),
        categoryId: sanitizeId(tx.categoryId, 'otros'),
        date: sanitizeDateStr(tx.date),
        addedBy: tx.addedBy,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (tx.notes && tx.notes.trim()) {
        createPayload.notes = tx.notes.trim().slice(0, 300);
      }
      if (tx.fixedExpenseId) {
        createPayload.fixedExpenseId = sanitizeId(tx.fixedExpenseId, 'fixed');
      }
      await setDoc(ref, createPayload);
    }
  } catch (error) {
    handleFirestoreError(error, isUpdate ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

/**
 * Atomically creates an auto-registered fixed expense transaction in Cloud Firestore
 * ONLY if no document with that deterministic ID already exists.
 * Prevents duplicate writes or update-rule collisions when both partners open the app
 * simultaneously at the start of a new month.
 */
export async function createAutoFixedTransactionIfMissing(
  ctx: CloudHouseholdContext,
  currentUid: string,
  tx: Transaction
): Promise<boolean> {
  const safeId = sanitizeId(tx.id, 'tx');
  const path = `households/${ctx.householdId}/transactions/${safeId}`;
  const ref = doc(db, 'households', ctx.householdId, 'transactions', safeId);

  try {
    return await runTransaction(db, async (txn) => {
      const snap = await txn.get(ref);
      if (snap.exists()) {
        return false;
      }
      const createPayload: Record<string, unknown> = {
        id: safeId,
        householdId: ctx.householdId,
        ownerUid: ctx.ownerUid,
        authorUid: currentUid,
        allowedEmails: ctx.allowedEmails,
        type: tx.type,
        amount: roundCents(tx.amount),
        title: tx.title.trim().slice(0, 120),
        categoryId: sanitizeId(tx.categoryId, 'otros'),
        date: sanitizeDateStr(tx.date),
        addedBy: tx.addedBy,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (tx.notes && tx.notes.trim()) {
        createPayload.notes = tx.notes.trim().slice(0, 300);
      }
      if (tx.fixedExpenseId) {
        createPayload.fixedExpenseId = sanitizeId(tx.fixedExpenseId, 'fixed');
      }
      txn.set(ref, createPayload);
      return true;
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteTransactionInCloud(
  householdId: string,
  txId: string
): Promise<void> {
  const path = `households/${householdId}/transactions/${txId}`;
  try {
    await deleteDoc(doc(db, 'households', householdId, 'transactions', txId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function upsertCategoryInCloud(
  ctx: CloudHouseholdContext,
  cat: Category,
  isUpdate: boolean
): Promise<void> {
  const safeId = sanitizeId(cat.id, 'cat');
  const path = `households/${ctx.householdId}/categories/${safeId}`;
  const ref = doc(db, 'households', ctx.householdId, 'categories', safeId);
  const sanitizedConcepts = cat.defaultConcepts
    .map((s) => s.trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 20);

  try {
    if (isUpdate) {
      await updateDoc(ref, {
        name: cat.name.trim().slice(0, 60),
        icon: cat.icon.trim().slice(0, 40) || 'Tag',
        color: sanitizeHex(cat.color),
        type: cat.type,
        defaultConcepts: sanitizedConcepts,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        id: safeId,
        householdId: ctx.householdId,
        ownerUid: ctx.ownerUid,
        allowedEmails: ctx.allowedEmails,
        name: cat.name.trim().slice(0, 60),
        icon: cat.icon.trim().slice(0, 40) || 'Tag',
        color: sanitizeHex(cat.color),
        type: cat.type,
        defaultConcepts: sanitizedConcepts,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, isUpdate ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function deleteCategoryInCloud(
  householdId: string,
  categoryId: string
): Promise<void> {
  const path = `households/${householdId}/categories/${categoryId}`;
  try {
    await deleteDoc(doc(db, 'households', householdId, 'categories', categoryId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function updateFixedExpenseInCloud(
  householdId: string,
  fixed: FixedExpense
): Promise<void> {
  const path = `households/${householdId}/fixedExpenses/${fixed.id}`;
  try {
    const safeSchedule = sanitizeMonthlyAmountMap(
      fixed.amountSchedule,
      (k) => k >= FIXED_EXPENSE_SCHEDULE_START
    );
    const safeManual = sanitizeMonthlyAmountMap(
      fixed.manualMonthlyAmounts,
      (k) => k < FIXED_EXPENSE_SCHEDULE_START
    );
    const payload: Record<string, unknown> = {
      name: fixed.name.trim().slice(0, 60),
      categoryId: sanitizeId(fixed.categoryId, 'vivienda'),
      amount: roundCents(fixed.amount),
      dueDate: sanitizeDateStr(fixed.dueDate),
      amountSchedule: safeSchedule,
      manualMonthlyAmounts: safeManual,
      updatedAt: serverTimestamp(),
    };
    if (fixed.notes && fixed.notes.trim()) {
      payload.notes = fixed.notes.trim().slice(0, 300);
    }
    await updateDoc(doc(db, 'households', householdId, 'fixedExpenses', fixed.id), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateAccountSettingsInCloud(
  householdId: string,
  accountName: string,
  initialBalance: number,
  savingsGoalPercent: number
): Promise<void> {
  const path = `households/${householdId}`;
  try {
    await updateDoc(doc(db, 'households', householdId), {
      accountName: accountName.trim().slice(0, 80) || DEFAULT_SETTINGS.accountName,
      initialBalance: roundCents(initialBalance),
      savingsGoalPercent: Math.max(1, Math.min(100, Math.round(savingsGoalPercent))),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateOwnProfileInCloud(
  uid: string,
  householdId: string,
  partnerSlot: PartnerId,
  name: string
): Promise<void> {
  const cleanName = name.trim().slice(0, 60);
  const initials = computeInitials(cleanName);

  try {
    await updateDoc(doc(db, 'users', uid), {
      name: cleanName,
      initials,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
  }

  try {
    if (partnerSlot === 'partnerA') {
      await updateDoc(doc(db, 'households', householdId), {
        partnerAName: cleanName,
        partnerAInitials: initials,
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(doc(db, 'households', householdId), {
        partnerBName: cleanName,
        partnerBInitials: initials,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `households/${householdId}`);
  }
}

export async function updateUserThemeInCloud(
  uid: string,
  theme: 'dark' | 'light'
): Promise<void> {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      theme,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Batch-imports backup transactions/categories/fixedExpenses into Cloud Firestore using writeBatch.
 */
export async function batchImportToCloud(
  ctx: CloudHouseholdContext,
  currentUid: string,
  mode: 'merge' | 'replace',
  importedTransactions: Transaction[],
  importedCategories: Category[],
  importedFixedExpenses: FixedExpense[],
  existingTransactions: Transaction[],
  existingCategories: Category[]
): Promise<{ addedCount: number; skippedCount: number }> {
  const basePath = `households/${ctx.householdId}`;
  const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];

  let addedCount = 0;
  let skippedCount = 0;

  if (mode === 'replace') {
    for (const oldTx of existingTransactions) {
      ops.push((b) =>
        b.delete(doc(db, 'households', ctx.householdId, 'transactions', oldTx.id))
      );
    }
    for (const tx of importedTransactions) {
      const safeId = sanitizeId(tx.id, 'tx');
      const payload: Record<string, unknown> = {
        id: safeId,
        householdId: ctx.householdId,
        ownerUid: ctx.ownerUid,
        authorUid: currentUid,
        allowedEmails: ctx.allowedEmails,
        type: tx.type,
        amount: roundCents(tx.amount),
        title: tx.title.trim().slice(0, 120),
        categoryId: sanitizeId(tx.categoryId, 'otros'),
        date: sanitizeDateStr(tx.date),
        addedBy: tx.addedBy,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (tx.notes?.trim()) payload.notes = tx.notes.trim().slice(0, 300);
      if (tx.fixedExpenseId) payload.fixedExpenseId = sanitizeId(tx.fixedExpenseId, 'fixed');
      ops.push((b) =>
        b.set(doc(db, 'households', ctx.householdId, 'transactions', safeId), payload)
      );
      addedCount += 1;
    }
  } else {
    const existingIds = new Set(existingTransactions.map((t) => t.id));
    for (const tx of importedTransactions) {
      const safeId = sanitizeId(tx.id, 'tx');
      if (existingIds.has(safeId)) {
        skippedCount += 1;
        continue;
      }
      existingIds.add(safeId);
      const payload: Record<string, unknown> = {
        id: safeId,
        householdId: ctx.householdId,
        ownerUid: ctx.ownerUid,
        authorUid: currentUid,
        allowedEmails: ctx.allowedEmails,
        type: tx.type,
        amount: roundCents(tx.amount),
        title: tx.title.trim().slice(0, 120),
        categoryId: sanitizeId(tx.categoryId, 'otros'),
        date: sanitizeDateStr(tx.date),
        addedBy: tx.addedBy,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (tx.notes?.trim()) payload.notes = tx.notes.trim().slice(0, 300);
      if (tx.fixedExpenseId) payload.fixedExpenseId = sanitizeId(tx.fixedExpenseId, 'fixed');
      ops.push((b) =>
        b.set(doc(db, 'households', ctx.householdId, 'transactions', safeId), payload)
      );
      addedCount += 1;
    }
  }

  // Merge or replace categories
  const existingCatIds = new Set(existingCategories.map((c) => c.id));
  for (const cat of importedCategories) {
    const safeId = sanitizeId(cat.id, 'cat');
    if (mode === 'merge' && existingCatIds.has(safeId)) continue;
    ops.push((b) =>
      b.set(doc(db, 'households', ctx.householdId, 'categories', safeId), {
        id: safeId,
        householdId: ctx.householdId,
        ownerUid: ctx.ownerUid,
        allowedEmails: ctx.allowedEmails,
        name: cat.name.trim().slice(0, 60),
        icon: cat.icon.trim().slice(0, 40) || 'Tag',
        color: sanitizeHex(cat.color),
        type: cat.type,
        defaultConcepts: cat.defaultConcepts.map((s) => s.trim().slice(0, 80)).filter(Boolean).slice(0, 20),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    );
  }

  // Replace fixed expenses if present in replace mode
  if (mode === 'replace' && importedFixedExpenses.length > 0) {
    for (const fixed of importedFixedExpenses) {
      const safeId = sanitizeId(fixed.id, 'fixed');
      const safeSchedule = sanitizeMonthlyAmountMap(
        fixed.amountSchedule,
        (k) => k >= FIXED_EXPENSE_SCHEDULE_START
      );
      const safeManual = sanitizeMonthlyAmountMap(
        fixed.manualMonthlyAmounts,
        (k) => k < FIXED_EXPENSE_SCHEDULE_START
      );
      const payload: Record<string, unknown> = {
        id: safeId,
        householdId: ctx.householdId,
        ownerUid: ctx.ownerUid,
        allowedEmails: ctx.allowedEmails,
        name: fixed.name.trim().slice(0, 60),
        categoryId: sanitizeId(fixed.categoryId, 'vivienda'),
        amount: roundCents(fixed.amount),
        dueDate: sanitizeDateStr(fixed.dueDate),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (fixed.notes?.trim()) payload.notes = fixed.notes.trim().slice(0, 300);
      if (Object.keys(safeSchedule).length > 0) payload.amountSchedule = safeSchedule;
      if (Object.keys(safeManual).length > 0) payload.manualMonthlyAmounts = safeManual;
      ops.push((b) =>
        b.set(doc(db, 'households', ctx.householdId, 'fixedExpenses', safeId), payload)
      );
    }
  }

  // Commit in chunks of 8 to stay safely below Firestore rules' 20-lookup per-batch limit
  try {
    for (let i = 0; i < ops.length; i += 8) {
      const chunk = ops.slice(i, i + 8);
      const batch = writeBatch(db);
      for (const fn of chunk) fn(batch);
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, basePath);
  }

  return { addedCount, skippedCount };
}
