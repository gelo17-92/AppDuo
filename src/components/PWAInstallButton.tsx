import React, { useState } from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
  variant?: 'primary' | 'subtle';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  compact = false,
  variant = 'primary',
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      await install();
    } else {
      setShowGuide(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={
          compact
            ? 'inline-flex items-center justify-center gap-2 min-h-[44px] px-3.5 py-2 rounded-xl text-sm font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors whitespace-nowrap shrink-0'
            : variant === 'subtle'
              ? 'w-full flex items-center justify-between gap-3 min-h-[48px] px-4 py-3 rounded-2xl bg-white dark:bg-[#131922] border border-slate-200/80 dark:border-white/[0.08] hover:border-emerald-500/40 text-slate-900 dark:text-white font-medium text-sm transition-colors active:scale-[0.99]'
              : 'w-full flex items-center justify-between gap-3 min-h-[48px] px-4 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm transition-colors active:scale-[0.99]'
        }
      >
        <span className="flex items-center gap-2.5 whitespace-nowrap">
          {isInstallable ? (
            <Download
              className={`w-4 h-4 shrink-0 ${variant === 'subtle' && !compact ? 'text-emerald-600 dark:text-emerald-400' : ''}`}
              aria-hidden="true"
            />
          ) : (
            <Smartphone
              className={`w-4 h-4 shrink-0 ${variant === 'subtle' && !compact ? 'text-emerald-600 dark:text-emerald-400' : ''}`}
              aria-hidden="true"
            />
          )}
          <span>{isInstallable ? 'Instalar app en el móvil' : isIOS ? 'Instalar en iPhone' : 'Instalar como app'}</span>
        </span>
        {!compact && (
          <span
            className={`text-xs whitespace-nowrap ${
              variant === 'subtle' ? 'text-slate-500 dark:text-slate-400' : 'text-emerald-100'
            }`}
          >
            Pantalla completa
          </span>
        )}
      </button>

      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-guide-title"
        >
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-[#131922] border border-slate-200 dark:border-white/10 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="pwa-guide-title" className="text-lg font-semibold text-slate-900 dark:text-white">
                  Instalar AppDuo en tu pantalla de inicio
                </h3>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  Se abrirá a pantalla completa, sin barra del navegador, igual que una app nativa.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Cerrar guía de instalación"
                className="min-h-[44px] min-w-[44px] -mr-2 -mt-2 flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-5 space-y-4 text-sm text-slate-700 dark:text-slate-300">
              <div className="rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/70 dark:border-white/[0.06] p-4">
                <p className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Share className="w-4 h-4 text-emerald-500" aria-hidden="true" />
                  En iPhone / iPad (Safari)
                </p>
                <ol className="mt-2 space-y-1.5 list-decimal list-inside text-slate-600 dark:text-slate-400">
                  <li>Abre este enlace directamente en <strong>Safari</strong>.</li>
                  <li>Pulsa el botón <strong>Compartir</strong> en la barra inferior.</li>
                  <li>Desliza hacia abajo y elige <strong>Añadir a pantalla de inicio</strong>.</li>
                  <li>Pulsa <strong>Añadir</strong> y ábrela desde el icono de tu pantalla de inicio (sin barra del navegador).</li>
                </ol>
              </div>

              <div className="rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200/70 dark:border-white/[0.06] p-4">
                <p className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-sky-500" aria-hidden="true" />
                  En Android (Google Chrome)
                </p>
                <ol className="mt-2 space-y-1.5 list-decimal list-inside text-slate-600 dark:text-slate-400">
                  <li>Abre este enlace en <strong>Chrome</strong> (no dentro de WhatsApp).</li>
                  <li>Pulsa el menú <strong>⋮</strong> en la esquina superior derecha.</li>
                  <li>Selecciona <strong>Instalar aplicación</strong> y confirma para abrirla en pantalla completa.</li>
                </ol>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-5 w-full min-h-[48px] rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  );
};
