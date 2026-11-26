import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Coins,
  Gift,
  LogOut,
  Play,
  ShieldAlert,
  Wallet,
  X,
} from 'lucide-react';
import { useDramaContext } from '../context/DramaContext';

function WelcomeCoinMedallion() {
  return (
    <div className="relative mx-auto w-20 h-20 flex items-center justify-center">
      <div
        aria-hidden="true"
        className="absolute -inset-4 rounded-full pointer-events-none"
        style={{
          background:
            'radial-gradient(circle, rgba(251,191,36,0.28) 0%, rgba(212,175,55,0.08) 55%, transparent 74%)',
        }}
      />
      <svg
        viewBox="0 0 80 80"
        className="relative w-20 h-20 drop-shadow-[0_12px_28px_rgba(212,175,55,0.35)]"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="kdCoinRim" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FEF3C7" />
            <stop offset="45%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#92400E" />
          </linearGradient>
          <radialGradient id="kdCoinFace" cx="35%" cy="28%" r="72%">
            <stop offset="0%" stopColor="#FEF9C3" />
            <stop offset="32%" stopColor="#FBBF24" />
            <stop offset="75%" stopColor="#D97706" />
            <stop offset="100%" stopColor="#78350F" />
          </radialGradient>
        </defs>
        <circle cx="40" cy="40" r="36" fill="url(#kdCoinRim)" />
        <circle cx="40" cy="40" r="31.5" fill="url(#kdCoinFace)" />
        <circle
          cx="40"
          cy="40"
          r="26"
          fill="none"
          stroke="rgba(255,251,235,0.55)"
          strokeWidth="1.25"
          strokeDasharray="3 3"
        />
        <path
          d="M40 24L44.2 33.8L54.8 34.7L46.7 41.7L49.2 52L40 46.4L30.8 52L33.3 41.7L25.2 34.7L35.8 33.8L40 24Z"
          fill="#FFFBEB"
          fillOpacity="0.94"
        />
      </svg>
    </div>
  );
}

function SecurityShieldCrest() {
  return (
    <div className="relative mx-auto w-20 h-20 flex items-center justify-center">
      <div
        aria-hidden="true"
        className="absolute -inset-4 rounded-full pointer-events-none"
        style={{
          background:
            'radial-gradient(circle, rgba(239,68,68,0.26) 0%, rgba(239,68,68,0.06) 58%, transparent 76%)',
        }}
      />
      <div className="relative w-16 h-16 rounded-2xl bg-[#1A1215] border border-red-500/40 flex items-center justify-center shadow-[0_14px_34px_rgba(239,68,68,0.22)]">
        <ShieldAlert className="w-8 h-8 text-red-400" strokeWidth={1.85} />
      </div>
    </div>
  );
}

