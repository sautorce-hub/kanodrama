import React, { useEffect, useState } from 'react';
import {
  X,
  Heart,
  Bookmark,
  Clapperboard,
  HelpCircle,
  LogOut,
  CheckCircle2,
  Sparkles,
  ChevronRight,
  Flame,
  Crown,
  Loader2,
  AlertCircle,
  LayoutDashboard,
  Mail,
} from 'lucide-react';
import { useDramaContext } from '../context/DramaContext';

function GoogleGIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.3 0 6.08-1.09 8.1-2.96l-3.88-3.05c-1.1.74-2.51 1.18-4.22 1.18-3.24 0-5.99-2.19-6.97-5.13H1.03v3.14C3.04 21.19 7.21 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.03 14.04c-.25-.74-.39-1.54-.39-2.36 0-.82.14-1.62.39-2.36V6.18H1.03A11.98 11.98 0 0 0 0 11.68c0 1.93.46 3.76 1.03 5.5l4-3.14Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.8 0 3.41.62 4.68 1.83l3.51-3.51C18.07 1.19 15.3 0 12 0 7.21 0 3.04 2.81 1.03 6.82l4 3.14C6.01 6.94 8.76 4.75 12 4.75Z"
      />
    </svg>
  );
}

export const AuthProfileModal: React.FC = () => {
  const {
    t,
    user,
    authLoading,
    authError,
    authModalOpen,
    authPromptReason,
    closeAuthModal,
    signInWithGoogle,
    signOut,
    streak,
    likedDramaIds,
    dramaWatchlistItems,
    movieWatchlistItems,
    gmailLoginCount,
    refreshGmailLoginCount,
    setHelpModalOpen,
  } = useDramaContext();

  const [avatarBroken, setAvatarBroken] = useState(false);

  useEffect(() => {
    setAvatarBroken(false);
  }, [user?.photoURL]);

  useEffect(() => {
    if (!authModalOpen) return;
    void refreshGmailLoginCount();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAuthModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [authModalOpen, closeAuthModal, refreshGmailLoginCount]);

  if (!authModalOpen) return null;

  const daysRemaining = Math.max(0, 3 - streak.count);

  const openDashboardWatchlist = (category: 'movie' | 'drama') => {
    closeAuthModal();
    window.dispatchEvent(
      new CustomEvent('hd:navigate', {
        detail: {
          tab: 'dashboard',
          subTab: 'watchlist',
          watchlistCategory: category,
        },
      })
    );
  };

  return (
    <div
      onClick={closeAuthModal}
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4 bg-black/80 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={user ? t.auth.profileTitle : t.auth.signInTitle}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-[#121013]/95 backdrop-blur-2xl border-t sm:border border-white/15 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Top Bar */}
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center shadow-sm">
              <GoogleGIcon className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">
                {user ? t.auth.profileTitle : t.auth.signInTitle}
              </h2>
              <p className="text-[11px] text-[#A1A1AA]">
                {user ? t.auth.signedInAs : 'KanoDrama Account'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={closeAuthModal}
            aria-label="Close account modal"
            className="p-2 rounded-full bg-white/5 hover:bg-white/15 text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!user ? (
          <div className="p-5 space-y-5 pb-[max(24px,env(safe-area-inset-bottom))]">
            {/* Contextual Reason Banner (e.g. triggered by Movie Watchlist / Heart / Comment gate) */}
            <div className="p-3.5 rounded-2xl bg-[var(--cd-accent-soft)] border border-[var(--cd-accent)]/40 flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 cd-accent-text shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="text-xs font-bold text-white">
                  {t.auth.signInWithGoogle}
                </p>
                <p className="text-[11px] text-[#E4E4E7] leading-relaxed">
                  {authPromptReason || t.auth.gateReasonDefault}
                </p>
              </div>
            </div>

            {authError && (
              <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/35 flex items-start gap-2 text-xs text-red-200">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{authError}</span>
              </div>
            )}

            <button
              type="button"
              disabled={authLoading}
              onClick={() => {
                void signInWithGoogle();
              }}
              className="w-full min-h-[48px] py-3 px-4 rounded-full bg-white hover:bg-[#F4F4F5] disabled:opacity-60 text-[#09090B] text-sm font-bold flex items-center justify-center gap-2.5 shadow-xl transition-all active:scale-[0.98]"
            >
              {authLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#09090B]" />
                  <span>{t.auth.signingIn}</span>
                </>
              ) : (
                <>
                  <GoogleGIcon className="w-5 h-5" />
                  <span>{t.auth.continueBtn}</span>
                </>
              )}
            </button>

            <div className="pt-2 border-t border-white/10 space-y-2">
              <div className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-[#2A1016] to-[#19161A] border border-[#991B1B]/50 flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-2 text-[#FCA5A5] font-semibold">
                  <Mail className="w-4 h-4 text-[#EF4444]" />
                  <span>{t.auth.gmailLoginCount}</span>
                </span>
                <span className="text-sm font-extrabold text-white tabular-nums">
                  {gmailLoginCount}
                </span>
              </div>

              <button
                type="button"
                onClick={() => openDashboardWatchlist('drama')}
                className="w-full min-h-[42px] px-4 py-2 rounded-2xl bg-[#19161A] hover:bg-[#221D24] border border-white/10 text-xs font-semibold text-white flex items-center justify-between transition-colors"
              >
                <span className="inline-flex items-center gap-2">
                  <Bookmark className="w-4 h-4 text-[#D4AF37]" />
                  <span>
                    {t.auth.dramaWatchlistCount} ({dramaWatchlistItems.length})
                  </span>
                </span>
                <ChevronRight className="w-4 h-4 text-[#A1A1AA]" />
              </button>
            </div>
          </div>
        ) : (
          /* Signed-in Real Google Profile, Separated Watchlists, Streak & Logout Drawer */
          <div className="p-5 space-y-4 pb-[max(24px,env(safe-area-inset-bottom))]">
            <div className="p-4 rounded-2xl bg-[#19161A] border border-white/10 flex items-center gap-3.5">
              {user.photoURL && !avatarBroken ? (
                <img
                  src={user.photoURL}
                  alt={user.displayName}
                  referrerPolicy="no-referrer"
                  onError={() => setAvatarBroken(true)}
                  className="w-12 h-12 rounded-full object-cover shrink-0 border-2 border-white/25 shadow-lg"
                />
              ) : (
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-extrabold text-white shrink-0 border-2 border-white/25 shadow-lg"
                  style={{ backgroundColor: user.avatarColor }}
                >
                  {user.avatarInitials}
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="text-sm font-bold text-white truncate">
                    {user.displayName}
                  </p>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                </div>
                <p className="text-xs text-[#A1A1AA] truncate">{user.email}</p>
                {streak.isVipCoffeeLover && (
                  <span className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#D4AF37]/20 border border-[#D4AF37]/50 text-[#FDE68A] text-[10px] font-bold">
                    <Crown className="w-3 h-3 text-[#D4AF37]" />
                    {t.retention.vipCoffeeLover}
                  </span>
                )}
              </div>
            </div>

            {/* Daily Watch Streak Card */}
            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-[#1F1512] to-[#19161A] border border-[#D4AF37]/30 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-white">
                  <Flame className="w-4 h-4 text-orange-400 fill-orange-400" />
                  <span>
                    {t.retention.streakBadge} {Math.max(1, streak.count)}{' '}
                    {streak.count === 1 ? 'Day' : 'Days'}
                  </span>
                </span>
                {streak.isVipCoffeeLover ? (
                  <span className="text-[11px] font-bold text-[#D4AF37]">
                    Active VIP Badge
                  </span>
                ) : (
                  <span className="text-[11px] text-[#A1A1AA] tabular-nums">
                    {daysRemaining} {t.retention.streakProgress}
                  </span>
                )}
              </div>
              <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-orange-500 to-[#D4AF37] rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, Math.round((Math.max(1, streak.count) / 3) * 100))}%`,
                  }}
                />
              </div>
              <p className="text-[11px] text-[#A1A1AA] leading-relaxed">
                {t.retention.streakRule}
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 rounded-2xl bg-[#19161A] border border-white/10">
                <div className="flex items-center gap-1 text-[10px] text-[#A1A1AA]">
                  <Heart className="w-3 h-3 text-[#EF4444] shrink-0" />
                  <span className="truncate">{t.auth.likedCount}</span>
                </div>
                <p className="text-lg font-extrabold text-white mt-1 tabular-nums">
                  {likedDramaIds.length}
                </p>
              </div>

              <button
                type="button"
                onClick={() => openDashboardWatchlist('movie')}
                className="p-3 rounded-2xl bg-[#19161A] hover:bg-[#221D24] border border-white/10 hover:border-[#E50914]/60 text-left transition-colors"
              >
                <div className="flex items-center gap-1 text-[10px] text-[#A1A1AA]">
                  <Clapperboard className="w-3 h-3 text-[#E50914] shrink-0" />
                  <span className="truncate">{t.auth.savedCount}</span>
                </div>
                <p className="text-lg font-extrabold text-white mt-1 tabular-nums">
                  {movieWatchlistItems.length}
                </p>
              </button>

              <button
                type="button"
                onClick={() => openDashboardWatchlist('drama')}
                className="p-3 rounded-2xl bg-[#19161A] hover:bg-[#221D24] border border-white/10 hover:border-[#D4AF37]/60 text-left transition-colors"
              >
                <div className="flex items-center gap-1 text-[10px] text-[#A1A1AA]">
                  <Bookmark className="w-3 h-3 text-[#D4AF37] shrink-0" />
                  <span className="truncate">{t.auth.dramaWatchlistCount}</span>
                </div>
                <p className="text-lg font-extrabold text-white mt-1 tabular-nums">
                  {dramaWatchlistItems.length}
                </p>
              </button>

              <div className="p-3 rounded-2xl bg-gradient-to-br from-[#2A1016] to-[#19161A] border border-[#991B1B]/50">
                <div className="flex items-center gap-1 text-[10px] text-[#FCA5A5]">
                  <Mail className="w-3 h-3 text-[#EF4444] shrink-0" />
                  <span className="truncate">{t.auth.gmailLoginCount}</span>
                </div>
                <p className="text-lg font-extrabold text-white mt-1 tabular-nums">
                  {Math.max(1, gmailLoginCount)}
                </p>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => openDashboardWatchlist('movie')}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl bg-[#19161A] hover:bg-[#221D24] border border-[#E50914]/35 text-xs font-bold text-white flex items-center justify-between transition-all"
              >
                <span className="inline-flex items-center gap-2.5">
                  <Clapperboard className="w-4 h-4 text-[#E50914]" />
                  <span>
                    {t.moviesPage.watchlistTitle} ({movieWatchlistItems.length})
                  </span>
                </span>
                <ChevronRight className="w-4 h-4 text-[#E50914]" />
              </button>

              <button
                type="button"
                onClick={() => openDashboardWatchlist('drama')}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl bg-[#19161A] hover:bg-[#221D24] border border-[#D4AF37]/30 text-xs font-bold text-white flex items-center justify-between transition-all"
              >
                <span className="inline-flex items-center gap-2.5">
                  <Bookmark className="w-4 h-4 text-[#D4AF37]" />
                  <span>
                    {t.sections.dramaWatchlistTitle} ({dramaWatchlistItems.length})
                  </span>
                </span>
                <ChevronRight className="w-4 h-4 text-[#D4AF37]" />
              </button>

              <button
                type="button"
                onClick={() => {
                  closeAuthModal();
                  window.dispatchEvent(
                    new CustomEvent('hd:navigate', {
                      detail: { tab: 'dashboard', subTab: 'profile' },
                    })
                  );
                }}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl bg-[var(--cd-accent-soft)] hover:brightness-110 border border-[var(--cd-accent)]/40 text-xs font-bold text-white flex items-center justify-between transition-all"
              >
                <span className="inline-flex items-center gap-2.5">
                  <LayoutDashboard className="w-4 h-4 cd-accent-text" />
                  <span>{t.dashboard.title}</span>
                </span>
                <ChevronRight className="w-4 h-4 text-white/80" />
              </button>

              <button
                type="button"
                onClick={() => {
                  closeAuthModal();
                  setHelpModalOpen(true);
                }}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl bg-[#19161A] hover:bg-[#221D24] border border-white/10 text-xs font-semibold text-white flex items-center justify-between transition-colors"
              >
                <span className="inline-flex items-center gap-2.5">
                  <HelpCircle className="w-4 h-4 text-[#D4AF37]" />
                  <span>{t.auth.openHelpCenter}</span>
                </span>
                <ChevronRight className="w-4 h-4 text-[#A1A1AA]" />
              </button>

              <button
                type="button"
                onClick={() => {
                  void signOut();
                }}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-full bg-red-500/15 hover:bg-red-500/25 border border-red-500/35 text-xs font-bold text-red-300 flex items-center justify-center gap-2 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>{t.auth.signOut}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
