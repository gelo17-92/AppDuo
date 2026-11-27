import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { getRedirectResult, onAuthStateChanged, signOut, type User } from 'firebase/auth';
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  Moon,
  PieChart,
  Plus,
  Settings,
  Sun,
} from 'lucide-react';
import {
  DEFAULT_CATEGORIES,
  DEFAULT_FIXED_EXPENSES,
  DEFAULT_SETTINGS,
  SEED_TRANSACTIONS,
} from './data/seedData';
import type {
  AppSettings,
  Category,
  FixedExpense,
  PartnerId,
  TabId,
  Transaction,
  TransactionType,
} from './types/finance';
import { auth } from './firebase';
import {
  batchImportToCloud,
  createAutoFixedTransactionIfMissing,
  deleteCategoryInCloud,
  deleteTransactionInCloud,
  ensureUserAndHousehold,
  subscribeCategories,
  subscribeFixedExpenses,
  subscribeHouseholdSettings,
  subscribeTransactions,
  updateAccountSettingsInCloud,
  updateFixedExpenseInCloud,
  updateOwnProfileInCloud,
  updateUserThemeInCloud,
  upsertCategoryInCloud,
  upsertTransactionInCloud,
  type CloudHouseholdContext,
} from './services/firestoreService';
import {
  clearCloudSnapshotCache,
  dismissAutoFixedId,
  loadCategories,
  loadCloudSnapshotCache,
  loadDismissedAutoFixedIds,
  loadFixedExpenses,
  loadSettings,
  loadTransactions,
  saveCategories,
  saveCloudSnapshotCache,
  saveFixedExpenses,
  saveSettings,
  saveTransactions,
  subscribeToCrossTabSync,
} from './services/storageService';
import {
  buildUnauthorizedEmailMessage,
  evaluateAuthSession,
} from './utils/authPolicy';
import {
  calculateMonthlySummary,
  filterTransactionsByMonth,
  formatLocalIsoDate,
  formatMonthYear,
  resolveTransactionDefaultDate,
} from './utils/financeMath';
import {
  AUTO_FIXED_TX_PREFIX,
  buildAutoFixedTransactionId,
  computePendingAutoFixedTransactions,
  resolveFixedExpenseForMonth,
  resolveFixedExpenseTarget,
  toYearMonthKey,
} from './utils/fixedExpenseSchedule';
import { mergeTransactions } from './utils/backupUtils';
import { AuthScreen, mapFirebaseAuthError } from './components/AuthScreen';
import { ResumenView } from './components/ResumenView';
import { MovimientosView } from './components/MovimientosView';
import { EstadisticasView } from './components/EstadisticasView';
import { AjustesBackupView } from './components/AjustesBackupView';
import { TransactionModal } from './components/TransactionModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import { SplashScreen } from './components/SplashScreen';
import { MonthYearPickerModal } from './components/MonthYearPickerModal';
import {
  computeSwipeRubberBand,
  evaluateHorizontalSwipe,
  evaluateHorizontalWheel,
} from './utils/swipeGesture';
import {
  createTabScrollStore,
  getTabScroll,
  switchTabWithScrollMemory,
  type TabScrollStore,
} from './utils/tabScrollMemory';

const NAV_ITEMS: { id: TabId; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'resumen', label: 'Resumen', icon: LayoutDashboard },
  { id: 'movimientos', label: 'Movimientos', icon: ListOrdered },
  { id: 'estadisticas', label: 'Estadísticas', icon: PieChart },
  { id: 'ajustes', label: 'Ajustes', icon: Settings },
];

function isLocalPreviewAutostart(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('autostart') === '1';
}

