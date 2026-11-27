import React, { useEffect, useState } from 'react';

interface SplashScreenProps {
  durationMs?: number;
  fadeOutMs?: number;
  onComplete: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  durationMs = 2500,
  fadeOutMs = 450,
  onComplete,
}) => {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    const fadeTimer = window.setTimeout(() => {
      setExiting(true);
    }, durationMs);

    const doneTimer = window.setTimeout(() => {
      onComplete();
    }, durationMs + fadeOutMs);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(doneTimer);
    };
  }, [durationMs, fadeOutMs, onComplete]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Cargando AppDuo Ingresos y Gastos"
      data-testid="splash-screen"
      data-state={exiting ? 'exiting' : 'visible'}
      className={`fixed inset-0 z-[100] h-[100dvh] w-full overflow-hidden bg-[#F5F7FA] dark:bg-[#0B0F14] text-slate-900 dark:text-[#F4F6F9] flex flex-col items-center justify-between px-6 py-12 sm:py-16 select-none transition-[opacity,transform] duration-[450ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
        exiting ? 'opacity-0 scale-[1.02] pointer-events-none' : 'opacity-100 scale-100'
      }`}
    >
      {/* Subtle radial atmospheric accent behind the emblem */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <div className="h-[340px] w-[340px] sm:h-[420px] sm:w-[420px] rounded-full bg-gradient-to-tr from-emerald-500/12 via-sky-500/10 to-transparent dark:from-emerald-500/14 dark:via-sky-500/10 blur-3xl" />
      </div>

      {/* Top spacer for vertical optical balance */}
      <div className="h-6 shrink-0" aria-hidden="true" />

      {/* Center Brand Lockup: Minimalist Duo Financial SVG + Title + Subtitle */}
      <div className="relative z-10 flex flex-col items-center text-center animate-splash-enter">
        {/* Minimalist Emblem: Interconnected Duo Circles + Opposing Flow Arrows */}
        <div className="mb-6 sm:mb-7 flex h-24 w-24 sm:h-28 sm:w-28 items-center justify-center rounded-[28px] sm:rounded-[32px] bg-white dark:bg-[#131922] border border-slate-200/80 dark:border-white/[0.08] shadow-xl shadow-slate-900/[0.06] dark:shadow-black/40">
          <svg
            viewBox="0 0 88 88"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="h-16 w-16 sm:h-[72px] sm:w-[72px]"
            aria-hidden="true"
          >
            {/* Left circle (Ingresos / Emerald) */}
            <circle cx="34" cy="44" r="20" stroke="#10B981" strokeWidth="4.25" />
            {/* Right circle (Gastos / Financial Sky Blue) */}
            <circle cx="54" cy="44" r="20" stroke="#0EA5E9" strokeWidth="4.25" />
            {/* Subtle overlap balance lens */}
            <path
              d="M44 26.7C49.2 30.8 52.5 37 52.5 44C52.5 51 49.2 57.2 44 61.3C38.8 57.2 35.5 51 35.5 44C35.5 37 38.8 30.8 44 26.7Z"
              fill="#10B981"
              fillOpacity="0.18"
            />
            {/* Upward-right minimalist arrow (Ingresos) */}
            <path
              d="M27.5 48.5L35 41M35 41H29.5M35 41V46.5"
              stroke="#10B981"
              strokeWidth="2.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Downward-left minimalist arrow (Gastos) */}
            <path
              d="M60.5 39.5L53 47M53 47H58.5M53 47V41.5"
              stroke="#0EA5E9"
              strokeWidth="2.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* Main Brand Title */}
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 dark:text-white leading-none">
          AppDuo
        </h1>

        {/* Subtle Subtitle */}
        <p className="mt-2.5 text-sm sm:text-base font-medium tracking-wide text-slate-500 dark:text-slate-400">
          Ingresos y Gastos
        </p>
      </div>

      {/* Bottom Minimalist Animated Progress Bar */}
      <div className="relative z-10 flex flex-col items-center gap-3 w-full max-w-[200px] sm:max-w-[220px] pb-safe animate-splash-bar-enter">
        <div
          role="progressbar"
          aria-label="Iniciando aplicación"
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-1 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-white/[0.08]"
        >
          <div className="h-full w-full rounded-full bg-gradient-to-r from-emerald-500 to-sky-500 animate-splash-bar-fill" />
        </div>
      </div>
    </div>
  );
};
