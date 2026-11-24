import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Check,
  CheckCircle2,
  Clock,
  Coins,
  Copy,
  Flame,
  Gift,
  Globe2,
  Lock,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
} from 'lucide-react';
import { useDramaContext } from '../context/DramaContext';

type PayoutMethod =
  | 'paypal'
  | 'usdt_polygon'
  | 'usdt_trc20'
  | 'wise'
  | 'dana'
  | 'ovo'
  | 'gopay'
  | 'bank_transfer';

type PayoutStatus = 'pending' | 'approved' | 'paid' | 'rejected';

interface PayoutMethodDescriptor {
  id: PayoutMethod;
  label: string;
  currency: 'USD' | 'IDR';
  countryCode: string;
  minPoints: number;
  category: 'ewallet_idr' | 'bank_idr' | 'global_usd' | 'crypto_usd';
}

interface DailyMissionMilestoneConfig {
  minutes: number;
  bonusPoints: number;
}

interface PayoutConfig {
  usdToIdrRate: number;
  pointsPerUsd: number;
  minPayoutIdr: number;
  minPayoutUsd: number;
  minPayoutPointsIdr: number;
  minPayoutPointsUsd: number;
  maxDailyEarnPoints: number;
  claimCooldownSeconds: number;
  dailyCheckinPoints: number;
  watchEpisodePoints: number;
  watchMinutePoints: number;
  dailyMissionMaxWatchSeconds: number;
  dailyMissionMilestones: DailyMissionMilestoneConfig[];
  referralQualifySeconds: number;
  referralBonusPoints: number;
  maxDailyReferrals: number;
  maxWeeklyReferrals: number;
  maxDailyVerifiedWatchSeconds: number;
  methods: PayoutMethodDescriptor[];
}

type ReferralStatus = 'pending_watch' | 'qualified' | 'rejected_fraud';

interface UserReferralItemView {
  id: string;
  maskedReferee: string;
  status: ReferralStatus;
  bonusPoints: number;
  verifiedWatchSeconds: number;
  requiredWatchSeconds: number;
  riskFlag?: string;
  qualifiedAt: string | null;
  createdAt: string;
}

interface UserReferralSummary {
  referralCode: string;
  referralQualifySeconds: number;
  referralBonusPoints: number;
  verifiedWatchSeconds: number;
  todayWatchSeconds: number;
  maxDailyVerifiedWatchSeconds: number;
  riskFlag: string;
  stats: {
    totalInvited: number;
    pendingCount: number;
    qualifiedCount: number;
    rejectedCount: number;
    totalBonusEarned: number;
  };
  referrals: UserReferralItemView[];
}

interface PointsLedgerItem {
  id: string;
  userId: string;
  type: 'earn' | 'redeem';
  points: number;
  description: string;
  referenceId: string;
  createdAt: string;
}

interface PayoutRequestItem {
  id: string;
  userId: string;
  pointsSpent: number;
  usdAmount: number;
  idrAmount: number;
  fxRateUsed: number;
  currency: 'USD' | 'IDR';
  method: PayoutMethod;
  destinationAccount: string;
  accountHolderName: string;
  status: PayoutStatus;
  adminNote: string;
  createdAt: string;
  updatedAt: string;
}

interface UserPointsSummary {
  balance: number;
  totalEarned: number;
  totalRedeemed: number;
  todayEarned: number;
  maxDailyEarnPoints: number;
  todayWatchSeconds?: number;
  todayWatchPointsEarned?: number;
  dailyMissionMaxWatchSeconds?: number;
  estimatedUsd: number;
  estimatedIdr: number;
  lastClaimAt: string | null;
  cooldownSecondsRemaining: number;
  dailyCheckinClaimedToday: boolean;
  ledger: PointsLedgerItem[];
  payouts: PayoutRequestItem[];
}

interface LivePayoutFeedItem {
  id: string;
  maskedUser: string;
  countryCode: string;
  method: PayoutMethod;
  methodLabel: string;
  currency: 'USD' | 'IDR';
  usdAmount: number;
  idrAmount: number;
  status: 'approved' | 'paid';
  createdAt: string;
  isReal: boolean;
}

const DEFAULT_CONFIG: PayoutConfig = {
  usdToIdrRate: 18200,
  pointsPerUsd: 20000,
  minPayoutIdr: 50000,
  minPayoutUsd: 5,
  minPayoutPointsIdr: 54946,
  minPayoutPointsUsd: 100000,
  maxDailyEarnPoints: 5000,
  claimCooldownSeconds: 45,
  dailyCheckinPoints: 100,
  watchEpisodePoints: 50,
  watchMinutePoints: 5,
  dailyMissionMaxWatchSeconds: 3600,
  dailyMissionMilestones: [
    { minutes: 15, bonusPoints: 25 },
    { minutes: 30, bonusPoints: 50 },
    { minutes: 60, bonusPoints: 100 },
  ],
  referralQualifySeconds: 3600,
  referralBonusPoints: 1000,
  maxDailyReferrals: 5,
  maxWeeklyReferrals: 15,
  maxDailyVerifiedWatchSeconds: 28800,
  methods: [
    { id: 'dana', label: 'DANA', currency: 'IDR', countryCode: 'ID', minPoints: 54946, category: 'ewallet_idr' },
    { id: 'gopay', label: 'GoPay', currency: 'IDR', countryCode: 'ID', minPoints: 54946, category: 'ewallet_idr' },
    { id: 'ovo', label: 'OVO', currency: 'IDR', countryCode: 'ID', minPoints: 54946, category: 'ewallet_idr' },
    { id: 'bank_transfer', label: 'Transfer Bank (IDR)', currency: 'IDR', countryCode: 'ID', minPoints: 54946, category: 'bank_idr' },
    { id: 'paypal', label: 'PayPal', currency: 'USD', countryCode: 'US', minPoints: 100000, category: 'global_usd' },
    { id: 'usdt_polygon', label: 'USDT (Polygon)', currency: 'USD', countryCode: 'SG', minPoints: 100000, category: 'crypto_usd' },
    { id: 'usdt_trc20', label: 'USDT (TRC20)', currency: 'USD', countryCode: 'PH', minPoints: 100000, category: 'crypto_usd' },
    { id: 'wise', label: 'Wise', currency: 'USD', countryCode: 'MY', minPoints: 100000, category: 'global_usd' },
  ],
};

function formatIdr(amount: number): string {
  return `Rp ${Math.max(0, Math.round(amount)).toLocaleString('id-ID')}`;
}

