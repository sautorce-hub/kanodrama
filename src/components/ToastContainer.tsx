import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  LogOut,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react';
import type { ToastItem } from '../types/drama';

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

function GoldCoinEmblem() {
  return (
    <div className="relative w-10 h-10 shrink-0 flex items-center justify-center">
      <div
        aria-hidden="true"
        className="absolute inset-0 rounded-full"
        style={{
          background:
            'radial-gradient(circle, rgba(251,191,36,0.28) 0%, transparent 72%)',
        }}
      />
      <svg viewBox="0 0 40 40" className="relative w-9 h-9" aria-hidden="true">
        <defs>
          <linearGradient id="hudCoinGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FEF3C7" />
            <stop offset="50%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#B45309" />
          </linearGradient>
        </defs>
        <circle cx="20" cy="20" r="17" fill="url(#hudCoinGrad)" />
        <circle
          cx="20"
          cy="20"
          r="13.5"
          fill="none"
          stroke="rgba(255,251,235,0.65)"
          strokeWidth="1"
        />
        <path
          d="M20 11.5L22.3 16.9L28.1 17.4L23.7 21.2L25 26.9L20 23.8L15 26.9L16.3 21.2L11.9 17.4L17.7 16.9L20 11.5Z"
          fill="#FFFBEB"
        />
      </svg>
    </div>
  );
}

