import React from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import { DramaProvider } from './context/DramaContext.tsx';
import { mountPopunderScript } from './utils/adRedirect.ts';
import './index.css';

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[KanoDrama] Render error caught by RootErrorBoundary:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#090706] text-[#FAFAFA] flex items-center justify-center p-6 text-center">
          <div className="max-w-md space-y-4">
            <h1 className="text-xl font-bold">KanoDrama</h1>
            <p className="text-sm text-[#A1A1AA]">
              Unable to render the catalog view. Please reload to continue.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 rounded-full bg-[#EF4444] text-white text-sm font-semibold"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

try {
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
} catch {
  // Ignore service worker security/storage restrictions in Incognito or embedded contexts
}

try {
  mountPopunderScript({});
} catch {
  // Ignore blocked popunder initialization
}

createRoot(document.getElementById('root')!).render(
  <RootErrorBoundary>
    <DramaProvider>
      <App />
    </DramaProvider>
  </RootErrorBoundary>
);
