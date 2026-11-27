import type { AnnualMonthPoint } from '../types/finance';

export const LINE_CHART_VIEWBOX_WIDTH = 600;
export const LINE_CHART_VIEWBOX_HEIGHT = 200;
export const LINE_CHART_PAD_TOP = 14;
export const LINE_CHART_PAD_BOTTOM = 12;

export interface AnnualLinePoint {
  monthIndex: number;
  monthName: string;
  shortLabel: string;
  totalIncome: number;
  totalExpenses: number;
  hasActivity: boolean;
  xSvg: number;
  xPercent: number;
  incomeYSvg: number;
  incomeYPercent: number;
  expenseYSvg: number;
  expenseYPercent: number;
}

export interface AnnualLineChartTick {
  value: number;
  label: string;
  ySvg: number;
  yPercent: number;
}

export interface AnnualLineChartGeometry {
  scaleMax: number;
  ticks: AnnualLineChartTick[];
  points: AnnualLinePoint[];
  incomeLinePath: string;
  expenseLinePath: string;
  incomeAreaPath: string;
  expenseAreaPath: string;
  baselineYSvg: number;
}

/**
 * Rounds a raw peak monetary value up to a clean, human-readable chart ceiling
 * (1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10 × 10^n) so Y-axis ticks stay evenly spaced and clean.
 */
export function computeNiceScaleMax(rawPeak: number): number {
  if (!Number.isFinite(rawPeak) || rawPeak <= 0) return 100;

  const exponent = Math.floor(Math.log10(rawPeak));
  const magnitude = Math.pow(10, exponent);
  const normalized = rawPeak / magnitude;

  const niceSteps = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  for (const step of niceSteps) {
    if (normalized <= step + 1e-9) {
      return Math.round(step * magnitude);
    }
  }
  return Math.round(10 * magnitude);
}

/**
 * Formats Y-axis tick amounts concisely in Spanish locale (e.g. 0 €, 2,5k €, 5.000 €).
 */
export function formatAxisTickEUR(value: number): string {
  const safe = Math.max(0, Math.round(value));
  if (safe === 0) return '0 €';
  if (safe >= 10000) {
    const k = safe / 1000;
    const formatted = Number.isInteger(k)
      ? String(k)
      : k.toFixed(1).replace('.', ',');
    return `${formatted}k €`;
  }
  const intStr = String(safe).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${intStr} €`;
}

function buildPolylinePath(coords: Array<{ x: number; y: number }>): string {
  if (coords.length === 0) return '';
  return coords
    .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`)
    .join(' ');
}

function buildAreaPath(
  coords: Array<{ x: number; y: number }>,
  baselineY: number
): string {
  if (coords.length === 0) return '';
  const first = coords[0];
  const last = coords[coords.length - 1];
  const linePart = buildPolylinePath(coords);
  return `${linePart} L ${last.x.toFixed(2)} ${baselineY.toFixed(2)} L ${first.x.toFixed(2)} ${baselineY.toFixed(2)} Z`;
}

/**
 * Computes deterministic SVG paths, Y-axis ticks, and percentage coordinates for
 * the 12-month annual Income vs Expense line chart.
 */