function parseFallbackPoints(message: string): number | null {
  const match = message.match(/\+([\d.,]+)/);
  if (!match) return null;
  const numeric = Number(match[1].replace(/[.,]/g, ''));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({
  toasts,
  onDismiss,
}) => {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-20 md:bottom-6 right-4 sm:right-6 z-[90] flex flex-col gap-2.5 w-[calc(100vw-2rem)] sm:w-[360px] max-w-[360px] pointer-events-none"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const inferredPoints =
          typeof toast.points === 'number' && toast.points > 0
            ? toast.points
            : toast.tone === 'gold'
            ? parseFallbackPoints(toast.message)
            : null;
        const variant =
          toast.variant ||
          (toast.tone === 'error'
            ? 'error'
            : inferredPoints
            ? 'points'
            : 'default');
        const durationMs = toast.durationMs ?? 3800;

        const frameToneClass =
          variant === 'points'
            ? 'border-amber-400/35'
            : variant === 'signin'
            ? 'border-emerald-400/35'
            : variant === 'blocked' || variant === 'error'
            ? 'border-red-500/40'
            : 'border-white/15';

        const radialGlow =
          variant === 'points'
            ? 'radial-gradient(circle at 10% 15%, rgba(251,191,36,0.16), transparent 62%)'
            : variant === 'signin'
            ? 'radial-gradient(circle at 10% 15%, rgba(16,185,129,0.16), transparent 62%)'
            : variant === 'blocked' || variant === 'error'
            ? 'radial-gradient(circle at 10% 15%, rgba(239,68,68,0.16), transparent 62%)'
            : 'radial-gradient(circle at 10% 15%, rgba(255,255,255,0.07), transparent 62%)';

        const sweepBarColor =
          variant === 'points'
            ? 'bg-gradient-to-r from-amber-300 to-amber-500'
            : variant === 'signin'
            ? 'bg-gradient-to-r from-emerald-300 to-emerald-500'
            : variant === 'blocked' || variant === 'error'
            ? 'bg-gradient-to-r from-red-400 to-red-600'
            : 'bg-white/35';

        return (
          <div
            key={toast.id}
            role="status"
            className={`toast-hud-enter pointer-events-auto relative overflow-hidden rounded-2xl bg-[#111015]/96 backdrop-blur-2xl shadow-[0_18px_48px_rgba(0,0,0,0.82)] border ${frameToneClass}`}
          >
            <div
              aria-hidden="true"
              className="absolute inset-0 pointer-events-none"
              style={{ background: radialGlow }}
            />

            <div className="relative flex items-center gap-3 px-4 py-3">
              {variant === 'points' ? (
                <GoldCoinEmblem />
              ) : variant === 'signin' ? (
                <div className="relative w-10 h-10 shrink-0">
                  {toast.photoURL ? (
                    <img
                      src={toast.photoURL}
                      alt={toast.userName || 'Account'}
                      referrerPolicy="no-referrer"
                      className="w-10 h-10 rounded-full object-cover border border-emerald-400/50"
                    />
                  ) : (
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-extrabold text-white border border-emerald-400/50"
                      style={{ backgroundColor: toast.avatarColor || '#10B981' }}
                    >
                      {toast.avatarInitials || 'KD'}
                    </div>
                  )}
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 bg-[#111015] rounded-full absolute -bottom-0.5 -right-0.5" />
                </div>
              ) : variant === 'signout' ? (
                <div className="w-10 h-10 rounded-xl bg-white/8 border border-white/12 flex items-center justify-center shrink-0 text-[#E4E4E7]">
                  <LogOut className="w-4 h-4" />
                </div>
              ) : variant === 'blocked' ? (
                <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/35 flex items-center justify-center shrink-0 text-red-400">
                  <ShieldAlert className="w-4 h-4" />
                </div>
              ) : variant === 'error' ? (
                <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/35 flex items-center justify-center shrink-0 text-red-400">
                  <AlertTriangle className="w-4 h-4" />
                </div>
              ) : (
                <div className="w-9 h-9 rounded-xl bg-white/8 border border-white/10 flex items-center justify-center shrink-0 text-[#D4D4D8]">
                  <Sparkles className="w-4 h-4" />
                </div>
              )}

              <div className="min-w-0 flex-1">
                {variant === 'points' && inferredPoints ? (
                  <>
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-amber-200/90">
                      <span className="truncate">
                        {toast.title || 'Poin Masuk'}
                      </span>
                      {toast.category && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="truncate text-[#A1A1AA]">
                            {toast.category}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-baseline gap-2">
                      <span className="text-base font-extrabold tracking-tight text-white tabular-nums">
                        +{inferredPoints.toLocaleString()} PTS
                      </span>
                      {typeof toast.balance === 'number' && toast.balance >= 0 && (
                        <span className="text-[11px] text-[#A1A1AA] tabular-nums truncate">
                          · {toast.balance.toLocaleString()}
                        </span>
                      )}
                    </div>
                    {toast.subtitle && (
                      <p className="text-[11px] text-[#A1A1AA] truncate mt-0.5">
                        {toast.subtitle}
                      </p>
                    )}
                  </>
                ) : variant === 'signin' ? (
                  <>
                    <p className="text-[11px] font-semibold text-emerald-300 truncate">
                      {toast.title || 'Masuk Akun Berhasil'}
                    </p>
                    <p className="text-sm font-bold text-white truncate">
                      {toast.userName || toast.message}
                    </p>
                    {(toast.subtitle || toast.userEmail) && (
                      <p className="text-[11px] text-[#A1A1AA] truncate">
                        {toast.subtitle || toast.userEmail}
                      </p>
                    )}
                  </>
                ) : variant === 'signout' ? (
                  <>
                    <p className="text-xs font-bold text-white truncate">
                      {toast.title || toast.message}
                    </p>
                    {toast.subtitle && (
                      <p className="text-[11px] text-[#A1A1AA] leading-snug mt-0.5">
                        {toast.subtitle}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    {toast.title && (
                      <p
                        className={`text-xs font-bold truncate ${
                          variant === 'blocked' || variant === 'error'
                            ? 'text-red-300'
                            : 'text-white'
                        }`}
                      >
                        {toast.title}
                      </p>
                    )}
                    <p
                      className={`leading-snug ${
                        toast.title
                          ? 'text-[11px] text-[#D4D4D8] mt-0.5'
                          : 'text-xs font-medium text-[#FAFAFA]'
                      }`}
                    >
                      {toast.subtitle || toast.message}
                    </p>
                  </>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {toast.actionLabel && toast.onAction && (
                  <button
                    type="button"
                    onClick={() => {
                      toast.onAction?.();
                      onDismiss(toast.id);
                    }}
                    className="min-h-[34px] px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/18 text-[11px] font-semibold text-white transition-colors whitespace-nowrap"
                  >
                    {toast.actionLabel}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onDismiss(toast.id)}
                  aria-label="Dismiss notification"
                  className="min-w-[34px] min-h-[34px] rounded-lg hover:bg-white/10 text-[#A1A1AA] hover:text-white flex items-center justify-center transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="h-[2px] w-full bg-white/5 overflow-hidden">
              <div
                className={`toast-sweep-bar h-full w-full ${sweepBarColor}`}
                style={{ animationDuration: `${durationMs}ms` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};
