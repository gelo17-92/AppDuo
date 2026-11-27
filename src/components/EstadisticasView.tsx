import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, X } from 'lucide-react';
import type {
  Category,
  MonthlySummary,
  Transaction,
  TransactionType,
} from '../types/finance';
import {
  calculateCategoryBreakdown,
  formatDayHeading,
  formatEUR,
  getCategoryTransactionsForMonth,
  resolveTransactionTitle,
} from '../utils/financeMath';
import { AnnualStatsPanel } from './AnnualStatsPanel';

interface EstadisticasViewProps {
  monthLabel: string;
  selectedYear: number;
  selectedMonth: number;
  savingsGoalPercent: number;
  transactions: Transaction[];
  allTransactions: Transaction[];
  categories: Category[];
  summary: MonthlySummary;
  periodMode: 'monthly' | 'annual';
  onChangePeriodMode: (mode: 'monthly' | 'annual') => void;
  onSelectMonthYear?: (year: number, monthIndex: number) => void;
}

export const EstadisticasView: React.FC<EstadisticasViewProps> = ({
  monthLabel,
  selectedYear,
  selectedMonth,
  savingsGoalPercent,
  transactions,
  allTransactions,
  categories,
  summary,
  periodMode,
  onChangePeriodMode,
  onSelectMonthYear,
}) => {
  const [categoryChartType, setCategoryChartType] = useState<TransactionType>('expense');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedCategoryId(null);
  }, [categoryChartType, selectedYear, selectedMonth]);

  const breakdown = useMemo(
    () => calculateCategoryBreakdown(transactions, categories, categoryChartType),
    [transactions, categories, categoryChartType]
  );

  const selectedCategory = breakdown.find((b) => b.categoryId === selectedCategoryId) ?? null;

  const selectedCategoryTransactions = useMemo(() => {
    if (!selectedCategoryId) return [];
    return getCategoryTransactionsForMonth(transactions, selectedCategoryId, categoryChartType);
  }, [transactions, selectedCategoryId, categoryChartType]);

  const activeTotal =
    categoryChartType === 'expense' ? summary.totalExpenses : summary.totalIncome;

  // Donut SVG geometry: true arc <path> per slice so each slice has its own exact hit target
  const radius = 78;

  const donutSegments = useMemo(() => {
    let accumulatedPercent = 0;
    return breakdown.map((item) => {
      const startDeg = (accumulatedPercent / 100) * 360 - 90;
      const sweepDeg = (item.percentage / 100) * 360;
      accumulatedPercent += item.percentage;

      if (breakdown.length === 1 || sweepDeg >= 359.5) {
        return {
          ...item,
          isFullCircle: true as const,
          pathD: '',
        };
      }

      const gapDeg = Math.min(1.6, sweepDeg * 0.25);
      const effectiveSweep = Math.max(0.8, sweepDeg - gapDeg);
      const a1 = ((startDeg + gapDeg / 2) * Math.PI) / 180;
      const a2 = ((startDeg + gapDeg / 2 + effectiveSweep) * Math.PI) / 180;

      const x1 = Number((100 + radius * Math.cos(a1)).toFixed(3));
      const y1 = Number((100 + radius * Math.sin(a1)).toFixed(3));
      const x2 = Number((100 + radius * Math.cos(a2)).toFixed(3));
      const y2 = Number((100 + radius * Math.sin(a2)).toFixed(3));
      const largeArc = effectiveSweep > 180 ? 1 : 0;

      return {
        ...item,
        isFullCircle: false as const,
        pathD: `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
      };
    });
  }, [breakdown, radius]);

  const handleOpenMonthFromAnnual = (year: number, monthIndex: number) => {
    onSelectMonthYear?.(year, monthIndex);
    onChangePeriodMode('monthly');
  };

  const toggleCategorySelection = (categoryId: string) => {
    setSelectedCategoryId((prev) => (prev === categoryId ? null : categoryId));
  };

  return (
    <div className="space-y-6">
      {/* Scope Bar: Mensual | Anual + Direct Year Stepper in Annual Mode */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Periodo de estadísticas"
          className="inline-flex items-center p-1 rounded-2xl bg-white dark:bg-[#131922] border border-slate-200/80 dark:border-white/[0.08]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={periodMode === 'monthly'}
            onClick={() => onChangePeriodMode('monthly')}
            data-testid="stats-tab-monthly"
            className={`min-h-[40px] px-4 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
              periodMode === 'monthly'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Mensual
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={periodMode === 'annual'}
            onClick={() => onChangePeriodMode('annual')}
            data-testid="stats-tab-annual"
            className={`min-h-[40px] px-4 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
              periodMode === 'annual'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Anual
          </button>
        </div>

        {periodMode === 'annual' && (
          <div
            role="group"
            aria-label="Cambiar año de estadísticas"
            className="inline-flex items-center gap-1 p-1 rounded-2xl bg-white dark:bg-[#131922] border border-slate-200/80 dark:border-white/[0.08]"
          >
            <button
              type="button"
              onClick={() => onSelectMonthYear?.(selectedYear - 1, selectedMonth)}
              aria-label={`Año anterior (${selectedYear - 1})`}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            <span
              data-testid="annual-year-label"
              className="px-2.5 text-sm font-bold font-num text-slate-900 dark:text-white whitespace-nowrap"
            >
              Año {selectedYear}
            </span>
            <button
              type="button"
              onClick={() => onSelectMonthYear?.(selectedYear + 1, selectedMonth)}
              aria-label={`Año siguiente (${selectedYear + 1})`}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
            >
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {periodMode === 'annual' ? (
        <AnnualStatsPanel
          selectedYear={selectedYear}
          selectedMonth={selectedMonth}
          savingsGoalPercent={savingsGoalPercent}
          allTransactions={allTransactions}
          categories={categories}
          onOpenMonthDetail={handleOpenMonthFromAnnual}
        />
      ) : (
        <section
          aria-labelledby="chart-categorias-heading"
          data-testid="stats-section-categorias"
          className="rounded-3xl bg-white dark:bg-[#131922] border border-slate-200/80 dark:border-white/[0.08] p-5 sm:p-6"
        >
          {/* Header with Gastos / Ingresos Switcher */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="min-w-0">
              <h2
                id="chart-categorias-heading"
                className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white"
              >
                {categoryChartType === 'expense'
                  ? 'Gastos por categoría'
                  : 'Ingresos por categoría'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {monthLabel} · Pulsa una categoría para desplegar sus conceptos
              </p>
            </div>

            <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
              <div
                role="tablist"
                aria-label="Tipo de desglose por categoría"
                data-testid="category-type-toggle"
                className="inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-[#0B0F14] border border-slate-200/70 dark:border-white/[0.06]"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={categoryChartType === 'expense'}
                  data-testid="category-type-expense"
                  onClick={() => setCategoryChartType('expense')}
                  className={`min-h-[36px] px-3.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                    categoryChartType === 'expense'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Gastos
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={categoryChartType === 'income'}
                  data-testid="category-type-income"
                  onClick={() => setCategoryChartType('income')}
                  className={`min-h-[36px] px-3.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                    categoryChartType === 'income'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Ingresos
                </button>
              </div>

              <span
                data-testid="category-chart-total"
                className={`font-num text-sm sm:text-base font-bold whitespace-nowrap ${
                  categoryChartType === 'income'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-900 dark:text-white'
                }`}
              >
                {formatEUR(activeTotal)}
              </span>
            </div>
          </div>

          {breakdown.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
              {categoryChartType === 'expense'
                ? `No hay gastos registrados en ${monthLabel}.`
                : `No hay ingresos registrados en ${monthLabel}.`}
            </div>
          ) : (
            <>
              <div className="mt-6 flex flex-col md:flex-row items-center md:items-start gap-6 sm:gap-8">
                {/* Interactive SVG Donut */}
                <div className="relative w-44 h-44 sm:w-48 sm:h-48 shrink-0">
                  <svg
                    viewBox="0 0 200 200"
                    className="w-full h-full"
                    role="img"
                    aria-label={
                      categoryChartType === 'expense'
                        ? `Gráfico circular de gastos por categoría en ${monthLabel}`
                        : `Gráfico circular de ingresos por categoría en ${monthLabel}`
                    }
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
                      const handleKeyDown = (e: React.KeyboardEvent) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleCategorySelection(seg.categoryId);
                        }
                      };
                      return seg.isFullCircle ? (
                        <circle
                          key={seg.categoryId}
                          data-testid={`monthly-donut-slice-${seg.categoryId}`}
                          role="button"
                          tabIndex={0}
                          aria-label={`${seg.name}: ${formatEUR(seg.total)} (${seg.percentage.toFixed(0)}%)`}
                          aria-pressed={isSelected}
                          cx="100"
                          cy="100"
                          r={radius}
                          fill="none"
                          stroke={seg.color}
                          strokeWidth={isSelected ? 26 : 22}
                          pointerEvents="stroke"
                          opacity={isDimmed ? 0.32 : 1}
                          className="transition-all duration-200 cursor-pointer focus:outline-none"
                          onClick={() => toggleCategorySelection(seg.categoryId)}
                          onKeyDown={handleKeyDown}
                        />
                      ) : (
                        <path
                          key={seg.categoryId}
                          data-testid={`monthly-donut-slice-${seg.categoryId}`}
                          role="button"
                          tabIndex={0}
                          aria-label={`${seg.name}: ${formatEUR(seg.total)} (${seg.percentage.toFixed(0)}%)`}
                          aria-pressed={isSelected}
                          d={seg.pathD}
                          fill="none"
                          stroke={seg.color}
                          strokeWidth={isSelected ? 26 : 22}
                          strokeLinecap="butt"
                          pointerEvents="stroke"
                          opacity={isDimmed ? 0.32 : 1}
                          className="transition-all duration-200 cursor-pointer focus:outline-none"
                          onClick={() => toggleCategorySelection(seg.categoryId)}
                          onKeyDown={handleKeyDown}
                        />
                      );
                    })}
                  </svg>

                  <div
                    data-testid="monthly-donut-center"
                    className="absolute inset-0 flex flex-col items-center justify-center text-center px-7 pointer-events-none"
                  >
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate max-w-full">
                      {selectedCategory
                        ? selectedCategory.name
                        : categoryChartType === 'expense'
                          ? 'Total gastos'
                          : 'Total ingresos'}
                    </span>
                    <span className="mt-0.5 text-lg font-bold font-num text-slate-900 dark:text-white">
                      {formatEUR(selectedCategory ? selectedCategory.total : activeTotal)}
                    </span>
                    {selectedCategory && (
                      <span
                        className={`text-xs font-num font-medium ${
                          categoryChartType === 'income'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {selectedCategory.percentage.toFixed(1).replace('.', ',')}%
                      </span>
                    )}
                  </div>
                </div>

                {/* Interactive Category List */}
                <ul className="w-full min-w-0 space-y-1.5 flex-1">
                  {breakdown.map((item) => {
                    const active = selectedCategoryId === item.categoryId;
                    return (
                      <li key={item.categoryId}>
                        <button
                          type="button"
                          data-testid={`monthly-category-row-${item.categoryId}`}
                          aria-expanded={active}
                          onClick={() => toggleCategorySelection(item.categoryId)}
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
                            <span className="text-[11px] font-num text-slate-400 dark:text-slate-500 shrink-0">
                              ({item.count})
                            </span>
                          </span>
                          <span className="flex items-center gap-2 shrink-0">
                            <span className="text-xs font-num text-slate-600 dark:text-slate-300 whitespace-nowrap">
                              <strong className="font-semibold text-slate-900 dark:text-white">
                                {formatEUR(item.total)}
                              </strong>
                              <span className="text-slate-400 dark:text-slate-500 ml-1.5">
                                {item.percentage.toFixed(0)}%
                              </span>
                            </span>
                            {active ? (
                              <ChevronUp
                                className="w-4 h-4 text-slate-400 shrink-0"
                                aria-hidden="true"
                              />
                            ) : (
                              <ChevronDown
                                className="w-4 h-4 text-slate-400 shrink-0"
                                aria-hidden="true"
                              />
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* Expanded Concepts List for Selected Category */}
              {selectedCategory && (
                <div
                  data-testid="category-concepts-drilldown"
                  className="mt-6 pt-5 border-t border-slate-100 dark:border-white/[0.06] space-y-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: selectedCategory.color }}
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          Conceptos de {selectedCategory.name}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {selectedCategoryTransactions.length}{' '}
                          {selectedCategoryTransactions.length === 1
                            ? 'concepto registrado'
                            : 'conceptos registrados'}{' '}
                          en {monthLabel} · Total{' '}
                          <strong className="font-num font-semibold text-slate-800 dark:text-slate-200">
                            {formatEUR(selectedCategory.total)}
                          </strong>
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedCategoryId(null)}
                      aria-label={`Ocultar conceptos de ${selectedCategory.name}`}
                      className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors shrink-0"
                    >
                      <X className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>

                  <ul className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                    {selectedCategoryTransactions.map((tx) => {
                      const displayTitle = resolveTransactionTitle(tx.title, selectedCategory.name);
                      return (
                        <li
                          key={tx.id}
                          data-testid="category-concept-item"
                          className="flex items-center justify-between gap-3 py-2.5"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                              {displayTitle}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              {formatDayHeading(tx.date)}
                              {tx.notes?.trim() ? ` · ${tx.notes.trim()}` : ''}
                            </p>
                          </div>
                          <span
                            className={`text-sm font-bold font-num whitespace-nowrap shrink-0 ${
                              tx.type === 'income'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-slate-900 dark:text-white'
                            }`}
                          >
                            {tx.type === 'income'
                              ? formatEUR(tx.amount, { showSign: true })
                              : formatEUR(-tx.amount)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
};

