import React, { useMemo, useState } from 'react';
import { Pencil, Search, Trash2, X } from 'lucide-react';
import type { Category, PartnerId, PartnerProfile, Transaction, TransactionType } from '../types/finance';
import {
  filterTransactionsByTitle,
  formatDayHeading,
  formatEUR,
  groupTransactionsByDay,
  resolveTransactionTitle,
} from '../utils/financeMath';
import { CategoryIcon } from './CategoryIcon';

interface MovimientosViewProps {
  monthLabel: string;
  transactions: Transaction[];
  categories: Category[];
  partners: Record<PartnerId, PartnerProfile>;
  onEdit: (tx: Transaction) => void;
  onDelete: (id: string) => void;
}

export const MovimientosView: React.FC<MovimientosViewProps> = ({
  monthLabel,
  transactions,
  categories,
  partners,
  onEdit,
  onDelete,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | TransactionType>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const filteredTransactions = useMemo(() => {
    const preFiltered = transactions.filter((tx) => {
      if (typeFilter !== 'all' && tx.type !== typeFilter) return false;
      if (categoryFilter !== 'all' && tx.categoryId !== categoryFilter) return false;
      return true;
    });

    return filterTransactionsByTitle(preFiltered, searchQuery, categories);
  }, [transactions, searchQuery, typeFilter, categoryFilter, categories]);

  const grouped = useMemo(() => groupTransactionsByDay(filteredTransactions), [filteredTransactions]);

  const filteredNetTotal = useMemo(
    () =>
      filteredTransactions.reduce(
        (sum, tx) => sum + (tx.type === 'income' ? tx.amount : -tx.amount),
        0
      ),
    [filteredTransactions]
  );

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    typeFilter !== 'all' ||
    categoryFilter !== 'all';

  const clearFilters = () => {
    setSearchQuery('');
    setTypeFilter('all');
    setCategoryFilter('all');
  };

  return (
    <div className="space-y-5">
      {/* Search & Filter Controls */}
      <section
        aria-label="Buscador y filtros de movimientos"
        className="rounded-3xl bg-white dark:bg-[#131922] border border-slate-200/80 dark:border-white/[0.08] p-4 sm:p-5 space-y-3.5"
      >
        <div className="space-y-1.5">
          <label
            htmlFor="movimientos-search"
            className="block text-xs font-medium text-slate-600 dark:text-slate-400"
          >
            Buscar por título o concepto
          </label>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
            <div className="relative flex-1 min-w-0">
              <Search
                className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                id="movimientos-search"
                data-testid="movimientos-search-input"
                type="text"
                role="searchbox"
                inputMode="search"
                enterKeyHint="search"
                autoComplete="off"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && searchQuery) {
                    setSearchQuery('');
                  }
                }}
                placeholder="Buscar por título o concepto..."
                aria-label="Buscar movimientos por título o concepto"
                className="w-full min-h-[46px] pl-10 pr-11 rounded-2xl bg-slate-50 dark:bg-[#0B0F14] border border-slate-200 dark:border-white/[0.08] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-base"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-1 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {/* Type Segmented Control */}
          <div
            role="group"
            aria-label="Filtrar por tipo de movimiento"
            className="inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-[#0B0F14] border border-slate-200/60 dark:border-white/[0.06]"
          >
            {(
              [
                { key: 'all', label: 'Todos' },
                { key: 'income', label: 'Ingresos' },
                { key: 'expense', label: 'Gastos' },
              ] as const
            ).map(({ key, label }) => {
              const active = typeFilter === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTypeFilter(key)}
                  className={`flex-1 sm:flex-none min-h-[38px] px-3.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-white dark:bg-[#1E293B] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Category Select */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filtrar por categoría"
            className="min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-[#0B0F14] border border-slate-200 dark:border-white/[0.08] text-slate-800 dark:text-slate-200 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 sm:ml-auto"
          >
            <option value="all">Todas las categorías</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        <div
          aria-live="polite"
          className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 pt-1"
        >
          <span>
            {filteredTransactions.length}{' '}
            {filteredTransactions.length === 1 ? 'movimiento' : 'movimientos'} en {monthLabel}
            {hasActiveFilters && filteredTransactions.length > 0 && (
              <>
                <span aria-hidden="true"> · </span>
                <strong
                  className={`font-num font-semibold ${
                    filteredNetTotal >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-800 dark:text-slate-200'
                  }`}
                >
                  {formatEUR(filteredNetTotal, { showSign: true })}
                </strong>
              </>
            )}
          </span>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="font-medium text-emerald-600 dark:text-emerald-400 hover:underline whitespace-nowrap"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </section>

      {/* Grouped Transactions List */}
      {grouped.length === 0 ? (
        <div className="rounded-3xl bg-white dark:bg-[#131922] border border-slate-200/80 dark:border-white/[0.08] px-6 py-12 text-center">
          <p className="text-base font-semibold text-slate-800 dark:text-slate-200">
            No se encontraron movimientos
          </p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {searchQuery.trim()
              ? `No hay movimientos cuyo título o concepto coincida con "${searchQuery.trim()}".`
              : hasActiveFilters
                ? 'Prueba a cambiar los filtros activos.'
                : `Todavía no hay ingresos ni gastos en ${monthLabel}.`}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map((group) => (
            <section
              key={group.date}
              aria-label={`Movimientos del ${group.date}`}
              className="rounded-3xl bg-white dark:bg-[#131922] border border-slate-200/80 dark:border-white/[0.08] overflow-hidden"
            >
              <header className="flex items-center justify-between px-5 py-3 bg-slate-50/70 dark:bg-white/[0.02] border-b border-slate-100 dark:border-white/[0.06]">
                <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {formatDayHeading(group.date)}
                </h3>
                <div className="flex items-center gap-3 text-xs font-num text-slate-500 dark:text-slate-400">
                  {group.dayIncomeTotal > 0 && (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      {formatEUR(group.dayIncomeTotal, { showSign: true })}
                    </span>
                  )}
                  {group.dayExpenseTotal > 0 && (
                    <span>{formatEUR(-group.dayExpenseTotal)}</span>
                  )}
                </div>
              </header>

              <ul className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                {group.transactions.map((tx) => {
                  const cat = catMap.get(tx.categoryId);
                  const displayTitle = resolveTransactionTitle(tx.title, cat?.name);
                  const author = partners[tx.addedBy];
                  const isIncome = tx.type === 'income';
                  const isConfirmingDelete = pendingDeleteId === tx.id;

                  return (
                    <li key={tx.id} className="px-4 sm:px-5 py-3.5">
                      <div className="flex items-center justify-between gap-3">
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
                              {displayTitle}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">
                              <span>{cat?.name ?? 'Otros'}</span>
                              <span aria-hidden="true"> · </span>
                              <span>
                                Añadido por{' '}
                                <span className="font-medium text-slate-700 dark:text-slate-300">
                                  {author.name}
                                </span>
                              </span>
                            </p>
                            {tx.notes && (
                              <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500 truncate">
                                {tx.notes}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                          <p
                            className={`font-num text-sm sm:text-base font-semibold whitespace-nowrap mr-1 ${
                              isIncome
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-slate-900 dark:text-white'
                            }`}
                          >
                            {isIncome
                              ? formatEUR(tx.amount, { showSign: true })
                              : formatEUR(-tx.amount)}
                          </p>

                          {!isConfirmingDelete ? (
                            <>
                              <button
                                type="button"
                                onClick={() => onEdit(tx)}
                                aria-label={`Editar "${displayTitle}"`}
                                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setPendingDeleteId(tx.id)}
                                aria-label={`Eliminar "${displayTitle}"`}
                                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  onDelete(tx.id);
                                  setPendingDeleteId(null);
                                }}
                                aria-label={`Confirmar borrado de "${displayTitle}"`}
                                className="min-h-[40px] px-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors whitespace-nowrap"
                              >
                                Borrar
                              </button>
                              <button
                                type="button"
                                onClick={() => setPendingDeleteId(null)}
                                aria-label="Cancelar borrado"
                                className="min-h-[40px] px-2.5 rounded-xl bg-slate-100 dark:bg-white/[0.08] text-slate-600 dark:text-slate-300 text-xs font-medium"
                              >
                                No
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};
