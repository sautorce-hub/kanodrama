import React from 'react';
import { Check, AlertTriangle, Sparkles } from 'lucide-react';
import type { ToastItem } from '../types/drama';

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({
  toasts,
  onDismiss,
}) => {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-20 md:bottom-6 right-4 sm:right-6 z-50 flex flex-col gap-2.5 max-w-sm pointer-events-none"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          onClick={() => onDismiss(toast.id)}
          role="status"
          className={`pointer-events-auto cursor-pointer flex items-center gap-3 px-4 py-3 rounded-xl bg-[#16161B]/95 backdrop-blur-xl shadow-2xl shadow-black/80 text-sm text-[#FAFAFA] border ${
            toast.tone === 'error'
              ? 'border-red-500/50'
              : 'border-[#EF4444]/40'
          }`}
        >
          <span
            className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
              toast.tone === 'error'
                ? 'bg-red-500/20 text-red-400'
                : toast.tone === 'gold'
                ? 'bg-[#EF4444]/20 text-[#EF4444]'
                : 'bg-white/10 text-[#A1A1AA]'
            }`}
          >
            {toast.tone === 'error' ? (
              <AlertTriangle className="w-3.5 h-3.5" />
            ) : toast.tone === 'gold' ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
          </span>
          <span className="font-medium leading-snug">{toast.message}</span>
        </div>
      ))}
    </div>
  );
};
