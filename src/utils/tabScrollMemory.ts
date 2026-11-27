import type { TabId } from '../types/finance';

export type TabScrollStore = Record<TabId, number>;

export function sanitizeScrollY(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value);
}

export function createTabScrollStore(): TabScrollStore {
  return {
    resumen: 0,
    movimientos: 0,
    estadisticas: 0,
    ajustes: 0,
  };
}

export function getTabScroll(store: TabScrollStore, tab: TabId): number {
  return sanitizeScrollY(store[tab] ?? 0);
}

export function recordTabScroll(
  store: TabScrollStore,
  tab: TabId,
  scrollY: number
): TabScrollStore {
  const safeY = sanitizeScrollY(scrollY);
  if (store[tab] === safeY) return store;
  return {
    ...store,
    [tab]: safeY,
  };
}

export interface TabSwitchScrollResult {
  nextStore: TabScrollStore;
  targetScrollY: number;
  changed: boolean;
}

/**
 * Saves the outgoing tab's scroll position and resolves the remembered scroll position
 * for the destination tab (0 if never scrolled, preventing scroll leakage between tabs).
 */
export function switchTabWithScrollMemory(
  store: TabScrollStore,
  currentTab: TabId,
  nextTab: TabId,
  currentScrollY: number
): TabSwitchScrollResult {
  if (currentTab === nextTab) {
    return {
      nextStore: store,
      targetScrollY: sanitizeScrollY(currentScrollY),
      changed: false,
    };
  }

  const nextStore = recordTabScroll(store, currentTab, currentScrollY);
  return {
    nextStore,
    targetScrollY: getTabScroll(nextStore, nextTab),
    changed: true,
  };
}