function formatUsd(amount: number): string {
  return `$${Math.max(0, amount).toFixed(2)}`;
}

function formatRelativeTime(iso: string, lang: string, nowMs = Date.now()): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return '';
  const diffSec = Math.max(0, Math.floor((nowMs - ts) / 1000));
  const isId = lang === 'id';
  if (diffSec < 10) return isId ? 'baru saja' : 'just now';
  if (diffSec < 60) return isId ? `${diffSec} dtk lalu` : `${diffSec}s ago`;
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return isId ? `${mins} mnt lalu` : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return isId ? `${hrs} jam lalu` : `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return isId ? `${days} hr lalu` : `${days}d ago`;
}

function getDestinationHint(method: PayoutMethod, lang: string): string {
  const isId = lang === 'id';
  switch (method) {
    case 'dana':
    case 'ovo':
    case 'gopay':
      return isId ? 'Nomor HP terdaftar (contoh: 081234567890)' : 'Registered mobile number (e.g. 081234567890)';
    case 'bank_transfer':
      return isId ? 'Nama Bank & No. Rekening (contoh: BCA - 1234567890)' : 'Bank Name & Account No. (e.g. BCA - 1234567890)';
    case 'paypal':
      return 'PayPal email (e.g. name@gmail.com)';
    case 'wise':
      return 'Wise email or @wisetag';
    case 'usdt_polygon':
      return 'Polygon USDT address (0x...)';
    case 'usdt_trc20':
      return 'TRON TRC20 USDT address (T...)';
  }
}

export const RewardsPayoutSection: React.FC = () => {
  const {
    t,
    language,
    user,
    openAuthModal,
    getAuthHeaders,
    refreshPointsBalance,
    pushToast,
  } = useDramaContext();

  const [config, setConfig] = useState<PayoutConfig>(DEFAULT_CONFIG);
  const [summary, setSummary] = useState<UserPointsSummary | null>(null);
  const [referralSummary, setReferralSummary] = useState<UserReferralSummary | null>(
    null
  );
  const [liveFeed, setLiveFeed] = useState<LivePayoutFeedItem[]>([]);
  const [liveNowTick, setLiveNowTick] = useState<number>(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [claimingCheckin, setClaimingCheckin] = useState(false);
  const [copiedRef, setCopiedRef] = useState(false);

  const [currencyTab, setCurrencyTab] = useState<'IDR' | 'USD'>(() =>
    language === 'id' ? 'IDR' : 'USD'
  );
  const [selectedMethod, setSelectedMethod] = useState<PayoutMethod>(() =>
    language === 'id' ? 'dana' : 'paypal'
  );
  const [pointsInput, setPointsInput] = useState<string>(() =>
    language === 'id' ? '54946' : '100000'
  );
  const [destinationInput, setDestinationInput] = useState<string>('');
  const [holderNameInput, setHolderNameInput] = useState<string>(user?.displayName || '');
  const [submittingPayout, setSubmittingPayout] = useState(false);
  const [formFeedback, setFormFeedback] = useState<{
    type: 'error' | 'success';
    message: string;
  } | null>(null);

  const loadLiveFeed = useCallback(async () => {
    try {
      const res = await fetch('/api/payouts/live?limit=12', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { ok?: boolean; items?: LivePayoutFeedItem[] };
      if (data.ok && Array.isArray(data.items)) {
        setLiveFeed(data.items);
      }
    } catch {
      // Ignore transient live feed fetch error
    }
  }, []);

  const loadPointsData = useCallback(async () => {
    setLoading(true);
    try {
      const cfgPromise = fetch('/api/points/config', { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);

      const mePromise = user
        ? fetch('/api/points/me', {
            credentials: 'include',
            headers: getAuthHeaders(),
            cache: 'no-store',
          })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null)
        : Promise.resolve(null);

      const refPromise = user
        ? fetch('/api/referrals/me', {
            credentials: 'include',
            headers: getAuthHeaders(),
            cache: 'no-store',
          })
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null)
        : Promise.resolve(null);

      const [cfgRes, meRes, refRes] = await Promise.all([
        cfgPromise,
        mePromise,
        refPromise,
        loadLiveFeed(),
      ]);
      if (cfgRes?.ok && cfgRes.config) {
        setConfig(cfgRes.config as PayoutConfig);
      }
      if (meRes?.ok && meRes.summary) {
        setSummary(meRes.summary as UserPointsSummary);
        if (meRes.config) setConfig(meRes.config as PayoutConfig);
      } else if (!user) {
        setSummary(null);
      }
      if (refRes?.ok && refRes.referralSummary) {
        setReferralSummary(refRes.referralSummary as UserReferralSummary);
      } else if (!user) {
        setReferralSummary(null);
      }
    } finally {
      setLoading(false);
    }
  }, [user, getAuthHeaders, loadLiveFeed]);

  useEffect(() => {
    void loadPointsData();
  }, [loadPointsData]);

  // Keep Live Payout History rolling every 10s + relative timestamps ticking every 1s
  useEffect(() => {
    const feedTimer = window.setInterval(() => {
      void loadLiveFeed();
    }, 10_000);
    const tickTimer = window.setInterval(() => {
      setLiveNowTick(Date.now());
    }, 1_000);
    return () => {
      window.clearInterval(feedTimer);
      window.clearInterval(tickTimer);
    };
  }, [loadLiveFeed]);

  useEffect(() => {
    if (user?.displayName && !holderNameInput.trim()) {
      setHolderNameInput(user.displayName);
    }
  }, [user?.displayName, holderNameInput]);

  useEffect(() => {
    const onPointsUpdated = (evt: Event) => {
      const detail = (
        evt as CustomEvent<{
          summary?: UserPointsSummary;
          verifiedWatchSeconds?: number;
          todayWatchSeconds?: number;
          todayWatchPointsEarned?: number;
          pointsBalance?: number | null;
          referralQualified?: boolean;
          referralBound?: boolean;
        }>
      ).detail;
      if (detail?.summary) {
        setSummary(detail.summary);
      }
      if (typeof detail?.verifiedWatchSeconds === 'number') {
        const nextSec = detail.verifiedWatchSeconds;
        setReferralSummary((prev) =>
          prev
            ? {
                ...prev,
                verifiedWatchSeconds: nextSec,
                todayWatchSeconds:
                  typeof detail.todayWatchSeconds === 'number'
                    ? detail.todayWatchSeconds
                    : prev.todayWatchSeconds,
              }
            : prev
        );
      }
      if (
        typeof detail?.todayWatchSeconds === 'number' ||
        typeof detail?.todayWatchPointsEarned === 'number' ||
        typeof detail?.pointsBalance === 'number'
      ) {
        setSummary((prev) =>
          prev
            ? {
                ...prev,
                ...(typeof detail.pointsBalance === 'number'
                  ? { balance: detail.pointsBalance }
                  : {}),
                ...(typeof detail.todayWatchSeconds === 'number'
                  ? { todayWatchSeconds: detail.todayWatchSeconds }
                  : {}),
                ...(typeof detail.todayWatchPointsEarned === 'number'
                  ? { todayWatchPointsEarned: detail.todayWatchPointsEarned }
                  : {}),
              }
            : prev
        );
      }
      if (detail?.referralQualified || detail?.referralBound) {
        void loadPointsData();
      }
    };
    window.addEventListener('kd:points-updated', onPointsUpdated);
    return () => window.removeEventListener('kd:points-updated', onPointsUpdated);
  }, [loadPointsData]);

  // Countdown tick when claim cooldown is active
  useEffect(() => {
    if (!summary || summary.cooldownSecondsRemaining <= 0) return;
    const timer = window.setInterval(() => {
      setSummary((prev) => {
        if (!prev || prev.cooldownSecondsRemaining <= 0) return prev;
        return {
          ...prev,
          cooldownSecondsRemaining: Math.max(0, prev.cooldownSecondsRemaining - 1),
        };
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [summary?.cooldownSecondsRemaining]);

  const filteredMethods = useMemo(
    () => config.methods.filter((m) => m.currency === currencyTab),
    [config.methods, currencyTab]
  );

  useEffect(() => {
    const matchesTab = filteredMethods.some((m) => m.id === selectedMethod);
    if (!matchesTab && filteredMethods[0]) {
      setSelectedMethod(filteredMethods[0].id);
      setPointsInput(String(filteredMethods[0].minPoints));
    }
  }, [currencyTab, filteredMethods, selectedMethod]);

  const activeMethodObj = useMemo(
    () =>
      config.methods.find((m) => m.id === selectedMethod) ||
      filteredMethods[0] ||
      DEFAULT_CONFIG.methods[0],
    [config.methods, selectedMethod, filteredMethods]
  );

  const parsedPoints = Math.max(0, Math.floor(Number(pointsInput) || 0));
  const estimatedReceiveUsd = useMemo(
    () => Math.round((parsedPoints / Math.max(1, config.pointsPerUsd)) * 100) / 100,
    [parsedPoints, config.pointsPerUsd]
  );
  const estimatedReceiveIdr = useMemo(
    () => Math.round((parsedPoints / Math.max(1, config.pointsPerUsd)) * config.usdToIdrRate),
    [parsedPoints, config.pointsPerUsd, config.usdToIdrRate]
  );

  const handleDailyCheckin = async () => {
    if (!user) {
      openAuthModal();
      return;
    }
    setClaimingCheckin(true);
    setFormFeedback(null);
    try {
      const res = await fetch('/api/points/claim', {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ action: 'daily_checkin' }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        awardedPoints?: number;
        error?: string;
        summary?: UserPointsSummary;
      };
      if (data.summary) setSummary(data.summary);
      if (res.ok && data.ok) {
        pushToast(`+${data.awardedPoints || config.dailyCheckinPoints} ${t.rewards.pointsUnit}!`, 'gold');
        void refreshPointsBalance();
      } else {
        setFormFeedback({
          type: 'error',
          message: data.error || 'Unable to claim daily check-in',
        });
      }
    } catch {
      setFormFeedback({ type: 'error', message: 'Network error while claiming points' });
    } finally {
      setClaimingCheckin(false);
    }
  };

  const handleSubmitWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      openAuthModal();
      return;
    }
    setFormFeedback(null);

    if (parsedPoints < activeMethodObj.minPoints) {
      const minLabel =
        activeMethodObj.currency === 'IDR'
          ? `${formatIdr(config.minPayoutIdr)} (${activeMethodObj.minPoints.toLocaleString()} ${t.rewards.pointsUnit})`
          : `${formatUsd(config.minPayoutUsd)} (${activeMethodObj.minPoints.toLocaleString()} ${t.rewards.pointsUnit})`;
      setFormFeedback({
        type: 'error',
        message: `${
          activeMethodObj.currency === 'IDR'
            ? t.rewards.ruleMinIdr
            : t.rewards.ruleMinUsd
        }: ${minLabel}`,
      });
      return;
    }
    if (summary && parsedPoints > summary.balance) {
      setFormFeedback({
        type: 'error',
        message: language === 'id' ? 'Saldo poin tidak mencukupi.' : 'Insufficient points balance.',
      });
      return;
    }

    setSubmittingPayout(true);
    try {
      const res = await fetch('/api/points/redeem', {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          method: selectedMethod,
          pointsSpent: parsedPoints,
          destinationAccount: destinationInput.trim(),
          accountHolderName: holderNameInput.trim(),
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        summary?: UserPointsSummary;
      };
      if (data.summary) setSummary(data.summary);

      if (res.ok && data.ok) {
        setDestinationInput('');
        setFormFeedback({ type: 'success', message: t.rewards.withdrawSuccess });
        pushToast(t.rewards.withdrawSuccess, 'gold');
        void refreshPointsBalance();
        void loadLiveFeed();
      } else {
        setFormFeedback({
          type: 'error',
          message: data.error || 'Failed to submit withdrawal request',
        });
      }
    } catch {
      setFormFeedback({ type: 'error', message: 'Network error while submitting request' });
    } finally {
      setSubmittingPayout(false);
    }
  };

  const renderStatusBadge = (status: PayoutStatus) => {
    switch (status) {
      case 'paid':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-[11px] font-bold text-emerald-300">
            <CheckCircle2 className="w-3 h-3" />
            {t.rewards.statusPaid}
          </span>
        );
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-sky-500/15 border border-sky-500/30 text-[11px] font-bold text-sky-300">
            <ShieldCheck className="w-3 h-3" />
            {t.rewards.statusApproved}
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-rose-500/15 border border-rose-500/30 text-[11px] font-bold text-rose-300">
            <AlertCircle className="w-3 h-3" />
            {t.rewards.statusRejected}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-[11px] font-bold text-amber-300">
            <Clock className="w-3 h-3" />
            {t.rewards.statusPending}
          </span>
        );
    }
  };

  const renderReferralStatusBadge = (status: ReferralStatus) => {
    switch (status) {
      case 'qualified':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-[11px] font-bold text-emerald-300">
            <CheckCircle2 className="w-3 h-3" />
            {t.rewards.referralStatusQualified}
          </span>
        );
      case 'rejected_fraud':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-rose-500/15 border border-rose-500/30 text-[11px] font-bold text-rose-300">
            <AlertCircle className="w-3 h-3" />
            {t.rewards.referralStatusRejected}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-[11px] font-bold text-amber-300">
            <Clock className="w-3 h-3" />
            {t.rewards.referralStatusPending}
          </span>
        );
    }
  };

  const referralShareUrl = useMemo(() => {
    if (!referralSummary?.referralCode) return '';
    const origin =
      typeof window !== 'undefined' &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1'
        ? window.location.origin
        : 'https://kano-drama.xyz';
    return `${origin}/?ref=${encodeURIComponent(referralSummary.referralCode)}`;
  }, [referralSummary?.referralCode]);

  const handleCopyReferralLink = async () => {
    if (!referralShareUrl) return;
    try {
      await navigator.clipboard.writeText(referralShareUrl);
      setCopiedRef(true);
      pushToast(t.rewards.referralCopied, 'gold');
      window.setTimeout(() => setCopiedRef(false), 2200);
    } catch {
      pushToast(referralShareUrl, 'neutral');
    }
  };

  const dailyPct = summary
    ? Math.min(
        100,
        Math.round(
          (summary.todayEarned / Math.max(1, summary.maxDailyEarnPoints)) * 100
        )
      )
    : 0;

  const verifiedWatchMinutes = Math.floor(
    (referralSummary?.verifiedWatchSeconds || 0) / 60
  );
  const qualifyMinutes = Math.max(
    1,
    Math.round(
      (referralSummary?.referralQualifySeconds || config.referralQualifySeconds || 3600) /
        60
    )
  );

  const missionMaxSeconds = Math.max(
    60,
    summary?.dailyMissionMaxWatchSeconds ?? config.dailyMissionMaxWatchSeconds ?? 3600
  );
  const missionMaxMinutes = Math.floor(missionMaxSeconds / 60);
  const todayWatchSeconds = Math.max(
    0,
    summary?.todayWatchSeconds ?? referralSummary?.todayWatchSeconds ?? 0
  );
  const cappedMissionWatchSeconds = Math.min(todayWatchSeconds, missionMaxSeconds);
  const todayMissionMinutes = Math.floor(cappedMissionWatchSeconds / 60);
  const missionWatchPct = Math.min(
    100,
    Math.round((cappedMissionWatchSeconds / missionMaxSeconds) * 100)
  );
  const todayWatchPointsEarned = Math.max(0, summary?.todayWatchPointsEarned ?? 0);
  const maxWatchMissionPoints =
    missionMaxMinutes * (config.watchMinutePoints || 5) +
    (config.dailyMissionMilestones || []).reduce((acc, m) => acc + m.bonusPoints, 0);
  const usd5Points = Math.max(1000, config.pointsPerUsd * 5);

  return (
    <div className="space-y-6">
      {/* Top Overview: Balance Card + Rules */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 rounded-3xl bg-gradient-to-br from-[#1C1610] via-[var(--cd-surface)] to-[#111015] border border-[#D4AF37]/30 p-5 sm:p-6 space-y-5">
          {!user ? (
            <div className="space-y-4 py-2">
              <div className="flex items-start gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-[#D4AF37]/15 border border-[#D4AF37]/35 flex items-center justify-center shrink-0 text-[#D4AF37]">
                  <Lock className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-base sm:text-lg font-bold text-white">
                    {t.rewards.loginRequiredTitle}
                  </h2>
                  <p className="text-xs sm:text-sm text-[#D4D4D8] leading-relaxed">
                    {t.rewards.loginRequiredDesc}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => openAuthModal()}
                  className="px-6 py-2.5 min-h-[44px] rounded-full cd-accent-bg text-xs sm:text-sm font-bold text-white shadow-lg hover:brightness-110 transition-all"
                >
                  {t.auth.continueBtn}
                </button>
                <span className="text-xs text-[#D4AF37] font-semibold tabular-nums">
                  {usd5Points.toLocaleString()} {t.rewards.pointsUnit} = $5.00 ·{' '}
                  {config.minPayoutPointsIdr.toLocaleString()} {t.rewards.pointsUnit} ={' '}
                  {formatIdr(config.minPayoutIdr)}
                </span>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#D4AF37]">
                    <Coins className="w-4 h-4" />
                    <span>{t.rewards.balanceTitle}</span>
                  </span>
                  <div className="flex items-baseline gap-2 mt-1.5">
                    <span className="text-3xl sm:text-4xl font-extrabold text-white tabular-nums">
                      {(summary?.balance ?? 0).toLocaleString()}
                    </span>
                    <span className="text-sm font-semibold text-[#D4AF37]">
                      {t.rewards.pointsUnit}
                    </span>
                  </div>
                  <p className="text-xs text-[#A1A1AA] mt-1 tabular-nums">
                    {t.rewards.estimatedValue}:{' '}
                    <span className="text-white font-semibold">
                      {formatUsd(summary?.estimatedUsd ?? 0)}
                    </span>{' '}
                    ·{' '}
                    <span className="text-emerald-300 font-semibold">
                      {formatIdr(summary?.estimatedIdr ?? 0)}
                    </span>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void loadPointsData()}
                  disabled={loading}
                  aria-label="Refresh points"
                  className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[#D4D4D8] transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {/* Daily Earn Cap + Verified Watch Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2 p-3.5 rounded-2xl bg-[#0D0C10]/80 border border-white/10">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#A1A1AA] font-medium">
                      {t.rewards.dailyProgress}
                    </span>
                    <span className="text-white font-bold tabular-nums">
                      {(summary?.todayEarned ?? 0).toLocaleString()} /{' '}
                      {(summary?.maxDailyEarnPoints ?? config.maxDailyEarnPoints).toLocaleString()}{' '}
                      {t.rewards.pointsUnit}
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#D4AF37] to-[#EF4444] rounded-full transition-all duration-300"
                      style={{ width: `${Math.max(2, dailyPct)}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-1.5 p-3.5 rounded-2xl bg-[#0D0C10]/80 border border-white/10">
                  <div className="flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-1.5 text-[#A1A1AA] font-medium">
                      <PlayCircle className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{t.rewards.verifiedWatchProgress}</span>
                    </span>
                    <span className="text-emerald-300 font-bold tabular-nums">
                      {verifiedWatchMinutes} {t.rewards.minutesUnit}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#71717A] tabular-nums">
                    {language === 'id'
                      ? `Hari ini: ${Math.floor(todayWatchSeconds / 60)} ${t.rewards.minutesUnit}`
                      : `Today: ${Math.floor(todayWatchSeconds / 60)} ${t.rewards.minutesUnit}`}
                  </p>
                </div>
              </div>

              {/* Daily Check-in Action */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleDailyCheckin}
                  disabled={
                    claimingCheckin ||
                    Boolean(summary?.dailyCheckinClaimedToday) ||
                    (summary?.cooldownSecondsRemaining ?? 0) > 0
                  }
                  className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] rounded-xl bg-[#D4AF37] text-[#09090B] text-xs sm:text-sm font-extrabold hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {summary?.dailyCheckinClaimedToday
                      ? t.rewards.dailyCheckinDone
                      : (summary?.cooldownSecondsRemaining ?? 0) > 0
                      ? `${t.rewards.cooldownWait} ${summary?.cooldownSecondsRemaining}s`
                      : `${t.rewards.dailyCheckinBtn.replace(/\(\+[^)]+\)/, '')} (+${config.dailyCheckinPoints.toLocaleString()} ${t.rewards.pointsUnit})`}
                  </span>
                </button>

                <span className="text-[11px] text-[#A1A1AA] tabular-nums">
                  {usd5Points.toLocaleString()} {t.rewards.pointsUnit} = $5.00 ·{' '}
                  {config.minPayoutPointsIdr.toLocaleString()} {t.rewards.pointsUnit} ={' '}
                  {formatIdr(config.minPayoutIdr)}
                </span>
              </div>
            </>
          )}
        </div>

        {/* Earning & Payout Rules Card */}
        <div className="lg:col-span-5 rounded-3xl bg-[var(--cd-surface)] border border-white/10 p-5 sm:p-6 space-y-3.5">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>{t.rewards.rulesTitle}</span>
          </div>
          <ul className="space-y-2.5 text-xs text-[#D4D4D8] leading-relaxed">
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] mt-1.5 shrink-0" />
              <span>
                {language === 'id'
                  ? `Rate tukar poin: ${usd5Points.toLocaleString()} poin = $5.00 USD (${config.pointsPerUsd.toLocaleString()} poin = $1.00 = ${formatIdr(config.usdToIdrRate)}).`
                  : `Exchange rate: ${usd5Points.toLocaleString()} pts = $5.00 USD (${config.pointsPerUsd.toLocaleString()} pts = $1.00 = ${formatIdr(config.usdToIdrRate)}).`}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] mt-1.5 shrink-0" />
              <span>
                {language === 'id'
                  ? `Misi Harian Nonton (maks. 1 jam/hari): +${config.watchMinutePoints} poin/menit + bonus 15m/30m/60m hingga +${maxWatchMissionPoints.toLocaleString()} poin/hari.`
                  : `Daily Watch Mission (max 1h/day): +${config.watchMinutePoints} pts/min + 15m/30m/60m bonuses up to +${maxWatchMissionPoints.toLocaleString()} pts/day.`}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] mt-1.5 shrink-0" />
              <span>
                {language === 'id'
                  ? `Check-in harian memberi +${config.dailyCheckinPoints} poin & nonton episode baru +${config.watchEpisodePoints} poin (batas harian ${config.maxDailyEarnPoints.toLocaleString()} poin).`
                  : `Daily check-in gives +${config.dailyCheckinPoints} pts & new episode watch +${config.watchEpisodePoints} pts (daily cap ${config.maxDailyEarnPoints.toLocaleString()} pts).`}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
              <span>
                {t.rewards.ruleMinIdr}:{' '}
                <strong className="text-white tabular-nums">
                  {formatIdr(config.minPayoutIdr)} ({config.minPayoutPointsIdr.toLocaleString()}{' '}
                  {t.rewards.pointsUnit})
                </strong>
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 mt-1.5 shrink-0" />
              <span>
                {t.rewards.ruleMinUsd}:{' '}
                <strong className="text-white tabular-nums">
                  {formatUsd(config.minPayoutUsd)} ({config.minPayoutPointsUsd.toLocaleString()}{' '}
                  {t.rewards.pointsUnit})
                </strong>
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-1.5 shrink-0" />
              <span>{t.rewards.referralRule1h}</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Daily Watch Missions (Max 1 Hour / Day) */}
      <div className="rounded-3xl bg-[var(--cd-surface)] border border-emerald-500/25 p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Flame className="w-5 h-5 text-[#EF4444]" />
              <h2 className="text-base sm:text-lg font-bold text-white">
                {language === 'id'
                  ? 'Misi Harian Nonton (Maks. 1 Jam / Hari)'
                  : 'Daily Watch Missions (Max 1 Hour / Day)'}
              </h2>
            </div>
            <p className="text-xs text-[#A1A1AA]">
              {language === 'id'
                ? `Tonton video dengan counter aktif (kecepatan 1x, tab aktif): +${config.watchMinutePoints} poin setiap menit hingga ${missionMaxMinutes} menit/hari + bonus milestone.`
                : `Watch videos with live counter active (1x speed, active tab): +${config.watchMinutePoints} pts per minute up to ${missionMaxMinutes} min/day + milestone bonuses.`}
            </p>
          </div>

          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs font-extrabold text-emerald-300 tabular-nums">
            <span>
              +{todayWatchPointsEarned.toLocaleString()} / {maxWatchMissionPoints.toLocaleString()}{' '}
              {t.rewards.pointsUnit}
            </span>
          </div>
        </div>

        <div className="space-y-2 p-4 rounded-2xl bg-[#0D0C10] border border-white/10">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-[#D4D4D8]">
              {language === 'id'
                ? 'Progres Nonton Misi Hari Ini (Reset 00:00 WIB)'
                : "Today's Mission Watch Progress (Resets 00:00 WIB)"}
            </span>
            <span className="font-extrabold text-white tabular-nums">
              {todayMissionMinutes} / {missionMaxMinutes} {t.rewards.minutesUnit} ({missionWatchPct}%)
            </span>
          </div>
          <div className="w-full h-2.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#EF4444] via-[#D4AF37] to-emerald-400 transition-all duration-500"
              style={{ width: `${Math.max(2, missionWatchPct)}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-2xl bg-[#0D0C10] border border-white/10 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white">
                {language === 'id' ? 'Nonton Aktif / Menit' : 'Active Watch / Min'}
              </span>
              <span className="text-xs font-extrabold text-[#D4AF37] tabular-nums">
                +{config.watchMinutePoints} {t.rewards.pointsUnit}
              </span>
            </div>
            <p className="text-[11px] text-[#A1A1AA] tabular-nums">
              {todayMissionMinutes}/{missionMaxMinutes} {t.rewards.minutesUnit} ·{' '}
              {language === 'id' ? 'Maks' : 'Max'}{' '}
              {(missionMaxMinutes * config.watchMinutePoints).toLocaleString()}{' '}
              {t.rewards.pointsUnit}
            </p>
          </div>

          {(config.dailyMissionMilestones || []).map((tier) => {
            const reached = todayMissionMinutes >= tier.minutes;
            return (
              <div
                key={tier.minutes}
                className={`p-3.5 rounded-2xl border flex flex-col justify-between gap-2 transition-colors ${
                  reached
                    ? 'bg-emerald-500/10 border-emerald-500/35'
                    : 'bg-[#0D0C10] border-white/10'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-white">
                    {language === 'id'
                      ? `Target ${tier.minutes} Menit`
                      : `${tier.minutes}-Min Milestone`}
                  </span>
                  <span
                    className={`text-xs font-extrabold tabular-nums ${
                      reached ? 'text-emerald-300' : 'text-[#D4AF37]'
                    }`}
                  >
                    +{tier.bonusPoints.toLocaleString()} {t.rewards.pointsUnit}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#A1A1AA] tabular-nums">
                    {Math.min(todayMissionMinutes, tier.minutes)}/{tier.minutes}{' '}
                    {t.rewards.minutesUnit}
                  </span>
                  <span
                    className={`font-bold ${
                      reached ? 'text-emerald-300' : 'text-[#71717A]'
                    }`}
                  >
                    {reached
                      ? language === 'id'
                        ? 'Terklaim Otomatis'
                        : 'Auto-Credited'
                      : language === 'id'
                      ? 'Berjalan'
                      : 'In Progress'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Referral Program & 1-Hour Active Watch Verification */}
      <div
        id="referral-program"
        className="rounded-3xl bg-[var(--cd-surface)] border border-[#D4AF37]/25 p-5 sm:p-6 space-y-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1 max-w-2xl">
            <div className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-[#D4AF37]" />
              <h2 className="text-base sm:text-lg font-bold text-white">
                {t.rewards.referralTitle}
              </h2>
            </div>
            <p className="text-xs text-[#A1A1AA] leading-relaxed">
              {t.rewards.referralSubtitle}
            </p>
          </div>

          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/30 text-xs font-extrabold text-[#D4AF37] tabular-nums">
            <Sparkles className="w-3.5 h-3.5" />
            <span>
              +{(referralSummary?.referralBonusPoints ?? config.referralBonusPoints).toLocaleString()}{' '}
              {t.rewards.pointsUnit} / {qualifyMinutes} {t.rewards.minutesUnit}
            </span>
          </div>
        </div>

        {!user ? (
          <div className="p-4 sm:p-5 rounded-2xl bg-[#0D0C10] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs sm:text-sm font-bold text-white">
                {language === 'id'
                  ? 'Dapatkan Link & Kode Referral Pribadi Anda'
                  : 'Get Your Personal Referral Link & Code'}
              </p>
              <p className="text-xs text-[#A1A1AA] leading-relaxed">
                {t.rewards.referralRule1h}
              </p>
            </div>
            <button
              type="button"
              onClick={() => openAuthModal()}
              className="px-5 py-2.5 min-h-[42px] rounded-full bg-[#D4AF37] text-[#09090B] text-xs font-extrabold hover:brightness-110 transition-all shrink-0"
            >
              {language === 'id'
                ? 'Masuk untuk Ambil Link Referral'
                : 'Sign In to Get Referral Link'}
            </button>
          </div>
        ) : !referralSummary ? (
          <div className="p-4 rounded-2xl bg-[#0D0C10] border border-white/10 text-xs text-[#A1A1AA]">
            {t.sections.loading}
          </div>
        ) : (
          <>

          {/* Share Link + KPI Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-6 p-4 rounded-2xl bg-[#0D0C10] border border-white/10 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#A1A1AA] font-semibold">
                  {t.rewards.referralLinkLabel}
                </span>
                <span className="text-[#D4AF37] font-mono font-bold">
                  {t.rewards.referralCodeLabel}: {referralSummary.referralCode}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={referralShareUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label={t.rewards.referralLinkLabel}
                  className="flex-1 min-h-[40px] px-3 py-2 rounded-xl bg-[#16151C] border border-white/10 text-xs text-white font-mono truncate focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void handleCopyReferralLink()}
                  className="inline-flex items-center gap-1.5 px-4 min-h-[40px] rounded-xl bg-[#D4AF37] text-[#09090B] text-xs font-extrabold hover:brightness-110 transition-all shrink-0"
                >
                  {copiedRef ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{t.rewards.copyReferralLink}</span>
                </button>
              </div>
            </div>

            <div className="lg:col-span-6 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 rounded-2xl bg-[#0D0C10] border border-white/10">
                <p className="text-[11px] text-[#A1A1AA]">{t.rewards.referralTotalInvited}</p>
                <p className="text-lg font-extrabold text-white tabular-nums mt-0.5">
                  {referralSummary.stats.totalInvited}
                </p>
              </div>
              <div className="p-3 rounded-2xl bg-[#0D0C10] border border-white/10">
                <p className="text-[11px] text-[#A1A1AA]">{t.rewards.referralPendingCount}</p>
                <p className="text-lg font-extrabold text-amber-300 tabular-nums mt-0.5">
                  {referralSummary.stats.pendingCount}
                </p>
              </div>
              <div className="p-3 rounded-2xl bg-[#0D0C10] border border-white/10">
                <p className="text-[11px] text-[#A1A1AA]">{t.rewards.referralQualifiedCount}</p>
                <p className="text-lg font-extrabold text-emerald-300 tabular-nums mt-0.5">
                  {referralSummary.stats.qualifiedCount}
                </p>
              </div>
              <div className="p-3 rounded-2xl bg-[#0D0C10] border border-white/10">
                <p className="text-[11px] text-[#A1A1AA]">{t.rewards.referralBonusEarned}</p>
                <p className="text-lg font-extrabold text-[#D4AF37] tabular-nums mt-0.5">
                  +{referralSummary.stats.totalBonusEarned.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* Invited Friends Watch Progress List */}
          {referralSummary.referrals.length === 0 ? (
            <div className="p-4 rounded-2xl bg-[#0D0C10]/70 border border-white/10 flex items-center gap-3 text-xs text-[#A1A1AA]">
              <Users className="w-4 h-4 text-[#D4AF37] shrink-0" />
              <span>{t.rewards.referralEmpty}</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[320px] overflow-y-auto pr-1">
              {referralSummary.referrals.map((ref) => {
                const watchedMin = Math.min(
                  qualifyMinutes,
                  Math.floor(ref.verifiedWatchSeconds / 60)
                );
                const reqMin = Math.max(
                  1,
                  Math.round(ref.requiredWatchSeconds / 60)
                );
                const pct =
                  ref.status === 'qualified'
                    ? 100
                    : Math.min(
                        99,
                        Math.round(
                          (ref.verifiedWatchSeconds / Math.max(1, ref.requiredWatchSeconds)) *
                            100
                        )
                      );
                return (
                  <div
                    key={ref.id}
                    className="p-3.5 rounded-2xl bg-[#0D0C10] border border-white/10 space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-white">
                        {ref.maskedReferee}
                      </span>
                      {renderReferralStatusBadge(ref.status)}
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] text-[#A1A1AA] tabular-nums">
                        <span>
                          {watchedMin} / {reqMin} {t.rewards.minutesUnit}
                        </span>
                        <span className="text-[#D4AF37] font-bold">
                          +{ref.bonusPoints.toLocaleString()} {t.rewards.pointsUnit}
                        </span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            ref.status === 'rejected_fraud'
                              ? 'bg-rose-500'
                              : ref.status === 'qualified'
                              ? 'bg-emerald-400'
                              : 'bg-[#D4AF37]'
                          }`}
                          style={{ width: `${Math.max(4, pct)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          </>
        )}
      </div>

      {/* Withdrawal Form + Live Payout Feed */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Withdrawal Request Form */}
        <form
          onSubmit={handleSubmitWithdraw}
          className="xl:col-span-7 rounded-3xl bg-[var(--cd-surface)] border border-white/10 p-5 sm:p-6 space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-[#D4AF37]" />
              <h2 className="text-base sm:text-lg font-bold text-white">
                {t.rewards.withdrawTitle}
              </h2>
            </div>

            {/* Region / Currency Toggle */}
            <div className="inline-flex p-1 rounded-xl bg-[#0D0C10] border border-white/10">
              <button
                type="button"
                onClick={() => setCurrencyTab('IDR')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  currencyTab === 'IDR'
                    ? 'cd-accent-bg text-white shadow'
                    : 'text-[#A1A1AA] hover:text-white'
                }`}
              >
                <Banknote className="w-3.5 h-3.5" />
                <span>{t.rewards.regionIdrLabel}</span>
              </button>
              <button
                type="button"
                onClick={() => setCurrencyTab('USD')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  currencyTab === 'USD'
                    ? 'cd-accent-bg text-white shadow'
                    : 'text-[#A1A1AA] hover:text-white'
                }`}
              >
                <Globe2 className="w-3.5 h-3.5" />
                <span>{t.rewards.regionUsdLabel}</span>
              </button>
            </div>
          </div>

          {/* Payout Method Grid */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-[#D4D4D8]">
              {t.rewards.methodLabel}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {filteredMethods.map((m) => {
                const active = selectedMethod === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setSelectedMethod(m.id);
                      if (parsedPoints < m.minPoints) {
                        setPointsInput(String(m.minPoints));
                      }
                    }}
                    className={`p-3 rounded-2xl border text-left transition-all ${
                      active
                        ? 'bg-[#D4AF37]/15 border-[#D4AF37] text-white'
                        : 'bg-[#0D0C10] border-white/10 text-[#D4D4D8] hover:border-white/25'
                    }`}
                  >
                    <p className="text-xs font-bold truncate">{m.label}</p>
                    <p className="text-[11px] text-[#A1A1AA] mt-0.5 tabular-nums">
                      Min {m.currency === 'IDR' ? formatIdr(config.minPayoutIdr) : formatUsd(config.minPayoutUsd)} ·{' '}
                      {m.minPoints.toLocaleString()} {t.rewards.pointsUnit}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Points Amount */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-[#D4D4D8]">
                {t.rewards.pointsAmountLabel}
              </label>
              <input
                type="number"
                min={activeMethodObj.minPoints}
                step={100}
                value={pointsInput}
                onChange={(e) => setPointsInput(e.target.value)}
                disabled={!user}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[#0D0C10] border border-white/10 focus:border-[#D4AF37] focus:outline-none text-sm text-white tabular-nums disabled:opacity-50"
              />
              <div className="flex flex-wrap gap-1.5">
                {[
                  activeMethodObj.minPoints,
                  100000,
                  200000,
                  ...(summary && summary.balance > activeMethodObj.minPoints
                    ? [summary.balance]
                    : []),
                ]
                  .filter((v, idx, arr) => arr.indexOf(v) === idx)
                  .slice(0, 4)
                  .map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      disabled={!user}
                      onClick={() => setPointsInput(String(preset))}
                      className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-semibold text-[#E4E4E7] tabular-nums disabled:opacity-40"
                    >
                      {summary && preset === summary.balance
                        ? 'MAX'
                        : preset.toLocaleString()}
                    </button>
                  ))}
              </div>
              <p className="text-[11px] text-[#A1A1AA] tabular-nums">
                {activeMethodObj.currency === 'IDR'
                  ? `Min: ${formatIdr(config.minPayoutIdr)} (${activeMethodObj.minPoints.toLocaleString()} ${t.rewards.pointsUnit})`
                  : `Min: ${formatUsd(config.minPayoutUsd)} (${activeMethodObj.minPoints.toLocaleString()} ${t.rewards.pointsUnit})`}
              </p>
            </div>

            {/* Estimated Receive Preview */}
            <div className="space-y-2">
              <span className="block text-xs font-semibold text-[#D4D4D8]">
                {t.rewards.estimatedReceive}
              </span>
              <div className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#111015] border border-[#D4AF37]/30 flex items-center justify-between">
                <span className="text-base font-extrabold text-[#D4AF37] tabular-nums">
                  {currencyTab === 'IDR'
                    ? formatIdr(estimatedReceiveIdr)
                    : formatUsd(estimatedReceiveUsd)}
                </span>
                <span className="text-[11px] text-[#A1A1AA] tabular-nums">
                  {currencyTab === 'IDR'
                    ? `(${formatUsd(estimatedReceiveUsd)})`
                    : `(${formatIdr(estimatedReceiveIdr)})`}
                </span>
              </div>
              <p className="text-[11px] text-[#71717A]">
                1 USD = {formatIdr(config.usdToIdrRate)} · {activeMethodObj.label}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-[#D4D4D8]">
                {t.rewards.destinationLabel}
              </label>
              <input
                type="text"
                value={destinationInput}
                onChange={(e) => setDestinationInput(e.target.value)}
                disabled={!user}
                required
                placeholder={getDestinationHint(selectedMethod, language)}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[#0D0C10] border border-white/10 focus:border-[#D4AF37] focus:outline-none text-sm text-white placeholder:text-[#71717A] disabled:opacity-50"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-[#D4D4D8]">
                {t.rewards.accountHolderLabel}
              </label>
              <input
                type="text"
                value={holderNameInput}
                onChange={(e) => setHolderNameInput(e.target.value)}
                disabled={!user}
                required
                placeholder={t.rewards.accountHolderPlaceholder}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[#0D0C10] border border-white/10 focus:border-[#D4AF37] focus:outline-none text-sm text-white placeholder:text-[#71717A] disabled:opacity-50"
              />
            </div>
          </div>

          {formFeedback && (
            <div
              className={`p-3.5 rounded-2xl border text-xs font-medium flex items-center gap-2 ${
                formFeedback.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
              }`}
            >
              {formFeedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{formFeedback.message}</span>
            </div>
          )}

          <div className="flex justify-end">
            {user ? (
              <button
                type="submit"
                disabled={submittingPayout}
                className="px-6 py-2.5 min-h-[44px] rounded-full cd-accent-bg text-xs sm:text-sm font-bold text-white shadow-lg hover:brightness-110 transition-all disabled:opacity-60"
              >
                {submittingPayout ? t.rewards.submittingWithdraw : t.rewards.submitWithdraw}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => openAuthModal()}
                className="px-6 py-2.5 min-h-[44px] rounded-full cd-accent-bg text-xs sm:text-sm font-bold text-white shadow-lg"
              >
                {t.auth.continueBtn}
              </button>
            )}
          </div>
        </form>

        {/* Live Payout History Feed */}
        <div className="xl:col-span-5 rounded-3xl bg-[var(--cd-surface)] border border-white/10 p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <h2 className="text-base font-bold text-white">
                  {t.rewards.liveFeedTitle}
                </h2>
              </div>
              <p className="text-xs text-[#A1A1AA] mt-0.5">
                {t.rewards.liveFeedSubtitle}
              </p>
            </div>
          </div>

          <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
            {liveFeed.map((item, idx) => {
              const itemTs = Date.parse(item.createdAt);
              const isJustNow = Number.isFinite(itemTs) && liveNowTick - itemTs < 18_000;
              return (
                <div
                  key={item.id}
                  className={`p-3 rounded-2xl border flex items-center justify-between gap-3 transition-all duration-300 ${
                    idx === 0 || isJustNow
                      ? 'bg-emerald-950/20 border-emerald-500/35'
                      : 'bg-[#0D0C10] border-white/10'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white">
                        {item.maskedUser}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[10px] font-semibold text-[#D4D4D8]">
                        {item.countryCode} • {item.methodLabel}
                      </span>
                      {isJustNow && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-[9px] font-extrabold text-emerald-300 uppercase">
                          LIVE
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#71717A] mt-0.5 tabular-nums">
                      {formatRelativeTime(item.createdAt, language, liveNowTick)}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-xs sm:text-sm font-extrabold text-emerald-300 tabular-nums">
                      {item.currency === 'IDR'
                        ? formatIdr(item.idrAmount)
                        : formatUsd(item.usdAmount)}
                    </p>
                    <span className="text-[10px] font-semibold text-emerald-400/90 uppercase">
                      {item.status === 'paid' ? t.rewards.statusPaid : t.rewards.statusApproved}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* User's Own Payout Requests & Points Ledger (when logged in) */}
      {user && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-3xl bg-[var(--cd-surface)] border border-white/10 p-5 sm:p-6 space-y-4">
            <h3 className="text-sm sm:text-base font-bold text-white">
              {t.rewards.historyPayoutsTitle}
            </h3>
            {!summary || summary.payouts.length === 0 ? (
              <p className="text-xs text-[#A1A1AA] py-6 text-center">
                {t.rewards.noPayouts}
              </p>
            ) : (
              <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                {summary.payouts.map((p) => (
                  <div
                    key={p.id}
                    className="p-3.5 rounded-2xl bg-[#0D0C10] border border-white/10 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-white uppercase">
                        {p.method.replace('_', ' ')} ·{' '}
                        {p.currency === 'IDR'
                          ? formatIdr(p.idrAmount)
                          : formatUsd(p.usdAmount)}
                      </span>
                      {renderStatusBadge(p.status)}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#A1A1AA]">
                      <span className="truncate max-w-[240px]">
                        {p.accountHolderName} · {p.destinationAccount}
                      </span>
                      <span className="tabular-nums">
                        -{p.pointsSpent.toLocaleString()} {t.rewards.pointsUnit} ·{' '}
                        {formatRelativeTime(p.createdAt, language)}
                      </span>
                    </div>
                    {p.adminNote && (
                      <p className="text-[11px] text-[#D4D4D8] bg-white/5 px-2.5 py-1.5 rounded-lg">
                        Note: {p.adminNote}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-3xl bg-[var(--cd-surface)] border border-white/10 p-5 sm:p-6 space-y-4">
            <h3 className="text-sm sm:text-base font-bold text-white">
              {t.rewards.historyLedgerTitle}
            </h3>
            {!summary || summary.ledger.length === 0 ? (
              <p className="text-xs text-[#A1A1AA] py-6 text-center">
                {t.rewards.noLedger}
              </p>
            ) : (
              <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                {summary.ledger.map((row) => {
                  const isEarn = row.type === 'earn';
                  return (
                    <div
                      key={row.id}
                      className="p-3 rounded-2xl bg-[#0D0C10] border border-white/10 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                            isEarn
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : 'bg-amber-500/15 text-amber-300'
                          }`}
                        >
                          {isEarn ? (
                            <ArrowDownLeft className="w-4 h-4" />
                          ) : (
                            <ArrowUpRight className="w-4 h-4" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-white truncate">
                            {row.description}
                          </p>
                          <p className="text-[11px] text-[#71717A] tabular-nums">
                            {formatRelativeTime(row.createdAt, language)}
                          </p>
                        </div>
                      </div>

                      <span
                        className={`text-xs font-extrabold tabular-nums shrink-0 ${
                          isEarn ? 'text-emerald-300' : 'text-amber-300'
                        }`}
                      >
                        {isEarn ? '+' : '-'}
                        {row.points.toLocaleString()} {t.rewards.pointsUnit}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