export function buildAnnualLineChartGeometry(
  monthlyPoints: AnnualMonthPoint[]
): AnnualLineChartGeometry {
  let rawPeak = 0;
  for (const pt of monthlyPoints) {
    if (pt.totalIncome > rawPeak) rawPeak = pt.totalIncome;
    if (pt.totalExpenses > rawPeak) rawPeak = pt.totalExpenses;
  }

  const scaleMax = computeNiceScaleMax(rawPeak);
  const innerHeight =
    LINE_CHART_VIEWBOX_HEIGHT - LINE_CHART_PAD_TOP - LINE_CHART_PAD_BOTTOM;
  const baselineYSvg = LINE_CHART_PAD_TOP + innerHeight;

  const valueToYSvg = (val: number): number => {
    const clamped = Math.max(0, Math.min(scaleMax, val));
    const ratio = scaleMax > 0 ? clamped / scaleMax : 0;
    return LINE_CHART_PAD_TOP + (1 - ratio) * innerHeight;
  };

  const count = Math.max(monthlyPoints.length, 1);

  const points: AnnualLinePoint[] = monthlyPoints.map((pt, idx) => {
    const xFraction = (idx + 0.5) / count;
    const xSvg = xFraction * LINE_CHART_VIEWBOX_WIDTH;
    const xPercent = xFraction * 100;

    const incomeYSvg = valueToYSvg(pt.totalIncome);
    const expenseYSvg = valueToYSvg(pt.totalExpenses);

    return {
      monthIndex: pt.monthIndex,
      monthName: pt.monthName,
      shortLabel: pt.shortLabel,
      totalIncome: pt.totalIncome,
      totalExpenses: pt.totalExpenses,
      hasActivity: pt.transactionCount > 0,
      xSvg,
      xPercent,
      incomeYSvg,
      incomeYPercent: (incomeYSvg / LINE_CHART_VIEWBOX_HEIGHT) * 100,
      expenseYSvg,
      expenseYPercent: (expenseYSvg / LINE_CHART_VIEWBOX_HEIGHT) * 100,
    };
  });

  const tickValues = [scaleMax, scaleMax / 2, 0];
  const ticks: AnnualLineChartTick[] = tickValues.map((val) => {
    const ySvg = valueToYSvg(val);
    return {
      value: val,
      label: formatAxisTickEUR(val),
      ySvg,
      yPercent: (ySvg / LINE_CHART_VIEWBOX_HEIGHT) * 100,
    };
  });

  const incomeCoords = points.map((p) => ({ x: p.xSvg, y: p.incomeYSvg }));
  const expenseCoords = points.map((p) => ({ x: p.xSvg, y: p.expenseYSvg }));

  return {
    scaleMax,
    ticks,
    points,
    incomeLinePath: buildPolylinePath(incomeCoords),
    expenseLinePath: buildPolylinePath(expenseCoords),
    incomeAreaPath: buildAreaPath(incomeCoords, baselineYSvg),
    expenseAreaPath: buildAreaPath(expenseCoords, baselineYSvg),
    baselineYSvg,
  };
}

export type AnnualFlowKey = 'income' | 'expense';

export interface IncomeExpenseDonutItem {
  key: AnnualFlowKey;
  label: string;
  shortLabel: string;
  total: number;
  percentage: number;
  color: string;
}

export interface IncomeExpenseDonutSegment extends IncomeExpenseDonutItem {
  strokeDasharray: string;
  strokeDashoffset: number;
}

export interface IncomeExpenseDonutGeometry {
  totalFlow: number;
  items: IncomeExpenseDonutItem[];
  segments: IncomeExpenseDonutSegment[];
}

/**
 * Computes deterministic percentages and SVG ring segments comparing annual
 * income vs expenses using the same donut geometry as the category breakdown.
 */
export function buildIncomeExpenseDonutSegments(
  totalIncome: number,
  totalExpenses: number,
  radius = 78
): IncomeExpenseDonutGeometry {
  const safeIncome = Number.isFinite(totalIncome) && totalIncome > 0 ? totalIncome : 0;
  const safeExpenses = Number.isFinite(totalExpenses) && totalExpenses > 0 ? totalExpenses : 0;
  const totalFlow = Math.round((safeIncome + safeExpenses) * 100) / 100;

  let incomePct = 0;
  let expensePct = 0;

  if (totalFlow > 0) {
    if (safeIncome > 0 && safeExpenses > 0) {
      incomePct = Math.round((safeIncome / totalFlow) * 1000) / 10;
      expensePct = Math.round((100 - incomePct) * 10) / 10;
    } else if (safeIncome > 0) {
      incomePct = 100;
      expensePct = 0;
    } else {
      incomePct = 0;
      expensePct = 100;
    }
  }

  const items: IncomeExpenseDonutItem[] = [
    {
      key: 'income',
      label: 'Ingresos anuales',
      shortLabel: 'Ingresos',
      total: safeIncome,
      percentage: incomePct,
      color: '#10B981',
    },
    {
      key: 'expense',
      label: 'Gastos anuales',
      shortLabel: 'Gastos',
      total: safeExpenses,
      percentage: expensePct,
      color: '#F43F5E',
    },
  ];

  const activeItems = items.filter((item) => item.total > 0);
  if (activeItems.length === 0) {
    return { totalFlow: 0, items, segments: [] };
  }

  const circumference = 2 * Math.PI * radius;
  const segmentGap = activeItems.length > 1 ? 2 : 0;
  let accumulatedPercent = 0;

  const segments: IncomeExpenseDonutSegment[] = activeItems.map((item) => {
    const length = (item.percentage / 100) * circumference;
    const rawOffset = -((accumulatedPercent / 100) * circumference);
    const offset = rawOffset === 0 ? 0 : rawOffset;
    accumulatedPercent += item.percentage;
    return {
      ...item,
      strokeDasharray: `${Math.max(0, length - segmentGap)} ${circumference}`,
      strokeDashoffset: offset,
    };
  });

  return { totalFlow, items, segments };
}

