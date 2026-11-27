import React, { useEffect, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  Pencil,
  Plus,
  Target,
  Wallet,
  X,
} from 'lucide-react';
import type {
  Category,
  FixedExpense,
  MonthlySummary,
  PartnerId,
  PartnerProfile,
  Transaction,
  TransactionType,
} from '../types/finance';
import {
  formatDayHeading,
  formatEUR,
  formatEuropeanDate,
  parseAmountInput,
} from '../utils/financeMath';
import {
  FIXED_EXPENSE_SCHEDULE_START,
  applyFixedExpenseUpdateForMonth,
  formatMonthStartEuropeanDate,
  getScheduledRateForMonth,
  isAutoFixedTransaction,
  isPreScheduleMonth,
  resolveFixedExpenseForMonth,
  resolveFixedExpenseTarget,
  toYearMonthKey,
} from '../utils/fixedExpenseSchedule';
import { CategoryIcon } from './CategoryIcon';

interface ResumenViewProps {
  monthLabel: string;
  selectedYear: number;
  selectedMonth: number;
  liveMonthKey: string;
  summary: MonthlySummary;
  recentTransactions: Transaction[];
  fixedExpenses: FixedExpense[];
  categories: Category[];
  partners: Record<PartnerId, PartnerProfile>;
  onViewAllTransactions: () => void;
  onEditTransaction: (tx: Transaction) => void;
  onOpenNewModal: (presetType?: TransactionType) => void;
  onUpdateFixedExpense: (updated: FixedExpense) => void;
  onRegisterFixedExpensePayment: (fixed: FixedExpense, amountForMonth: number) => void;
}

