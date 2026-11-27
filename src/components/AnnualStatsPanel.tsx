import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Calendar, Target } from 'lucide-react';
import type { Category, Transaction } from '../types/finance';
import {
  calculateAnnualSummary,
  calculateCategoryBreakdown,
  filterTransactionsByYear,
  formatEUR,
} from '../utils/financeMath';
import {
  buildAnnualLineChartGeometry,
  buildAnnualSavingsBarChart,
  buildIncomeExpenseDonutSegments,
  LINE_CHART_VIEWBOX_HEIGHT,
  LINE_CHART_VIEWBOX_WIDTH,
  type AnnualFlowKey,
} from '../utils/annualLineChart';

interface AnnualStatsPanelProps {
  selectedYear: number;
  selectedMonth: number;
  savingsGoalPercent: number;
  allTransactions: Transaction[];
  categories: Category[];
  onOpenMonthDetail: (year: number, monthIndex: number) => void;
}

export const AnnualStatsPanel: React.FC<AnnualStatsPanelProps> = ({
  selectedYear,
  selectedMonth,
  savingsGoalPercent,
  allTransactions,
  categories,
  onOpenMonthDetail,
}) => {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedAnnualFlow, setSelectedAnnualFlow] = useState<AnnualFlowKey | null>(null);

  const yearlyTransactions = useMemo(
    () => filterTransactionsByYear(allTransactions, selectedYear),
    [allTransactions, selectedYear]
  );

  const annual = useMemo(
    () => calculateAnnualSummary(allTransactions, selectedYear, savingsGoalPercent),
    [allTransactions, selectedYear, savingsGoalPercent]
  );

  const defaultInspectedMonth = useMemo(() => {
    if (annual.monthlyPoints[selectedMonth]?.transactionCount > 0) {
      return selectedMonth;
    }
    for (let i = 11; i >= 0; i--) {
      if (annual.monthlyPoints[i].transactionCount > 0) return i;
    }
    return selectedMonth;
  }, [annual.monthlyPoints, selectedMonth]);

  const [inspectedMonthIndex, setInspectedMonthIndex] = useState<number>(defaultInspectedMonth);
  const [selectedSavingsMonthIndex, setSelectedSavingsMonthIndex] =
    useState<number>(defaultInspectedMonth);

  useEffect(() => {
    setInspectedMonthIndex(defaultInspectedMonth);
    setSelectedSavingsMonthIndex(defaultInspectedMonth);
    setSelectedCategoryId(null);
    setSelectedAnnualFlow(null);
  }, [selectedYear, defaultInspectedMonth]);

  const breakdown = useMemo(
    () => calculateCategoryBreakdown(yearlyTransactions, categories),
    [yearlyTransactions, categories]
  );

  const selectedCategory = breakdown.find((b) => b.categoryId === selectedCategoryId) ?? null;
  const inspectedPoint = annual.monthlyPoints[inspectedMonthIndex] ?? annual.monthlyPoints[0];

  // 12-month line chart geometry
  const lineGeometry = useMemo(
    () => buildAnnualLineChartGeometry(annual.monthlyPoints),
    [annual.monthlyPoints]
  );

  // Annual Donut SVG geometry
  const radius = 78;
  const circumference = 2 * Math.PI * radius;

  const donutSegments = useMemo(() => {
    let accumulatedPercent = 0;
    return breakdown.map((item) => {
      const length = (item.percentage / 100) * circumference;
      const offset = -((accumulatedPercent / 100) * circumference);
      accumulatedPercent += item.percentage;
      return {
        ...item,
        strokeDasharray: `${Math.max(0, length - 2)} ${circumference}`,
        strokeDashoffset: offset,
      };
    });
  }, [breakdown, circumference]);

  const annualFlowDonut = useMemo(
    () => buildIncomeExpenseDonutSegments(annual.totalIncome, annual.totalExpenses, radius),
    [annual.totalIncome, annual.totalExpenses, radius]
  );

  const selectedFlowItem =
    annualFlowDonut.items.find((item) => item.key === selectedAnnualFlow) ?? null;

  const savingsBarChart = useMemo(
    () => buildAnnualSavingsBarChart(annual.monthlyPoints, savingsGoalPercent),
    [annual.monthlyPoints, savingsGoalPercent]
  );

  const inspectedSavingsBar =
    savingsBarChart.bars[selectedSavingsMonthIndex] ?? savingsBarChart.bars[0];

  if (annual.transactionCount === 0) {
    return (
      <section
        aria-labelledby="annual-empty-heading"
        className="rounded-3xl bg-white dark:bg-[#131922] border border-slate-200/80 dark:border-white/[0.08] p-8 sm:p-12 text-center space-y-3"
      >
        <div className="mx-auto w-12 h-12 rounded-2xl bg-slate-100 dark:bg-white/[0.06] flex items-center justify-center text-slate-400">
          <Calendar className="w-6 h-6" aria-hidden="true" />
        </div>
        <h2
          id="annual-empty-heading"
          className="text-base font-semibold text-slate-900 dark:text-white"
        >
          Sin movimientos registrados en {selectedYear}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
          Cuando registres ingresos o gastos en {selectedYear}, aquí verás el balance anual completo,
          la evolución de los 12 meses y el desglose por categorías.
        </p>
      </section>
    );
  }

  const annualGoal = annual.savingsGoal;

  return (
    <div className="space-y-6" data-testid="annual-stats-panel">
      {/* 1. Annual Hero KPI Strip + Annual Savings Goal Bar */}
      <section
        aria-labelledby="annual-summary-heading"
        className="rounded-3xl bg-white dark:bg-[#131922] border border-slate-200/80 dark:border-white/[0.08] p-5 sm:p-6 space-y-6"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2
              id="annual-summary-heading"
              className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white"
            >
              Resumen anual {selectedYear}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {annual.activeMonthsCount}{' '}
              {annual.activeMonthsCount === 1 ? 'mes con actividad' : 'meses con actividad'}
              <span aria-hidden="true"> · </span>
              {annual.transactionCount}{' '}
              {annual.transactionCount === 1 ? 'movimiento' : 'movimientos'}
            </p>
          </div>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Objetivo de ahorro: {savingsGoalPercent}%
          </span>
        </div>

        {/* 4-Column KPI Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Ingresos anuales
            </p>
            <p
              data-testid="annual-total-income"
              className="text-lg sm:text-xl font-bold font-num text-emerald-600 dark:text-emerald-400"
            >
              {formatEUR(annual.totalIncome)}
            </p>
            <p className="text-[11px] font-num text-slate-500 dark:text-slate-400">
              Media {formatEUR(annual.avgMonthlyIncome)}/mes
            </p>
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Gastos anuales
            </p>
            <p
              data-testid="annual-total-expenses"
              className="text-lg sm:text-xl font-bold font-num text-rose-600 dark:text-rose-400"
            >
              {formatEUR(annual.totalExpenses)}
            </p>
            <p className="text-[11px] font-num text-slate-500 dark:text-slate-400">
              Media {formatEUR(annual.avgMonthlyExpense)}/mes
            </p>
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Ahorro neto {selectedYear}
            </p>
            <p
              data-testid="annual-net-balance"
              className={`text-lg sm:text-xl font-bold font-num ${
                annual.annualBalance >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {formatEUR(annual.annualBalance, { showSign: true })}
            </p>
            <p className="text-[11px] font-num text-slate-500 dark:text-slate-400">
              Tasa anual {annualGoal.actualRate.toFixed(1).replace('.', ',')}%
            </p>
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Meses en objetivo
            </p>
            <p
              data-testid="annual-goal-months"
              className="text-lg sm:text-xl font-bold font-num text-slate-900 dark:text-white"
            >
              {annual.goalAchievedMonthsCount} de {annual.monthsWithIncomeCount}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Cumpliendo el {savingsGoalPercent}% mensual
            </p>
          </div>
        </div>

        {/* Annual Income vs Expenses Donut Chart (same ring style as category breakdown) */}
        <div
          data-testid="annual-summary-donut"
          className="pt-5 border-t border-slate-100 dark:border-white/[0.06] flex flex-col sm:flex-row items-center gap-6 sm:gap-8"
        >
          <div className="relative w-44 h-44 shrink-0">
            <svg
              viewBox="0 0 200 200"
              className="w-full h-full -rotate-90"
              role="img"
              aria-label={`Gráfico circular de ingresos frente a gastos en ${selectedYear}`}
            >
              <circle
                cx="100"
                cy="100"
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth="22"
                className="text-slate-100 dark:text-white/[0.06]"
              />
              {annualFlowDonut.segments.map((seg) => {
                const isSelected = selectedAnnualFlow === seg.key;
                const isDimmed = selectedAnnualFlow !== null && !isSelected;
                return (
                  <circle
                    key={seg.key}
                    data-testid={`annual-donut-slice-${seg.key}`}
                    cx="100"
                    cy="100"
                    r={radius}
                    fill="none"
                    stroke={seg.color}
                    strokeWidth={isSelected ? 26 : 22}
                    strokeDasharray={seg.strokeDasharray}
                    strokeDashoffset={seg.strokeDashoffset}
                    strokeLinecap="butt"
                    opacity={isDimmed ? 0.32 : 1}
                    className="transition-all duration-200 cursor-pointer"
                    onClick={() =>
                      setSelectedAnnualFlow((prev) => (prev === seg.key ? null : seg.key))
                    }
                  />
                );
              })}
            </svg>

            <div
              data-testid="annual-donut-center"
              className="absolute inset-0 flex flex-col items-center justify-center text-center px-5 pointer-events-none"
            >
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate max-w-full">
                {selectedFlowItem ? selectedFlowItem.shortLabel : `Balance ${selectedYear}`}
              </span>
              <span
                className={`mt-0.5 text-lg font-bold font-num ${
                  selectedFlowItem
                    ? 'text-slate-900 dark:text-white'
                    : annual.annualBalance >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {selectedFlowItem
                  ? formatEUR(selectedFlowItem.total)
                  : formatEUR(annual.annualBalance, { showSign: true })}
              </span>
              <span
                className={`text-xs font-num font-medium ${
                  selectedFlowItem
                    ? selectedFlowItem.key === 'income'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {selectedFlowItem
                  ? `${selectedFlowItem.percentage.toFixed(1).replace('.', ',')}%`
                  : `Ahorro ${annualGoal.actualRate.toFixed(1).replace('.', ',')}%`}
              </span>
            </div>
          </div>

          <div className="w-full min-w-0 flex-1 space-y-2">
            <div className="px-1">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Ingresos vs gastos anuales
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Pulsa un segmento para inspeccionar su peso en {selectedYear}
              </p>
            </div>
            <ul className="w-full min-w-0 space-y-1.5">
              {annualFlowDonut.items.map((item) => {
                const active = selectedAnnualFlow === item.key;
                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      data-testid={`annual-donut-legend-${item.key}`}
                      aria-pressed={active}
                      onClick={() =>
                        setSelectedAnnualFlow((prev) => (prev === item.key ? null : item.key))
                      }
                      className={`w-full flex items-center justify-between gap-2 px-3 py-2 min-h-[44px] rounded-xl text-left transition-colors ${
                        active
                          ? 'bg-slate-100 dark:bg-white/[0.08]'
                          : 'hover:bg-slate-50 dark:hover:bg-white/[0.03]'
                      }`}
                    >
                      <span className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: item.color }}
                          aria-hidden="true"
                        />
                        <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                          {item.label}
                        </span>
                      </span>
                      <span className="text-xs font-num text-slate-600 dark:text-slate-300 whitespace-nowrap shrink-0">
                        <strong className="font-semibold text-slate-900 dark:text-white">
                          {formatEUR(item.total)}
                        </strong>
                        <span className="text-slate-400 dark:text-slate-500 ml-1.5">
                          {item.percentage.toFixed(1).replace('.', ',')}%
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* Annual Savings Goal Status + 12-Month Vertical Bar Chart */}
        <div className="pt-5 border-t border-slate-100 dark:border-white/[0.06] space-y-4">
          {/* Header & Annual Target Status */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Target
                  className={`w-4 h-4 shrink-0 ${
                    annualGoal.achieved ? 'text-emerald-500' : 'text-sky-500'
                  }`}
                  aria-hidden="true"
                />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <span>Meta de ahorro anual ({savingsGoalPercent}%)</span>
                  {annualGoal.achieved && (
                    <span
                      data-testid="annual-savings-goal-celebration"
                      role="img"
                      aria-label="Meta de ahorro anual alcanzada"
                      className="text-sm leading-none shrink-0"
                    >
                      🎉
                    </span>
                  )}
                </h3>
              </div>
              <p
                data-testid="annual-savings-status"
                className={`text-xs font-medium ${
                  annual.totalIncome <= 0
                    ? 'text-slate-500 dark:text-slate-400'
                    : annualGoal.achieved
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : annualGoal.savedAmount >= 0
                        ? 'text-sky-600 dark:text-sky-400'
                        : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {annual.totalIncome <= 0
                  ? `Sin ingresos registrados en ${selectedYear}`
                  : annualGoal.achieved
                    ? `Dentro del objetivo anual (${annualGoal.actualRate
                        .toFixed(1)
                        .replace('.', ',')}% frente al ${savingsGoalPercent}% marcado)`
                    : annualGoal.savedAmount >= 0
                      ? `Por debajo del objetivo anual (${annualGoal.actualRate
                          .toFixed(1)
                          .replace('.', ',')}% · faltan ${formatEUR(annualGoal.remainingToGoal)})`
                      : `Fuera del objetivo anual (balance negativo en ${selectedYear})`}
              </p>
            </div>

            <div className="text-right font-num text-xs shrink-0">
              <p className="font-semibold whitespace-nowrap">
                <span
                  className={
                    annualGoal.achieved
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : annualGoal.savedAmount < 0
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-sky-600 dark:text-sky-400'
                  }
                >
                  {formatEUR(annualGoal.savedAmount)}
                </span>
                <span className="text-slate-400 dark:text-slate-500 font-normal ml-1">
                  / {formatEUR(annualGoal.targetAmount)}
                </span>
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {annual.goalAchievedMonthsCount} de {annual.monthsWithIncomeCount}{' '}
                {annual.monthsWithIncomeCount === 1 ? 'mes en objetivo' : 'meses en objetivo'}
              </p>
            </div>
          </div>

          {/* Compact Annual Progress Bar */}
          <div
            role="progressbar"
            aria-label={`Progreso anual de ahorro en ${selectedYear}`}
            aria-valuenow={Math.round(annualGoal.progressPercent)}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-white/[0.06] overflow-hidden"
          >
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                annualGoal.achieved
                  ? 'bg-emerald-500'
                  : annualGoal.savedAmount < 0
                    ? 'bg-rose-500'
                    : 'bg-sky-500'
              }`}
              style={{ width: `${annualGoal.progressPercent}%` }}
            />
          </div>

          {/* 12-Month Vertical Savings Goal Bar Chart */}
          <div data-testid="annual-savings-bar-chart" className="pt-2 space-y-3">
            {/* Compact Legend */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 shrink-0" aria-hidden="true" />
                  <span>Objetivo alcanzado</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-sky-500/80 shrink-0" aria-hidden="true" />
                  <span>Por debajo</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-rose-500 shrink-0" aria-hidden="true" />
                  <span>Negativo</span>
                </span>
              </div>
              <span className="inline-flex items-center gap-1.5 font-num font-medium text-emerald-600 dark:text-emerald-400">
                <span
                  className="w-4 border-t-2 border-dashed border-emerald-500 shrink-0"
                  aria-hidden="true"
                />
                <span>Meta {savingsGoalPercent}%</span>
              </span>
            </div>

            {/* Plot Area + Y-Axis */}
            <div className="flex items-stretch gap-2 sm:gap-3">
              {/* Y-Axis Scale Labels */}
              <div
                aria-hidden="true"
                className="relative w-9 sm:w-10 shrink-0 h-36 sm:h-40 select-none text-[10px] font-num"
              >
                <span className="absolute right-0 top-0 -translate-y-1/2 text-slate-400 dark:text-slate-500">
                  {savingsBarChart.maxRate}%
                </span>
                <span
                  style={{ bottom: `${savingsBarChart.targetLineBottomPercent}%` }}
                  className="absolute right-0 translate-y-1/2 font-semibold text-emerald-600 dark:text-emerald-400"
                >
                  {savingsGoalPercent}%
                </span>
                <span className="absolute right-0 bottom-0 translate-y-1/2 text-slate-400 dark:text-slate-500">
                  0%
                </span>
              </div>

              {/* Vertical Bars + Dashed Target Threshold Line */}
              <div className="flex-1 min-w-0">
                <div className="relative h-36 sm:h-40 w-full border-b border-slate-200 dark:border-white/[0.12]">
                  {/* Top subtle guide */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-slate-200/70 dark:border-white/[0.06]"
                  />

                  {/* Dashed Horizontal Target Line */}
                  <div
                    data-testid="annual-savings-target-line"
                    aria-hidden="true"
                    style={{ bottom: `${savingsBarChart.targetLineBottomPercent}%` }}
                    className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-dashed border-emerald-500/80 dark:border-emerald-400/80"
                  />

                  {/* 12 Interactive Vertical Bar Columns */}
                  <div
                    role="group"
                    aria-label={`Ahorro mensual respecto al objetivo del ${savingsGoalPercent}% en ${selectedYear}`}
                    className="relative z-20 grid grid-cols-12 gap-1 sm:gap-2 h-full w-full items-end"
                  >
                    {savingsBarChart.bars.map((bar) => {
                      const isSelected = selectedSavingsMonthIndex === bar.monthIndex;
                      const barColorClass =
                        bar.status === 'achieved'
                          ? 'bg-emerald-500'
                          : bar.status === 'below'
                            ? 'bg-sky-500/85'
                            : bar.status === 'deficit'
                              ? 'bg-rose-500'
                              : 'bg-slate-200 dark:bg-white/[0.08]';

                      const barHeightStyle =
                        bar.status === 'deficit'
                          ? { height: '6px' }
                          : bar.status === 'empty'
                            ? { height: '3px' }
                            : { height: `${bar.barHeightPercent}%` };

                      return (
                        <button
                          key={bar.monthIndex}
                          type="button"
                          data-testid={`annual-savings-bar-${bar.monthIndex}`}
                          data-status={bar.status}
                          aria-pressed={isSelected}
                          aria-label={`${bar.monthName} ${selectedYear}: ${
                            bar.hasIncome
                              ? `${bar.actualRate.toFixed(1).replace('.', ',')}% de ahorro, ${
                                  bar.achieved
                                    ? 'objetivo alcanzado'
                                    : 'por debajo del objetivo'
                                }`
                              : bar.status === 'deficit'
                                ? 'balance negativo'
                                : 'sin ingresos'
                          }`}
                          onClick={() => setSelectedSavingsMonthIndex(bar.monthIndex)}
                          className={`group h-full flex flex-col justify-end items-center px-0.5 sm:px-1 rounded-t-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 ${
                            isSelected
                              ? 'bg-slate-900/[0.04] dark:bg-white/[0.05]'
                              : 'hover:bg-slate-900/[0.025] dark:hover:bg-white/[0.03]'
                          }`}
                        >
                          <span
                            style={barHeightStyle}
                            className={`w-full max-w-[26px] rounded-t-md transition-all duration-300 ${barColorClass} ${
                              isSelected
                                ? 'ring-2 ring-offset-1 ring-offset-white dark:ring-offset-[#131922] ring-slate-900/20 dark:ring-white/30'
                                : ''
                            }`}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* X-Axis Month Labels */}
                <div className="mt-1.5 grid grid-cols-12 gap-1 sm:gap-2">
                  {savingsBarChart.bars.map((bar) => {
                    const isSelected = selectedSavingsMonthIndex === bar.monthIndex;
                    return (
                      <button
                        key={bar.monthIndex}
                        type="button"
                        tabIndex={-1}
                        aria-hidden="true"
                        onClick={() => setSelectedSavingsMonthIndex(bar.monthIndex)}
                        className={`min-h-[26px] flex items-center justify-center rounded-md text-[11px] font-semibold leading-none whitespace-nowrap transition-colors ${
                          isSelected
                            ? 'bg-slate-100 dark:bg-white/[0.1] text-slate-900 dark:text-white'
                            : bar.achieved
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : bar.status === 'deficit'
                                ? 'text-rose-500 dark:text-rose-400'
                                : bar.hasActivity
                                  ? 'text-slate-700 dark:text-slate-300'
                                  : 'text-slate-400 dark:text-slate-500'
                        }`}
                      >
                        <span className="sm:hidden">{bar.shortLabel.slice(0, 1)}</span>
                        <span className="hidden sm:inline">{bar.shortLabel}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Selected Month Savings Detail Readout */}
            {inspectedSavingsBar && (
              <div
                data-testid="annual-savings-bar-detail"
                className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-white/[0.06] text-xs"
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {inspectedSavingsBar.monthName} {selectedYear}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">
                    {inspectedSavingsBar.hasIncome
                      ? inspectedSavingsBar.achieved
                        ? `Objetivo alcanzado (${inspectedSavingsBar.actualRate
                            .toFixed(1)
                            .replace('.', ',')}%) 🎉`
                        : inspectedSavingsBar.savedAmount >= 0
                          ? `${inspectedSavingsBar.actualRate
                              .toFixed(1)
                              .replace('.', ',')}% · Faltan ${formatEUR(
                              inspectedSavingsBar.remainingToGoal
                            )}`
                          : `Balance negativo (${inspectedSavingsBar.actualRate
                              .toFixed(1)
                              .replace('.', ',')}%)`
                      : inspectedSavingsBar.status === 'deficit'
                        ? 'Gastos sin ingresos registrados'
                        : 'Sin ingresos registrados'}
                  </span>
                </div>
                {inspectedSavingsBar.hasActivity && (
                  <span
                    className={`font-num font-semibold whitespace-nowrap ${
                      inspectedSavingsBar.savedAmount >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {formatEUR(inspectedSavingsBar.savedAmount, { showSign: true })}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 2. Interactive 12-Month Comparative Line Chart (Ene – Dic) */}
      <section
        aria-labelledby="annual-monthly-chart-heading"
        className="rounded-3xl bg-white dark:bg-[#131922] border border-slate-200/80 dark:border-white/[0.08] p-5 sm:p-6 space-y-5"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h2
              id="annual-monthly-chart-heading"
              className="text-base font-semibold text-slate-900 dark:text-white"
            >
              Ingresos y gastos por mes · {selectedYear}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Pulsa cualquier mes para consultar su detalle exacto
            </p>
          </div>

          {/* Line Chart Legend */}
          <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
            <span className="inline-flex items-center gap-1.5">
              <span className="relative inline-flex items-center w-4 h-2 shrink-0" aria-hidden="true">
                <span className="w-full h-[2.5px] rounded-full bg-emerald-500" />
                <span className="absolute left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-emerald-500" />
              </span>
              <span>Ingresos</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="relative inline-flex items-center w-4 h-2 shrink-0" aria-hidden="true">
                <span className="w-full h-[2.5px] rounded-full bg-rose-500" />
                <span className="absolute left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-rose-500" />
              </span>
              <span>Gastos</span>
            </span>
          </div>
        </div>

        {/* 12-Month Responsive Dual-Series Line Chart */}
        <div
          data-testid="annual-line-chart"
          className="pt-1 flex items-stretch gap-2 sm:gap-3"
        >
          {/* Y-Axis Scale Labels */}
          <div
            aria-hidden="true"
            className="relative w-12 sm:w-14 shrink-0 h-44 sm:h-52 select-none"
          >
            {lineGeometry.ticks.map((tick) => (
              <span
                key={tick.value}
                style={{ top: `${tick.yPercent}%` }}
                className="absolute right-0 -translate-y-1/2 text-[10px] sm:text-[11px] font-num text-slate-400 dark:text-slate-500 whitespace-nowrap leading-none"
              >
                {tick.label}
              </span>
            ))}
          </div>

          {/* Plot Canvas + Aligned 12-Month X-Axis */}
          <div className="flex-1 min-w-0">
            <div className="relative h-44 sm:h-52 w-full">
              {/* Crisp SVG Gridlines, Subtle Area Gradients, and Non-Scaling Lines */}
              <svg
                viewBox={`0 0 ${LINE_CHART_VIEWBOX_WIDTH} ${LINE_CHART_VIEWBOX_HEIGHT}`}
                preserveAspectRatio="none"
                role="img"
                aria-label={`Gráfico de líneas de ingresos y gastos mensuales en ${selectedYear}`}
                className="absolute inset-0 w-full h-full overflow-visible pointer-events-none"
              >
                <defs>
                  <linearGradient id={`annual-income-area-${selectedYear}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10B981" stopOpacity="0.18" />
                    <stop offset="100%" stopColor="#10B981" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id={`annual-expense-area-${selectedYear}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#F43F5E" stopOpacity="0.14" />
                    <stop offset="100%" stopColor="#F43F5E" stopOpacity="0" />
                  </linearGradient>
                </defs>

                {/* Horizontal Gridlines */}
                {lineGeometry.ticks.map((tick, idx) => (
                  <line
                    key={tick.value}
                    x1={0}
                    x2={LINE_CHART_VIEWBOX_WIDTH}
                    y1={tick.ySvg}
                    y2={tick.ySvg}
                    stroke="currentColor"
                    strokeWidth={1}
                    strokeDasharray={idx === lineGeometry.ticks.length - 1 ? undefined : '4 4'}
                    vectorEffect="non-scaling-stroke"
                    className={
                      idx === lineGeometry.ticks.length - 1
                        ? 'text-slate-200 dark:text-white/[0.12]'
                        : 'text-slate-200/80 dark:text-white/[0.07]'
                    }
                  />
                ))}

                {/* Subtle Area Fills */}
                <path
                  d={lineGeometry.incomeAreaPath}
                  fill={`url(#annual-income-area-${selectedYear})`}
                />
                <path
                  d={lineGeometry.expenseAreaPath}
                  fill={`url(#annual-expense-area-${selectedYear})`}
                />

                {/* Expenses Line */}
                <path
                  data-testid="annual-expense-line"
                  d={lineGeometry.expenseLinePath}
                  fill="none"
                  stroke="#F43F5E"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />

                {/* Income Line */}
                <path
                  data-testid="annual-income-line"
                  d={lineGeometry.incomeLinePath}
                  fill="none"
                  stroke="#10B981"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>

              {/* Vertical Active-Month Guide Line */}
              {lineGeometry.points[inspectedMonthIndex] && (
                <div
                  aria-hidden="true"
                  style={{
                    left: `${lineGeometry.points[inspectedMonthIndex].xPercent}%`,
                    top: `${lineGeometry.ticks[0]?.yPercent ?? 0}%`,
                    bottom: `${100 - (lineGeometry.ticks[lineGeometry.ticks.length - 1]?.yPercent ?? 100)}%`,
                  }}
                  className="pointer-events-none absolute -translate-x-1/2 w-px bg-slate-300/90 dark:bg-white/20 transition-all duration-150"
                />
              )}

              {/* True Circular Data Point Markers (never distorted across aspect ratios) */}
              {lineGeometry.points.map((pt) => {
                const isInspected = inspectedMonthIndex === pt.monthIndex;
                return (
                  <React.Fragment key={pt.monthIndex}>
                    <span
                      aria-hidden="true"
                      style={{ left: `${pt.xPercent}%`, top: `${pt.expenseYPercent}%` }}
                      className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform duration-150 ${
                        isInspected
                          ? 'z-20 w-3 h-3 bg-rose-500 ring-4 ring-rose-500/20 border-2 border-white dark:border-[#131922]'
                          : pt.totalExpenses > 0
                            ? 'z-10 w-2 h-2 bg-rose-500 border border-white dark:border-[#131922]'
                            : 'w-1.5 h-1.5 bg-rose-400/45 dark:bg-rose-400/35'
                      }`}
                    />
                    <span
                      aria-hidden="true"
                      style={{ left: `${pt.xPercent}%`, top: `${pt.incomeYPercent}%` }}
                      className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform duration-150 ${
                        isInspected
                          ? 'z-20 w-3 h-3 bg-emerald-500 ring-4 ring-emerald-500/20 border-2 border-white dark:border-[#131922]'
                          : pt.totalIncome > 0
                            ? 'z-10 w-2 h-2 bg-emerald-500 border border-white dark:border-[#131922]'
                            : 'w-1.5 h-1.5 bg-emerald-400/45 dark:bg-emerald-400/35'
                      }`}
                    />
                  </React.Fragment>
                );
              })}

              {/* 12 Interactive Full-Height Column Hit Targets */}
              <div
                role="group"
                aria-label={`Seleccionar mes en el gráfico de líneas de ${selectedYear}`}
                className="relative z-30 grid grid-cols-12 h-full w-full"
              >
                {annual.monthlyPoints.map((pt) => {
                  const isInspected = inspectedMonthIndex === pt.monthIndex;
                  return (
                    <button
                      key={pt.monthIndex}
                      type="button"
                      onClick={() => setInspectedMonthIndex(pt.monthIndex)}
                      aria-pressed={isInspected}
                      aria-label={`${pt.monthName} ${selectedYear}: ingresos ${formatEUR(pt.totalIncome)}, gastos ${formatEUR(pt.totalExpenses)}`}
                      data-testid={`annual-month-btn-${pt.monthIndex}`}
                      className={`h-full w-full rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 ${
                        isInspected
                          ? 'bg-slate-900/[0.03] dark:bg-white/[0.03]'
                          : 'hover:bg-slate-900/[0.025] dark:hover:bg-white/[0.025]'
                      }`}
                    />
                  );
                })}
              </div>
            </div>

            {/* Aligned 12-Month X-Axis Labels */}
            <div className="mt-1.5 grid grid-cols-12">
              {annual.monthlyPoints.map((pt) => {
                const isInspected = inspectedMonthIndex === pt.monthIndex;
                const hasActivity = pt.transactionCount > 0;
                return (
                  <button
                    key={pt.monthIndex}
                    type="button"
                    onClick={() => setInspectedMonthIndex(pt.monthIndex)}
                    tabIndex={-1}
                    aria-hidden="true"
                    className={`min-h-[28px] flex items-center justify-center rounded-lg text-[11px] font-semibold leading-none whitespace-nowrap transition-colors ${
                      isInspected
                        ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
                        : hasActivity
                          ? 'text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white'
                          : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                    }`}
                  >
                    <span className="sm:hidden">{pt.shortLabel.slice(0, 1)}</span>
                    <span className="hidden sm:inline">{pt.shortLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Inspected Month Detail Strip */}
        <div
          data-testid="annual-inspected-month"
          className="pt-4 border-t border-slate-100 dark:border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-sm font-semibold text-slate-900 dark:text-white">
                {inspectedPoint.monthName} {selectedYear}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {inspectedPoint.transactionCount === 0
                  ? 'Sin movimientos'
                  : `${inspectedPoint.transactionCount} ${
                      inspectedPoint.transactionCount === 1 ? 'movimiento' : 'movimientos'
                    } · Ahorro ${inspectedPoint.savingsGoal.actualRate
                      .toFixed(1)
                      .replace('.', ',')}%`}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-num">
              <span className="text-slate-600 dark:text-slate-300">
                Ingresos:{' '}
                <strong className="font-semibold text-emerald-600 dark:text-emerald-400">
                  {formatEUR(inspectedPoint.totalIncome)}
                </strong>
              </span>
              <span className="text-slate-600 dark:text-slate-300">
                Gastos:{' '}
                <strong className="font-semibold text-rose-600 dark:text-rose-400">
                  {formatEUR(inspectedPoint.totalExpenses)}
                </strong>
              </span>
              <span className="text-slate-600 dark:text-slate-300">
                Balance:{' '}
                <strong
                  className={`font-semibold ${
                    inspectedPoint.netBalance >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {formatEUR(inspectedPoint.netBalance, { showSign: true })}
                </strong>
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onOpenMonthDetail(selectedYear, inspectedPoint.monthIndex)}
            className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 rounded-xl bg-slate-100 dark:bg-white/[0.06] hover:bg-emerald-500/15 text-slate-800 dark:text-slate-200 hover:text-emerald-600 dark:hover:text-emerald-400 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
          >
            <span>Ver {inspectedPoint.monthName}</span>
            <ArrowUpRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          </button>
        </div>

        {/* Standout Months Metadata Row */}
        {(annual.bestSavingsMonth || annual.highestExpenseMonth) && (
          <div className="pt-4 border-t border-slate-100 dark:border-white/[0.06] grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {annual.bestSavingsMonth && (
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-slate-500 dark:text-slate-400">Mejor mes de ahorro</span>
                <span className="font-num font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                  {annual.bestSavingsMonth.monthName} ·{' '}
                  {formatEUR(annual.bestSavingsMonth.netBalance, { showSign: true })}
                </span>
              </div>
            )}
            {annual.highestExpenseMonth && (
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-slate-500 dark:text-slate-400">Mes con mayor gasto</span>
                <span className="font-num font-semibold text-rose-600 dark:text-rose-400 whitespace-nowrap">
                  {annual.highestExpenseMonth.monthName} ·{' '}
                  {formatEUR(annual.highestExpenseMonth.totalExpenses)}
                </span>
              </div>
            )}
          </div>
        )}
      </section>

      {/* 3. Annual Breakdown: Gastos anuales por categoría */}
      <section
        aria-labelledby="annual-categorias-heading"
        className="rounded-3xl bg-white dark:bg-[#131922] border border-slate-200/80 dark:border-white/[0.08] p-5 sm:p-6"
      >
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <h2
              id="annual-categorias-heading"
              className="text-base font-semibold text-slate-900 dark:text-white"
            >
              Gastos anuales por categoría
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Año {selectedYear} · Pulsa una categoría para inspeccionar
            </p>
          </div>
          <span className="font-num text-sm font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap shrink-0">
            {formatEUR(annual.totalExpenses)}
          </span>
        </div>

        {breakdown.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
            No hay gastos registrados en {selectedYear}.
          </div>
        ) : (
          <div className="mt-6 flex flex-col sm:flex-row items-center gap-6 sm:gap-8">
            <div className="relative w-44 h-44 shrink-0">
                <svg
                  viewBox="0 0 200 200"
                  className="w-full h-full -rotate-90"
                  role="img"
                  aria-label={`Gráfico circular de gastos anuales por categoría en ${selectedYear}`}
                >
                  <circle
                    cx="100"
                    cy="100"
                    r={radius}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="22"
                    className="text-slate-100 dark:text-white/[0.06]"
                  />
                  {donutSegments.map((seg) => {
                    const isSelected = selectedCategoryId === seg.categoryId;
                    const isDimmed = selectedCategoryId !== null && !isSelected;
                    return (
                      <circle
                        key={seg.categoryId}
                        cx="100"
                        cy="100"
                        r={radius}
                        fill="none"
                        stroke={seg.color}
                        strokeWidth={isSelected ? 26 : 22}
                        strokeDasharray={seg.strokeDasharray}
                        strokeDashoffset={seg.strokeDashoffset}
                        strokeLinecap="butt"
                        opacity={isDimmed ? 0.32 : 1}
                        className="transition-all duration-200 cursor-pointer"
                        onClick={() =>
                          setSelectedCategoryId((prev) =>
                            prev === seg.categoryId ? null : seg.categoryId
                          )
                        }
                      />
                    );
                  })}
                </svg>

                <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-5 pointer-events-none">
                  <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate max-w-full">
                    {selectedCategory ? selectedCategory.name : `Gastos ${selectedYear}`}
                  </span>
                  <span className="mt-0.5 text-lg font-bold font-num text-slate-900 dark:text-white">
                    {formatEUR(selectedCategory ? selectedCategory.total : annual.totalExpenses)}
                  </span>
                  {selectedCategory && (
                    <span className="text-xs font-num font-medium text-emerald-600 dark:text-emerald-400">
                      {selectedCategory.percentage.toFixed(1).replace('.', ',')}%
                    </span>
                  )}
                </div>
              </div>

              <ul className="w-full min-w-0 space-y-1.5 flex-1">
                {breakdown.map((item) => {
                  const active = selectedCategoryId === item.categoryId;
                  return (
                    <li key={item.categoryId}>
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedCategoryId((prev) =>
                            prev === item.categoryId ? null : item.categoryId
                          )
                        }
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2 min-h-[44px] rounded-xl text-left transition-colors ${
                          active
                            ? 'bg-slate-100 dark:bg-white/[0.08]'
                            : 'hover:bg-slate-50 dark:hover:bg-white/[0.03]'
                        }`}
                      >
                        <span className="flex items-center gap-2.5 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: item.color }}
                            aria-hidden="true"
                          />
                          <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                            {item.name}
                          </span>
                        </span>
                        <span className="text-xs font-num text-slate-600 dark:text-slate-300 whitespace-nowrap shrink-0">
                          <strong className="font-semibold text-slate-900 dark:text-white">
                            {formatEUR(item.total)}
                          </strong>
                          <span className="text-slate-400 dark:text-slate-500 ml-1.5">
                            {item.percentage.toFixed(0)}%
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
      </section>
    </div>
  );
};