export const SpotlightFeedbackModal: React.FC = () => {
  const {
    language,
    spotlightPopup,
    closeSpotlightPopup,
    signOut,
    openAuthModal,
  } = useDramaContext();

  const isId = language === 'id';
  const [animatedPoints, setAnimatedPoints] = useState(0);
  const [switchingAccount, setSwitchingAccount] = useState(false);

  const welcomePointsTarget =
    spotlightPopup?.kind === 'welcome_bonus' ? Math.max(0, spotlightPopup.points) : 0;

  useEffect(() => {
    if (!spotlightPopup) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeSpotlightPopup();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [spotlightPopup, closeSpotlightPopup]);

  useEffect(() => {
    if (spotlightPopup?.kind !== 'welcome_bonus') {
      setAnimatedPoints(0);
      return;
    }
    const target = Math.max(0, spotlightPopup.points);
    if (typeof window === 'undefined') {
      setAnimatedPoints(target);
      return;
    }
    const prefersReduced =
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
    if (prefersReduced || target === 0) {
      setAnimatedPoints(target);
      return;
    }

    let rafId = 0;
    const durationMs = 760;
    const startAt = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - startAt) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedPoints(Math.round(target * eased));
      if (progress < 1) {
        rafId = window.requestAnimationFrame(tick);
      }
    };
    rafId = window.requestAnimationFrame(tick);
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [spotlightPopup]);

  if (!spotlightPopup) return null;

  const locale = isId ? 'id-ID' : 'en-US';

  if (spotlightPopup.kind === 'welcome_bonus') {
    const bindBonus = Math.max(0, Number(spotlightPopup.bindBonusPoints) || 0);
    const totalCredited = spotlightPopup.points + bindBonus;
    const methodLabel =
      spotlightPopup.authMethod === 'email'
        ? isId
          ? 'Login Email Terverifikasi'
          : 'Verified Email Sign-In'
        : isId
        ? 'Login Google Terverifikasi'
        : 'Verified Google Sign-In';

    const goToRewards = () => {
      closeSpotlightPopup();
      window.dispatchEvent(
        new CustomEvent('kd:navigate', {
          detail: { tab: 'rewards', subTab: 'rewards' },
        })
      );
    };

    return (
      <div
        onClick={closeSpotlightPopup}
        className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center sm:p-4 bg-black/80 backdrop-blur-md"
        role="dialog"
        aria-modal="true"
        aria-label={
          isId ? 'Bonus Login Pertama Masuk' : 'First Sign-In Bonus Credited'
        }
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="spotlight-card-enter relative w-full sm:max-w-md overflow-hidden rounded-t-3xl sm:rounded-3xl bg-[#0E0D12]/98 border-t sm:border border-amber-400/30 shadow-[0_28px_90px_rgba(0,0,0,0.92)]"
        >
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-44 pointer-events-none"
            style={{
              background:
                'radial-gradient(ellipse at 50% 0%, rgba(251,191,36,0.16) 0%, rgba(239,68,68,0.06) 48%, transparent 80%)',
            }}
          />

          <button
            type="button"
            onClick={closeSpotlightPopup}
            aria-label={isId ? 'Tutup popup' : 'Close popup'}
            className="absolute top-3.5 right-3.5 z-10 min-w-[44px] min-h-[44px] rounded-full bg-white/5 hover:bg-white/12 text-[#D4D4D8] hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="relative px-6 pt-8 pb-[max(24px,env(safe-area-inset-bottom))] space-y-6">
            <WelcomeCoinMedallion />

            <div className="text-center space-y-2">
              <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-[#A1A1AA]">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>{methodLabel}</span>
                {spotlightPopup.email && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="truncate max-w-[190px] text-[#E4E4E7]">
                      {spotlightPopup.email}
                    </span>
                  </>
                )}
              </div>

              <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                {isId
                  ? `Selamat Datang, ${spotlightPopup.displayName}`
                  : `Welcome, ${spotlightPopup.displayName}`}
              </h2>

              <div className="pt-1">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-300/90">
                  {isId ? 'Bonus Akun Baru Langsung Masuk' : 'First Sign-In Bonus Credited'}
                </p>
                <div className="mt-1 flex items-baseline justify-center gap-2">
                  <span className="text-4xl sm:text-5xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-[#FEF3C7] via-[#FBBF24] to-[#D97706] tabular-nums">
                    +{(animatedPoints || welcomePointsTarget).toLocaleString(locale)}
                  </span>
                  <span className="text-sm font-bold text-amber-300">
                    {isId ? 'POIN' : 'PTS'}
                  </span>
                </div>
                {bindBonus > 0 && (
                  <p className="mt-1.5 text-xs text-emerald-300 font-medium tabular-nums">
                    {isId
                      ? `+${bindBonus.toLocaleString(locale)} poin bind referral · Total +${totalCredited.toLocaleString(locale)} poin`
                      : `+${bindBonus.toLocaleString(locale)} referral bind pts · Total +${totalCredited.toLocaleString(locale)} pts`}
                  </p>
                )}
              </div>
            </div>

            <div className="border-t border-white/10 pt-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-2 text-[#D4D4D8]">
                  <Play className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>{isId ? 'Nonton Drama Aktif' : 'Active Watch Rewards'}</span>
                </span>
                <span className="font-semibold text-white tabular-nums">
                  {isId ? '+40 poin / menit' : '+40 pts / min'}
                </span>
              </div>
              <div className="border-t border-white/6 pt-3 flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-2 text-[#D4D4D8]">
                  <Gift className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>{isId ? 'Check-in & Share Harian' : 'Daily Check-in & Share'}</span>
                </span>
                <span className="font-semibold text-white tabular-nums">
                  {isId ? '+1.000 poin / hari' : '+1,000 pts / day'}
                </span>
              </div>
              <div className="border-t border-white/6 pt-3 flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-2 text-[#D4D4D8]">
                  <Coins className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>{isId ? 'Konversi Penarikan' : 'Redemption Rate'}</span>
                </span>
                <span className="font-semibold text-amber-200 tabular-nums">
                  100.000 pts = $1 USDT / IDR
                </span>
              </div>
            </div>

            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                onClick={closeSpotlightPopup}
                className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#F59E0B] to-[#D97706] hover:brightness-110 text-[#09090B] text-sm font-bold flex items-center justify-center gap-2 shadow-[0_12px_30px_rgba(245,158,11,0.28)] transition-all active:scale-[0.98]"
              >
                <span>
                  {isId ? 'Mulai Nonton & Kumpulkan Poin' : 'Start Watching & Earning'}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={goToRewards}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-[#E4E4E7] flex items-center justify-center gap-2 transition-colors"
              >
                <Wallet className="w-3.5 h-3.5 text-amber-400" />
                <span>{isId ? 'Lihat Dompet & Misi Harian' : 'View Wallet & Daily Missions'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Account Restricted / Blocked Security Popup
  const handleSwitchAccount = async () => {
    if (switchingAccount) return;
    setSwitchingAccount(true);
    try {
      await signOut();
      closeSpotlightPopup();
      openAuthModal(
        isId
          ? 'Masuk dengan akun utama pertama yang terdaftar di perangkat ini.'
          : 'Sign in with the primary account registered on this device.'
      );
    } finally {
      setSwitchingAccount(false);
    }
  };

  return (
    <div
      onClick={closeSpotlightPopup}
      className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center sm:p-4 bg-black/80 backdrop-blur-md"
      role="alertdialog"
      aria-modal="true"
      aria-label={
        isId
          ? 'Peringatan Proteksi 1 Perangkat 1 Akun'
          : '1 Device 1 Account Protection Alert'
      }
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="spotlight-card-enter relative w-full sm:max-w-md overflow-hidden rounded-t-3xl sm:rounded-3xl bg-[#0E0D12]/98 border-t sm:border border-red-500/35 shadow-[0_28px_90px_rgba(0,0,0,0.92)]"
      >
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-44 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse at 50% 0%, rgba(239,68,68,0.16) 0%, rgba(245,158,11,0.04) 52%, transparent 82%)',
          }}
        />

        <button
          type="button"
          onClick={closeSpotlightPopup}
          aria-label={isId ? 'Tutup peringatan' : 'Close alert'}
          className="absolute top-3.5 right-3.5 z-10 min-w-[44px] min-h-[44px] rounded-full bg-white/5 hover:bg-white/12 text-[#D4D4D8] hover:text-white flex items-center justify-center transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="relative px-6 pt-8 pb-[max(24px,env(safe-area-inset-bottom))] space-y-5">
          <SecurityShieldCrest />

          <div className="text-center space-y-2">
            <div className="flex items-center justify-center gap-1.5 text-xs text-[#A1A1AA]">
              <span className="font-semibold text-red-400">
                {isId ? 'Proteksi Keamanan' : 'Security Guard'}
              </span>
              <span aria-hidden="true">·</span>
              <span>{isId ? 'Kebijakan 1 Perangkat 1 Akun' : '1 Device · 1 Primary Account'}</span>
            </div>

            <h2 className="text-xl font-bold text-white tracking-tight">
              {isId ? 'Poin Dibatasi pada Akun Ini' : 'Rewards Restricted on This Account'}
            </h2>

            {spotlightPopup.userEmail && (
              <p className="text-xs text-[#D4D4D8] truncate">{spotlightPopup.userEmail}</p>
            )}

            <p className="text-xs text-[#A1A1AA] leading-relaxed pt-1">
              {spotlightPopup.reason ||
                (isId
                  ? 'Perangkat ini sudah terhubung dengan akun utama lain. Untuk menjaga keadilan reward, hanya akun utama pertama di perangkat ini yang dapat memperoleh poin dan bonus.'
                  : 'This device is already linked to another primary account. To keep rewards fair, only the primary account on this device can earn points and claim missions.')}
            </p>
          </div>

          <div className="border-t border-white/10 pt-4 space-y-2.5 text-xs text-[#D4D4D8]">
            <div className="flex items-start justify-between gap-3">
              <span className="text-[#A1A1AA]">
                {isId ? 'Akses Streaming' : 'Streaming Access'}
              </span>
              <span className="font-semibold text-emerald-300 text-right">
                {isId ? 'Tetap Bisa Nonton Normal' : 'Normal Playback Allowed'}
              </span>
            </div>
            <div className="border-t border-white/6 pt-2.5 flex items-start justify-between gap-3">
              <span className="text-[#A1A1AA]">
                {isId ? 'Poin & Misi Harian' : 'Points & Daily Missions'}
              </span>
              <span className="font-semibold text-red-300 text-right">
                {isId ? 'Khusus Akun Utama Perangkat' : 'Primary Account Only'}
              </span>
            </div>
          </div>

          <div className="space-y-2.5 pt-1">
            <button
              type="button"
              disabled={switchingAccount}
              onClick={() => {
                void handleSwitchAccount();
              }}
              className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-red-500/90 hover:bg-red-500 disabled:opacity-60 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-lg transition-all active:scale-[0.98]"
            >
              <LogOut className="w-4 h-4" />
              <span>
                {isId ? 'Keluar & Ganti ke Akun Utama' : 'Sign Out & Switch to Primary'}
              </span>
            </button>
            <button
              type="button"
              onClick={closeSpotlightPopup}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-[#E4E4E7] transition-colors"
            >
              {isId ? 'Mengerti, Tutup' : 'Got It, Dismiss'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
