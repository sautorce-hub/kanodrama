import React, { useEffect, useRef, useState } from 'react';
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
  Lock,
  Eye,
  EyeOff,
  UserPlus,
  LogIn,
  Coins,
} from 'lucide-react';
import { renderGoogleCredentialButton } from '../config/auth';
import { useDramaContext } from '../context/DramaContext';

const EMAIL_INPUT_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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
    language,
    user,
    authLoading,
    authError,
    authModalOpen,
    authPromptReason,
    closeAuthModal,
    signInWithGoogle,
    signInWithEmail,
    registerAccountWithEmail,
    completeGoogleSignIn,
    signOut,
    streak,
    likedDramaIds,
    dramaWatchlistItems,
    movieWatchlistItems,
    pointsBalance,
    setHelpModalOpen,
  } = useDramaContext();

  const [avatarBroken, setAvatarBroken] = useState(false);
  const [gsiFallbackError, setGsiFallbackError] = useState<string | null>(null);
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const gsiBtnContainerRef = useRef<HTMLDivElement | null>(null);

  const isId = language === 'id';

  useEffect(() => {
    setAvatarBroken(false);
  }, [user?.photoURL]);

  useEffect(() => {
    if (!authModalOpen) {
      setGsiFallbackError(null);
      setLocalError(null);
      setPasswordInput('');
      setShowPassword(false);
      setConfirmSignOut(false);
      setSigningOut(false);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmSignOut) {
          setConfirmSignOut(false);
        } else {
          closeAuthModal();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [authModalOpen, closeAuthModal, confirmSignOut]);

  useEffect(() => {
    if (user) {
      setPasswordInput('');
      setLocalError(null);
      setGsiFallbackError(null);
      setConfirmSignOut(false);
      setSigningOut(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authModalOpen || user || !authError || !gsiBtnContainerRef.current) return;
    let active = true;
    void renderGoogleCredentialButton(
      gsiBtnContainerRef.current,
      (result) => {
        if (active) completeGoogleSignIn(result);
      },
      (errMsg) => {
        if (active) setGsiFallbackError(errMsg);
      }
    );
    return () => {
      active = false;
    };
  }, [authModalOpen, user, authError, completeGoogleSignIn]);

  if (!authModalOpen) return null;

  const daysRemaining = Math.max(0, 3 - streak.count);
  const combinedError = localError || gsiFallbackError || authError;

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setGsiFallbackError(null);

    const normalizedEmail = emailInput.trim().toLowerCase();
    if (!EMAIL_INPUT_REGEX.test(normalizedEmail)) {
      setLocalError(
        isId
          ? 'Masukkan alamat email yang valid (contoh: nama@email.com).'
          : 'Please enter a valid email address.'
      );
      return;
    }
    if (passwordInput.length < 6 || passwordInput.length > 128) {
      setLocalError(
        isId
          ? 'Kata sandi wajib 6 hingga 128 karakter.'
          : 'Password must be between 6 and 128 characters.'
      );
      return;
    }

    if (authTab === 'register') {
      const cleanName = displayNameInput.trim();
      const signedIn = await registerAccountWithEmail(
        normalizedEmail,
        passwordInput,
        cleanName || undefined
      );
      if (signedIn) {
        setPasswordInput('');
      }
    } else {
      const signedIn = await signInWithEmail(normalizedEmail, passwordInput);
      if (signedIn) {
        setPasswordInput('');
      }
    }
  };

  const openDashboardWatchlist = (category: 'movie' | 'drama') => {
    closeAuthModal();
    window.dispatchEvent(
      new CustomEvent('kd:navigate', {
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
      className="fixed inset-0 z-[85] flex items-end sm:items-center justify-center sm:p-4 bg-black/80 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={user ? t.auth.profileTitle : t.auth.signInTitle}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="spotlight-card-enter relative w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[#0E0D12]/98 backdrop-blur-2xl border-t sm:border border-white/15 shadow-[0_28px_90px_rgba(0,0,0,0.92)]"
      >
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-32 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse at 50% 0%, rgba(239,68,68,0.14) 0%, rgba(212,175,55,0.05) 55%, transparent 82%)',
          }}
        />
        {/* Top Bar */}
        <div className="sticky top-0 z-10 bg-[#0E0D12]/95 backdrop-blur-xl px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center shadow-sm">
              {user && !user.uid.startsWith('google_') ? (
                <Mail className="w-4 h-4 text-[#09090B]" />
              ) : (
                <GoogleGIcon className="w-4 h-4" />
              )}
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">
                {user
                  ? confirmSignOut
                    ? isId
                      ? 'Konfirmasi Keluar Akun'
                      : 'Confirm Sign Out'
                    : t.auth.profileTitle
                  : t.auth.signInTitle}
              </h2>
              <p className="text-[11px] text-[#A1A1AA]">
                {user
                  ? confirmSignOut
                    ? user.email
                    : t.auth.signedInAs
                  : isId
                  ? 'Akses Akun & Dompet Poin KanoDrama'
                  : 'KanoDrama Account & Rewards'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={closeAuthModal}
            aria-label="Close account modal"
            className="min-w-[44px] min-h-[44px] rounded-full bg-white/5 hover:bg-white/12 text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!user ? (
          <div className="relative p-5 space-y-4 pb-[max(24px,env(safe-area-inset-bottom))]">
            {/* Contextual Reason & First-Login Bonus Callout */}
            <div className="p-4 rounded-2xl bg-[#15131A] border border-amber-400/25 flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-400/15 border border-amber-400/30 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-amber-300" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-white">
                  {isId ? 'Masuk dengan Email atau Google' : 'Sign in with Email or Google'}
                </p>
                <p className="text-[11px] text-[#D4D4D8] leading-relaxed">
                  {authPromptReason || t.auth.gateReasonDefault}
                </p>
                <p className="text-xs font-bold text-amber-300 tabular-nums pt-0.5">
                  {isId
                    ? '+25.000 poin otomatis saat login pertama akun baru'
                    : '+25,000 pts automatically on first new-account login'}
                </p>
              </div>
            </div>

            {combinedError && (
              <div className="space-y-2.5">
                <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/35 flex items-start gap-2 text-xs text-red-200">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{combinedError}</span>
                </div>
                {authError && (
                  <div ref={gsiBtnContainerRef} className="flex justify-center min-h-[42px]" />
                )}
              </div>
            )}

            {/* Primary Google Sign-In Button */}
            <button
              type="button"
              disabled={authLoading}
              onClick={() => {
                setLocalError(null);
                setGsiFallbackError(null);
                void signInWithGoogle();
              }}
              className="w-full min-h-[46px] py-2.5 px-4 rounded-full bg-white hover:bg-[#F4F4F5] disabled:opacity-60 text-[#09090B] text-sm font-bold flex items-center justify-center gap-2.5 shadow-xl transition-all active:scale-[0.98]"
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

            <div className="flex items-center gap-3 text-[11px] text-[#71717A]">
              <span className="h-px flex-1 bg-white/10" />
              <span>{isId ? 'atau dengan Email' : 'or with Email'}</span>
              <span className="h-px flex-1 bg-white/10" />
            </div>

            {/* Masuk / Daftar Email Tabs */}
            <div
              role="tablist"
              aria-label="Email authentication mode"
              className="grid grid-cols-2 p-1 rounded-2xl bg-[#19161A] border border-white/10"
            >
              <button
                type="button"
                role="tab"
                aria-selected={authTab === 'login'}
                disabled={authLoading}
                onClick={() => {
                  setAuthTab('login');
                  setLocalError(null);
                }}
                className={`min-h-[38px] rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-all ${
                  authTab === 'login'
                    ? 'cd-accent-bg text-white shadow'
                    : 'text-[#A1A1AA] hover:text-white'
                }`}
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>{isId ? 'Masuk' : 'Sign In'}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={authTab === 'register'}
                disabled={authLoading}
                onClick={() => {
                  setAuthTab('register');
                  setLocalError(null);
                }}
                className={`min-h-[38px] rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-all ${
                  authTab === 'register'
                    ? 'cd-accent-bg text-white shadow'
                    : 'text-[#A1A1AA] hover:text-white'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>{isId ? 'Daftar' : 'Register'}</span>
              </button>
            </div>

            {/* Email + Password Form */}
            <form onSubmit={handleEmailSubmit} className="space-y-3" noValidate>
              {authTab === 'register' && (
                <div className="space-y-1">
                  <label
                    htmlFor="kano-auth-name"
                    className="block text-[11px] font-semibold text-[#D4D4D8]"
                  >
                    {isId ? 'Nama Tampilan (opsional)' : 'Display Name (optional)'}
                  </label>
                  <input
                    id="kano-auth-name"
                    type="text"
                    maxLength={60}
                    autoComplete="name"
                    value={displayNameInput}
                    onChange={(e) => setDisplayNameInput(e.target.value)}
                    disabled={authLoading}
                    placeholder={isId ? 'Contoh: Raka Drama' : 'e.g. Kano Viewer'}
                    className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-[#0D0C10] border border-white/10 focus:border-[var(--cd-accent)] focus:outline-none text-sm text-white disabled:opacity-60"
                  />
                </div>
              )}

              <div className="space-y-1">
                <label
                  htmlFor="kano-auth-email"
                  className="block text-[11px] font-semibold text-[#D4D4D8]"
                >
                  Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#71717A] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="kano-auth-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    disabled={authLoading}
                    placeholder="nama@email.com"
                    className="w-full min-h-[42px] pl-10 pr-3.5 py-2 rounded-xl bg-[#0D0C10] border border-white/10 focus:border-[var(--cd-accent)] focus:outline-none text-sm text-white disabled:opacity-60"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="kano-auth-password"
                  className="block text-[11px] font-semibold text-[#D4D4D8]"
                >
                  {isId ? 'Kata Sandi' : 'Password'}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#71717A] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="kano-auth-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    maxLength={128}
                    autoComplete={authTab === 'register' ? 'new-password' : 'current-password'}
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    disabled={authLoading}
                    placeholder={isId ? 'Minimal 6 karakter' : 'At least 6 characters'}
                    className="w-full min-h-[42px] pl-10 pr-10 py-2 rounded-xl bg-[#0D0C10] border border-white/10 focus:border-[var(--cd-accent)] focus:outline-none text-sm text-white disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="p-1.5 rounded-lg text-[#A1A1AA] hover:text-white absolute right-2 top-1/2 -translate-y-1/2 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full min-h-[44px] py-2.5 px-4 rounded-full cd-accent-bg hover:brightness-110 disabled:opacity-60 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98]"
              >
                {authLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{t.auth.signingIn}</span>
                  </>
                ) : authTab === 'register' ? (
                  <>
                    <UserPlus className="w-4 h-4" />
                    <span>{isId ? 'Daftar dengan Email' : 'Create Email Account'}</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>{isId ? 'Masuk dengan Email' : 'Sign In with Email'}</span>
                  </>
                )}
              </button>
            </form>

            <div className="pt-2 border-t border-white/10 space-y-2">
              <button
                type="button"
                onClick={() => {
                  closeAuthModal();
                  window.dispatchEvent(
                    new CustomEvent('kd:navigate', {
                      detail: { tab: 'rewards', subTab: 'rewards' },
                    })
                  );
                }}
                className="w-full min-h-[42px] px-4 py-2 rounded-2xl bg-[#D4AF37]/15 hover:bg-[#D4AF37]/25 border border-[#D4AF37]/40 text-xs font-bold text-[#FDE68A] flex items-center justify-between transition-colors"
              >
                <span className="inline-flex items-center gap-2">
                  <Coins className="w-4 h-4 text-[#D4AF37]" />
                  <span>
                    {isId
                      ? 'Lihat Sistem Poin & Referral (Tukar IDR / USD)'
                      : 'View Points & Referral System (Redeem IDR / USD)'}
                  </span>
                </span>
                <ChevronRight className="w-4 h-4 text-[#D4AF37]" />
              </button>

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
        ) : confirmSignOut ? (
          <div className="relative p-6 space-y-5 pb-[max(24px,env(safe-area-inset-bottom))]">
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-red-500/15 border border-red-500/35 flex items-center justify-center text-red-400">
                <LogOut className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-white">
                  {isId ? 'Keluar dari akun ini?' : 'Sign out of this account?'}
                </h3>
                <p className="text-xs text-[#A1A1AA] leading-relaxed">
                  {isId
                    ? 'Saldo poin, riwayat tontonan, dan progres misi harian tetap tersimpan aman di akunmu.'
                    : 'Your points balance, watch history, and mission progress remain safely saved.'}
                </p>
              </div>
            </div>

            <div className="border-t border-white/10 pt-4 space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[#A1A1AA]">{isId ? 'Akun Aktif' : 'Active Account'}</span>
                <span className="font-semibold text-white truncate max-w-[210px]">
                  {user.email}
                </span>
              </div>
              {typeof pointsBalance === 'number' && (
                <div className="border-t border-white/6 pt-2.5 flex items-center justify-between gap-3">
                  <span className="text-[#A1A1AA]">
                    {isId ? 'Saldo Tersimpan' : 'Saved Balance'}
                  </span>
                  <span className="font-bold text-amber-300 tabular-nums">
                    {pointsBalance.toLocaleString(isId ? 'id-ID' : 'en-US')}{' '}
                    {t.rewards.pointsUnit}
                  </span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                disabled={signingOut}
                onClick={() => setConfirmSignOut(false)}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white transition-colors"
              >
                {isId ? 'Batal' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={signingOut}
                onClick={async () => {
                  setSigningOut(true);
                  try {
                    await signOut();
                  } finally {
                    setSigningOut(false);
                  }
                }}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-red-500/90 hover:bg-red-500 disabled:opacity-60 text-xs font-bold text-white inline-flex items-center justify-center gap-2 transition-colors"
              >
                {signingOut ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <LogOut className="w-4 h-4" />
                )}
                <span>{isId ? 'Ya, Keluar' : 'Yes, Sign Out'}</span>
              </button>
            </div>
          </div>
        ) : (
          /* Signed-in Real Google / Email Profile, Separated Watchlists, Streak & Logout Drawer */
          <div className="relative p-5 space-y-4 pb-[max(24px,env(safe-area-inset-bottom))]">
            <div className="p-4 rounded-2xl bg-[#16151C] border border-white/10 flex items-center gap-3.5">
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
                  <p className="mt-1 inline-flex items-center gap-1 text-[#FDE68A] text-[11px] font-semibold">
                    <Crown className="w-3 h-3 text-[#D4AF37]" />
                    <span>{t.retention.vipCoffeeLover}</span>
                  </p>
                )}
              </div>
            </div>

            {/* Daily Watch Streak Card */}
            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-[#1D1612] to-[#16151C] border border-[#D4AF37]/30 space-y-2">
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
                    Active VIP
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

            <div className="grid grid-cols-3 gap-2.5">
              <div className="p-3 rounded-2xl bg-[#16151C] border border-white/10">
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
                className="p-3 rounded-2xl bg-[#16151C] hover:bg-[#1F1D26] border border-white/10 hover:border-[#E50914]/60 text-left transition-colors"
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
                className="p-3 rounded-2xl bg-[#16151C] hover:bg-[#1F1D26] border border-white/10 hover:border-[#D4AF37]/60 text-left transition-colors"
              >
                <div className="flex items-center gap-1 text-[10px] text-[#A1A1AA]">
                  <Bookmark className="w-3 h-3 text-[#D4AF37] shrink-0" />
                  <span className="truncate">{t.auth.dramaWatchlistCount}</span>
                </div>
                <p className="text-lg font-extrabold text-white mt-1 tabular-nums">
                  {dramaWatchlistItems.length}
                </p>
              </button>
            </div>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => openDashboardWatchlist('movie')}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl bg-[#16151C] hover:bg-[#1F1D26] border border-[#E50914]/35 text-xs font-bold text-white flex items-center justify-between transition-all"
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
                className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl bg-[#16151C] hover:bg-[#1F1D26] border border-[#D4AF37]/30 text-xs font-bold text-white flex items-center justify-between transition-all"
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
                    new CustomEvent('kd:navigate', {
                      detail: { tab: 'rewards', subTab: 'rewards' },
                    })
                  );
                }}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl bg-gradient-to-r from-[#231B0E] to-[#16151C] hover:brightness-110 border border-[#D4AF37]/45 text-xs font-bold text-[#FDE68A] flex items-center justify-between transition-all"
              >
                <span className="inline-flex items-center gap-2.5">
                  <Coins className="w-4 h-4 text-[#D4AF37]" />
                  <span>
                    {isId ? 'Poin & Referral' : 'Points & Referral'}
                    {typeof pointsBalance === 'number'
                      ? ` (${pointsBalance.toLocaleString()} ${t.rewards.pointsUnit})`
                      : ''}
                  </span>
                </span>
                <ChevronRight className="w-4 h-4 text-[#D4AF37]" />
              </button>

              <button
                type="button"
                onClick={() => {
                  closeAuthModal();
                  window.dispatchEvent(
                    new CustomEvent('kd:navigate', {
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
                className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl bg-[#16151C] hover:bg-[#1F1D26] border border-white/10 text-xs font-semibold text-white flex items-center justify-between transition-colors"
              >
                <span className="inline-flex items-center gap-2.5">
                  <HelpCircle className="w-4 h-4 text-[#D4AF37]" />
                  <span>{t.auth.openHelpCenter}</span>
                </span>
                <ChevronRight className="w-4 h-4 text-[#A1A1AA]" />
              </button>

              <button
                type="button"
                onClick={() => setConfirmSignOut(true)}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-red-500/12 hover:bg-red-500/22 border border-red-500/35 text-xs font-bold text-red-300 flex items-center justify-center gap-2 transition-colors"
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
