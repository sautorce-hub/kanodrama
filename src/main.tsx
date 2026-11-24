import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import { DramaProvider } from './context/DramaContext.tsx';
import './index.css';

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  const expectedSwPath = import.meta.env.DEV ? '/dev-sw.js' : '/pwa-sw-v2.js';

  registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (registration) {
        void registration.update().catch(() => {});
      }
    },
  });

  // Ensure any legacy service workers (e.g. old /sw.js or push workers) are replaced cleanly
  void navigator.serviceWorker
    .getRegistrations()
    .then((registrations) =>
      Promise.all(
        registrations.map(async (registration) => {
          const scriptUrl =
            registration.active?.scriptURL ||
            registration.waiting?.scriptURL ||
            registration.installing?.scriptURL ||
            '';
          if (!scriptUrl) return;
          try {
            const parsedPath = new URL(scriptUrl).pathname;
            if (parsedPath !== expectedSwPath) {
              await registration.unregister();
            } else {
              await registration.update();
            }
          } catch {
            // Ignore malformed script URLs or transient SW update errors
          }
        })
      )
    )
    .catch(() => {});
}

createRoot(document.getElementById('root')!).render(
  <DramaProvider>
    <App />
  </DramaProvider>
);
