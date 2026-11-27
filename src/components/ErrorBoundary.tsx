import React from 'react';
import { signOut } from 'firebase/auth';
import { AlertTriangle, ArrowLeft, RefreshCw, X } from 'lucide-react';
import { auth } from '../firebase';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Ha ocurrido un error inesperado al sincronizar con la nube.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('ErrorBoundary caught error:', error, info);
  }

  handleCloseAndGoBack = async () => {
    try {
      await signOut(auth);
    } catch {
      // Ignore signOut failures when recovering from error state
    }
    this.setState({ hasError: false, message: '' });
  };

  render() {
    if (this.state.hasError) {
      let friendlyDetail = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message);
        if (parsed?.error) {
          friendlyDetail = `Error de sincronización (${parsed.operationType ?? 'operación'}): ${parsed.error}`;
        }
      } catch {
        // Plain error string
      }

      return (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="error-boundary-title"
          className="min-h-dvh bg-[#F5F7FA] dark:bg-[#0B0F14] text-slate-900 dark:text-white flex items-center justify-center p-6"
        >
          <div className="relative w-full max-w-md rounded-3xl bg-white dark:bg-[#131922] border border-slate-200 dark:border-white/10 p-6 space-y-4 text-center shadow-xl">
            <button
              type="button"
              onClick={this.handleCloseAndGoBack}
              aria-label="Cerrar ventana y volver atrás"
              className="absolute top-3 right-3 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>

            <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" aria-hidden="true" />
            </div>
            <h1 id="error-boundary-title" className="text-lg font-bold">
              No se pudo conectar con tu cuenta
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 break-words leading-relaxed">
              {friendlyDetail}
            </p>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={this.handleCloseAndGoBack}
                className="inline-flex items-center justify-center gap-2 min-h-[46px] px-5 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-semibold hover:opacity-90 transition-opacity whitespace-nowrap"
              >
                <ArrowLeft className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Cerrar y volver atrás</span>
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center justify-center gap-2 min-h-[46px] px-5 rounded-2xl bg-slate-100 dark:bg-white/[0.06] text-slate-700 dark:text-slate-200 hover:bg-slate-200/80 dark:hover:bg-white/[0.1] text-sm font-semibold transition-colors whitespace-nowrap"
              >
                <RefreshCw className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Reintentar</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
