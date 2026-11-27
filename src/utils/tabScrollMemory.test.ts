import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTabScrollStore,
  getTabScroll,
  recordTabScroll,
  sanitizeScrollY,
  switchTabWithScrollMemory,
} from './tabScrollMemory';

test('createTabScrollStore initializes all tabs at scroll 0', () => {
  const store = createTabScrollStore();
  assert.equal(getTabScroll(store, 'resumen'), 0);
  assert.equal(getTabScroll(store, 'movimientos'), 0);
  assert.equal(getTabScroll(store, 'estadisticas'), 0);
  assert.equal(getTabScroll(store, 'ajustes'), 0);
});

test('switchTabWithScrollMemory isolates scroll between tabs and restores remembered height on return', () => {
  let store = createTabScrollStore();

  // Scroll Resumen to 420px, then switch to Movimientos -> Movimientos starts at 0 (no scroll transfer)
  const step1 = switchTabWithScrollMemory(store, 'resumen', 'movimientos', 420);
  assert.equal(step1.changed, true);
  assert.equal(step1.targetScrollY, 0);
  store = step1.nextStore;
  assert.equal(getTabScroll(store, 'resumen'), 420);

  // Scroll Movimientos to 285.4px, then switch to Estadisticas -> Estadisticas starts at 0
  const step2 = switchTabWithScrollMemory(store, 'movimientos', 'estadisticas', 285.4);
  assert.equal(step2.changed, true);
  assert.equal(step2.targetScrollY, 0);
  store = step2.nextStore;
  assert.equal(getTabScroll(store, 'movimientos'), 285);

  // Return to Resumen -> remembers 420px
  const step3 = switchTabWithScrollMemory(store, 'estadisticas', 'resumen', 0);
  assert.equal(step3.changed, true);
  assert.equal(step3.targetScrollY, 420);
  store = step3.nextStore;

  // Return to Movimientos -> remembers 285px
  const step4 = switchTabWithScrollMemory(store, 'resumen', 'movimientos', 510);
  assert.equal(step4.changed, true);
  assert.equal(step4.targetScrollY, 285);
  store = step4.nextStore;

  // Return to Resumen again -> remembers updated 510px
  const step5 = switchTabWithScrollMemory(store, 'movimientos', 'resumen', 285);
  assert.equal(step5.changed, true);
  assert.equal(step5.targetScrollY, 510);
});

test('switchTabWithScrollMemory is a no-op when selecting the already-active tab and sanitizes invalid values', () => {
  const store = recordTabScroll(createTabScrollStore(), 'resumen', 300);

  const sameTab = switchTabWithScrollMemory(store, 'resumen', 'resumen', 180);
  assert.equal(sameTab.changed, false);
  assert.equal(sameTab.nextStore, store);
  assert.equal(sameTab.targetScrollY, 180);

  assert.equal(sanitizeScrollY(-50), 0);
  assert.equal(sanitizeScrollY(Number.NaN), 0);
  assert.equal(sanitizeScrollY(Number.POSITIVE_INFINITY), 0);
  assert.equal(sanitizeScrollY(123.7), 124);
});
