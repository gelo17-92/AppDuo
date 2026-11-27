import React, { useEffect, useState } from 'react';
import { Check, Lock, Pencil, Plus, SlidersHorizontal, Trash2, X } from 'lucide-react';
import type {
  Category,
  PartnerId,
  PartnerProfile,
  Transaction,
  TransactionType,
} from '../types/finance';
import {
  parseAmountInput,
  resolveTransactionTitle,
  sortCategoriesAlphabetically,
} from '../utils/financeMath';
import {
  AVAILABLE_CATEGORY_COLORS,
  AVAILABLE_CATEGORY_ICONS,
  CategoryIcon,
} from './CategoryIcon';

interface TransactionModalProps {
  isOpen: boolean;
  editingTransaction: Transaction | null;
  presetType?: TransactionType;
  loggedInPartnerId: PartnerId;
  partners: Record<PartnerId, PartnerProfile>;
  categories: Category[];
  defaultDate: string;
  todayDate?: string;
  onClose: () => void;
  onSave: (tx: Transaction) => void;
  onCreateCategory: (cat: Category) => void;
  onUpdateCategory: (cat: Category) => void;
  onDeleteCategory: (categoryId: string) => void;
}

export const TransactionModal: React.FC<TransactionModalProps> = ({
  isOpen,
  editingTransaction,
  presetType = 'expense',
  loggedInPartnerId,
  partners,
  categories,
  defaultDate,
  todayDate,
  onClose,
  onSave,
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory,
}) => {
  const [type, setType] = useState<TransactionType>('expense');
  const [amountRaw, setAmountRaw] = useState('');
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('supermercado');
  const [date, setDate] = useState(defaultDate);
  const [dateManuallyEdited, setDateManuallyEdited] = useState(false);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Inline category manager state inside the modal
  const [managingCategories, setManagingCategories] = useState(false);
  const [catFormMode, setCatFormMode] = useState<'create' | 'edit' | null>(null);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [catName, setCatName] = useState('');
  const [catColor, setCatColor] = useState(AVAILABLE_CATEGORY_COLORS[0]);
  const [catIcon, setCatIcon] = useState('Tag');
  const [catConceptsRaw, setCatConceptsRaw] = useState('');
  const [catFormError, setCatFormError] = useState<string | null>(null);
  const [confirmDeleteCatId, setConfirmDeleteCatId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setManagingCategories(false);
    setCatFormMode(null);
    setEditingCatId(null);
    setConfirmDeleteCatId(null);
    setCatFormError(null);

    if (editingTransaction) {
      setType(editingTransaction.type);
      setAmountRaw(editingTransaction.amount.toFixed(2).replace('.', ','));
      setTitle(editingTransaction.title);
      setCategoryId(editingTransaction.categoryId);
      setDate(editingTransaction.date);
      setDateManuallyEdited(true);
      setNotes(editingTransaction.notes ?? '');
    } else {
      const initialType = presetType;
      setType(initialType);
      setAmountRaw('');
      setTitle('');
      const sortedMatching = sortCategoriesAlphabetically(
        categories.filter((c) => c.type === initialType || c.type === 'both')
      );
      const defaultCat =
        sortedMatching[0]?.id ??
        (initialType === 'income' ? 'nomina' : 'supermercado');
      setCategoryId(defaultCat);
      setDate(defaultDate);
      setDateManuallyEdited(false);
      setNotes('');
    }
  }, [isOpen, editingTransaction, presetType]);

  // Keep new movement date live-synced to defaultDate whenever the viewed month or live day changes
  useEffect(() => {
    if (!isOpen || editingTransaction || dateManuallyEdited) return;
    setDate(defaultDate);
  }, [isOpen, editingTransaction, dateManuallyEdited, defaultDate]);

  if (!isOpen) return null;

  const effectiveTodayDate = todayDate ?? defaultDate;
  const availableCategories = sortCategoriesAlphabetically(
    categories.filter((c) => c.type === type || c.type === 'both')
  );
  const selectedCategory =
    availableCategories.find((c) => c.id === categoryId) ?? availableCategories[0] ?? null;

  const authorId: PartnerId = editingTransaction ? editingTransaction.addedBy : loggedInPartnerId;
  const authorProfile = partners[authorId];

  const handleTypeChange = (nextType: TransactionType) => {
    setType(nextType);
    setCatFormMode(null);
    setConfirmDeleteCatId(null);
    const matching = sortCategoriesAlphabetically(
      categories.filter((c) => c.type === nextType || c.type === 'both')
    );
    if (matching.length > 0 && !matching.some((c) => c.id === categoryId)) {
      setCategoryId(matching[0].id);
    }
  };

  const openCreateCategoryForm = () => {
    setCatFormMode('create');
    setEditingCatId(null);
    setCatName('');
    setCatColor(AVAILABLE_CATEGORY_COLORS[0]);
    setCatIcon(type === 'income' ? 'Briefcase' : 'Tag');
    setCatConceptsRaw('');
    setCatFormError(null);
    setConfirmDeleteCatId(null);
  };

  const openEditCategoryForm = (cat: Category) => {
    setCatFormMode('edit');
    setEditingCatId(cat.id);
    setCatName(cat.name);
    setCatColor(cat.color);
    setCatIcon(cat.icon);
    setCatConceptsRaw(cat.defaultConcepts.join(', '));
    setCatFormError(null);
    setConfirmDeleteCatId(null);
  };

  const handleSaveCategory = () => {
    const cleanName = catName.trim();
    if (!cleanName) {
      setCatFormError('Escribe un nombre para la categoría.');
      return;
    }

    const parsedConcepts = catConceptsRaw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (catFormMode === 'create') {
      const slug = cleanName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const newId = `cat-${slug || 'nueva'}-${Date.now().toString(36).slice(-4)}`;
      const created: Category = {
        id: newId,
        name: cleanName,
        icon: catIcon,
        color: catColor,
        type,
        defaultConcepts: parsedConcepts,
      };
      onCreateCategory(created);
      setCategoryId(created.id);
    } else if (catFormMode === 'edit' && editingCatId) {
      const existing = categories.find((c) => c.id === editingCatId);
      if (existing) {
        onUpdateCategory({
          ...existing,
          name: cleanName,
          icon: catIcon,
          color: catColor,
          defaultConcepts: parsedConcepts,
        });
      }
    }

    setCatFormMode(null);
    setEditingCatId(null);
    setCatFormError(null);
  };

  const handleConfirmDeleteCategory = (targetId: string) => {
    if (availableCategories.length <= 1) return;
    onDeleteCategory(targetId);
    if (categoryId === targetId) {
      const fallback = availableCategories.find((c) => c.id !== targetId);
      if (fallback) setCategoryId(fallback.id);
    }
    setConfirmDeleteCatId(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = parseAmountInput(amountRaw);
    if (numericAmount === null) {
      setError('Introduce un importe válido mayor que 0,00 €.');
      return;
    }
    const resolvedTitle = resolveTransactionTitle(title, selectedCategory?.name);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('Selecciona una fecha válida.');
      return;
    }

    const nowIso = new Date().toISOString();

    const tx: Transaction = {
      id: editingTransaction?.id ?? `tx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      amount: numericAmount,
      title: resolvedTitle,
      categoryId: selectedCategory?.id ?? categoryId,
      date,
      addedBy: authorId,
      fixedExpenseId: editingTransaction?.fixedExpenseId,
      notes: notes.trim() || undefined,
      createdAt: editingTransaction?.createdAt ?? nowIso,
      updatedAt: nowIso,
    };

    onSave(tx);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-xs sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tx-modal-title"
    >
      <div className="w-full sm:max-w-lg max-h-[92dvh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#131922] border-t sm:border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden">
        {/* Grab handle on mobile */}
        <div className="sm:hidden pt-3 pb-1 flex justify-center">
          <div className="w-10 h-1.5 rounded-full bg-slate-300 dark:bg-white/15" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-5 py-3.5 border-b border-slate-100 dark:border-white/[0.06]">
          <h2 id="tx-modal-title" className="text-base font-semibold text-slate-900 dark:text-white truncate">
            {editingTransaction ? 'Editar movimiento' : 'Nuevo movimiento'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar formulario"
            className="min-h-[44px] min-w-[44px] -mr-2 flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body & Pinned Footer */}
        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            {/* Type Switcher */}
            <div
              role="group"
              aria-label="Tipo de movimiento"
              className="grid grid-cols-2 p-1 rounded-2xl bg-slate-100 dark:bg-[#0B0F14] border border-slate-200/70 dark:border-white/[0.06]"
            >
              <button
                type="button"
                onClick={() => handleTypeChange('expense')}
                className={`min-h-[44px] rounded-xl text-sm font-semibold transition-colors ${
                  type === 'expense'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Gasto
              </button>
              <button
                type="button"
                onClick={() => handleTypeChange('income')}
                className={`min-h-[44px] rounded-xl text-sm font-semibold transition-colors ${
                  type === 'income'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Ingreso
              </button>
            </div>

            {/* Hero Numeric Amount Field (inputMode="decimal") */}
            <div className="rounded-2xl bg-slate-50 dark:bg-[#0B0F14] border border-slate-200 dark:border-white/[0.08] px-4 py-3.5">
              <label htmlFor="tx-amount" className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                Importe (€)
              </label>
              <div className="mt-1 flex items-baseline gap-2">
                <input
                  id="tx-amount"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0,00"
                  value={amountRaw}
                  onChange={(e) => {
                    setAmountRaw(e.target.value);
                    setError(null);
                  }}
                  className="w-full bg-transparent text-3xl font-bold font-num text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:outline-none"
                />
                <span className="text-2xl font-bold text-slate-400 shrink-0">€</span>
              </div>
            </div>

            {/* Date Field (Before Category, opens calendar in the viewed month) */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label htmlFor="tx-date" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Fecha
                </label>
                {!editingTransaction &&
                  defaultDate === effectiveTodayDate &&
                  date !== effectiveTodayDate && (
                    <button
                      type="button"
                      onClick={() => {
                        setDate(effectiveTodayDate);
                        setDateManuallyEdited(false);
                      }}
                      className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline whitespace-nowrap"
                    >
                      Hoy
                    </button>
                  )}
              </div>
              <input
                id="tx-date"
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setDateManuallyEdited(true);
                }}
                className="w-full min-h-[46px] px-3 rounded-xl bg-slate-50 dark:bg-[#0B0F14] border border-slate-200 dark:border-white/[0.08] text-slate-900 dark:text-white text-base focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              />
            </div>

            {/* Category Quick Picker + Inline CRUD Manager */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Categoría
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setManagingCategories((prev) => !prev);
                    setCatFormMode(null);
                    setConfirmDeleteCatId(null);
                    setCatFormError(null);
                  }}
                  className={`inline-flex items-center gap-1.5 min-h-[34px] px-2.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                    managingCategories
                      ? 'bg-emerald-600 text-white'
                      : 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10'
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{managingCategories ? 'Listo' : 'Gestionar categorías'}</span>
                </button>
              </div>

              {!managingCategories ? (
                <div data-testid="tx-category-grid" className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {availableCategories.map((cat) => {
                    const active = selectedCategory?.id === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setCategoryId(cat.id)}
                        className={`flex items-center gap-2 min-h-[44px] px-3 rounded-xl border text-left transition-colors ${
                          active
                            ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white'
                            : 'bg-slate-50 dark:bg-[#0B0F14] border-slate-200 dark:border-white/[0.08] text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-white/20'
                        }`}
                      >
                        <CategoryIcon
                          name={cat.icon}
                          className="w-4 h-4 shrink-0"
                          style={{ color: active ? undefined : cat.color }}
                        />
                        <span className="text-xs font-medium truncate">{cat.name}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl bg-slate-50 dark:bg-[#0B0F14] border border-slate-200 dark:border-white/[0.08] p-3.5 space-y-3">
                  {/* Create / Edit Form */}
                  {catFormMode ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-slate-900 dark:text-white">
                          {catFormMode === 'create'
                            ? `Nueva categoría (${type === 'income' ? 'Ingreso' : 'Gasto'})`
                            : 'Editar categoría'}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setCatFormMode(null);
                            setCatFormError(null);
                          }}
                          className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white"
                        >
                          Cancelar
                        </button>
                      </div>

                      <div>
                        <label
                          htmlFor="cat-editor-name"
                          className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1"
                        >
                          Nombre de la categoría
                        </label>
                        <input
                          id="cat-editor-name"
                          type="text"
                          value={catName}
                          onChange={(e) => {
                            setCatName(e.target.value);
                            setCatFormError(null);
                          }}
                          placeholder="Ej. Mascotas, Gimnasio, Guardería..."
                          className="w-full min-h-[42px] px-3 rounded-xl bg-white dark:bg-[#131922] border border-slate-200 dark:border-white/[0.08] text-slate-900 dark:text-white text-base focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="cat-editor-concepts"
                          className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1"
                        >
                          Conceptos predefinidos (separados por comas)
                        </label>
                        <input
                          id="cat-editor-concepts"
                          type="text"
                          value={catConceptsRaw}
                          onChange={(e) => setCatConceptsRaw(e.target.value)}
                          placeholder="Ej. Veterinario, Pienso, Accesorios"
                          className="w-full min-h-[42px] px-3 rounded-xl bg-white dark:bg-[#131922] border border-slate-200 dark:border-white/[0.08] text-slate-900 dark:text-white text-base focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                        />
                      </div>

                      <div>
                        <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                          Color
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {AVAILABLE_CATEGORY_COLORS.map((hex) => (
                            <button
                              key={hex}
                              type="button"
                              onClick={() => setCatColor(hex)}
                              aria-label={`Seleccionar color ${hex}`}
                              className={`w-7 h-7 rounded-full flex items-center justify-center transition-transform ${
                                catColor === hex ? 'ring-2 ring-offset-2 ring-slate-900 dark:ring-white dark:ring-offset-[#0B0F14] scale-110' : ''
                              }`}
                              style={{ backgroundColor: hex }}
                            >
                              {catColor === hex && <Check className="w-3.5 h-3.5 text-white" />}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                          Icono
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {AVAILABLE_CATEGORY_ICONS.map(({ name, label }) => {
                            const selected = catIcon === name;
                            return (
                              <button
                                key={name}
                                type="button"
                                onClick={() => setCatIcon(name)}
                                aria-label={`Icono ${label}`}
                                className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-colors ${
                                  selected
                                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white'
                                    : 'bg-white dark:bg-[#131922] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/[0.08]'
                                }`}
                              >
                                <CategoryIcon name={name} className="w-4 h-4" />
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {catFormError && (
                        <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
                          {catFormError}
                        </p>
                      )}

                      <button
                        type="button"
                        onClick={handleSaveCategory}
                        className="w-full min-h-[42px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors"
                      >
                        {catFormMode === 'create' ? 'Crear categoría' : 'Guardar categoría'}
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                          {availableCategories.length} categorías de{' '}
                          {type === 'income' ? 'ingreso' : 'gasto'}
                        </span>
                        <button
                          type="button"
                          onClick={openCreateCategoryForm}
                          className="inline-flex items-center gap-1 min-h-[36px] px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors whitespace-nowrap"
                        >
                          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Nueva categoría</span>
                        </button>
                      </div>

                      <ul
                        data-testid="tx-category-manage-list"
                        className="divide-y divide-slate-200/70 dark:divide-white/[0.06] max-h-52 overflow-y-auto"
                      >
                        {availableCategories.map((cat) => {
                          const confirming = confirmDeleteCatId === cat.id;
                          return (
                            <li
                              key={cat.id}
                              className="py-2 flex items-center justify-between gap-2"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span
                                  className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                                  style={{
                                    backgroundColor: `${cat.color}1A`,
                                    color: cat.color,
                                  }}
                                >
                                  <CategoryIcon name={cat.icon} className="w-4 h-4" />
                                </span>
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                                    {cat.name}
                                  </p>
                                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                    {cat.defaultConcepts.length > 0
                                      ? `${cat.defaultConcepts.length} conceptos predefinidos`
                                      : 'Sin conceptos predefinidos'}
                                  </p>
                                </div>
                              </div>

                              {confirming ? (
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => handleConfirmDeleteCategory(cat.id)}
                                    className="min-h-[34px] px-2.5 rounded-lg bg-rose-600 text-white text-[11px] font-semibold"
                                  >
                                    Eliminar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteCatId(null)}
                                    className="min-h-[34px] px-2.5 rounded-lg bg-slate-200 dark:bg-white/[0.08] text-slate-700 dark:text-slate-300 text-[11px] font-medium"
                                  >
                                    No
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => openEditCategoryForm(cat)}
                                    aria-label={`Editar categoría ${cat.name}`}
                                    className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-white/[0.08]"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={availableCategories.length <= 1}
                                    onClick={() => setConfirmDeleteCatId(cat.id)}
                                    aria-label={`Eliminar categoría ${cat.name}`}
                                    className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 disabled:opacity-30 disabled:cursor-not-allowed"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Concept + Predefined Concepts Directly Below Concepto */}
            <div className="space-y-3">
              <div>
                <label htmlFor="tx-title" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Concepto <span className="font-normal text-slate-400 dark:text-slate-500">(opcional)</span>
                </label>
                <input
                  id="tx-title"
                  type="text"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setError(null);
                  }}
                  placeholder={
                    selectedCategory
                      ? `Vacío → se guardará como "${selectedCategory.name}"`
                      : type === 'expense'
                        ? 'Ej. Compra semanal Mercadona'
                        : 'Ej. Nómina mensual'
                  }
                  className="w-full min-h-[46px] px-3.5 rounded-xl bg-slate-50 dark:bg-[#0B0F14] border border-slate-200 dark:border-white/[0.08] text-slate-900 dark:text-white placeholder:text-slate-400 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />

                {/* Clickable Predefined Concepts Directly Below Concepto */}
                {selectedCategory && selectedCategory.defaultConcepts.length > 0 && (
                  <div className="mt-2.5" aria-label={`Conceptos frecuentes en ${selectedCategory.name}`}>
                    <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                      Conceptos frecuentes en {selectedCategory.name}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedCategory.defaultConcepts.map((concept) => {
                        const isCurrent = title.trim().toLowerCase() === concept.toLowerCase();
                        return (
                          <button
                            key={concept}
                            type="button"
                            onClick={() => {
                              setTitle(concept);
                              setError(null);
                            }}
                            className={`min-h-[34px] px-3 rounded-xl text-xs font-medium border transition-colors ${
                              isCurrent
                                ? 'bg-emerald-600 border-emerald-600 text-white'
                                : 'bg-slate-50 dark:bg-[#0B0F14] border-slate-200 dark:border-white/[0.08] text-slate-700 dark:text-slate-300 hover:border-emerald-500/50'
                            }`}
                          >
                            {concept}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Optional Note */}
            <div>
              <label htmlFor="tx-notes" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Nota opcional
              </label>
              <input
                id="tx-notes"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ej. Recibo domiciliado, transferencia..."
                className="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-[#0B0F14] border border-slate-200 dark:border-white/[0.08] text-slate-900 dark:text-white placeholder:text-slate-400 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              />
            </div>

            {/* Locked Author Attribution (Authenticated Session) */}
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 dark:bg-[#0B0F14] border border-slate-200 dark:border-white/[0.08] px-3.5 py-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                  style={{ backgroundColor: authorProfile.accentHex }}
                >
                  {authorProfile.initials}
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Registrado por
                  </p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                    {authorProfile.name} · {authorProfile.email}
                  </p>
                </div>
              </div>
              <Lock className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
            </div>
          </div>

          {/* Pinned Bottom Action Footer */}
          <div className="shrink-0 px-5 pt-3 pb-safe border-t border-slate-100 dark:border-white/[0.06] bg-white dark:bg-[#131922] space-y-2.5">
            {error && (
              <div
                role="alert"
                className="rounded-xl bg-rose-500/10 border border-rose-500/30 px-3.5 py-2.5 text-xs font-medium text-rose-600 dark:text-rose-400"
              >
                {error}
              </div>
            )}
            <button
              type="submit"
              className="w-full min-h-[50px] rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-base transition-colors active:scale-[0.99] whitespace-nowrap"
            >
              {editingTransaction
                ? 'Guardar cambios'
                : type === 'income'
                  ? 'Guardar ingreso'
                  : 'Guardar gasto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
