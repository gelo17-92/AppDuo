import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSwipeRubberBand,
  evaluateHorizontalSwipe,
  evaluateHorizontalWheel,
} from './swipeGesture';

test('evaluateHorizontalSwipe detects clean left/right swipes and ignores vertical scroll or short taps', () => {
  assert.equal(evaluateHorizontalSwipe(-90, 12), 'next');
  assert.equal(evaluateHorizontalSwipe(95, -18), 'prev');
  // Too short
  assert.equal(evaluateHorizontalSwipe(-30, 0), null);
  // Mostly vertical scroll
  assert.equal(evaluateHorizontalSwipe(-70, 80), null);
  assert.equal(evaluateHorizontalSwipe(60, 60), null);
});

test('evaluateHorizontalWheel detects horizontal trackpad swipes and ignores vertical scroll', () => {
  assert.equal(evaluateHorizontalWheel(55, 4), 'next');
  assert.equal(evaluateHorizontalWheel(-60, 10), 'prev');
  assert.equal(evaluateHorizontalWheel(20, 0), null);
  assert.equal(evaluateHorizontalWheel(45, 40), null);
});

test('computeSwipeRubberBand clamps drag preview smoothly', () => {
  assert.equal(computeSwipeRubberBand(0), 0);
  assert.equal(computeSwipeRubberBand(300), 40);
  assert.equal(computeSwipeRubberBand(-300), -40);
});
