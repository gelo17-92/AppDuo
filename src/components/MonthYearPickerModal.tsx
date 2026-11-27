import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { Transaction } from '../types/finance';

const SPANISH_MONTHS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

interface MonthYearPickerModalProps {
  isOpen: boolean;
  selectedYear: number;
  selectedMonth: number;
  transactions: Transaction[];
  onSelect: (year: number, month: number) => void;
  onClose: () => void;
}

export const MonthYearPickerModal: React.FC<MonthYearPickerModalProps> = ({
  isOpen,
  selectedYear,
  selectedMonth,
  transactions,
  onSelect,
  onClose,
}) => {
  const [browseYear, setBrowseYear] = useState<number>(selectedYear);

  useEffect(() => {
    if (isOpen) {
      setBrowseYear(selectedYear);
    }
  }, [isOpen, selectedYear]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const txCountByMonth = useMemo(() => {
    const counts = new Array<number>(12).fill(0);
    const prefix = `${browseYear}-`;
    for (const tx of transactions) {
      if (tx.date.startsWith(prefix)) {
        const m = Number(tx.date.slice(5, 7)) - 1;
        if (m >= 0 && m <= 11) {
          counts[m] += 1;
        }
      }
    }
    return counts;
  }, [transactions, browseYear]);

  if (!isOpen) return null;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="month-picker-title"
      data-testid="month-year-picker-modal"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#131922] border-t sm:border border-slate-200 dark:border-white/10 shadow-2xl p-5 sm:p-6 pb-safe space-y-5">
        {/* Mobile grab handle */}
        <div className="sm:hidden w-10 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700 mx-auto -mt-1" />

        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <Calendar className="w-4.5 h-4.5" aria-hidden="true" />
            </span>
            <div>
              <h2
                id="month-picker-title"
                className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white"
              >
                Ir a mes y año
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Elige directamente cualquier periodo
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar selector de mes y año"
            className="min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Year Stepper */}
        <div
          className="flex items-center justify-between rounded-2xl bg-slate-100 dark:bg-[#0B0F14] border border-slate-200/80 dark:border-white/[0.08] p-1.5"
          role="group"
          aria-label="Selector de año"
        >
          <button
            type="button"
            onClick={() => setBrowseYear((y) => y - 1)}
            aria-label="Año anterior"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-[#1A2230] transition-colors"
          >
            <ChevronLeft className="w-5 h-5" aria-hidden="true" />
          </button>

          <span
            data-testid="month-picker-year"
            className="text-xl font-bold tracking-tight text-slate-900 dark:text-white tabular-nums select-none"
          >
            {browseYear}
          </span>

          <button
            type="button"
            onClick={() => setBrowseYear((y) => y + 1)}
            aria-label="Año siguiente"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-[#1A2230] transition-colors"
          >
            <ChevronRight className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* 12-Month Grid */}
        <div className="grid grid-cols-3 gap-2" role="listbox" aria-label={`Meses de ${browseYear}`}>
          {SPANISH_MONTHS.map((label, monthIdx) => {
            const isSelected = browseYear === selectedYear && monthIdx === selectedMonth;
            const count = txCountByMonth[monthIdx];
            return (
              <button
                key={label}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onSelect(browseYear, monthIdx);
                  onClose();
                }}
                className={`min-h-[54px] px-2 py-2 rounded-2xl flex flex-col items-center justify-center text-center transition-all active:scale-[0.97] ${
                  isSelected
                    ? 'bg-emerald-600 text-white font-bold shadow-md shadow-emerald-600/25'
                    : 'bg-slate-50 dark:bg-[#0B0F14] border border-slate-200/80 dark:border-white/[0.07] text-slate-800 dark:text-slate-200 hover:border-emerald-500/50 hover:text-emerald-600 dark:hover:text-emerald-400 font-semibold'
                }`}
              >
                <span className="text-sm leading-tight whitespace-nowrap">{label}</span>
                {count > 0 && (
                  <span
                    className={`mt-0.5 text-[10px] font-medium tabular-nums leading-none ${
                      isSelected ? 'text-emerald-100' : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    {count} mov.
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Quick jump to today's month */}
        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={() => {
              onSelect(currentYear, currentMonth);
              onClose();
            }}
            className="w-full min-h-[44px] px-4 rounded-2xl bg-slate-100 dark:bg-white/[0.06] hover:bg-slate-200/80 dark:hover:bg-white/[0.1] text-slate-700 dark:text-slate-200 text-sm font-semibold transition-colors whitespace-nowrap"
          >
            Ir al mes actual ({SPANISH_MONTHS[currentMonth]} {currentYear})
          </button>
        </div>
      </div>
    </div>
  );
};
