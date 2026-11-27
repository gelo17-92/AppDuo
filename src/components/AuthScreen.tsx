import React, { useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Cloud, KeyRound, Mail, Moon, Sun, X } from 'lucide-react';
import { auth, ensurePersistentAuth, googleProvider } from '../firebase';
import { buildUnauthorizedEmailMessage, isAuthorizedCoupleEmail } from '../utils/authPolicy';
import { PWAInstallButton } from './PWAInstallButton';

interface AuthScreenProps {
  theme: 'dark' | 'light';
  initialError?: string | null;
  onClearInitialError?: () => void;
  onToggleTheme: () => void;
}

export function mapFirebaseAuthError(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code)
      : '';
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';

  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Se cerró la ventana de inicio de sesión antes de completar el acceso.';
    case 'auth/popup-blocked':
      return 'El navegador bloqueó la ventana emergente de Google. Permite las ventanas emergentes o abre el enlace directamente en Safari/Chrome.';
    case 'auth/unauthorized-domain':
      return `El dominio "${hostname}" aún no está autorizado en Firebase Authentication. Añádelo en Firebase Console → Authentication → Settings → Authorized domains.`;
    case 'auth/operation-not-supported-in-this-environment':
    case 'auth/web-storage-unsupported':
      return 'Este navegador restringe el acceso de Google. Abre el enlace directamente en Safari (iPhone) o Google Chrome (Android).';
    case 'auth/invalid-email':
      return 'El formato del correo electrónico no es válido.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Correo o contraseña incorrectos. Si usas Gmail, pulsa el botón verde "Continuar con Google".';
    case 'auth/email-already-in-use':
      return 'Este correo ya tiene una cuenta registrada. Cambia a "Iniciar sesión" o entra con "Continuar con Google".';
    case 'auth/account-exists-with-different-credential':
      return 'Ya existe una cuenta con este correo usando otro método de acceso. Inicia sesión con Google.';
    case 'auth/weak-password':
      return 'La contraseña debe tener al menos 6 caracteres.';
    case 'auth/operation-not-allowed':
      return 'Para acceder con tu cuenta de Google pulsa el botón verde "Continuar con Google". (El acceso con contraseña requiere activarlo en Firebase Console → Authentication → Sign-in method → Correo electrónico/contraseña).';
    case 'auth/network-request-failed':
      return 'Sin conexión con Firebase. Comprueba tu red e inténtalo de nuevo.';
    default:
      return code
        ? `No se pudo completar el inicio de sesión (${code}). Inténtalo de nuevo o abre el enlace en Safari/Chrome.`
        : 'No se pudo completar el inicio de sesión. Inténtalo de nuevo.';
  }
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  theme,
  initialError = null,
  onClearInitialError,
  onToggleTheme,
}) => {
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [errorTitle, setErrorTitle] = useState<string>('No se pudo iniciar sesión');
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (initialError) {
      setErrorTitle(
        initialError.includes('no está autorizada')
          ? 'Cuenta no autorizada'
          : 'Error al iniciar sesión con Google'
      );
      setError(initialError);
    }
  }, [initialError]);

  const dismissErrorModal = () => {
    setError(null);
    onClearInitialError?.();
  };

  useEffect(() => {
    if (!error) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        dismissErrorModal();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [error]);

  const handleGoogleSignIn = async () => {
    setBusy(true);
    setError(null);
    setInfo(null);

    const isInIframe = typeof window !== 'undefined' && window.self !== window.top;

    try {
      await ensurePersistentAuth();

      // Always prefer signInWithPopup first (even in installed PWAs): modern Safari/Chrome
      // storage partitioning can drop cross-origin signInWithRedirect sessions, whereas popup
      // writes the persistent token directly into this origin's IndexedDB.
      const cred = await signInWithPopup(auth, googleProvider);
      if (cred.user && !isAuthorizedCoupleEmail(cred.user.email)) {
        const attemptedEmail = cred.user.email ?? '';
        await signOut(auth).catch(() => {});
        setErrorTitle('Cuenta no autorizada');
        setError(buildUnauthorizedEmailMessage(attemptedEmail));
      }
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code)
          : '';

      // Automatic redirect fallback only when a top-level mobile browser blocks popups
      if (
        !isInIframe &&
        (code === 'auth/popup-blocked' ||
          code === 'auth/operation-not-supported-in-this-environment' ||
          code === 'auth/web-storage-unsupported')
      ) {
        try {
          await ensurePersistentAuth();
          await signInWithRedirect(auth, googleProvider);
          return;
        } catch (redirectErr) {
          setErrorTitle('Error al iniciar sesión con Google');
          setError(mapFirebaseAuthError(redirectErr));
          return;
        }
      }

      setErrorTitle('Error al iniciar sesión con Google');
      setError(mapFirebaseAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorTitle('Correo electrónico no válido');
      setError('Introduce un correo electrónico válido para continuar.');
      return;
    }
    if (!isAuthorizedCoupleEmail(cleanEmail)) {
      setErrorTitle('Cuenta no autorizada');
      setError(buildUnauthorizedEmailMessage(cleanEmail));
      return;
    }
    if (password.length < 6) {
      setErrorTitle('Contraseña demasiado corta');
      setError('Introduce una contraseña de al menos 6 caracteres.');
      return;
    }

    setBusy(true);
    setError(null);
    setInfo(null);

    try {
      await ensurePersistentAuth();
      if (authMode === 'register') {
        const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        await sendEmailVerification(cred.user);
        await signOut(auth);
        setInfo(
          `Te hemos enviado un correo de verificación a ${cleanEmail}. Verifícalo y vuelve a iniciar sesión para sincronizar con la nube.`
        );
        setAuthMode('login');
      } else {
        const cred = await signInWithEmailAndPassword(auth, cleanEmail, password);
        if (!cred.user.emailVerified) {
          await sendEmailVerification(cred.user).catch(() => {});
          await signOut(auth);
          setErrorTitle('Correo pendiente de verificación');
          setError(
            'Tu correo aún no está verificado. Revisa tu bandeja de entrada, confirma el enlace de verificación y vuelve a entrar.'
          );
        }
      }
    } catch (err) {
      setErrorTitle(
        authMode === 'register'
          ? 'No se pudo crear la cuenta'
          : 'Error al iniciar sesión con correo'
      );
      setError(mapFirebaseAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh bg-[#F5F7FA] dark:bg-[#0B0F14] text-slate-900 dark:text-[#F4F6F9] flex flex-col justify-between px-4 py-6 sm:px-6 transition-colors">
      {/* Top Bar */}
      <header className="w-full max-w-md mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <img
            src="/icon.svg"
            alt="Logotipo AppDuo Ingresos y Gastos"
            className="w-9 h-9 rounded-xl shrink-0"
            referrerPolicy="no-referrer"
          />
          <span className="text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
            AppDuo
          </span>
        </div>

        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-white/[0.06] transition-colors"
        >
          {theme === 'dark' ? (
            <Sun className="w-5 h-5" aria-hidden="true" />
          ) : (
            <Moon className="w-5 h-5" aria-hidden="true" />
          )}
        </button>
      </header>

      {/* Center Login Card */}
      <main className="w-full max-w-md mx-auto my-auto py-8">
        <section
          aria-labelledby="login-heading"
          className="rounded-3xl bg-white dark:bg-[#131922] border border-slate-200/80 dark:border-white/[0.08] p-6 sm:p-8 shadow-sm dark:shadow-none space-y-6"
        >
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <Cloud className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>Sincronización en la nube · AppDuo</span>
            </div>
            <h1
              id="login-heading"
              className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white"
            >
              Inicia sesión con tu correo
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Accede con tu cuenta para sincronizar los movimientos en tiempo real entre vuestros móviles.
            </p>
          </div>

          {/* Primary Firebase Google Sign-In */}
          <div className="space-y-2.5">
            <button
              type="button"
              disabled={busy}
              onClick={handleGoogleSignIn}
              className="w-full inline-flex items-center justify-center gap-3 min-h-[50px] px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-semibold text-base transition-colors active:scale-[0.99] whitespace-nowrap"
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M21.35 11.1h-9.18v2.98h5.27c-.23 1.48-1.69 4.35-5.27 4.35-3.17 0-5.76-2.63-5.76-5.88s2.59-5.88 5.76-5.88c1.81 0 3.02.77 3.71 1.43l2.53-2.44C16.79 4.15 14.69 3.2 12.17 3.2 7.21 3.2 3.2 7.21 3.2 12.17s4.01 8.97 8.97 8.97c5.18 0 8.61-3.64 8.61-8.77 0-.59-.06-1.04-.14-1.27z"
                />
              </svg>
              <span>{busy ? 'Conectando...' : 'Continuar con Google'}</span>
            </button>
            <p className="flex items-center justify-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" aria-hidden="true" />
              <span>La sesión se mantendrá iniciada al volver a entrar</span>
            </p>
          </div>

          {/* Divider */}
          <div className="relative flex items-center">
            <div className="flex-1 border-t border-slate-200 dark:border-white/[0.08]" />
            <span className="px-3 text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">
              o con correo y contraseña
            </span>
            <div className="flex-1 border-t border-slate-200 dark:border-white/[0.08]" />
          </div>

          {/* Email & Password Form */}
          <form onSubmit={handleEmailSubmit} className="space-y-3.5" noValidate>
            <div>
              <label
                htmlFor="login-email"
                className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5"
              >
                Correo electrónico
              </label>
              <div className="relative">
                <Mail
                  className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError(null);
                  }}
                  placeholder="tu.correo@gmail.com"
                  className="w-full min-h-[46px] pl-10 pr-4 rounded-2xl bg-slate-50 dark:bg-[#0B0F14] border border-slate-200 dark:border-white/[0.08] text-slate-900 dark:text-white placeholder:text-slate-400 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5"
              >
                Contraseña
              </label>
              <div className="relative">
                <KeyRound
                  className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  id="login-password"
                  type="password"
                  autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full min-h-[46px] pl-10 pr-4 rounded-2xl bg-slate-50 dark:bg-[#0B0F14] border border-slate-200 dark:border-white/[0.08] text-slate-900 dark:text-white placeholder:text-slate-400 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>
            </div>

            {info && (
              <div
                role="status"
                className="rounded-2xl bg-emerald-500/10 border border-emerald-500/30 px-4 py-3 text-xs font-medium text-emerald-700 dark:text-emerald-400"
              >
                {info}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full inline-flex items-center justify-center gap-2 min-h-[46px] px-5 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold text-sm hover:opacity-90 disabled:opacity-60 transition-opacity whitespace-nowrap"
            >
              <span>{authMode === 'login' ? 'Iniciar sesión con correo' : 'Crear cuenta'}</span>
              <ArrowRight className="w-4 h-4 shrink-0" aria-hidden="true" />
            </button>

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => {
                  setAuthMode((m) => (m === 'login' ? 'register' : 'login'));
                  setError(null);
                  setInfo(null);
                }}
                className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
              >
                {authMode === 'login'
                  ? '¿Primera vez con contraseña? Crear cuenta'
                  : '¿Ya tienes cuenta? Iniciar sesión'}
              </button>
            </div>
          </form>
        </section>

        {/* Native Full-Screen App Install CTA (automatically hidden once installed) */}
        <div className="mt-4">
          <PWAInstallButton variant="subtle" />
        </div>
      </main>

      <footer className="w-full max-w-md mx-auto text-center text-xs text-slate-500 dark:text-slate-500">
        AppDuo Ingresos y Gastos · Datos protegidos y sincronizados en tiempo real con Firebase Firestore.
      </footer>

      {/* Dismissible Auth Error Modal Dialog */}
      {error && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="auth-error-title"
          aria-describedby="auth-error-message"
          data-testid="auth-error-modal"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) dismissErrorModal();
          }}
        >
          <div className="relative w-full max-w-md rounded-3xl bg-white dark:bg-[#131922] border border-slate-200 dark:border-white/10 p-6 shadow-2xl space-y-5">
            <button
              type="button"
              onClick={dismissErrorModal}
              aria-label="Cerrar ventana de error"
              className="absolute top-3.5 right-3.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>

            <div className="flex flex-col items-center text-center space-y-3 pt-1">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center">
                <AlertCircle className="w-6 h-6" aria-hidden="true" />
              </div>
              <h2
                id="auth-error-title"
                className="text-lg font-bold tracking-tight text-slate-900 dark:text-white pr-4 pl-4"
              >
                {errorTitle}
              </h2>
              <p
                id="auth-error-message"
                className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed"
              >
                {error}
              </p>
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={dismissErrorModal}
                className="w-full inline-flex items-center justify-center gap-2 min-h-[48px] px-5 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold text-sm hover:opacity-90 transition-opacity whitespace-nowrap"
              >
                <ArrowLeft className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Cerrar y volver atrás</span>
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  dismissErrorModal();
                  handleGoogleSignIn();
                }}
                className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-2xl bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-700 dark:text-emerald-400 font-semibold text-sm transition-colors whitespace-nowrap"
              >
                <span>
                  {errorTitle === 'Cuenta no autorizada'
                    ? 'Cambiar de cuenta de Google'
                    : 'Intentar con Google'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
