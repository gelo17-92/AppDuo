import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const hadController = Boolean(navigator.serviceWorker.controller);
    let hasReloadedForUpdate = false;

    const triggerUpdateReload = () => {
      if (!hadController || hasReloadedForUpdate) return;
      hasReloadedForUpdate = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', triggerUpdateReload);
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'SW_UPDATED') {
        triggerUpdateReload();
      }
    });

    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((registration) => {
        const checkForUpdate = () => {
          registration.update().catch(() => {});
        };

        checkForUpdate();

        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            checkForUpdate();
          }
        });
        window.addEventListener('focus', checkForUpdate);
      })
      .catch(() => {
        // Service worker registration skipped in restricted preview frames
      });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