export type AnnualSavingsBarStatus = 'achieved' | 'below' | 'deficit' | 'empty';

export interface AnnualSavingsBarItem {
  monthIndex: number;
  monthName: string;
  shortLabel: string;
  hasIncome: boolean;
  hasActivity: boolean;
  actualRate: number;
  savedAmount: number;
  targetAmount: number;
  remainingToGoal: number;
  achieved: boolean;
  status: AnnualSavingsBarStatus;
  barHeightPercent: number;
}

export interface AnnualSavingsBarChartGeometry {
  targetPercent: number;
  maxRate: number;
  targetLineBottomPercent: number;
  bars: AnnualSavingsBarItem[];
}

/**
 * Computes normalized bar heights, target threshold line position, and per-month
 * achievement statuses for the 12-month vertical savings goal bar chart.
 */
export function buildAnnualSavingsBarChart(
  monthlyPoints: AnnualMonthPoint[],
  targetPercent = 20
): AnnualSavingsBarChartGeometry {
  const safeTarget = Math.max(1, Math.min(100, targetPercent));

  let maxPositiveRate = 0;
  for (const pt of monthlyPoints) {
    if (pt.totalIncome > 0 && pt.savingsGoal.actualRate > maxPositiveRate) {
      maxPositiveRate = pt.savingsGoal.actualRate;
    }
  }

  // Pick a clean ceiling above both the target line and the highest monthly savings rate
  const rawCeiling = Math.max(safeTarget * 1.5, maxPositiveRate * 1.12, 40);
  const cleanSteps = [40, 50, 60, 75, 80, 100];
  let maxRate = 100;
  for (const step of cleanSteps) {
    if (rawCeiling <= step) {
      maxRate = step;
      break;
    }
  }
  if (rawCeiling > 100) {
    maxRate = Math.ceil(rawCeiling / 20) * 20;
  }

  const targetLineBottomPercent = Math.min(95, (safeTarget / maxRate) * 100);

  const bars: AnnualSavingsBarItem[] = monthlyPoints.map((pt) => {
    const hasIncome = pt.totalIncome > 0;
    const hasActivity = pt.transactionCount > 0;
    const g = pt.savingsGoal;

    let status: AnnualSavingsBarStatus = 'empty';
    if (hasIncome) {
      if (g.achieved) {
        status = 'achieved';
      } else if (g.actualRate < 0) {
        status = 'deficit';
      } else {
        status = 'below';
      }
    } else if (pt.totalExpenses > 0) {
      status = 'deficit';
    }

    const barHeightPercent =
      hasIncome && g.actualRate > 0
        ? Math.min(100, Math.max(4, (g.actualRate / maxRate) * 100))
        : 0;

    return {
      monthIndex: pt.monthIndex,
      monthName: pt.monthName,
      shortLabel: pt.shortLabel,
      hasIncome,
      hasActivity,
      actualRate: g.actualRate,
      savedAmount: g.savedAmount,
      targetAmount: g.targetAmount,
      remainingToGoal: g.remainingToGoal,
      achieved: g.achieved,
      status,
      barHeightPercent,
    };
  });

  return {
    targetPercent: safeTarget,
    maxRate,
    targetLineBottomPercent,
    bars,
  };
}


