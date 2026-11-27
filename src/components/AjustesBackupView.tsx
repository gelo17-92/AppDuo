import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Download,
  FileJson,
  FileSpreadsheet,
  Lock,
  LogOut,
  Moon,
  RotateCcw,
  ShieldCheck,
  Sun,
  Target,
  Upload,
  UserCheck,
} from 'lucide-react';
import type {
  AppSettings,
  Category,
  FixedExpense,
  PartnerId,
  Transaction,
} from '../types/finance';
import {
  createBackupPayload,
  generateEuropeanCsv,
  getBackupFilename,
  getCsvFilename,
  mergeTransactions,
  validateBackupPayload,
} from '../utils/backupUtils';
import { formatEuropeanDate } from '../utils/financeMath';
import { triggerFileDownload } from '../services/storageService';
import { PWAInstallButton } from './PWAInstallButton';

interface AjustesBackupViewProps {
  settings: AppSettings;
  loggedInPartnerId: PartnerId;
  isCloudSync: boolean;
  transactions: Transaction[];
  monthlyTransactions: Transaction[];
  categories: Category[];
  fixedExpenses: FixedExpense[];
  selectedYear: number;
  selectedMonth: number;
  monthLabel: string;
  onUpdateSettings: (next: AppSettings) => void;
  onUpdateOwnProfile: (partnerId: PartnerId, name: string, email: string) => void;
  onLogout: () => void;
  onImportTransactions: (
    mode: 'merge' | 'replace',
    imported: Transaction[],
    importedCategories: Category[],
    importedFixedExpenses: FixedExpense[],
    importedInitialBalance?: number,
    importedSavingsGoalPercent?: number
  ) => void;
  onResetDemoData: () => void;
  onNotify: (message: string) => void;
}

interface PendingImport {
  filename: string;
  transactions: Transaction[];
  categories: Category[];
  fixedExpenses: FixedExpense[];
  initialBalance?: number;
  savingsGoalPercent?: number;
  exportedAt?: string;
  newCount: number;
  duplicateCount: number;
}

