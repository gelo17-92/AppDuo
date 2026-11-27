import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAnnualLineChartGeometry,
  buildAnnualSavingsBarChart,
  buildIncomeExpenseDonutSegments,
  computeNiceScaleMax,
  formatAxisTickEUR,
  LINE_CHART_PAD_TOP,
  LINE_CHART_VIEWBOX_HEIGHT,
  LINE_CHART_VIEWBOX_WIDTH,
} from './annualLineChart';
import { calculateAnnualSummary } from './financeMath';
import { SEED_TRANSACTIONS } from '../data/seedData';

test('computeNiceScaleMax rounds peaks up to clean human-readable ceilings', () => {
  assert.equal(computeNiceScaleMax(0), 100);
  assert.equal(computeNiceScaleMax(-20), 100);
  assert.equal(computeNiceScaleMax(4730), 5000);
  assert.equal(computeNiceScaleMax(2000), 2000);
  assert.equal(computeNiceScaleMax(2001), 2500);
  assert.equal(computeNiceScaleMax(11400), 15000);
});

test('formatAxisTickEUR formats axis labels concisely in Spanish euro notation', () => {
  assert.equal(formatAxisTickEUR(0), '0 €');
  assert.equal(formatAxisTickEUR(2500), '2.500 €');
  assert.equal(formatAxisTickEUR(5000), '5.000 €');
  assert.equal(formatAxisTickEUR(12500), '12,5k €');
  assert.equal(formatAxisTickEUR(20000), '20k €');
});

test('buildAnnualLineChartGeometry maps all 12 months accurately within viewBox bounds', () => {
  const annual = calculateAnnualSummary(SEED_TRANSACTIONS, 2026, 20);
  const geom = buildAnnualLineChartGeometry(annual.monthlyPoints);

  assert.equal(geom.scaleMax, 5000);
  assert.equal(geom.points.length, 12);
  assert.equal(geom.ticks.length, 3);
  assert.deepEqual(
    geom.ticks.map((t) => t.label),
    ['5.000 €', '2.500 €', '0 €']
  );

  // X positions align with the centers of 12 equal columns
  assert.ok(Math.abs(geom.points[0].xSvg - LINE_CHART_VIEWBOX_WIDTH / 24) < 0.01);
  assert.ok(Math.abs(geom.points[11].xPercent - (11.5 / 12) * 100) < 0.01);

  // Zero months sit exactly on baselineYSvg
  assert.equal(geom.points[0].incomeYSvg, geom.baselineYSvg);
  assert.equal(geom.points[0].expenseYSvg, geom.baselineYSvg);

  // Active month (Noviembre = index 10): income 4730 > expenses 1998.7, so incomeY < expenseY (higher on chart)
  const nov = geom.points[10];
  assert.equal(nov.hasActivity, true);
  assert.ok(nov.incomeYSvg >= LINE_CHART_PAD_TOP && nov.incomeYSvg < nov.expenseYSvg);
  assert.ok(nov.expenseYSvg < geom.baselineYSvg);
  assert.ok(nov.incomeYPercent > 0 && nov.incomeYPercent < 100);
  assert.ok(geom.baselineYSvg < LINE_CHART_VIEWBOX_HEIGHT);

  // Valid SVG path syntax for lines and closed areas
  assert.ok(geom.incomeLinePath.startsWith('M '));
  assert.ok(geom.expenseLinePath.startsWith('M '));
  assert.equal(geom.incomeLinePath.split(' L ').length, 12);
  assert.ok(geom.incomeAreaPath.endsWith(' Z'));
  assert.ok(geom.expenseAreaPath.endsWith(' Z'));
});

test('buildIncomeExpenseDonutSegments splits income and expenses accurately and handles edge cases', () => {
  const split = buildIncomeExpenseDonutSegments(14190, 9680.7, 78);
  assert.equal(split.totalFlow, 23870.7);
  assert.equal(split.items.length, 2);
  assert.equal(split.segments.length, 2);
  assert.equal(split.items[0].key, 'income');
  assert.equal(split.items[1].key, 'expense');
  assert.equal(Math.round((split.items[0].percentage + split.items[1].percentage) * 10) / 10, 100);
  assert.equal(split.items[0].percentage, 59.4);
  assert.equal(split.items[1].percentage, 40.6);
  assert.equal(split.segments[0].strokeDashoffset, 0);
  assert.ok(split.segments[1].strokeDashoffset < 0);

  // Single-sided income only -> 1 full closed segment with zero gap
  const incomeOnly = buildIncomeExpenseDonutSegments(3000, 0, 78);
  assert.equal(incomeOnly.segments.length, 1);
  assert.equal(incomeOnly.segments[0].key, 'income');
  assert.equal(incomeOnly.segments[0].percentage, 100);
  const fullCirc = 2 * Math.PI * 78;
  assert.equal(incomeOnly.segments[0].strokeDasharray, `${fullCirc} ${fullCirc}`);

  // Single-sided expense only -> 1 full closed segment
  const expenseOnly = buildIncomeExpenseDonutSegments(0, 1200, 78);
  assert.equal(expenseOnly.segments.length, 1);
  assert.equal(expenseOnly.segments[0].key, 'expense');
  assert.equal(expenseOnly.segments[0].percentage, 100);

  // Zero / negative inputs -> 0 segments, both items at 0%
  const empty = buildIncomeExpenseDonutSegments(0, -50, 78);
  assert.equal(empty.totalFlow, 0);
  assert.equal(empty.segments.length, 0);
  assert.equal(empty.items[0].percentage, 0);
  assert.equal(empty.items[1].percentage, 0);
});

test('buildAnnualSavingsBarChart classifies achieved, below-target, and empty months against target line', () => {
  const annual = calculateAnnualSummary(SEED_TRANSACTIONS, 2026, 20);
  const chart = buildAnnualSavingsBarChart(annual.monthlyPoints, 20);

  assert.equal(chart.bars.length, 12);
  assert.equal(chart.targetPercent, 20);
  assert.ok(chart.maxRate >= 60);
  assert.ok(chart.targetLineBottomPercent > 0 && chart.targetLineBottomPercent < 100);

  // Enero (0) has no activity -> empty
  assert.equal(chart.bars[0].status, 'empty');
  assert.equal(chart.bars[0].barHeightPercent, 0);

  // Septiembre (8) -> achieved (~24.1% >= 20%)
  assert.equal(chart.bars[8].status, 'achieved');
  assert.equal(chart.bars[8].achieved, true);
  assert.ok(chart.bars[8].barHeightPercent > chart.targetLineBottomPercent);

  // Octubre (9) -> positive but below 20% (~16.0%)
  assert.equal(chart.bars[9].status, 'below');
  assert.equal(chart.bars[9].achieved, false);
  assert.ok(chart.bars[9].barHeightPercent > 0);
  assert.ok(chart.bars[9].barHeightPercent < chart.targetLineBottomPercent);

  // Noviembre (10) -> achieved (>50% >= 20%)
  assert.equal(chart.bars[10].status, 'achieved');
  assert.equal(chart.bars[10].achieved, true);
  assert.ok(chart.bars[10].barHeightPercent > chart.targetLineBottomPercent);
});