export const ResumenView: React.FC<ResumenViewProps> = ({
  monthLabel,
  selectedYear,
  selectedMonth,
  liveMonthKey,
  summary,
  recentTransactions,
  fixedExpenses,
  categories,
  partners,
  onViewAllTransactions,
  onEditTransaction,
  onOpenNewModal,
  onUpdateFixedExpense,
  onRegisterFixedExpensePayment,
}) => {
  const catMap = new Map(categories.map((c) => [c.id, c]));

  // Inline editor state for the fixed household expenses
  const [editingFixedId, setEditingFixedId] = useState<string | null>(null);
  const [draftDueDate, setDraftDueDate] = useState('');
  const [draftAmount, setDraftAmount] = useState('');
  const [draftNotes, setDraftNotes] = useState('');
  const [fixedError, setFixedError] = useState<string | null>(null);

  // Close open inline editor when navigating between months
  useEffect(() => {
    setEditingFixedId(null);
    setFixedError(null);
  }, [selectedYear, selectedMonth]);

  const currentMonthKey = toYearMonthKey(selectedYear, selectedMonth);
  const isPreSchedule = isPreScheduleMonth(selectedYear, selectedMonth);
  const isFutureScheduledMonth = !isPreSchedule && currentMonthKey > liveMonthKey;
  const monthStartLabel = formatMonthStartEuropeanDate(currentMonthKey);

  const fixedResolutions = fixedExpenses.map((item) => ({
    item,
    resolution: resolveFixedExpenseForMonth(
      item,
      selectedYear,
      selectedMonth,
      recentTransactions
    ),
  }));

  const startEditingFixed = (item: FixedExpense, resolvedAmount: number | null) => {
    setEditingFixedId(item.id);
    setDraftDueDate(item.dueDate);
    if (resolvedAmount !== null) {
      setDraftAmount(resolvedAmount.toFixed(2).replace('.', ','));
    } else if (!isPreSchedule) {
      const latestRate = getScheduledRateForMonth(item, currentMonthKey).amount;
      setDraftAmount(latestRate.toFixed(2).replace('.', ','));
    } else {
      setDraftAmount('');
    }
    setDraftNotes(item.notes ?? '');
    setFixedError(null);
  };

  const cancelEditingFixed = () => {
    setEditingFixedId(null);
    setFixedError(null);
  };

  const handleSaveFixed = (item: FixedExpense) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draftDueDate)) {
      setFixedError('Selecciona una fecha de vencimiento válida.');
      return;
    }
    const parsedAmount = parseAmountInput(draftAmount);
    if (parsedAmount === null) {
      setFixedError('Introduce un importe válido mayor que 0,00 €.');
      return;
    }

    const target = resolveFixedExpenseTarget(item, categories);
    const updated = applyFixedExpenseUpdateForMonth(
      { ...item, categoryId: target.categoryId },
      {
        year: selectedYear,
        monthIndex: selectedMonth,
        amount: parsedAmount,
        dueDate: draftDueDate,
        notes: draftNotes,
      }
    );
    onUpdateFixedExpense(updated);
    setEditingFixedId(null);
    setFixedError(null);
  };

  const goal = summary.savingsGoal;
  const totalFixedMonthly = fixedResolutions.reduce(
    (acc, entry) => acc + (entry.resolution.amount ?? 0),
    0
  );
  const hasAnyManualEntered = fixedResolutions.some(
    (entry) => entry.resolution.amount !== null
  );

  return (
    <div className="space-y-6">
      {/* Unified Monthly Summary Card: Balance + Ingresos/Gastos + Meta de ahorro */}
      <section
        aria-labelledby="balance-mes-heading"
        data-testid="resumen-unified-summary"
        className="rounded-3xl bg-white dark:bg-[#131922] border border-slate-200/80 dark:border-white/[0.08] p-5 sm:p-6 shadow-sm dark:shadow-none space-y-5"
      >
        {/* 1. Monthly Balance */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-2 min-w-0">
              <Wallet className="w-4 h-4 text-emerald-500 shrink-0" aria-hidden="true" />
              <h2 id="balance-mes-heading" className="truncate">
                Balance de {monthLabel}
              </h2>
            </div>
            <span className="shrink-0 whitespace-nowrap">
              {summary.transactionCount}{' '}
              {summary.transactionCount === 1 ? 'movimiento' : 'movimientos'}
            </span>
          </div>

          <p
            className={`text-3xl sm:text-4xl font-bold font-num tracking-tight ${
              summary.monthlyBalance >= 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {formatEUR(summary.monthlyBalance, { showSign: true })}
          </p>
        </div>

        {/* 2. Monthly Income & Expenses Side-by-Side */}
        <div
          aria-label="Indicadores del mes"
          data-testid="resumen-kpi-row"
          className="pt-5 border-t border-slate-100 dark:border-white/[0.06] grid grid-cols-2 divide-x divide-slate-100 dark:divide-white/[0.06]"
        >
          <div
            data-testid="resumen-kpi-income"
            className="min-w-0 pr-3 sm:pr-5"
          >
            <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400">
              <span className="truncate">Ingresos del mes</span>
              <ArrowDownLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-500 shrink-0" aria-hidden="true" />
            </div>
            <p className="mt-1.5 sm:mt-2 text-lg sm:text-2xl font-bold font-num tracking-tight whitespace-nowrap text-emerald-600 dark:text-emerald-400">
              {formatEUR(summary.totalIncome)}
            </p>
          </div>

          <div
            data-testid="resumen-kpi-expense"
            className="min-w-0 pl-3 sm:pl-5"
          >
            <div className="flex items-center justify-between gap-1 text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400">
              <span className="truncate">Gastos del mes</span>
              <ArrowUpRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-500 shrink-0" aria-hidden="true" />
            </div>
            <p className="mt-1.5 sm:mt-2 text-lg sm:text-2xl font-bold font-num tracking-tight whitespace-nowrap text-slate-900 dark:text-white">
              {formatEUR(summary.totalExpenses)}
            </p>
          </div>
        </div>

        {/* 3. Monthly Savings Goal Progress Bar (20% Target) */}
        <div
          aria-labelledby="meta-ahorro-heading"
          className="pt-5 border-t border-slate-100 dark:border-white/[0.06] space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Target
                className={`w-4 h-4 shrink-0 ${
                  goal.achieved ? 'text-emerald-500' : 'text-sky-500'
                }`}
                aria-hidden="true"
              />
              <h3
                id="meta-ahorro-heading"
                className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white flex items-center gap-1.5"
              >
                <span>Meta de ahorro mensual (Objetivo {goal.targetPercent}%)</span>
                {goal.achieved && (
                  <span
                    data-testid="savings-goal-celebration"
                    role="img"
                    aria-label="Meta de ahorro alcanzada"
                    className="text-base leading-none shrink-0"
                  >
                    🎉
                  </span>
                )}
              </h3>
            </div>

            <div className="text-right shrink-0">
              <p
                className={`font-num text-base sm:text-lg font-bold whitespace-nowrap ${
                  goal.achieved
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : goal.savedAmount < 0
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-sky-600 dark:text-sky-400'
                }`}
              >
                {summary.totalIncome > 0
                  ? `${goal.actualRate.toFixed(1).replace('.', ',')}%`
                  : '0,0%'}
                <span className="text-xs font-medium text-slate-400 dark:text-slate-500 ml-1">
                  / {goal.targetPercent}%
                </span>
              </p>
            </div>
          </div>

          {/* Progress Track */}
          <div className="space-y-2">
            <div
              role="progressbar"
              aria-label={`Progreso de meta de ahorro en ${monthLabel}`}
              aria-valuenow={Math.round(goal.progressPercent)}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-3 w-full rounded-full bg-slate-100 dark:bg-white/[0.06] overflow-hidden"
            >
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  goal.achieved
                    ? 'bg-emerald-500'
                    : goal.savedAmount < 0
                      ? 'bg-rose-500'
                      : 'bg-sky-500'
                }`}
                style={{ width: `${goal.progressPercent}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>
                Ahorrado:{' '}
                <strong className="font-num font-semibold text-slate-900 dark:text-white">
                  {formatEUR(goal.savedAmount)}
                </strong>
              </span>
              <span>
                Meta {goal.targetPercent}%:{' '}
                <strong className="font-num font-semibold text-slate-900 dark:text-white">
                  {formatEUR(goal.targetAmount)}
                </strong>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Fixed Household Expenses with Temporal Schedule (Oct 2026 -> Maturity) & Manual Pre-Oct 2026 */}
      <section
        aria-labelledby="gastos-fijos-heading"
        className="rounded-3xl bg-white dark:bg-[#131922] border border-slate-200/80 dark:border-white/[0.08] overflow-hidden"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-b border-slate-100 dark:border-white/[0.06]">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-emerald-500 shrink-0" aria-hidden="true" />
            <div>
              <h3
                id="gastos-fijos-heading"
                className="text-base font-semibold text-slate-900 dark:text-white"
              >
                Gastos fijos de la casa
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isPreSchedule
                  ? `Mes anterior a Oct 2026 · Introduce manualmente los importes de ${monthLabel}`
                  : 'Registro automático el día 1 de cada mes según la fecha actual · Mismo importe hasta el vencimiento'}
              </p>
            </div>
          </div>
          <span
            data-testid="fixed-monthly-total"
            className="font-num text-sm font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap"
          >
            {isPreSchedule && !hasAnyManualEntered
              ? 'Importe manual'
              : `${formatEUR(totalFixedMonthly)} / mes`}
          </span>
        </div>

        <ul className="divide-y divide-slate-100 dark:divide-white/[0.06]">
          {fixedResolutions.map(({ item, resolution }) => {
            const target = resolveFixedExpenseTarget(item, categories);
            const cat = target.matchedCategory ?? catMap.get(target.categoryId);
            const isPaid = resolution.isPaid;
            const isEditing = editingFixedId === item.id;
            const isExpired = resolution.status === 'expired';
            const isManualPending = resolution.status === 'manual_pending';

            return (
              <li key={item.id} data-testid={`fixed-item-${item.id}`} className="px-5 py-4">
                {isEditing ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">
                        {isPreSchedule
                          ? `Importe de ${monthLabel} · ${item.name}`
                          : `Editar ${item.name} · desde ${monthLabel}`}
                      </span>
                      <button
                        type="button"
                        onClick={cancelEditingFixed}
                        aria-label={`Cancelar edición de ${item.name}`}
                        className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor={`fixed-amount-${item.id}`}
                          className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                        >
                          {isPreSchedule ? `Importe en ${monthLabel} (€)` : 'Importe mensual (€)'}
                        </label>
                        <input
                          id={`fixed-amount-${item.id}`}
                          type="text"
                          inputMode="decimal"
                          placeholder="0,00"
                          value={draftAmount}
                          onChange={(e) => {
                            setDraftAmount(e.target.value);
                            setFixedError(null);
                          }}
                          className="w-full min-h-[44px] px-3 rounded-xl bg-slate-50 dark:bg-[#0B0F14] border border-slate-200 dark:border-white/[0.08] font-num text-slate-900 dark:text-white text-base focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor={`fixed-date-${item.id}`}
                          className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                        >
                          Fecha de vencimiento
                        </label>
                        <input
                          id={`fixed-date-${item.id}`}
                          type="date"
                          value={draftDueDate}
                          onChange={(e) => {
                            setDraftDueDate(e.target.value);
                            setFixedError(null);
                          }}
                          className="w-full min-h-[44px] px-3 rounded-xl bg-slate-50 dark:bg-[#0B0F14] border border-slate-200 dark:border-white/[0.08] text-slate-900 dark:text-white text-base focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                        />
                      </div>
                    </div>

                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {isPreSchedule
                        ? `Solo afecta a ${monthLabel} (mes anterior a Octubre 2026). No modificará ningún otro mes.`
                        : currentMonthKey === FIXED_EXPENSE_SCHEDULE_START
                          ? 'Se aplicará desde Octubre 2026 hasta la fecha de vencimiento.'
                          : `Se aplicará desde ${monthLabel} hasta el vencimiento. Los meses anteriores conservarán su importe.`}
                    </p>

                    <div>
                      <label
                        htmlFor={`fixed-notes-${item.id}`}
                        className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                      >
                        Nota opcional
                      </label>
                      <input
                        id={`fixed-notes-${item.id}`}
                        type="text"
                        value={draftNotes}
                        onChange={(e) => setDraftNotes(e.target.value)}
                        placeholder="Ej. Cuota mensual día 5"
                        className="w-full min-h-[42px] px-3 rounded-xl bg-slate-50 dark:bg-[#0B0F14] border border-slate-200 dark:border-white/[0.08] text-slate-900 dark:text-white text-base focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                      />
                    </div>

                    {fixedError && (
                      <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
                        {fixedError}
                      </p>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleSaveFixed(item)}
                        className="inline-flex items-center justify-center gap-1.5 min-h-[42px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors whitespace-nowrap"
                      >
                        <Check className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{isPreSchedule ? 'Guardar importe' : 'Guardar cambios'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={cancelEditingFixed}
                        className="min-h-[42px] px-4 rounded-xl bg-slate-100 dark:bg-white/[0.08] text-slate-700 dark:text-slate-300 text-xs font-medium whitespace-nowrap"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <span
                        className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                          isExpired ? 'opacity-50' : ''
                        }`}
                        style={{
                          backgroundColor: `${cat?.color ?? '#6366F1'}1A`,
                          color: cat?.color ?? '#6366F1',
                        }}
                      >
                        <CategoryIcon name={cat?.icon ?? 'Landmark'} className="w-5 h-5" />
                      </span>
                      <div className="min-w-0">
                        <p
                          className={`text-sm font-semibold truncate ${
                            isExpired
                              ? 'text-slate-500 dark:text-slate-400'
                              : 'text-slate-900 dark:text-white'
                          }`}
                        >
                          {item.name}
                        </p>
                        <p className="mt-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
                          <span>{target.categoryName}</span>
                          <span aria-hidden="true"> · </span>
                          <span>Concepto: {target.concept}</span>
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          {isExpired ? (
                            <span>Vencido el {formatEuropeanDate(item.dueDate)}</span>
                          ) : isManualPending ? (
                            <>
                              <span>Anterior a Oct 2026</span>
                              <span aria-hidden="true"> · </span>
                              <span className="font-medium text-amber-600 dark:text-amber-400">
                                Sin importe en {monthLabel}
                              </span>
                            </>
                          ) : (
                            <>
                              <span>
                                {isPreSchedule
                                  ? 'Importe manual'
                                  : `Vence: ${formatEuropeanDate(item.dueDate)}`}
                              </span>
                              <span aria-hidden="true"> · </span>
                              <span
                                className={
                                  isPaid
                                    ? 'font-medium text-emerald-600 dark:text-emerald-400'
                                    : isFutureScheduledMonth
                                      ? 'font-medium text-sky-600 dark:text-sky-400'
                                      : 'font-medium text-amber-600 dark:text-amber-400'
                                }
                              >
                                {isPaid
                                  ? isAutoFixedTransaction(resolution.paidTransaction)
                                    ? `Automático el ${monthStartLabel}`
                                    : `Pagado en ${monthLabel}`
                                  : isFutureScheduledMonth
                                    ? `Se registrará el ${monthStartLabel}`
                                    : 'Pendiente este mes'}
                              </span>
                            </>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 shrink-0">
                      {isExpired ? (
                        <>
                          <span className="text-xs font-medium text-slate-400 dark:text-slate-500 whitespace-nowrap mr-1">
                            Finalizado
                          </span>
                          <button
                            type="button"
                            onClick={() => startEditingFixed(item, null)}
                            aria-label={`Editar fecha de vencimiento de ${item.name}`}
                            className="inline-flex items-center justify-center gap-1 min-h-[38px] px-3 rounded-xl bg-slate-100 dark:bg-white/[0.06] hover:bg-slate-200 dark:hover:bg-white/[0.12] text-slate-700 dark:text-slate-200 text-xs font-medium transition-colors whitespace-nowrap"
                          >
                            <Pencil className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                            <span>Editar fecha</span>
                          </button>
                        </>
                      ) : isManualPending ? (
                        <>
                          <span className="font-num text-sm font-medium text-slate-400 dark:text-slate-500 whitespace-nowrap mr-1">
                            —
                          </span>
                          <button
                            type="button"
                            onClick={() => startEditingFixed(item, null)}
                            aria-label={`Introducir importe de ${item.name} en ${monthLabel}`}
                            className="inline-flex items-center justify-center gap-1.5 min-h-[38px] px-3.5 rounded-xl bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-700 dark:text-emerald-400 text-xs font-semibold transition-colors whitespace-nowrap"
                          >
                            <Plus className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                            <span>Introducir importe</span>
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="font-num text-sm font-semibold text-slate-900 dark:text-white whitespace-nowrap mr-1">
                            {formatEUR(resolution.amount ?? 0)}
                          </span>

                          {!isPaid ? (
                            <button
                              type="button"
                              onClick={() =>
                                onRegisterFixedExpensePayment(item, resolution.amount ?? item.amount)
                              }
                              className="inline-flex items-center justify-center gap-1 min-h-[38px] px-3 rounded-xl bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-700 dark:text-emerald-400 text-xs font-semibold transition-colors whitespace-nowrap"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                              <span>Registrar pago</span>
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 px-1.5 whitespace-nowrap">
                              <Check className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Al día</span>
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={() => startEditingFixed(item, resolution.amount)}
                            aria-label={`Editar ${item.name} en ${monthLabel}`}
                            className="inline-flex items-center justify-center gap-1 min-h-[38px] px-3 rounded-xl bg-slate-100 dark:bg-white/[0.06] hover:bg-slate-200 dark:hover:bg-white/[0.12] text-slate-700 dark:text-slate-200 text-xs font-medium transition-colors whitespace-nowrap"
                          >
                            <Pencil className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                            <span>Editar</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {/* Recent Activity Preview */}
      <section
        aria-labelledby="recientes-heading"
        className="rounded-3xl bg-white dark:bg-[#131922] border border-slate-200/80 dark:border-white/[0.08] overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-white/[0.06]">
          <h3 id="recientes-heading" className="text-base font-semibold text-slate-900 dark:text-white">
            Últimos movimientos
          </h3>
          <button
            type="button"
            onClick={onViewAllTransactions}
            className="inline-flex items-center gap-1 min-h-[44px] px-2 -mr-2 text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 transition-colors whitespace-nowrap"
          >
            <span>Ver todos</span>
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {recentTransactions.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              No hay movimientos registrados en {monthLabel}.
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Pulsa el botón + para anotar un ingreso o gasto.
            </p>
            <button
              type="button"
              onClick={() => onOpenNewModal('expense')}
              className="mt-4 inline-flex items-center justify-center min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors"
            >
              Añadir primer movimiento
            </button>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-white/[0.06]">
            {recentTransactions.slice(0, 5).map((tx) => {
              const cat = catMap.get(tx.categoryId);
              const author = partners[tx.addedBy];
              const isIncome = tx.type === 'income';

              return (
                <li key={tx.id}>
                  <button
                    type="button"
                    onClick={() => onEditTransaction(tx)}
                    className="w-full flex items-center justify-between gap-3 px-5 py-3.5 min-h-[64px] text-left hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <span
                        className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: `${cat?.color ?? '#64748B'}1A`,
                          color: cat?.color ?? '#94A3B8',
                        }}
                      >
                        <CategoryIcon name={cat?.icon ?? 'Tag'} className="w-5 h-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {tx.title}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">
                          <span>{cat?.name ?? 'Otros'}</span>
                          <span aria-hidden="true"> · </span>
                          <span>Añadido por {author.name}</span>
                          <span aria-hidden="true"> · </span>
                          <span>{formatDayHeading(tx.date)}</span>
                        </p>
                      </div>
                    </div>

                    <span
                      className={`font-num text-sm sm:text-base font-semibold whitespace-nowrap shrink-0 ${
                        isIncome
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {isIncome
                        ? formatEUR(tx.amount, { showSign: true })
                        : formatEUR(-tx.amount)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
};