function resolveLiveDate(): Date {
  if (typeof window !== 'undefined' && isLocalPreviewAutostart()) {
    const override = new URLSearchParams(window.location.search).get('liveDate');
    if (override && /^\d{4}-\d{2}-\d{2}$/.test(override)) {
      const [y, m, d] = override.split('-').map(Number);
      const parsed = new Date(y, m - 1, d, 12, 0, 0);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  }
  return new Date();
}

function shouldIgnoreHorizontalGesture(target: EventTarget | null, boundary: HTMLElement | null): boolean {
  let node = target instanceof HTMLElement ? target : null;
  while (node && node !== boundary) {
    const tag = node.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node.isContentEditable) {
      return true;
    }
    const style = window.getComputedStyle(node);
    const canScrollX =
      (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
      node.scrollWidth > node.clientWidth + 4;
    if (canScrollX) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

function readWindowScrollY(): number {
  if (typeof window === 'undefined') return 0;
  return window.scrollY || document.documentElement.scrollTop || 0;
}

function jumpWindowScrollYInstant(targetY: number): void {
  if (typeof window === 'undefined') return;
  const safeY = Math.max(0, Math.round(targetY));
  const root = document.documentElement;
  const prevBehavior = root.style.scrollBehavior;
  root.style.scrollBehavior = 'auto';
  window.scrollTo({ top: safeY, left: 0, behavior: 'instant' as ScrollBehavior });
  root.scrollTop = safeY;
  root.style.scrollBehavior = prevBehavior;
}

export default function App() {
  const [showSplash, setShowSplash] = useState<boolean>(true);
  const [previewMode, setPreviewMode] = useState<boolean>(() => isLocalPreviewAutostart());
  const [authReady, setAuthReady] = useState<boolean>(() => isLocalPreviewAutostart());
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [cloudCtx, setCloudCtx] = useState<CloudHouseholdContext | null>(null);
  const [syncingCloud, setSyncingCloud] = useState<boolean>(false);
  const [cloudTransactionsReady, setCloudTransactionsReady] = useState<boolean>(false);
  const [cloudFixedExpensesReady, setCloudFixedExpensesReady] = useState<boolean>(false);
  const [redirectAuthError, setRedirectAuthError] = useState<string | null>(null);
  const [fatalSyncError, setFatalSyncError] = useState<Error | null>(null);

  const handleSplashComplete = useCallback(() => {
    setShowSplash(false);
  }, []);

  const [liveDate, setLiveDate] = useState<Date>(() => resolveLiveDate());
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [transactions, setTransactions] = useState<Transaction[]>(() => loadTransactions());
  const [categories, setCategories] = useState<Category[]>(() => loadCategories());
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpense[]>(() => loadFixedExpenses());

  const themeRef = useRef(settings.theme);
  themeRef.current = settings.theme;
  const inFlightAutoFixedIdsRef = useRef<Set<string>>(new Set());
  const alignedFixedSyncKeysRef = useRef<Set<string>>(new Set());

  const [activeTab, setActiveTab] = useState<TabId>('resumen');
  const tabScrollPositionsRef = useRef<TabScrollStore>(createTabScrollStore());
  const [statsPeriodMode, setStatsPeriodMode] = useState<'monthly' | 'annual'>('monthly');
  const [selectedYear, setSelectedYear] = useState<number>(() => resolveLiveDate().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(() => resolveLiveDate().getMonth());
  const [isMonthPickerOpen, setIsMonthPickerOpen] = useState<boolean>(false);
  const [monthTransitionDir, setMonthTransitionDir] = useState<'next' | 'prev' | null>(null);
  const [monthSlideKey, setMonthSlideKey] = useState<number>(0);
  const [swipeOffsetX, setSwipeOffsetX] = useState<number>(0);

  const mainSwipeRef = useRef<HTMLElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; ignored: boolean; lockedHorizontal: boolean } | null>(null);
  const lastWheelMonthChangeRef = useRef<number>(0);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalPresetType, setModalPresetType] = useState<TransactionType>('expense');
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Throw fatal Firestore sync errors to ErrorBoundary
  if (fatalSyncError) {
    throw fatalSyncError;
  }

  // Sync dark/light class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [settings.theme]);

  // Restore persisted Firebase Auth session (IndexedDB/localStorage) and handle any OAuth redirect
  useEffect(() => {
    if (previewMode) return;

    let active = true;

    const applyAuthUser = (user: User | null) => {
      if (!active) return;
      const evaluation = evaluateAuthSession(user);

      if (evaluation.status === 'authenticated' && user) {
        // Hydrate cached cloud snapshot immediately so returning users see their live data without demo flicker
        const cached = loadCloudSnapshotCache(user.uid);
        if (cached) {
          if (cached.settings) {
            themeRef.current = cached.settings.theme;
            setSettings(cached.settings);
          }
          if (cached.transactions) setTransactions(cached.transactions);
          if (cached.categories && cached.categories.length > 0) setCategories(cached.categories);
          if (cached.fixedExpenses && cached.fixedExpenses.length > 0) {
            setFixedExpenses(cached.fixedExpenses);
          }
        }
        setFirebaseUser(user);
        setRedirectAuthError(null);
      } else if (evaluation.status === 'unauthorized') {
        setFirebaseUser(null);
        setCloudCtx(null);
        setRedirectAuthError(buildUnauthorizedEmailMessage(evaluation.email));
        signOut(auth).catch(() => {});
      } else {
        setFirebaseUser(null);
        setCloudCtx(null);
      }
    };

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      applyAuthUser(user);
    });

    // Wait for both IndexedDB session restoration and any pending redirect result
    // before marking authReady=true so a persisted session never flashes the login screen.
    (async () => {
      try {
        await auth.authStateReady();
        const redirectResult = await getRedirectResult(auth);
        if (redirectResult?.user) {
          applyAuthUser(redirectResult.user);
        } else if (auth.currentUser) {
          applyAuthUser(auth.currentUser);
        }
      } catch (err) {
        if (active) {
          setRedirectAuthError(mapFirebaseAuthError(err));
        }
      } finally {
        if (active) {
          setAuthReady(true);
        }
      }
    })();

    return () => {
      active = false;
      unsubscribe();
    };
  }, [previewMode]);

  // Bootstrap & subscribe to real-time Cloud Firestore collections once authenticated
  useEffect(() => {
    if (previewMode || !firebaseUser || !firebaseUser.email) return;

    let cancelled = false;
    const unsubs: Array<() => void> = [];
    const uid = firebaseUser.uid;

    const connectCloud = async () => {
      setSyncingCloud(true);
      setCloudTransactionsReady(false);
      setCloudFixedExpensesReady(false);
      try {
        const ctx = await ensureUserAndHousehold(firebaseUser);
        if (cancelled) return;

        setCloudCtx(ctx);
        themeRef.current = ctx.userTheme;
        setSettings((prev) => ({ ...prev, theme: ctx.userTheme }));

        const userEmail = firebaseUser.email!.trim().toLowerCase();

        unsubs.push(
          subscribeHouseholdSettings(ctx.householdId, ctx.userTheme, (nextSettings) => {
            const mergedSettings = { ...nextSettings, theme: themeRef.current };
            setSettings(mergedSettings);
            saveCloudSnapshotCache(uid, { settings: mergedSettings });
          })
        );
        unsubs.push(
          subscribeTransactions(ctx.householdId, userEmail, (txs) => {
            setTransactions(txs);
            saveCloudSnapshotCache(uid, { transactions: txs });
            setCloudTransactionsReady(true);
          })
        );
        unsubs.push(
          subscribeCategories(ctx.householdId, userEmail, (cats) => {
            if (cats.length > 0) {
              setCategories(cats);
              saveCloudSnapshotCache(uid, { categories: cats });
            }
          })
        );
        unsubs.push(
          subscribeFixedExpenses(ctx.householdId, userEmail, (items) => {
            if (items.length > 0) {
              setFixedExpenses(items);
              saveCloudSnapshotCache(uid, { fixedExpenses: items });
            }
            setCloudFixedExpensesReady(true);
          })
        );
      } catch (err) {
        if (!cancelled) {
          setFatalSyncError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (!cancelled) setSyncingCloud(false);
      }
    };

    connectCloud();

    return () => {
      cancelled = true;
      setCloudTransactionsReady(false);
      setCloudFixedExpensesReady(false);
      for (const unsub of unsubs) unsub();
    };
  }, [previewMode, firebaseUser]);

  // Cross-tab sync only when running in local preview mode
  useEffect(() => {
    if (!previewMode) return;
    return subscribeToCrossTabSync((scope) => {
      if (scope === 'transactions') setTransactions(loadTransactions());
      if (scope === 'categories') setCategories(loadCategories());
      if (scope === 'fixedExpenses') setFixedExpenses(loadFixedExpenses());
      if (scope === 'settings') setSettings(loadSettings());
    });
  }, [previewMode]);

  const notify = (message: string) => {
    setToast(message);
  };

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  const isCloudSync = Boolean(!previewMode && firebaseUser && cloudCtx);
  const loggedInPartnerId: PartnerId | null = previewMode
    ? 'partnerA'
    : cloudCtx?.partnerSlot ?? null;

  const liveMonthKey = toYearMonthKey(liveDate.getFullYear(), liveDate.getMonth());

  // Keep live calendar date synchronized in real time (detects midnight / start-of-month rollover)
  useEffect(() => {
    const refreshLiveClock = () => {
      const next = resolveLiveDate();
      setLiveDate((prev) =>
        prev.getFullYear() === next.getFullYear() &&
        prev.getMonth() === next.getMonth() &&
        prev.getDate() === next.getDate()
          ? prev
          : next
      );
    };

    const intervalId = window.setInterval(refreshLiveClock, 60_000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshLiveClock();
    };
    window.addEventListener('focus', refreshLiveClock);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshLiveClock);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // Automatically register fixed household expenses at the start of each reached month (live date)
  useEffect(() => {
    if (!loggedInPartnerId || fixedExpenses.length === 0) return;
    if (!previewMode && (!isCloudSync || !firebaseUser || !cloudCtx || !cloudTransactionsReady || !cloudFixedExpensesReady)) {
      return;
    }

    const dismissedIds = loadDismissedAutoFixedIds();
    const pendingAll = computePendingAutoFixedTransactions({
      fixedExpenses,
      existingTransactions: transactions,
      categories,
      liveDate,
      addedBy: loggedInPartnerId,
      dismissedAutoIds: dismissedIds,
    });

    const toCreate = pendingAll.filter((tx) => !inFlightAutoFixedIdsRef.current.has(tx.id));
    if (toCreate.length === 0) return;

    for (const tx of toCreate) {
      inFlightAutoFixedIdsRef.current.add(tx.id);
    }

    if (isCloudSync && firebaseUser && cloudCtx) {
      let active = true;
      (async () => {
        try {
          let createdCount = 0;
          for (const tx of toCreate) {
            const created = await createAutoFixedTransactionIfMissing(cloudCtx, firebaseUser.uid, tx);
            if (created) createdCount += 1;
          }
          if (active && createdCount > 0) {
            setToast(
              createdCount === 1
                ? `Gasto fijo registrado automáticamente: ${toCreate[0].title}.`
                : `${createdCount} gastos fijos registrados automáticamente al inicio de mes.`
            );
          }
        } catch (err) {
          for (const tx of toCreate) {
            inFlightAutoFixedIdsRef.current.delete(tx.id);
          }
          if (active) {
            setFatalSyncError(err instanceof Error ? err : new Error(String(err)));
          }
        }
      })();
      return () => {
        active = false;
      };
    }

    // Local preview mode
    setTransactions((prev) => {
      const existingIds = new Set(prev.map((item) => item.id));
      const fresh = toCreate.filter((item) => !existingIds.has(item.id));
      if (fresh.length === 0) return prev;
      const next = [...fresh, ...prev];
      saveTransactions(next);
      return next;
    });
    setToast(
      toCreate.length === 1
        ? `Gasto fijo registrado automáticamente: ${toCreate[0].title}.`
        : `${toCreate.length} gastos fijos registrados automáticamente al inicio de mes.`
    );
  }, [
    loggedInPartnerId,
    fixedExpenses,
    transactions,
    categories,
    liveDate,
    previewMode,
    isCloudSync,
    firebaseUser,
    cloudCtx,
    cloudTransactionsReady,
    cloudFixedExpensesReady,
  ]);

  // Idempotently align existing household fixed expenses and their auto-registered payments
  // to their canonical categories & concepts ("Hipoteca y Préstamos" / "Seguros")
  useEffect(() => {
    if (!loggedInPartnerId || fixedExpenses.length === 0 || categories.length === 0) return;
    if (!previewMode && (!isCloudSync || !firebaseUser || !cloudCtx || !cloudTransactionsReady || !cloudFixedExpensesReady)) {
      return;
    }

    const fixedUpdates: FixedExpense[] = [];
    const fixedById = new Map<string, FixedExpense>();
    for (const fixed of fixedExpenses) {
      fixedById.set(fixed.id, fixed);
      const target = resolveFixedExpenseTarget(fixed, categories);
      if (target.matchedCategory && fixed.categoryId !== target.categoryId) {
        const key = `fixed:${fixed.id}:${target.categoryId}`;
        if (!alignedFixedSyncKeysRef.current.has(key)) {
          alignedFixedSyncKeysRef.current.add(key);
          fixedUpdates.push({ ...fixed, categoryId: target.categoryId });
        }
      }
    }

    const txUpdates: Transaction[] = [];
    for (const tx of transactions) {
      if (!tx.fixedExpenseId || !tx.id.startsWith(AUTO_FIXED_TX_PREFIX)) continue;
      const fixed = fixedById.get(tx.fixedExpenseId);
      if (!fixed) continue;
      const target = resolveFixedExpenseTarget(fixed, categories);
      const targetCatId = target.matchedCategory ? target.categoryId : tx.categoryId;
      if (tx.categoryId !== targetCatId || tx.title !== target.concept) {
        const key = `tx:${tx.id}:${targetCatId}:${target.concept}`;
        if (!alignedFixedSyncKeysRef.current.has(key)) {
          alignedFixedSyncKeysRef.current.add(key);
          txUpdates.push({
            ...tx,
            categoryId: targetCatId,
            title: target.concept,
            updatedAt: new Date().toISOString(),
          });
        }
      }
    }

    if (fixedUpdates.length === 0 && txUpdates.length === 0) return;

    if (isCloudSync && firebaseUser && cloudCtx) {
      for (const updatedFixed of fixedUpdates) {
        updateFixedExpenseInCloud(cloudCtx.householdId, updatedFixed).catch(() => {});
      }
      for (const updatedTx of txUpdates) {
        upsertTransactionInCloud(cloudCtx, firebaseUser.uid, updatedTx, true).catch(() => {});
      }
      return;
    }

    if (fixedUpdates.length > 0) {
      const updateMap = new Map(fixedUpdates.map((f) => [f.id, f]));
      setFixedExpenses((prev) => {
        const next = prev.map((f) => updateMap.get(f.id) ?? f);
        saveFixedExpenses(next);
        return next;
      });
    }
    if (txUpdates.length > 0) {
      const txMap = new Map(txUpdates.map((t) => [t.id, t]));
      setTransactions((prev) => {
        const next = prev.map((t) => txMap.get(t.id) ?? t);
        saveTransactions(next);
        return next;
      });
    }
  }, [
    loggedInPartnerId,
    fixedExpenses,
    transactions,
    categories,
    previewMode,
    isCloudSync,
    firebaseUser,
    cloudCtx,
    cloudTransactionsReady,
    cloudFixedExpensesReady,
  ]);

  const monthLabel = formatMonthYear(selectedYear, selectedMonth);

  const monthlyTransactions = useMemo(
    () =>
      filterTransactionsByMonth(transactions, selectedYear, selectedMonth).sort((a, b) => {
        const d = b.date.localeCompare(a.date);
        return d !== 0 ? d : b.createdAt.localeCompare(a.createdAt);
      }),
    [transactions, selectedYear, selectedMonth]
  );

  const summary = useMemo(
    () =>
      calculateMonthlySummary(
        transactions,
        selectedYear,
        selectedMonth,
        settings.initialBalance,
        settings.savingsGoalPercent
      ),
    [transactions, selectedYear, selectedMonth, settings.initialBalance, settings.savingsGoalPercent]
  );

  const handleUpdateSettings = (next: AppSettings) => {
    const themeChanged = next.theme !== settings.theme;
    const accountChanged =
      next.accountName !== settings.accountName ||
      next.initialBalance !== settings.initialBalance ||
      next.savingsGoalPercent !== settings.savingsGoalPercent;

    setSettings(next);

    if (isCloudSync && firebaseUser && cloudCtx) {
      if (themeChanged) {
        updateUserThemeInCloud(firebaseUser.uid, next.theme).catch((err) =>
          setFatalSyncError(err instanceof Error ? err : new Error(String(err)))
        );
      }
      if (accountChanged) {
        updateAccountSettingsInCloud(
          cloudCtx.householdId,
          next.accountName,
          next.initialBalance,
          next.savingsGoalPercent
        ).catch((err) =>
          setFatalSyncError(err instanceof Error ? err : new Error(String(err)))
        );
      }
    } else {
      saveSettings(next);
    }
  };

  const handleLogout = async () => {
    if (previewMode) {
      setPreviewMode(false);
      setAuthReady(true);
      return;
    }
    if (firebaseUser) {
      clearCloudSnapshotCache(firebaseUser.uid);
    }
    await signOut(auth);
    setCloudCtx(null);
    tabScrollPositionsRef.current = createTabScrollStore();
    setActiveTab('resumen');
  };

  const handleUpdateOwnProfile = (partnerId: PartnerId, name: string, email: string) => {
    const cleanEmail = email.trim().toLowerCase();
    const initials =
      name
        .split(/\s+/)
        .map((w) => w[0] ?? '')
        .join('')
        .toUpperCase()
        .slice(0, 2) || 'P';

    if (isCloudSync && firebaseUser && cloudCtx) {
      updateOwnProfileInCloud(firebaseUser.uid, cloudCtx.householdId, partnerId, name)
        .then(() => notify('Tu perfil se ha sincronizado en la nube.'))
        .catch((err) => setFatalSyncError(err instanceof Error ? err : new Error(String(err))));
      return;
    }

    const nextAllowed: [string, string] =
      partnerId === 'partnerA'
        ? [cleanEmail, settings.allowedEmails[1]]
        : [settings.allowedEmails[0], cleanEmail];

    const nextSettings: AppSettings = {
      ...settings,
      allowedEmails: nextAllowed,
      partners: {
        ...settings.partners,
        [partnerId]: {
          ...settings.partners[partnerId],
          name,
          email: cleanEmail,
          initials,
        },
      },
    };
    setSettings(nextSettings);
    saveSettings(nextSettings);
    notify('Tu perfil se ha actualizado correctamente.');
  };

  const handlePrevMonth = useCallback(() => {
    setMonthTransitionDir('prev');
    setMonthSlideKey((k) => k + 1);
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear((y) => y - 1);
    } else {
      setSelectedMonth((m) => m - 1);
    }
  }, [selectedMonth]);

  const handleNextMonth = useCallback(() => {
    setMonthTransitionDir('next');
    setMonthSlideKey((k) => k + 1);
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear((y) => y + 1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
  }, [selectedMonth]);

  const handleSelectMonthYear = useCallback(
    (targetYear: number, targetMonth: number) => {
      const currentOrdinal = selectedYear * 12 + selectedMonth;
      const targetOrdinal = targetYear * 12 + targetMonth;
      if (targetOrdinal !== currentOrdinal) {
        setMonthTransitionDir(targetOrdinal > currentOrdinal ? 'next' : 'prev');
        setMonthSlideKey((k) => k + 1);
      }
      setSelectedYear(targetYear);
      setSelectedMonth(targetMonth);
    },
    [selectedYear, selectedMonth]
  );

  const handleGoToCurrentMonth = useCallback(() => {
    const now = resolveLiveDate();
    setLiveDate(now);
    handleSelectMonthYear(now.getFullYear(), now.getMonth());
  }, [handleSelectMonthYear]);

  const handleSelectTab = useCallback(
    (nextTab: TabId) => {
      const currentY = readWindowScrollY();
      const { nextStore, changed } = switchTabWithScrollMemory(
        tabScrollPositionsRef.current,
        activeTab,
        nextTab,
        currentY
      );
      if (!changed) return;
      tabScrollPositionsRef.current = nextStore;
      setActiveTab(nextTab);
    },
    [activeTab]
  );

  // Restore each tab's remembered scroll offset (or 0 for unvisited tabs) before paint
  useLayoutEffect(() => {
    const targetY = getTabScroll(tabScrollPositionsRef.current, activeTab);
    jumpWindowScrollYInstant(targetY);

    let cancelled = false;
    const rafId = window.requestAnimationFrame(() => {
      if (cancelled) return;
      if (Math.abs(readWindowScrollY() - targetY) > 2) {
        jumpWindowScrollYInstant(targetY);
      }
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
    };
  }, [activeTab]);

  const handleMainTouchStart = (e: React.TouchEvent<HTMLElement>) => {
    if (isModalOpen || isMonthPickerOpen || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const ignored = shouldIgnoreHorizontalGesture(e.target, mainSwipeRef.current);
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      ignored,
      lockedHorizontal: false,
    };
  };

  const handleMainTouchMove = (e: React.TouchEvent<HTMLElement>) => {
    const start = touchStartRef.current;
    if (!start || start.ignored || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;

    if (!start.lockedHorizontal) {
      if (Math.abs(dy) > 14 && Math.abs(dy) >= Math.abs(dx)) {
        // User is scrolling vertically; ignore the rest of this gesture
        start.ignored = true;
        setSwipeOffsetX(0);
        return;
      }
      if (Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        start.lockedHorizontal = true;
      }
    }

    if (start.lockedHorizontal) {
      setSwipeOffsetX(computeSwipeRubberBand(dx));
    }
  };

  const handleMainTouchEnd = (e: React.TouchEvent<HTMLElement>) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    setSwipeOffsetX(0);

    if (!start || start.ignored || e.changedTouches.length === 0) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    const direction = evaluateHorizontalSwipe(dx, dy);

    if (direction === 'next') {
      if (activeTab === 'estadisticas' && statsPeriodMode === 'annual') {
        handleSelectMonthYear(selectedYear + 1, selectedMonth);
      } else {
        handleNextMonth();
      }
    } else if (direction === 'prev') {
      if (activeTab === 'estadisticas' && statsPeriodMode === 'annual') {
        handleSelectMonthYear(selectedYear - 1, selectedMonth);
      } else {
        handlePrevMonth();
      }
    }
  };

  const handleMainTouchCancel = () => {
    touchStartRef.current = null;
    setSwipeOffsetX(0);
  };

  const handleMainWheel = (e: React.WheelEvent<HTMLElement>) => {
    if (isModalOpen || isMonthPickerOpen) return;
    if (shouldIgnoreHorizontalGesture(e.target, mainSwipeRef.current)) return;

    const direction = evaluateHorizontalWheel(e.deltaX, e.deltaY);
    if (!direction) return;

    const now = Date.now();
    if (now - lastWheelMonthChangeRef.current < 480) return;
    lastWheelMonthChangeRef.current = now;

    if (direction === 'next') {
      if (activeTab === 'estadisticas' && statsPeriodMode === 'annual') {
        handleSelectMonthYear(selectedYear + 1, selectedMonth);
      } else {
        handleNextMonth();
      }
    } else {
      if (activeTab === 'estadisticas' && statsPeriodMode === 'annual') {
        handleSelectMonthYear(selectedYear - 1, selectedMonth);
      } else {
        handlePrevMonth();
      }
    }
  };

  const handleSaveTransaction = (tx: Transaction) => {
    const isUpdate = Boolean(editingTx);

    if (isCloudSync && firebaseUser && cloudCtx) {
      upsertTransactionInCloud(cloudCtx, firebaseUser.uid, tx, isUpdate)
        .then(() =>
          notify(
            isUpdate
              ? 'Movimiento actualizado en la nube.'
              : tx.type === 'income'
                ? 'Ingreso guardado en la nube.'
                : 'Gasto guardado en la nube.'
          )
        )
        .catch((err) => setFatalSyncError(err instanceof Error ? err : new Error(String(err))));
      setEditingTx(null);
      return;
    }

    setTransactions((prev) => {
      const exists = prev.some((item) => item.id === tx.id);
      const next = exists ? prev.map((item) => (item.id === tx.id ? tx : item)) : [tx, ...prev];
      saveTransactions(next);
      return next;
    });
    notify(
      isUpdate
        ? 'Movimiento actualizado.'
        : tx.type === 'income'
          ? 'Ingreso añadido.'
          : 'Gasto añadido.'
    );
    setEditingTx(null);
  };

  const handleDeleteTransaction = (id: string) => {
    if (id.startsWith(AUTO_FIXED_TX_PREFIX)) {
      dismissAutoFixedId(id);
    }
    if (isCloudSync && cloudCtx) {
      deleteTransactionInCloud(cloudCtx.householdId, id)
        .then(() => notify('Movimiento eliminado de la nube.'))
        .catch((err) => setFatalSyncError(err instanceof Error ? err : new Error(String(err))));
      return;
    }

    setTransactions((prev) => {
      const next = prev.filter((item) => item.id !== id);
      saveTransactions(next);
      return next;
    });
    notify('Movimiento eliminado.');
  };

  const handleCreateCategory = (cat: Category) => {
    if (isCloudSync && cloudCtx) {
      upsertCategoryInCloud(cloudCtx, cat, false)
        .then(() => notify(`Categoría "${cat.name}" creada en la nube.`))
        .catch((err) => setFatalSyncError(err instanceof Error ? err : new Error(String(err))));
      return;
    }

    setCategories((prev) => {
      const next = [...prev, cat];
      saveCategories(next);
      return next;
    });
    notify(`Categoría "${cat.name}" creada.`);
  };

  const handleUpdateCategory = (cat: Category) => {
    if (isCloudSync && cloudCtx) {
      upsertCategoryInCloud(cloudCtx, cat, true)
        .then(() => notify(`Categoría "${cat.name}" actualizada.`))
        .catch((err) => setFatalSyncError(err instanceof Error ? err : new Error(String(err))));
      return;
    }

    setCategories((prev) => {
      const next = prev.map((item) => (item.id === cat.id ? cat : item));
      saveCategories(next);
      return next;
    });
    notify(`Categoría "${cat.name}" actualizada.`);
  };

  const handleDeleteCategory = (categoryId: string) => {
    const target = categories.find((c) => c.id === categoryId);
    if (isCloudSync && cloudCtx) {
      deleteCategoryInCloud(cloudCtx.householdId, categoryId)
        .then(() => {
          if (target) notify(`Categoría "${target.name}" eliminada.`);
        })
        .catch((err) => setFatalSyncError(err instanceof Error ? err : new Error(String(err))));
      return;
    }

    setCategories((prev) => {
      const next = prev.filter((item) => item.id !== categoryId);
      saveCategories(next);
      return next;
    });
    if (target) {
      notify(`Categoría "${target.name}" eliminada.`);
    }
  };

  const handleUpdateFixedExpense = (updated: FixedExpense) => {
    const target = resolveFixedExpenseTarget(updated, categories);
    const alignedFixed: FixedExpense = target.matchedCategory
      ? { ...updated, categoryId: target.categoryId }
      : updated;

    const viewedMonthKey = toYearMonthKey(selectedYear, selectedMonth);
    const autoTxIdForViewedMonth = buildAutoFixedTransactionId(alignedFixed.id, viewedMonthKey);
    const existingAutoTx = transactions.find((tx) => tx.id === autoTxIdForViewedMonth);
    const resolvedForViewedMonth = resolveFixedExpenseForMonth(
      alignedFixed,
      selectedYear,
      selectedMonth,
      []
    );
    const updatedAutoTx: Transaction | null =
      existingAutoTx &&
      resolvedForViewedMonth.amount !== null &&
      resolvedForViewedMonth.amount > 0 &&
      (resolvedForViewedMonth.amount !== existingAutoTx.amount ||
        existingAutoTx.categoryId !== alignedFixed.categoryId ||
        existingAutoTx.title !== target.concept)
        ? {
            ...existingAutoTx,
            amount: resolvedForViewedMonth.amount,
            categoryId: alignedFixed.categoryId,
            title: target.concept,
            updatedAt: new Date().toISOString(),
          }
        : null;

    if (isCloudSync && cloudCtx) {
      const ops: Promise<void>[] = [updateFixedExpenseInCloud(cloudCtx.householdId, alignedFixed)];
      if (updatedAutoTx && firebaseUser) {
        ops.push(upsertTransactionInCloud(cloudCtx, firebaseUser.uid, updatedAutoTx, true));
      }
      Promise.all(ops)
        .then(() => notify(`Gasto fijo ${alignedFixed.name} sincronizado.`))
        .catch((err) => setFatalSyncError(err instanceof Error ? err : new Error(String(err))));
      return;
    }

    setFixedExpenses((prev) => {
      const next = prev.map((item) => (item.id === alignedFixed.id ? alignedFixed : item));
      saveFixedExpenses(next);
      return next;
    });
    if (updatedAutoTx) {
      setTransactions((prev) => {
        const next = prev.map((tx) => (tx.id === updatedAutoTx.id ? updatedAutoTx : tx));
        saveTransactions(next);
        return next;
      });
    }
    notify(`Gasto fijo ${alignedFixed.name} actualizado.`);
  };

  const handleRegisterFixedExpensePayment = (fixed: FixedExpense, amountForMonth: number) => {
    if (!loggedInPartnerId) return;
    const target = resolveFixedExpenseTarget(fixed, categories);
    const dueDay = Number(fixed.dueDate.split('-')[2]) || 1;
    const maxDayInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    const clampedDay = Math.min(dueDay, maxDayInMonth);
    const paymentDate = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(
      clampedDay
    ).padStart(2, '0')}`;
    const nowIso = new Date().toISOString();

    const tx: Transaction = {
      id: `tx-fixed-${fixed.id}-${Date.now()}`,
      type: 'expense',
      amount: amountForMonth,
      title: target.concept,
      categoryId: target.categoryId,
      date: paymentDate,
      addedBy: loggedInPartnerId,
      fixedExpenseId: fixed.id,
      notes: fixed.notes,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    if (isCloudSync && firebaseUser && cloudCtx) {
      upsertTransactionInCloud(cloudCtx, firebaseUser.uid, tx, false)
        .then(() => notify(`Pago de ${target.concept} registrado en ${monthLabel}.`))
        .catch((err) => setFatalSyncError(err instanceof Error ? err : new Error(String(err))));
      return;
    }

    setTransactions((prev) => {
      const next = [tx, ...prev];
      saveTransactions(next);
      return next;
    });
    notify(`Pago de ${target.concept} registrado en ${monthLabel}.`);
  };

  const handleImportTransactions = (
    mode: 'merge' | 'replace',
    imported: Transaction[],
    importedCategories: Category[],
    importedFixedExpenses: FixedExpense[],
    importedInitialBalance?: number,
    importedSavingsGoalPercent?: number
  ) => {
    if (isCloudSync && firebaseUser && cloudCtx) {
      batchImportToCloud(
        cloudCtx,
        firebaseUser.uid,
        mode,
        imported,
        importedCategories,
        importedFixedExpenses,
        transactions,
        categories
      )
        .then(async (res) => {
          if (
            mode === 'replace' &&
            (typeof importedInitialBalance === 'number' ||
              typeof importedSavingsGoalPercent === 'number')
          ) {
            await updateAccountSettingsInCloud(
              cloudCtx.householdId,
              settings.accountName,
              importedInitialBalance ?? settings.initialBalance,
              importedSavingsGoalPercent ?? settings.savingsGoalPercent
            );
          }
          notify(
            mode === 'replace'
              ? `Backup restaurado en la nube: ${res.addedCount} movimientos cargados.`
              : `Importación en la nube: ${res.addedCount} añadidos, ${res.skippedCount} duplicados omitidos.`
          );
        })
        .catch((err) => setFatalSyncError(err instanceof Error ? err : new Error(String(err))));
      return;
    }

    if (mode === 'replace') {
      setTransactions(imported);
      saveTransactions(imported);
      if (importedCategories.length > 0) {
        setCategories(importedCategories);
        saveCategories(importedCategories);
      }
      if (importedFixedExpenses.length > 0) {
        setFixedExpenses(importedFixedExpenses);
        saveFixedExpenses(importedFixedExpenses);
      }
      handleUpdateSettings({
        ...settings,
        initialBalance:
          typeof importedInitialBalance === 'number'
            ? importedInitialBalance
            : settings.initialBalance,
        savingsGoalPercent:
          typeof importedSavingsGoalPercent === 'number'
            ? importedSavingsGoalPercent
            : settings.savingsGoalPercent,
      });
      notify(`Backup restaurado: ${imported.length} movimientos cargados.`);
      return;
    }

    const result = mergeTransactions(transactions, imported);
    setTransactions(result.merged);
    saveTransactions(result.merged);
    if (importedCategories.length > 0) {
      const existingCatIds = new Set(categories.map((c) => c.id));
      const newCats = importedCategories.filter((c) => !existingCatIds.has(c.id));
      if (newCats.length > 0) {
        const mergedCats = [...categories, ...newCats];
        setCategories(mergedCats);
        saveCategories(mergedCats);
      }
    }
    notify(
      `Importación completada: ${result.addedCount} añadidos, ${result.skippedCount} duplicados omitidos.`
    );
  };

  const handleResetDemoData = () => {
    if (isCloudSync && firebaseUser && cloudCtx) {
      batchImportToCloud(
        cloudCtx,
        firebaseUser.uid,
        'replace',
        SEED_TRANSACTIONS,
        DEFAULT_CATEGORIES,
        DEFAULT_FIXED_EXPENSES,
        transactions,
        categories
      )
        .then(() =>
          updateAccountSettingsInCloud(
            cloudCtx.householdId,
            DEFAULT_SETTINGS.accountName,
            DEFAULT_SETTINGS.initialBalance,
            DEFAULT_SETTINGS.savingsGoalPercent
          )
        )
        .then(() => {
          setSelectedYear(2026);
          setSelectedMonth(10);
          notify('Datos de ejemplo restaurados en la nube.');
        })
        .catch((err) => setFatalSyncError(err instanceof Error ? err : new Error(String(err))));
      return;
    }

    setTransactions(SEED_TRANSACTIONS);
    saveTransactions(SEED_TRANSACTIONS);
    setCategories(DEFAULT_CATEGORIES);
    saveCategories(DEFAULT_CATEGORIES);
    setFixedExpenses(DEFAULT_FIXED_EXPENSES);
    saveFixedExpenses(DEFAULT_FIXED_EXPENSES);
    handleUpdateSettings({
      ...settings,
      initialBalance: DEFAULT_SETTINGS.initialBalance,
      accountName: DEFAULT_SETTINGS.accountName,
      savingsGoalPercent: DEFAULT_SETTINGS.savingsGoalPercent,
    });
    setSelectedYear(2026);
    setSelectedMonth(10);
    notify('Datos de demostración restaurados.');
  };

  const openNewModal = (presetType: TransactionType = 'expense') => {
    setLiveDate(resolveLiveDate());
    setEditingTx(null);
    setModalPresetType(presetType);
    setIsModalOpen(true);
  };

  const openEditModal = (tx: Transaction) => {
    setEditingTx(tx);
    setModalPresetType(tx.type);
    setIsModalOpen(true);
  };

  const renderAppContent = () => {
    // Loading state while Firebase Auth initializes or bootstraps cloud household
    if (!authReady || (!previewMode && firebaseUser && (!cloudCtx || syncingCloud))) {
      return (
        <div className="min-h-dvh bg-[#F5F7FA] dark:bg-[#0B0F14] text-slate-900 dark:text-[#F4F6F9] flex flex-col items-center justify-center gap-3 p-6">
          <img
            src="/icon.svg"
            alt="Logotipo AppDuo Ingresos y Gastos"
            className="w-12 h-12 rounded-2xl animate-pulse"
            referrerPolicy="no-referrer"
          />
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            {firebaseUser ? 'Sincronizando tu cuenta con la nube...' : 'Comprobando sesión...'}
          </p>
        </div>
      );
    }

    // Gate the app behind Firebase Authentication
    if (!loggedInPartnerId) {
      return (
        <AuthScreen
          theme={settings.theme}
          initialError={redirectAuthError}
          onClearInitialError={() => setRedirectAuthError(null)}
          onToggleTheme={() =>
            handleUpdateSettings({
              ...settings,
              theme: settings.theme === 'dark' ? 'light' : 'dark',
            })
          }
        />
      );
    }

    const activePartner = settings.partners[loggedInPartnerId];
    const liveTodayIso = formatLocalIsoDate(liveDate);
    const modalDefaultDate = resolveTransactionDefaultDate(
      selectedYear,
      selectedMonth,
      liveDate
    );

    return (
      <div className="min-h-dvh bg-[#F5F7FA] dark:bg-[#0B0F14] text-slate-900 dark:text-[#F4F6F9] transition-colors">
        <OfflineIndicator />

        <div className="mx-auto max-w-6xl lg:grid lg:grid-cols-[248px_1fr] lg:gap-8 lg:px-6">
          {/* Desktop Sidebar Navigation */}
          <aside className="hidden lg:flex flex-col sticky top-0 h-dvh py-6 pr-2 justify-between">
            <div className="space-y-6">
              {/* Brand Mark */}
              <div className="flex items-center gap-3 px-2">
                <img
                  src="/icon.svg"
                  alt="Logotipo AppDuo Ingresos y Gastos"
                  className="w-9 h-9 rounded-xl shrink-0"
                  referrerPolicy="no-referrer"
                />
                <div className="min-w-0 leading-tight">
                  <span className="block text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
                    AppDuo
                  </span>
                  <span className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    Ingresos y Gastos
                  </span>
                </div>
              </div>

            {/* Primary Desktop CTA */}
            <div>
              <button
                type="button"
                onClick={() => openNewModal('expense')}
                className="w-full flex items-center justify-center gap-2 min-h-[48px] px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition-colors active:scale-[0.98] whitespace-nowrap"
              >
                <Plus className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Nuevo movimiento</span>
              </button>
            </div>

            {/* Primary Nav */}
            <nav aria-label="Navegación principal" className="space-y-1">
              {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
                const active = activeTab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => handleSelectTab(id)}
                    aria-current={active ? 'page' : undefined}
                    className={`w-full flex items-center gap-3 min-h-[46px] px-3.5 rounded-2xl text-sm font-medium transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-white dark:bg-[#131922] text-emerald-600 dark:text-emerald-400 border border-slate-200/80 dark:border-white/[0.08] font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-white/[0.03]'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Authenticated User Session Card (Desktop Footer) */}
          <div className="rounded-2xl bg-white dark:bg-[#131922] border border-slate-200/80 dark:border-white/[0.08] p-3.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                style={{ backgroundColor: activePartner.accentHex }}
              >
                {activePartner.initials}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                  {activePartner.name}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {activePartner.email}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
              className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </aside>

        {/* Main Content Column */}
        <div className="min-w-0 flex flex-col min-h-dvh">
          {/* Compact Top App Bar */}
          <header className="sticky top-0 z-30 h-14 px-2.5 sm:px-4 lg:px-0 bg-[#F5F7FA]/90 dark:bg-[#0B0F14]/90 backdrop-blur-md border-b border-slate-200/70 dark:border-white/[0.06] flex items-center justify-between gap-1 sm:gap-2">
            {/* Left: Authenticated User Avatar on Mobile / View Heading on Desktop */}
            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => handleSelectTab('ajustes')}
                aria-label={`Sesión activa: ${activePartner.name}. Ir a Ajustes`}
                className="lg:hidden min-h-[44px] min-w-[34px] flex items-center justify-center"
              >
                <span
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[11px] sm:text-xs font-bold text-white"
                  style={{ backgroundColor: activePartner.accentHex }}
                >
                  {activePartner.initials}
                </span>
              </button>
              <h1 className="hidden lg:block text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
                {NAV_ITEMS.find((n) => n.id === activeTab)?.label}
              </h1>
            </div>

            {/* Center: Prominent Interactive Month & Year Quick-Jump Selector (< Noviembre 2026 ▾ >) */}
            <div className="flex items-center gap-0 sm:gap-1 min-w-0" role="group" aria-label="Selector de mes y año">
              <button
                type="button"
                onClick={handlePrevMonth}
                aria-label="Mes anterior"
                className="min-h-[44px] min-w-[28px] sm:min-w-[42px] flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/[0.06] transition-colors shrink-0"
              >
                <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
              <button
                type="button"
                onClick={() => setIsMonthPickerOpen(true)}
                data-testid="month-year-button"
                aria-haspopup="dialog"
                aria-expanded={isMonthPickerOpen}
                aria-label={`Periodo seleccionado: ${monthLabel}. Pulsar para cambiar de mes y año rápidamente`}
                className="inline-flex items-center justify-center gap-0.5 sm:gap-1.5 min-h-[44px] px-1 sm:px-3.5 rounded-xl text-sm sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white hover:bg-slate-200/70 dark:hover:bg-white/[0.08] active:scale-[0.98] transition-all whitespace-nowrap min-w-0"
              >
                <span className="truncate">{monthLabel}</span>
                <ChevronDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={handleNextMonth}
                aria-label="Mes siguiente"
                className="min-h-[44px] min-w-[28px] sm:min-w-[42px] flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-white/[0.06] transition-colors shrink-0"
              >
                <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>

            {/* Right: Jump to Current Month + Dark/Light Theme Toggle */}
            <div className="flex items-center gap-0.5 sm:gap-1.5 shrink-0">
              {(() => {
                const isViewingCurrentMonth =
                  selectedYear === liveDate.getFullYear() &&
                  selectedMonth === liveDate.getMonth();
                return (
                  <button
                    type="button"
                    onClick={handleGoToCurrentMonth}
                    data-testid="go-current-month-button"
                    aria-label="Ir al mes actual"
                    title="Ir al mes actual"
                    aria-current={isViewingCurrentMonth ? 'date' : undefined}
                    className={`inline-flex items-center justify-center gap-1 sm:gap-1.5 min-h-[34px] sm:min-h-[38px] px-2 sm:px-3 rounded-xl text-[11px] sm:text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 ${
                      isViewingCurrentMonth
                        ? 'bg-slate-100/80 dark:bg-white/[0.04] border-slate-200/70 dark:border-white/[0.08] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        : 'bg-emerald-600/12 dark:bg-emerald-500/15 border-emerald-500/35 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-600/20'
                    }`}
                  >
                    <Calendar className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span className="sm:hidden">Hoy</span>
                    <span className="hidden sm:inline">Mes actual</span>
                  </button>
                );
              })()}

              <button
                type="button"
                onClick={() =>
                  handleUpdateSettings({
                    ...settings,
                    theme: settings.theme === 'dark' ? 'light' : 'dark',
                  })
                }
                aria-label={settings.theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
                className="min-h-[44px] min-w-[34px] sm:min-w-[44px] -mr-0.5 lg:mr-0 flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-white/[0.06] transition-colors shrink-0"
              >
                {settings.theme === 'dark' ? (
                  <Sun className="w-[18px] h-[18px] sm:w-5 sm:h-5" aria-hidden="true" />
                ) : (
                  <Moon className="w-[18px] h-[18px] sm:w-5 sm:h-5" aria-hidden="true" />
                )}
              </button>
            </div>
          </header>

          {/* Active Screen (supports horizontal swipe & trackpad horizontal scroll on every tab) */}
          <main
            ref={mainSwipeRef}
            onTouchStart={handleMainTouchStart}
            onTouchMove={handleMainTouchMove}
            onTouchEnd={handleMainTouchEnd}
            onTouchCancel={handleMainTouchCancel}
            onWheel={handleMainWheel}
            className="flex-1 px-4 lg:px-0 py-5 pb-nav-safe lg:pb-10 touch-pan-y overflow-x-clip"
          >
            <div
              key={`${activeTab}-${monthSlideKey}`}
              style={
                swipeOffsetX !== 0
                  ? { transform: `translateX(${swipeOffsetX}px)`, transition: 'none' }
                  : undefined
              }
              className={
                monthTransitionDir === 'next'
                  ? 'animate-month-next'
                  : monthTransitionDir === 'prev'
                    ? 'animate-month-prev'
                    : undefined
              }
            >
            {activeTab === 'resumen' && (
              <ResumenView
                monthLabel={monthLabel}
                selectedYear={selectedYear}
                selectedMonth={selectedMonth}
                liveMonthKey={liveMonthKey}
                summary={summary}
                recentTransactions={monthlyTransactions}
                fixedExpenses={fixedExpenses}
                categories={categories}
                partners={settings.partners}
                onViewAllTransactions={() => handleSelectTab('movimientos')}
                onEditTransaction={openEditModal}
                onOpenNewModal={openNewModal}
                onUpdateFixedExpense={handleUpdateFixedExpense}
                onRegisterFixedExpensePayment={handleRegisterFixedExpensePayment}
              />
            )}

            {activeTab === 'movimientos' && (
              <MovimientosView
                monthLabel={monthLabel}
                transactions={monthlyTransactions}
                categories={categories}
                partners={settings.partners}
                onEdit={openEditModal}
                onDelete={handleDeleteTransaction}
              />
            )}

            {activeTab === 'estadisticas' && (
              <EstadisticasView
                monthLabel={monthLabel}
                selectedYear={selectedYear}
                selectedMonth={selectedMonth}
                savingsGoalPercent={settings.savingsGoalPercent}
                transactions={monthlyTransactions}
                allTransactions={transactions}
                categories={categories}
                summary={summary}
                periodMode={statsPeriodMode}
                onChangePeriodMode={setStatsPeriodMode}
                onSelectMonthYear={handleSelectMonthYear}
              />
            )}

            {activeTab === 'ajustes' && (
              <AjustesBackupView
                settings={settings}
                loggedInPartnerId={loggedInPartnerId}
                isCloudSync={isCloudSync}
                transactions={transactions}
                monthlyTransactions={monthlyTransactions}
                categories={categories}
                fixedExpenses={fixedExpenses}
                selectedYear={selectedYear}
                selectedMonth={selectedMonth}
                monthLabel={monthLabel}
                onUpdateSettings={handleUpdateSettings}
                onUpdateOwnProfile={handleUpdateOwnProfile}
                onLogout={handleLogout}
                onImportTransactions={handleImportTransactions}
                onResetDemoData={handleResetDemoData}
                onNotify={notify}
              />
            )}
            </div>
          </main>
        </div>
      </div>

      {/* Fixed Mobile Bottom Navigation with Prominent Centered (+) CTA */}
      <nav
        aria-label="Navegación móvil"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#0E131B]/95 backdrop-blur-md border-t border-slate-200/80 dark:border-white/[0.08] pb-safe"
      >
        <div className="max-w-lg mx-auto grid grid-cols-5 items-center h-16 px-1">
          {NAV_ITEMS.slice(0, 2).map(({ id, label, icon: Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleSelectTab(id)}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center justify-center min-h-[48px] gap-0.5 transition-colors ${
                  active
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <Icon className="w-5 h-5" aria-hidden="true" />
                <span className="text-[10px] font-semibold tracking-tight whitespace-nowrap">
                  {label}
                </span>
              </button>
            );
          })}

          {/* Centered Prominent (+) Action Button */}
          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={() => openNewModal('expense')}
              aria-label="Registrar nuevo movimiento"
              className="-mt-6 w-14 h-14 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30 flex items-center justify-center active:scale-95 transition-transform"
            >
              <Plus className="w-7 h-7" aria-hidden="true" />
            </button>
          </div>

          {NAV_ITEMS.slice(2, 4).map(({ id, label, icon: Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleSelectTab(id)}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center justify-center min-h-[48px] gap-0.5 transition-colors ${
                  active
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <Icon className="w-5 h-5" aria-hidden="true" />
                <span className="text-[10px] font-semibold tracking-tight whitespace-nowrap">
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Quick-Add / Edit Bottom Sheet Modal */}
      <TransactionModal
        isOpen={isModalOpen}
        editingTransaction={editingTx}
        presetType={modalPresetType}
        loggedInPartnerId={loggedInPartnerId}
        partners={settings.partners}
        categories={categories}
        defaultDate={modalDefaultDate}
        todayDate={liveTodayIso}
        onClose={() => {
          setIsModalOpen(false);
          setEditingTx(null);
        }}
        onSave={handleSaveTransaction}
        onCreateCategory={handleCreateCategory}
        onUpdateCategory={handleUpdateCategory}
        onDeleteCategory={handleDeleteCategory}
      />

      {/* Fast Month & Year Quick-Jump Picker Modal */}
      <MonthYearPickerModal
        isOpen={isMonthPickerOpen}
        selectedYear={selectedYear}
        selectedMonth={selectedMonth}
        transactions={transactions}
        onSelect={handleSelectMonthYear}
        onClose={() => setIsMonthPickerOpen(false)}
      />

      {/* Non-intrusive Feedback Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-24 lg:bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs sm:text-sm font-medium shadow-xl whitespace-nowrap max-w-[92vw] truncate"
        >
          {toast}
        </div>
      )}
      </div>
    );
  };

  return (
    <>
      {showSplash && (
        <SplashScreen durationMs={2500} fadeOutMs={450} onComplete={handleSplashComplete} />
      )}
      {renderAppContent()}
    </>
  );
}
