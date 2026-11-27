export type SwipeMonthDirection = 'next' | 'prev' | null;

/**
 * Evaluates a touch drag vector (dx = endX - startX, dy = endY - startY).
 * Swiping left (negative dx) moves forward to the next month;
 * swiping right (positive dx) moves back to the previous month.
 */
export function evaluateHorizontalSwipe(
  dx: number,
  dy: number,
  minDistancePx = 56,
  dominanceRatio = 1.35
): SwipeMonthDirection {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);

  if (absX < minDistancePx) return null;
  if (absX < absY * dominanceRatio) return null;

  return dx < 0 ? 'next' : 'prev';
}

/**
 * Evaluates a trackpad/mouse horizontal wheel delta (deltaX, deltaY).
 * Positive deltaX (scrolling right) advances to next month;
 * negative deltaX (scrolling left) goes to previous month.
 */
export function evaluateHorizontalWheel(
  deltaX: number,
  deltaY: number,
  minDeltaPx = 38,
  dominanceRatio = 1.5
): SwipeMonthDirection {
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);

  if (absX < minDeltaPx) return null;
  if (absX < absY * dominanceRatio) return null;

  return deltaX > 0 ? 'next' : 'prev';
}

/**
 * Computes a clamped rubber-band visual offset while dragging horizontally.
 */
export function computeSwipeRubberBand(dx: number, maxOffsetPx = 40): number {
  const damped = dx * 0.28;
  return Math.max(-maxOffsetPx, Math.min(maxOffsetPx, damped));
}