export const AjustesBackupView: React.FC<AjustesBackupViewProps> = ({
  settings,
  loggedInPartnerId,
  isCloudSync,
  transactions,
  monthlyTransactions,
  categories,
  fixedExpenses,
  selectedYear,
  selectedMonth,
  monthLabel,
  onUpdateSettings,
  onUpdateOwnProfile,
  onLogout,
  onImportTransactions,
  onResetDemoData,
  onNotify,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null);
  const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
  const [confirmingReset, setConfirmingReset] = useState(false);

  const ownPartner = settings.partners[loggedInPartnerId];
  const otherPartnerId: PartnerId = loggedInPartnerId === 'partnerA' ? 'partnerB' : 'partnerA';
  const otherPartner = settings.partners[otherPartnerId];

  // Monthly savings goal setting
  const [savingsGoalRaw, setSavingsGoalRaw] = useState(String(settings.savingsGoalPercent));
  const [goalError, setGoalError] = useState<string | null>(null);
  const [goalSaved, setGoalSaved] = useState(false);

  // Editable ONLY for the currently authenticated user
  const [ownName, setOwnName] = useState(ownPartner.name);
  const [ownEmail, setOwnEmail] = useState(ownPartner.email);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);

  useEffect(() => {
    setOwnName(ownPartner.name);
    setOwnEmail(ownPartner.email);
  }, [ownPartner.name, ownPartner.email]);

  useEffect(() => {
    setSavingsGoalRaw(String(settings.savingsGoalPercent));
  }, [settings.savingsGoalPercent]);

  const handleSaveSavingsGoal = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedGoal = Number(savingsGoalRaw.replace(',', '.'));
    if (!Number.isFinite(parsedGoal) || parsedGoal < 1 || parsedGoal > 100) {
      setGoalError('La meta de ahorro debe estar entre 1% y 100% (ej. 20).');
      return;
    }

    setGoalError(null);
    onUpdateSettings({
      ...settings,
      savingsGoalPercent: Math.round(parsedGoal),
    });
    setGoalSaved(true);
    onNotify('Meta de ahorro actualizada.');
    setTimeout(() => setGoalSaved(false), 2500);
  };

  const handleSaveOwnProfile = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = ownName.trim();
    const cleanEmail = isCloudSync ? ownPartner.email : ownEmail.trim().toLowerCase();
    if (!cleanName) {
      setProfileError('Tu nombre no puede quedar vacío.');
      return;
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setProfileError('Introduce un correo electrónico válido.');
      return;
    }
    if (!isCloudSync && cleanEmail === otherPartner.email.trim().toLowerCase()) {
      setProfileError('Tu correo no puede coincidir con el del otro usuario.');
      return;
    }

    setProfileError(null);
    onUpdateOwnProfile(loggedInPartnerId, cleanName, cleanEmail);
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2500);
  };

  const handleToggleTheme = (theme: 'dark' | 'light') => {
    onUpdateSettings({ ...settings, theme });
  };

  const handleExportJson = () => {
    const payload = createBackupPayload({
      transactions,
      categories,
      fixedExpenses,
      partners: settings.partners,
      allowedEmails: settings.allowedEmails,
      initialBalance: settings.initialBalance,
      savingsGoalPercent: settings.savingsGoalPercent,
      exportedByEmail: ownPartner.email,
    });
    const filename = getBackupFilename(new Date());
    triggerFileDownload(JSON.stringify(payload, null, 2), filename, 'application/json;charset=utf-8');
    onNotify(`Backup descargado: ${filename}`);
  };

  const handleExportCsv = (scope: 'month' | 'all') => {
    const list = scope === 'month' ? monthlyTransactions : transactions;
    const csv = generateEuropeanCsv(list, categories, settings.partners);
    const filename =
      scope === 'month' ? getCsvFilename(selectedYear, selectedMonth) : getCsvFilename();
    triggerFileDownload(csv, filename, 'text/csv;charset=utf-8');
    onNotify(`Archivo Excel CSV descargado (${list.length} registros).`);
  };

  const handleSelectBackupFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setImportError(null);
    setPendingImport(null);
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const validation = validateBackupPayload(parsed);

      if (!validation.valid) {
        setImportError(validation.error);
        return;
      }

      const mergePreview = mergeTransactions(transactions, validation.data.transactions);
      setPendingImport({
        filename: file.name,
        transactions: validation.data.transactions,
        categories: validation.data.categories,
        fixedExpenses: validation.data.fixedExpenses,
        initialBalance: validation.data.initialBalance,
        savingsGoalPercent: validation.data.savingsGoalPercent,
        exportedAt: validation.data.exportedAt,
        newCount: mergePreview.addedCount,
        duplicateCount: mergePreview.skippedCount,
      });
    } catch {
      setImportError('No se pudo leer el archivo JSON. Comprueba que no esté dañado.');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleConfirmImport = () => {
    if (!pendingImport) return;
    onImportTransactions(
      importMode,
      pendingImport.transactions,
      pendingImport.categories,
      pendingImport.fixedExpenses,
      pendingImport.initialBalance,
      pendingImport.savingsGoalPercent
    );
    setPendingImport(null);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Column 1: Own Editable Profile (Locked Other Partner), Bank Account & Appearance */}
        <div className="space-y-6">
          {/* Authenticated User Profile (Only Own Settings Editable) */}
          <section
            aria-labelledby="perfil-propio-heading"
            className="rounded-3xl bg-white dark:bg-[#131922] border border-slate-200/80 dark:border-white/[0.08] p-5 sm:p-6 space-y-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <UserCheck className="w-5 h-5 text-emerald-500 shrink-0" aria-hidden="true" />
                <div>
                  <h2 id="perfil-propio-heading" className="text-base font-semibold text-slate-900 dark:text-white">
                    Tu perfil (sesión activa)
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Solo puedes editar tus propios datos personales
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onLogout}
                className="inline-flex items-center gap-1.5 min-h-[38px] px-3 rounded-xl bg-slate-100 dark:bg-white/[0.06] hover:bg-rose-500/10 text-slate-700 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Cerrar sesión</span>
              </button>
            </div>

            <form onSubmit={handleSaveOwnProfile} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="own-name" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Tu nombre
                  </label>
                  <input
                    id="own-name"
                    type="text"
                    value={ownName}
                    onChange={(e) => {
                      setOwnName(e.target.value);
                      setProfileError(null);
                    }}
                    className="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-[#0B0F14] border border-slate-200 dark:border-white/[0.08] text-slate-900 dark:text-white text-base focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                </div>
                <div>
                  <label htmlFor="own-email" className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Tu correo electrónico {isCloudSync ? '(verificado)' : ''}
                  </label>
                  <input
                    id="own-email"
                    type="email"
                    value={ownEmail}
                    readOnly={isCloudSync}
                    onChange={(e) => {
                      if (isCloudSync) return;
                      setOwnEmail(e.target.value);
                      setProfileError(null);
                    }}
                    className={`w-full min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-[#0B0F14] border border-slate-200 dark:border-white/[0.08] text-base focus:outline-none ${
                      isCloudSync
                        ? 'text-slate-500 dark:text-slate-400 cursor-not-allowed'
                        : 'text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500/50'
                    }`}
                  />
                </div>
              </div>

              {profileError && (
                <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
                  {profileError}
                </p>
              )}

              <button
                type="submit"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-semibold hover:opacity-90 transition-opacity whitespace-nowrap"
              >
                {profileSaved && <Check className="w-4 h-4" aria-hidden="true" />}
                <span>{profileSaved ? 'Perfil guardado' : 'Guardar mi perfil'}</span>
              </button>
            </form>

            {/* Other Partner Strictly Read-Only Card */}
            <div
              aria-label="Perfil del otro usuario (solo lectura)"
              className="pt-4 border-t border-slate-100 dark:border-white/[0.06]"
            >
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 dark:bg-[#0B0F14] border border-slate-200/80 dark:border-white/[0.06] px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 opacity-85"
                    style={{ backgroundColor: otherPartner.accentHex }}
                  >
                    {otherPartner.initials}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {otherPartner.name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {otherPartner.email}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 shrink-0">
                  <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                  <span className="whitespace-nowrap">Solo lectura</span>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                Los ajustes de {otherPartner.name} están protegidos y solo pueden editarse iniciando sesión con su correo.
              </p>
            </div>
          </section>

          {/* Monthly Savings Goal */}
          <section
            aria-labelledby="meta-ahorro-ajustes-heading"
            className="rounded-3xl bg-white dark:bg-[#131922] border border-slate-200/80 dark:border-white/[0.08] p-5 sm:p-6 space-y-4"
          >
            <div className="flex items-center gap-2.5">
              <Target className="w-5 h-5 text-emerald-500 shrink-0" aria-hidden="true" />
              <div>
                <h2
                  id="meta-ahorro-ajustes-heading"
                  className="text-base font-semibold text-slate-900 dark:text-white"
                >
                  Meta de ahorro mensual
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Objetivo común de ahorro sobre los ingresos de cada mes
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveSavingsGoal} className="space-y-3.5">
              <div>
                <label
                  htmlFor="savings-goal-percent"
                  className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                >
                  Objetivo de ahorro mensual (%)
                </label>
                <input
                  id="savings-goal-percent"
                  type="number"
                  min={1}
                  max={100}
                  value={savingsGoalRaw}
                  onChange={(e) => {
                    setSavingsGoalRaw(e.target.value);
                    setGoalError(null);
                  }}
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-[#0B0F14] border border-slate-200 dark:border-white/[0.08] font-num text-slate-900 dark:text-white text-base focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>

              {goalError && (
                <p role="alert" className="text-xs font-medium text-rose-600 dark:text-rose-400">
                  {goalError}
                </p>
              )}

              <button
                type="submit"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors whitespace-nowrap"
              >
                {goalSaved && <Check className="w-4 h-4" aria-hidden="true" />}
                <span>{goalSaved ? 'Meta guardada' : 'Guardar meta de ahorro'}</span>
              </button>
            </form>
          </section>

          {/* Theme & PWA Installation */}
          <section
            aria-labelledby="apariencia-heading"
            className="rounded-3xl bg-white dark:bg-[#131922] border border-slate-200/80 dark:border-white/[0.08] p-5 sm:p-6 space-y-4"
          >
            <h2 id="apariencia-heading" className="text-base font-semibold text-slate-900 dark:text-white">
              Apariencia e instalación móvil
            </h2>

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">Tema visual</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Modo oscuro por defecto, adaptable a luz de día
                </p>
              </div>
              <div
                role="group"
                aria-label="Seleccionar tema"
                className="inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-[#0B0F14] border border-slate-200/60 dark:border-white/[0.06]"
              >
                <button
                  type="button"
                  onClick={() => handleToggleTheme('dark')}
                  className={`inline-flex items-center gap-1.5 min-h-[38px] px-3 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                    settings.theme === 'dark'
                      ? 'bg-white dark:bg-[#1E293B] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <Moon className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Oscuro</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleTheme('light')}
                  className={`inline-flex items-center gap-1.5 min-h-[38px] px-3 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                    settings.theme === 'light'
                      ? 'bg-white dark:bg-[#1E293B] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <Sun className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Claro</span>
                </button>
              </div>
            </div>

            <div className="pt-2">
              <PWAInstallButton />
            </div>
          </section>
        </div>

        {/* Column 2: Full Backup & Export/Import Module */}
        <div className="space-y-6">
          <section
            aria-labelledby="backup-heading"
            className="rounded-3xl bg-white dark:bg-[#131922] border border-slate-200/80 dark:border-white/[0.08] p-5 sm:p-6 space-y-5"
          >
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0" aria-hidden="true" />
              <div>
                <h2 id="backup-heading" className="text-base font-semibold text-slate-900 dark:text-white">
                  Copias de seguridad y exportación
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {transactions.length} movimientos, {categories.length} categorías y {fixedExpenses.length} gastos fijos
                </p>
              </div>
            </div>

            {/* Export Complete JSON */}
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={handleExportJson}
                className="w-full flex items-center justify-between gap-3 min-h-[54px] px-4 py-3 rounded-2xl bg-slate-50 dark:bg-[#0B0F14] border border-slate-200 dark:border-white/[0.08] hover:border-emerald-500/50 text-left transition-colors"
              >
                <span className="flex items-center gap-3 min-w-0">
                  <FileJson className="w-5 h-5 text-emerald-500 shrink-0" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-900 dark:text-white">
                      Exportar Backup Completo (.json)
                    </span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">
                      {getBackupFilename()}
                    </span>
                  </span>
                </span>
                <Download className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
              </button>

              {/* Export Excel CSV (Month & All) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleExportCsv('month')}
                  className="flex items-center justify-between gap-2 min-h-[52px] px-4 py-3 rounded-2xl bg-slate-50 dark:bg-[#0B0F14] border border-slate-200 dark:border-white/[0.08] hover:border-sky-500/50 text-left transition-colors"
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <FileSpreadsheet className="w-4 h-4 text-sky-500 shrink-0" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-slate-900 dark:text-white truncate">
                        Excel CSV ({monthLabel})
                      </span>
                      <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                        {monthlyTransactions.length} filas · Formato € (;)
                      </span>
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleExportCsv('all')}
                  className="flex items-center justify-between gap-2 min-h-[52px] px-4 py-3 rounded-2xl bg-slate-50 dark:bg-[#0B0F14] border border-slate-200 dark:border-white/[0.08] hover:border-sky-500/50 text-left transition-colors"
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <FileSpreadsheet className="w-4 h-4 text-sky-500 shrink-0" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-slate-900 dark:text-white truncate">
                        Excel CSV (Histórico)
                      </span>
                      <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                        {transactions.length} filas · Formato € (;)
                      </span>
                    </span>
                  </span>
                </button>
              </div>
            </div>

            {/* Import / Restore JSON Backup */}
            <div className="pt-4 border-t border-slate-100 dark:border-white/[0.06] space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Importar / Restaurar Backup (.json)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Valida la estructura del archivo y te muestra una vista previa antes de aplicar cambios.
                </p>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleSelectBackupFile}
                aria-label="Seleccionar archivo JSON de copia de seguridad"
                className="hidden"
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 min-h-[48px] px-4 py-3 rounded-2xl border border-dashed border-slate-300 dark:border-white/20 text-sm font-medium text-slate-700 dark:text-slate-300 hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
              >
                <Upload className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Seleccionar archivo .json para restaurar</span>
              </button>

              {importError && (
                <div
                  role="alert"
                  className="rounded-2xl bg-rose-500/10 border border-rose-500/30 px-4 py-3 text-xs font-medium text-rose-600 dark:text-rose-400"
                >
                  {importError}
                </div>
              )}

              {pendingImport && (
                <div className="rounded-2xl bg-slate-50 dark:bg-[#0B0F14] border border-emerald-500/40 p-4 space-y-3.5">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      Vista previa: {pendingImport.filename}
                    </p>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                      <strong className="font-num text-slate-900 dark:text-white">
                        {pendingImport.transactions.length}
                      </strong>{' '}
                      {pendingImport.transactions.length === 1 ? 'movimiento válido' : 'movimientos válidos'} (
                      {pendingImport.newCount} {pendingImport.newCount === 1 ? 'nuevo' : 'nuevos'} ·{' '}
                      {pendingImport.duplicateCount}{' '}
                      {pendingImport.duplicateCount === 1 ? 'ya existente' : 'ya existentes'} por ID)
                      {pendingImport.exportedAt && (
                        <> · Exportado el {formatEuropeanDate(pendingImport.exportedAt.slice(0, 10))}</>
                      )}
                    </p>
                  </div>

                  <div className="space-y-2" role="radiogroup" aria-label="Modo de importación">
                    <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-white/[0.08] cursor-pointer hover:bg-white dark:hover:bg-white/[0.02]">
                      <input
                        type="radio"
                        name="import-mode"
                        checked={importMode === 'merge'}
                        onChange={() => setImportMode('merge')}
                        className="mt-0.5 accent-emerald-500"
                      />
                      <span className="text-xs">
                        <strong className="block text-slate-900 dark:text-white">
                          Combinar con los datos actuales (evitando duplicados por ID)
                        </strong>
                        <span className="text-slate-500 dark:text-slate-400">
                          Añadirá {pendingImport.newCount}{' '}
                          {pendingImport.newCount === 1 ? 'movimiento nuevo' : 'movimientos nuevos'} y conservará los actuales.
                        </span>
                      </span>
                    </label>

                    <label className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-white/[0.08] cursor-pointer hover:bg-white dark:hover:bg-white/[0.02]">
                      <input
                        type="radio"
                        name="import-mode"
                        checked={importMode === 'replace'}
                        onChange={() => setImportMode('replace')}
                        className="mt-0.5 accent-emerald-500"
                      />
                      <span className="text-xs">
                        <strong className="block text-slate-900 dark:text-white">
                          Reemplazar todo
                        </strong>
                        <span className="text-slate-500 dark:text-slate-400">
                          Sustituirá todos los movimientos actuales por los {pendingImport.transactions.length} del archivo.
                        </span>
                      </span>
                    </label>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleConfirmImport}
                      className="flex-1 min-h-[44px] px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors whitespace-nowrap"
                    >
                      Importar ahora
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingImport(null)}
                      className="min-h-[44px] px-4 rounded-xl bg-slate-200 dark:bg-white/[0.08] text-slate-700 dark:text-slate-300 text-sm font-medium whitespace-nowrap"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Reset Demo Dataset */}
            <div className="pt-4 border-t border-slate-100 dark:border-white/[0.06]">
              {!confirmingReset ? (
                <button
                  type="button"
                  onClick={() => setConfirmingReset(true)}
                  className="inline-flex items-center gap-2 min-h-[44px] text-xs font-medium text-slate-500 hover:text-rose-500 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Restaurar datos de ejemplo iniciales</span>
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-600 dark:text-slate-400">
                    ¿Restaurar los datos de demostración?
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onResetDemoData();
                      setConfirmingReset(false);
                    }}
                    className="min-h-[38px] px-3.5 rounded-xl bg-rose-600 text-white text-xs font-semibold"
                  >
                    Sí, restaurar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingReset(false)}
                    className="min-h-[38px] px-3.5 rounded-xl bg-slate-100 dark:bg-white/[0.08] text-slate-700 dark:text-slate-300 text-xs font-medium"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
