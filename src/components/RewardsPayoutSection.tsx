import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  Calendar,
  CalendarCheck2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coins,
  Copy,
  Database,
  Flame,
  Gift,
  Globe2,
  Link2,
  Lock,
  Play,
  PlayCircle,
  RefreshCw,
  Search,
  Share2,
  Shield,
  ShieldCheck,
  Sparkles,
  Star,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useDramaContext } from '../context/DramaContext';
import { getProductionReferralUrl } from '../config/auth';
import { PaymentMethodLogo } from './PaymentMethodLogo';
import { RewardsSeoContent } from './RewardsSeoContent';

const GoldCoinIcon: React.FC<{ className?: string }> = ({ className = 'w-6 h-6' }) => (
  <svg viewBox="0 0 36 36" className={className} aria-hidden="true">
    <defs>
      <linearGradient id="kdCoinOuter" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#FDE047" />
        <stop offset="50%" stopColor="#F59E0B" />
        <stop offset="100%" stopColor="#B45309" />
      </linearGradient>
      <linearGradient id="kdCoinInner" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#FEF08A" />
        <stop offset="100%" stopColor="#D97706" />
      </linearGradient>
    </defs>
    <circle cx="18" cy="18" r="16" fill="url(#kdCoinOuter)" stroke="#FEF08A" strokeWidth="1.5" />
    <circle cx="18" cy="18" r="11.5" fill="url(#kdCoinInner)" stroke="#92400E" strokeOpacity="0.35" strokeWidth="1" />
    <path
      d="M12.5 22V14.5l3 2.5 2.5-3.5 2.5 3.5 3-2.5V22h-11Z"
      fill="#78350F"
      fillOpacity="0.82"
    />
  </svg>
);

const CoinStackArt: React.FC<{ level: 1 | 2 | 3 | 4 }> = ({ level }) => {
  if (level === 1) {
    return (
      <div className="relative w-9 h-9 flex items-center justify-center">
        <GoldCoinIcon className="w-7 h-7 drop-shadow-[0_4px_8px_rgba(245,158,11,0.35)]" />
      </div>
    );
  }
  if (level === 2) {
    return (
      <div className="relative w-9 h-9 flex items-center justify-center">
        <GoldCoinIcon className="w-6 h-6 -translate-x-1.5 translate-y-0.5 opacity-90" />
        <GoldCoinIcon className="w-6 h-6 translate-x-1.5 -translate-y-0.5 drop-shadow-[0_4px_8px_rgba(245,158,11,0.4)]" />
      </div>
    );
  }
  if (level === 3) {
    return (
      <div className="relative w-10 h-9 flex items-center justify-center">
        <GoldCoinIcon className="w-5 h-5 absolute left-0.5 bottom-0.5 opacity-85" />
        <GoldCoinIcon className="w-5 h-5 absolute right-0.5 bottom-0.5 opacity-95" />
        <GoldCoinIcon className="w-6 h-6 relative -translate-y-1 drop-shadow-[0_4px_8px_rgba(245,158,11,0.45)]" />
      </div>
    );
  }
  return (
    <div className="relative w-11 h-9 flex items-center justify-center">
      <GoldCoinIcon className="w-5 h-5 absolute left-0 bottom-0 opacity-85" />
      <GoldCoinIcon className="w-5 h-5 absolute right-0 bottom-0 opacity-90" />
      <GoldCoinIcon className="w-5 h-5 absolute left-2 top-0.5 opacity-95" />
      <GoldCoinIcon className="w-6 h-6 relative translate-y-0.5 drop-shadow-[0_4px_10px_rgba(250,204,21,0.55)]" />
      <span className="absolute -top-0.5 right-0.5 text-[10px] text-amber-200 leading-none">✦</span>
    </div>
  );
};

const GiftBoxHeroIllustration: React.FC = () => (
  <svg
    viewBox="0 0 180 140"
    className="w-32 h-24 sm:w-44 sm:h-32 shrink-0 select-none drop-shadow-[0_12px_28px_rgba(225,29,72,0.28)]"
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="kdBoxBody" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#F43F5E" />
        <stop offset="100%" stopColor="#9F1239" />
      </linearGradient>
      <linearGradient id="kdBoxLid" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#FB7185" />
        <stop offset="100%" stopColor="#E11D48" />
      </linearGradient>
      <linearGradient id="kdRibbon" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#FEF08A" />
        <stop offset="100%" stopColor="#D97706" />
      </linearGradient>
    </defs>

    {/* Floating Coins */}
    <g>
      <circle cx="32" cy="36" r="10" fill="url(#kdRibbon)" stroke="#FEF9C3" strokeWidth="1.2" />
      <circle cx="152" cy="40" r="8.5" fill="url(#kdRibbon)" stroke="#FEF9C3" strokeWidth="1" />
      <circle cx="144" cy="96" r="11" fill="url(#kdRibbon)" stroke="#FEF9C3" strokeWidth="1.2" />
      <circle cx="38" cy="88" r="7.5" fill="url(#kdRibbon)" stroke="#FEF9C3" strokeWidth="1" />
      <circle cx="90" cy="20" r="8" fill="url(#kdRibbon)" stroke="#FEF9C3" strokeWidth="1" />
    </g>

    {/* Sparkles */}
    <path d="M52 20l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z" fill="#FEF08A" opacity="0.9" />
    <path d="M132 18l1.5 3.5 3.5 1.5-3.5 1.5-1.5 3.5-1.5-3.5-3.5-1.5 3.5-1.5 1.5-3.5Z" fill="#FDE047" opacity="0.8" />
    <circle cx="24" cy="64" r="2" fill="#FDA4AF" opacity="0.8" />
    <circle cx="160" cy="68" r="2.2" fill="#FDE047" opacity="0.85" />

    {/* Gift Box Body */}
    <rect x="48" y="64" width="84" height="56" rx="10" fill="url(#kdBoxBody)" />
    <rect x="83" y="64" width="14" height="56" fill="url(#kdRibbon)" />
    <rect x="48" y="64" width="84" height="6" fill="#000000" fillOpacity="0.18" />

    {/* Tilted Open Gift Lid */}
    <g transform="rotate(-8 90 54)">
      <rect x="42" y="42" width="96" height="18" rx="6" fill="url(#kdBoxLid)" />
      <rect x="83" y="42" width="14" height="18" fill="url(#kdRibbon)" />
      {/* Ribbon Bow */}
      <path
        d="M90 42c-10-12-26-10-22 0 3 6 14 4 22 0Zm0 0c10-12 26-10 22 0-3 6-14 4-22 0Z"
        fill="url(#kdRibbon)"
        stroke="#FEF9C3"
        strokeWidth="1"
      />
    </g>
  </svg>
);

type PayoutMethod =
  | 'dana'
  | 'gopay'
  | 'ovo'
  | 'shopeepay'
  | 'linkaja'
  | 'bank_transfer'
  | 'paypal'
  | 'wise'
  | 'usdt_polygon'
  | 'usdt_trc20'
  | 'usdt_bep20'
  | 'usdt_erc20';

type PayoutStatus =
  | 'pending'
  | 'processing'
  | 'approved'
  | 'paid'
  | 'completed'
  | 'rejected'
  | 'failed';

interface IndonesianBankOption {
  code: string;
  label: string;
  shortName: string;
  minDigits: number;
  maxDigits: number;
}

interface UsdtNetworkOption {
  network: 'Polygon' | 'TRC20' | 'BEP20' | 'ERC20';
  method: PayoutMethod;
  label: string;
  addressHint: string;
}

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

interface DailyMissionMilestoneStatus extends DailyMissionMilestoneConfig {
  reached: boolean;
  claimed: boolean;
  claimedAt: string | null;
}

type AccountLevelTierId = 'bronze' | 'silver' | 'gold' | 'platinum';

interface AccountLevelTierSummary {
  level: number;
  tierId: AccountLevelTierId;
  tierName: string;
  minTotalEarned: number;
  minVerifiedWatchSeconds: number;
  multiplier: number;
  bonusPercent: number;
  watchMinutePoints: number;
  dailyCheckinPoints: number;
  watchEpisodePoints: number;
  dailyMissionMilestones: DailyMissionMilestoneConfig[];
}

interface AccountLevelNextTierInfo {
  level: number;
  tierId: AccountLevelTierId;
  tierName: string;
  multiplier: number;
  bonusPercent: number;
  minTotalEarned: number;
  minVerifiedWatchSeconds: number;
  remainingPoints: number;
  remainingWatchSeconds: number;
}

interface AccountLevelStatus {
  level: number;
  tierId: AccountLevelTierId;
  tierName: string;
  multiplier: number;
  bonusPercent: number;
  watchMinutePoints: number;
  dailyCheckinPoints: number;
  watchEpisodePoints: number;
  dailyMissionMilestones: DailyMissionMilestoneConfig[];
  totalEarned: number;
  verifiedWatchSeconds: number;
  nextTier: AccountLevelNextTierInfo | null;
  progressPct: number;
}

interface PayoutConfig {
  usdToIdrRate: number;
  pointsPerUsd: number;
  minPayoutIdr: number;
  minPayoutUsd: number;
  minPayoutPointsIdr: number;
  minPayoutPointsUsd: number;
  maxDailyEarnPoints: number;
  maxDailyWatchPoints?: number;
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
  levelTiers?: AccountLevelTierSummary[];
  methods: PayoutMethodDescriptor[];
  banks?: IndonesianBankOption[];
  usdtNetworks?: UsdtNetworkOption[];
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
  balanceAfter?: number | null;
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
  bankCode?: string;
  network?: string;
  destinationAccount: string;
  destinationMasked?: string;
  accountHolderName: string;
  status: PayoutStatus;
  adminNote: string;
  createdAt: string;
  updatedAt: string;
}

interface UserPointsSummary {
  timeZone?: string;
  resetPeriodKey?: string;
  nextResetAt?: string;
  balance: number;
  totalEarned: number;
  totalRedeemed: number;
  totalHeld?: number;
  totalWithdrawn?: number;
  todayEarned: number;
  maxDailyEarnPoints: number;
  todayWatchSeconds?: number;
  todayWatchPointsEarned?: number;
  dailyMissionMaxWatchSeconds?: number;
  verifiedWatchSeconds?: number;
  levelInfo?: AccountLevelStatus;
  estimatedUsd: number;
  estimatedIdr: number;
  lastClaimAt: string | null;
  cooldownSecondsRemaining: number;
  dailyCheckinClaimedToday: boolean;
  checkinStreak?: number;
  recentCheckins?: string[];
  milestones?: DailyMissionMilestoneStatus[];
  ledgerTotal?: number;
  payoutsTotal?: number;
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
  status: 'approved' | 'paid' | 'completed';
  createdAt: string;
  isReal: boolean;
}

const DEFAULT_BANKS: IndonesianBankOption[] = [
  { code: 'BCA', label: 'Bank Central Asia (BCA)', shortName: 'BCA', minDigits: 10, maxDigits: 10 },
  { code: 'BRI', label: 'Bank Rakyat Indonesia (BRI)', shortName: 'BRI', minDigits: 15, maxDigits: 15 },
  { code: 'BNI', label: 'Bank Negara Indonesia (BNI)', shortName: 'BNI', minDigits: 10, maxDigits: 10 },
  { code: 'MANDIRI', label: 'Bank Mandiri', shortName: 'Mandiri', minDigits: 13, maxDigits: 13 },
  { code: 'BSI', label: 'Bank Syariah Indonesia (BSI)', shortName: 'BSI', minDigits: 10, maxDigits: 10 },
  { code: 'CIMB', label: 'CIMB Niaga', shortName: 'CIMB Niaga', minDigits: 12, maxDigits: 13 },
  { code: 'JAGO', label: 'Bank Jago', shortName: 'Bank Jago', minDigits: 10, maxDigits: 12 },
  { code: 'SEABANK', label: 'SeaBank Indonesia', shortName: 'SeaBank', minDigits: 12, maxDigits: 12 },
  { code: 'PERMATA', label: 'PermataBank', shortName: 'Permata', minDigits: 10, maxDigits: 10 },
  { code: 'BTN', label: 'Bank Tabungan Negara (BTN)', shortName: 'BTN', minDigits: 16, maxDigits: 16 },
];

const DEFAULT_USDT_NETWORKS: UsdtNetworkOption[] = [
  { network: 'Polygon', method: 'usdt_polygon', label: 'USDT (Polygon)', addressHint: '0x...' },
  { network: 'TRC20', method: 'usdt_trc20', label: 'USDT (TRC20)', addressHint: 'T...' },
  { network: 'BEP20', method: 'usdt_bep20', label: 'USDT (BEP20)', addressHint: '0x...' },
  { network: 'ERC20', method: 'usdt_erc20', label: 'USDT (ERC20)', addressHint: '0x...' },
];

const DEFAULT_CONFIG: PayoutConfig = {
  usdToIdrRate: 18200,
  pointsPerUsd: 100000,
  minPayoutIdr: 50000,
  minPayoutUsd: 5,
  minPayoutPointsIdr: 274726,
  minPayoutPointsUsd: 500000,
  maxDailyEarnPoints: 25000,
  maxDailyWatchPoints: 10000,
  claimCooldownSeconds: 45,
  dailyCheckinPoints: 500,
  watchEpisodePoints: 200,
  watchMinutePoints: 20,
  dailyMissionMaxWatchSeconds: 3600,
  dailyMissionMilestones: [
    { minutes: 15, bonusPoints: 500 },
    { minutes: 30, bonusPoints: 1200 },
    { minutes: 60, bonusPoints: 2800 },
  ],
  referralQualifySeconds: 3600,
  referralBonusPoints: 5000,
  maxDailyReferrals: 5,
  maxWeeklyReferrals: 15,
  maxDailyVerifiedWatchSeconds: 28800,
  levelTiers: [
    {
      level: 1,
      tierId: 'bronze',
      tierName: 'Bronze',
      minTotalEarned: 0,
      minVerifiedWatchSeconds: 0,
      multiplier: 1.0,
      bonusPercent: 0,
      watchMinutePoints: 20,
      dailyCheckinPoints: 500,
      watchEpisodePoints: 200,
      dailyMissionMilestones: [
        { minutes: 15, bonusPoints: 500 },
        { minutes: 30, bonusPoints: 1200 },
        { minutes: 60, bonusPoints: 2800 },
      ],
    },
    {
      level: 2,
      tierId: 'silver',
      tierName: 'Silver',
      minTotalEarned: 20000,
      minVerifiedWatchSeconds: 7200,
      multiplier: 1.2,
      bonusPercent: 20,
      watchMinutePoints: 24,
      dailyCheckinPoints: 600,
      watchEpisodePoints: 240,
      dailyMissionMilestones: [
        { minutes: 15, bonusPoints: 600 },
        { minutes: 30, bonusPoints: 1440 },
        { minutes: 60, bonusPoints: 3360 },
      ],
    },
    {
      level: 3,
      tierId: 'gold',
      tierName: 'Gold',
      minTotalEarned: 100000,
      minVerifiedWatchSeconds: 36000,
      multiplier: 1.4,
      bonusPercent: 40,
      watchMinutePoints: 28,
      dailyCheckinPoints: 700,
      watchEpisodePoints: 280,
      dailyMissionMilestones: [
        { minutes: 15, bonusPoints: 700 },
        { minutes: 30, bonusPoints: 1680 },
        { minutes: 60, bonusPoints: 3920 },
      ],
    },
    {
      level: 4,
      tierId: 'platinum',
      tierName: 'Platinum',
      minTotalEarned: 300000,
      minVerifiedWatchSeconds: 108000,
      multiplier: 1.6,
      bonusPercent: 60,
      watchMinutePoints: 32,
      dailyCheckinPoints: 800,
      watchEpisodePoints: 320,
      dailyMissionMilestones: [
        { minutes: 15, bonusPoints: 800 },
        { minutes: 30, bonusPoints: 1920 },
        { minutes: 60, bonusPoints: 4480 },
      ],
    },
  ],
  methods: [
    { id: 'dana', label: 'DANA', currency: 'IDR', countryCode: 'ID', minPoints: 274726, category: 'ewallet_idr' },
    { id: 'gopay', label: 'GoPay', currency: 'IDR', countryCode: 'ID', minPoints: 274726, category: 'ewallet_idr' },
    { id: 'ovo', label: 'OVO', currency: 'IDR', countryCode: 'ID', minPoints: 274726, category: 'ewallet_idr' },
    { id: 'shopeepay', label: 'ShopeePay', currency: 'IDR', countryCode: 'ID', minPoints: 274726, category: 'ewallet_idr' },
    { id: 'linkaja', label: 'LinkAja', currency: 'IDR', countryCode: 'ID', minPoints: 274726, category: 'ewallet_idr' },
    { id: 'bank_transfer', label: 'Transfer Bank (IDR)', currency: 'IDR', countryCode: 'ID', minPoints: 274726, category: 'bank_idr' },
    { id: 'paypal', label: 'PayPal', currency: 'USD', countryCode: 'US', minPoints: 500000, category: 'global_usd' },
    { id: 'wise', label: 'Wise', currency: 'USD', countryCode: 'MY', minPoints: 500000, category: 'global_usd' },
    { id: 'usdt_polygon', label: 'USDT (Polygon)', currency: 'USD', countryCode: 'SG', minPoints: 500000, category: 'crypto_usd' },
    { id: 'usdt_trc20', label: 'USDT (TRC20)', currency: 'USD', countryCode: 'PH', minPoints: 500000, category: 'crypto_usd' },
    { id: 'usdt_bep20', label: 'USDT (BEP20)', currency: 'USD', countryCode: 'SG', minPoints: 500000, category: 'crypto_usd' },
    { id: 'usdt_erc20', label: 'USDT (ERC20)', currency: 'USD', countryCode: 'SG', minPoints: 500000, category: 'crypto_usd' },
  ],
  banks: DEFAULT_BANKS,
  usdtNetworks: DEFAULT_USDT_NETWORKS,
};

function formatIdr(amount: number): string {
  return `Rp ${Math.max(0, Math.round(amount)).toLocaleString('id-ID')}`;
}

function formatUsd(amount: number): string {
  return `$${Math.max(0, amount).toFixed(2)}`;
}

function formatRelativeTime(iso: string, lang: string, nowMs: number): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return '';
  const diffSec = Math.max(0, Math.floor((nowMs - ts) / 1000));
  const isId = lang === 'id';
  if (diffSec < 15) return isId ? 'baru saja' : 'just now';
  if (diffSec < 60) return isId ? `${diffSec} dtk lalu` : `${diffSec}s ago`;
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return isId ? `${mins} mnt lalu` : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return isId ? `${hrs} jam lalu` : `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return isId ? `${days} hr lalu` : `${days}d ago`;
}

// Isolated 30s relative time ticker to prevent full-dashboard 1s re-renders
const RelativeTimeText: React.FC<{ iso: string; lang: string }> = React.memo(
  ({ iso, lang }) => {
    const [nowMs, setNowMs] = useState(() => Date.now());
    useEffect(() => {
      const id = window.setInterval(() => {
        if (!document.hidden) setNowMs(Date.now());
      }, 30_000);
      return () => window.clearInterval(id);
    }, []);
    return <>{formatRelativeTime(iso, lang, nowMs)}</>;
  }
);
RelativeTimeText.displayName = 'RelativeTimeText';

// Isolated canonical reset countdown widget (single 00:00 WIB / 17:00 UTC server cycle, displayed in WIB for ID or UTC for other languages)
const ResetCountdown: React.FC<{ lang: string; nextResetAt?: string | null }> = React.memo(
  ({ lang, nextResetAt }) => {
    const [label, setLabel] = useState('');
    const isWib = lang === 'id';

    useEffect(() => {
      const parsedNextResetMs = nextResetAt ? Date.parse(nextResetAt) : NaN;
      const update = () => {
        const now = Date.now();
        let targetResetMs = parsedNextResetMs;
        if (!Number.isFinite(targetResetMs) || targetResetMs <= now) {
          // Canonical server reset: 00:00 WIB (Asia/Jakarta, UTC+7) === 17:00 UTC
          const wibOffsetMs = 7 * 3600 * 1000;
          const wibMs = now + wibOffsetMs;
          const elapsedWibDay = wibMs % (24 * 3600 * 1000);
          targetResetMs = now + (24 * 3600 * 1000 - elapsedWibDay);
        }
        const remSec = Math.max(0, Math.floor((targetResetMs - now) / 1000));
        const h = Math.floor(remSec / 3600);
        const m = Math.floor((remSec % 3600) / 60);
        const s = remSec % 60;
        setLabel(
          `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
        );
      };
      update();
      const id = window.setInterval(() => {
        if (!document.hidden) update();
      }, 1000);
      return () => window.clearInterval(id);
    }, [nextResetAt]);

    return (
      <span className="tabular-nums font-mono text-[11px] text-[#A1A1AA]">
        {isWib ? `Reset 00:00 WIB (${label})` : `Resets 17:00 UTC (${label})`}
      </span>
    );
  }
);
ResetCountdown.displayName = 'ResetCountdown';

function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `wd-${crypto.randomUUID()}`;
  }
  return `wd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function getMethodDisplayLabel(method: PayoutMethod, bankCode?: string, network?: string): string {
  if (method === 'bank_transfer') {
    return bankCode ? `Bank ${bankCode}` : 'Transfer Bank';
  }
  if (method.startsWith('usdt_')) {
    const net =
      network ||
      method.replace('usdt_', '').toUpperCase();
    return `USDT (${net})`;
  }
  const map: Record<string, string> = {
    dana: 'DANA',
    gopay: 'GoPay',
    ovo: 'OVO',
    shopeepay: 'ShopeePay',
    linkaja: 'LinkAja',
    paypal: 'PayPal',
    wise: 'Wise',
  };
  return map[method] || method.toUpperCase();
}

function validateClientDestination(
  method: PayoutMethod,
  rawDest: string,
  bankCode: string,
  banks: IndonesianBankOption[],
  lang: string
): { valid: boolean; error?: string; hint: string } {
  const isId = lang === 'id';
  const clean = rawDest.trim();

  if (
    method === 'dana' ||
    method === 'gopay' ||
    method === 'ovo' ||
    method === 'shopeepay' ||
    method === 'linkaja'
  ) {
    const hint = isId ? 'Nomor HP 08xxxxxxxxxx (10-14 digit)' : 'Mobile number 08xxxxxxxxxx (10-14 digits)';
    if (!clean) return { valid: false, hint };
    const digits = clean.replace(/[\s\-+]/g, '');
    if (!/^(08|628)\d{8,12}$/.test(digits)) {
      return {
        valid: false,
        hint,
        error: isId
          ? 'Masukkan nomor HP Indonesia yang valid (contoh: 081234567890).'
          : 'Enter a valid Indonesian mobile number (e.g. 081234567890).',
      };
    }
    return { valid: true, hint };
  }

  if (method === 'bank_transfer') {
    const bank = banks.find((b) => b.code === bankCode) || banks[0];
    const hint = bank
      ? isId
        ? `No. Rekening ${bank.shortName} (${bank.minDigits === bank.maxDigits ? `${bank.minDigits}` : `${bank.minDigits}-${bank.maxDigits}`} digit)`
        : `${bank.shortName} account no. (${bank.minDigits}-${bank.maxDigits} digits)`
      : isId
      ? 'Nomor rekening bank'
      : 'Bank account number';
    if (!clean) return { valid: false, hint };
    const digits = clean.replace(/[\s\-]/g, '');
    if (bank && (!/^\d+$/.test(digits) || digits.length < bank.minDigits || digits.length > bank.maxDigits)) {
      return {
        valid: false,
        hint,
        error: isId
          ? `Nomor rekening ${bank.shortName} harus ${bank.minDigits === bank.maxDigits ? `${bank.minDigits}` : `${bank.minDigits}-${bank.maxDigits}`} digit angka.`
          : `${bank.shortName} account number must be ${bank.minDigits}-${bank.maxDigits} digits.`,
      };
    }
    return { valid: true, hint };
  }

  if (method === 'paypal') {
    const hint = isId ? 'Email akun PayPal (contoh: nama@gmail.com)' : 'PayPal email (e.g. name@gmail.com)';
    if (!clean) return { valid: false, hint };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean)) {
      return {
        valid: false,
        hint,
        error: isId ? 'Format email PayPal tidak valid.' : 'Invalid PayPal email address.',
      };
    }
    return { valid: true, hint };
  }

  if (method === 'wise') {
    const hint = isId ? 'Email Wise atau @wisetag' : 'Wise email or @wisetag';
    if (!clean) return { valid: false, hint };
    if (clean.length < 4) {
      return {
        valid: false,
        hint,
        error: isId ? 'Masukkan email atau @wisetag yang valid.' : 'Enter a valid Wise email or @wisetag.',
      };
    }
    return { valid: true, hint };
  }

  if (method === 'usdt_trc20') {
    const hint = 'Alamat wallet TRON TRC20 (diawali T..., 34 karakter)';
    if (!clean) return { valid: false, hint };
    if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(clean)) {
      return {
        valid: false,
        hint,
        error: isId
          ? 'Alamat USDT TRC20 harus diawali huruf T dan berjumlah 34 karakter.'
          : 'USDT TRC20 address must start with T and be 34 characters.',
      };
    }
    return { valid: true, hint };
  }

  // Polygon / BEP20 / ERC20 EVM 0x address
  const netName = method.replace('usdt_', '').toUpperCase();
  const hint = `Alamat wallet ${netName} (0x..., 42 karakter)`;
  if (!clean) return { valid: false, hint };
  if (!/^0x[a-fA-F0-9]{40}$/.test(clean)) {
    return {
      valid: false,
      hint,
      error: isId
        ? `Alamat wallet USDT ${netName} harus diawali 0x (42 karakter heksadesimal).`
        : `USDT ${netName} wallet must be a valid 42-char 0x address.`,
    };
  }
  return { valid: true, hint };
}

export const RewardsPayoutSection: React.FC = () => {
  const {
    t,
    language,
    user,
    pointsDbConnected,
    pointsDbError,
    openAuthModal,
    getAuthHeaders,
    refreshPointsBalance,
    pushToast,
  } = useDramaContext();

  const isId = language === 'id';

  const [config, setConfig] = useState<PayoutConfig>(DEFAULT_CONFIG);
  const [dbAvailable, setDbAvailable] = useState<boolean>(pointsDbConnected !== false);
  const [dbErrorMsg, setDbErrorMsg] = useState<string | null>(pointsDbError);

  const [summary, setSummary] = useState<UserPointsSummary | null>(null);
  const [referralSummary, setReferralSummary] = useState<UserReferralSummary | null>(null);
  const [liveFeed, setLiveFeed] = useState<LivePayoutFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [claimingCheckin, setClaimingCheckin] = useState(false);
  const [claimingMilestoneMinutes, setClaimingMilestoneMinutes] = useState<number | null>(null);

  // Ledger & Payout History pagination states
  const [ledgerRows, setLedgerRows] = useState<PointsLedgerItem[]>([]);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [ledgerPage, setLedgerPage] = useState(0);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const [payoutRows, setPayoutRows] = useState<PayoutRequestItem[]>([]);
  const [payoutTotal, setPayoutTotal] = useState(0);
  const [payoutPage, setPayoutPage] = useState(0);
  const [payoutLoading, setPayoutLoading] = useState(false);

  // Referral Copy / Share / Manual Bind
  const [copiedRef, setCopiedRef] = useState(false);
  const [bindCodeInput, setBindCodeInput] = useState('');
  const [bindingRef, setBindingRef] = useState(false);
  const [bindFeedback, setBindFeedback] = useState<{
    type: 'error' | 'success';
    message: string;
  } | null>(null);

  // Withdrawal Form State
  const [currencyTab, setCurrencyTab] = useState<'IDR' | 'USD'>(() =>
    language === 'id' ? 'IDR' : 'USD'
  );
  const [selectedMethod, setSelectedMethod] = useState<PayoutMethod>(() =>
    language === 'id' ? 'dana' : 'paypal'
  );
  const [selectedBankCode, setSelectedBankCode] = useState<string>('BCA');
  const [bankDropdownOpen, setBankDropdownOpen] = useState(false);
  const [bankSearchQuery, setBankSearchQuery] = useState('');
  const bankDropdownRef = useRef<HTMLDivElement | null>(null);
  const [selectedUsdtMethod, setSelectedUsdtMethod] =
    useState<PayoutMethod>('usdt_polygon');
  const [pointsInput, setPointsInput] = useState<string>(() =>
    language === 'id' ? '274726' : '500000'
  );
  const [destinationInput, setDestinationInput] = useState<string>('');
  const [holderNameInput, setHolderNameInput] = useState<string>(user?.displayName || '');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const pendingIdempotencyRef = useRef<string>(generateIdempotencyKey());
  const [submittingPayout, setSubmittingPayout] = useState(false);
  const [formFeedback, setFormFeedback] = useState<{
    type: 'error' | 'success';
    message: string;
  } | null>(null);

  const LEDGER_PAGE_SIZE = 12;
  const PAYOUT_PAGE_SIZE = 8;

  const banks = useMemo(() => config.banks || DEFAULT_BANKS, [config.banks]);
  const selectedBankObj = useMemo(
    () => banks.find((b) => b.code === selectedBankCode) || banks[0],
    [banks, selectedBankCode]
  );
  const filteredBanks = useMemo(() => {
    const q = bankSearchQuery.trim().toLowerCase();
    if (!q) return banks;
    return banks.filter(
      (b) =>
        b.label.toLowerCase().includes(q) ||
        b.shortName.toLowerCase().includes(q) ||
        b.code.toLowerCase().includes(q)
    );
  }, [banks, bankSearchQuery]);

  useEffect(() => {
    if (!bankDropdownOpen) return;
    const onOutsideClick = (e: MouseEvent) => {
      if (
        bankDropdownRef.current &&
        !bankDropdownRef.current.contains(e.target as Node)
      ) {
        setBankDropdownOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBankDropdownOpen(false);
    };
    document.addEventListener('mousedown', onOutsideClick);
    window.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onOutsideClick);
      window.removeEventListener('keydown', onEsc);
    };
  }, [bankDropdownOpen]);

  const [showLevelTiers, setShowLevelTiers] = useState(false);

  const usdtNetworks = useMemo(
    () => config.usdtNetworks || DEFAULT_USDT_NETWORKS,
    [config.usdtNetworks]
  );

  const loadLiveFeed = useCallback(async () => {
    try {
      const res = await fetch('/api/payouts/live?limit=12', { cache: 'no-store' });
      if (res.status === 503) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setDbAvailable(false);
        setDbErrorMsg(
          d.error ||
            'Database PostgreSQL belum terhubung (DATABASE_URL belum dikonfigurasi).'
        );
        return;
      }
      if (!res.ok) return;
      const data = (await res.json()) as { ok?: boolean; items?: LivePayoutFeedItem[] };
      if (data.ok && Array.isArray(data.items)) {
        setLiveFeed(data.items);
      }
    } catch {
      // Transient fetch failure
    }
  }, []);

  const loadLedgerPage = useCallback(
    async (pageIdx: number) => {
      if (!user) return;
      setLedgerLoading(true);
      try {
        const res = await fetch(
          `/api/points/ledger?limit=${LEDGER_PAGE_SIZE}&offset=${pageIdx * LEDGER_PAGE_SIZE}`,
          {
            credentials: 'include',
            headers: getAuthHeaders(),
            cache: 'no-store',
          }
        );
        if (res.ok) {
          const data = (await res.json()) as {
            ok?: boolean;
            items?: PointsLedgerItem[];
            total?: number;
          };
          if (data.ok && Array.isArray(data.items)) {
            setLedgerRows(data.items);
            setLedgerTotal(Number(data.total ?? data.items.length));
          }
        }
      } finally {
        setLedgerLoading(false);
      }
    },
    [user, getAuthHeaders]
  );

  const loadPayoutsPage = useCallback(
    async (pageIdx: number) => {
      if (!user) return;
      setPayoutLoading(true);
      try {
        const res = await fetch(
          `/api/points/payouts?limit=${PAYOUT_PAGE_SIZE}&offset=${pageIdx * PAYOUT_PAGE_SIZE}`,
          {
            credentials: 'include',
            headers: getAuthHeaders(),
            cache: 'no-store',
          }
        );
        if (res.ok) {
          const data = (await res.json()) as {
            ok?: boolean;
            items?: PayoutRequestItem[];
            total?: number;
          };
          if (data.ok && Array.isArray(data.items)) {
            setPayoutRows(data.items);
            setPayoutTotal(Number(data.total ?? data.items.length));
          }
        }
      } finally {
        setPayoutLoading(false);
      }
    },
    [user, getAuthHeaders]
  );

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
          }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }))
        : Promise.resolve(null);

      const refPromise = user
        ? fetch('/api/referrals/me', {
            credentials: 'include',
            headers: getAuthHeaders(),
            cache: 'no-store',
          }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }))
        : Promise.resolve(null);

      const [cfgRes, meRes, refRes] = await Promise.all([
        cfgPromise,
        mePromise,
        refPromise,
        loadLiveFeed(),
      ]);

      if (cfgRes?.ok && cfgRes.config) {
        setConfig({
          ...(cfgRes.config as PayoutConfig),
          banks: cfgRes.banks || (cfgRes.config as PayoutConfig).banks,
          usdtNetworks: cfgRes.usdtNetworks || (cfgRes.config as PayoutConfig).usdtNetworks,
        });
        if (typeof cfgRes.dbConnected === 'boolean') {
          setDbAvailable(cfgRes.dbConnected);
          if (!cfgRes.dbConnected) {
            setDbErrorMsg(
              isId
                ? 'Database PostgreSQL belum terhubung (DATABASE_URL belum diset). Data poin & penarikan hanya dapat disimpan setelah PostgreSQL aktif.'
                : 'PostgreSQL database is not connected (DATABASE_URL missing). Points & payouts require an active database.'
            );
          } else {
            setDbErrorMsg(null);
          }
        }
      }

      if (meRes) {
        if (meRes.status === 503) {
          setDbAvailable(false);
          setDbErrorMsg(
            meRes.body?.error ||
              'Database PostgreSQL belum terhubung (DATABASE_URL).'
          );
          setSummary(null);
        } else if (meRes.body?.ok && meRes.body.summary) {
          const s = meRes.body.summary as UserPointsSummary;
          setDbAvailable(true);
          setDbErrorMsg(null);
          setSummary(s);
          setLedgerRows(s.ledger || []);
          setLedgerTotal(Number(s.ledgerTotal ?? (s.ledger || []).length));
          setLedgerPage(0);
          setPayoutRows(s.payouts || []);
          setPayoutTotal(Number(s.payoutsTotal ?? (s.payouts || []).length));
          setPayoutPage(0);
          if (meRes.body.config) setConfig(meRes.body.config as PayoutConfig);
        }
      } else if (!user) {
        setSummary(null);
        setLedgerRows([]);
        setPayoutRows([]);
      }

      if (refRes && refRes.body?.ok && refRes.body.referralSummary) {
        setReferralSummary(refRes.body.referralSummary as UserReferralSummary);
      } else if (!user) {
        setReferralSummary(null);
      }
    } finally {
      setLoading(false);
    }
  }, [user, getAuthHeaders, loadLiveFeed, isId]);

  useEffect(() => {
    void loadPointsData();
  }, [loadPointsData]);

  // Background polling for real live feed — pauses automatically when tab is hidden
  useEffect(() => {
    const feedTimer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void loadLiveFeed();
    }, 15_000);
    return () => window.clearInterval(feedTimer);
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
          awardedWatchPoints?: number;
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
      if (
        detail?.referralQualified ||
        detail?.referralBound ||
        (typeof detail?.awardedWatchPoints === 'number' &&
          detail.awardedWatchPoints > 0)
      ) {
        void loadPointsData();
      }
    };
    window.addEventListener('kd:points-updated', onPointsUpdated);
    return () => window.removeEventListener('kd:points-updated', onPointsUpdated);
  }, [loadPointsData]);

  // Cooldown countdown tick only when active
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

  const effectiveMethod: PayoutMethod = useMemo(() => {
    if (currencyTab === 'USD' && selectedMethod.startsWith('usdt_')) {
      return selectedUsdtMethod;
    }
    return selectedMethod;
  }, [currencyTab, selectedMethod, selectedUsdtMethod]);

  const idrEwallets = useMemo(
    () => config.methods.filter((m) => m.category === 'ewallet_idr'),
    [config.methods]
  );
  const idrBankMethod = useMemo(
    () => config.methods.find((m) => m.id === 'bank_transfer'),
    [config.methods]
  );
  const usdGlobalMethods = useMemo(
    () =>
      config.methods.filter(
        (m) => m.currency === 'USD' && !m.id.startsWith('usdt_')
      ),
    [config.methods]
  );
  const usdtMethodBase = useMemo(
    () =>
      config.methods.find((m) => m.id === effectiveMethod) ||
      config.methods.find((m) => m.id === 'usdt_polygon'),
    [config.methods, effectiveMethod]
  );

  useEffect(() => {
    const allowedInTab = config.methods.some(
      (m) => m.id === effectiveMethod && m.currency === currencyTab
    );
    if (!allowedInTab) {
      const first = config.methods.find((m) => m.currency === currencyTab);
      if (first) {
        setSelectedMethod(first.id);
        setPointsInput(String(first.minPoints));
      }
    }
  }, [currencyTab, config.methods, effectiveMethod]);

  const activeMethodObj = useMemo(
    () =>
      config.methods.find((m) => m.id === effectiveMethod) ||
      usdtMethodBase ||
      DEFAULT_CONFIG.methods[0],
    [config.methods, effectiveMethod, usdtMethodBase]
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

  const destinationCheck = useMemo(
    () =>
      validateClientDestination(
        effectiveMethod,
        destinationInput,
        selectedBankCode,
        banks,
        language
      ),
    [effectiveMethod, destinationInput, selectedBankCode, banks, language]
  );

  const activeNetworkLabel = useMemo(() => {
    if (!effectiveMethod.startsWith('usdt_')) return undefined;
    return (
      usdtNetworks.find((n) => n.method === effectiveMethod)?.network ||
      'Polygon'
    );
  }, [effectiveMethod, usdtNetworks]);

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
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        awardedPoints?: number;
        streakBonus?: number;
        error?: string;
        summary?: UserPointsSummary;
      };
      if (res.status === 503) {
        setDbAvailable(false);
        setDbErrorMsg(data.error || 'Database PostgreSQL belum terhubung.');
        return;
      }
      if (data.summary) {
        setSummary(data.summary);
        setLedgerRows(data.summary.ledger || []);
        setLedgerTotal(Number(data.summary.ledgerTotal ?? (data.summary.ledger || []).length));
      }
      if (res.ok && data.ok) {
        const bonusNote =
          data.streakBonus && data.streakBonus > 0
            ? ` (termasuk bonus streak +${data.streakBonus})`
            : '';
        pushToast(
          `+${data.awardedPoints || effectiveDailyCheckinPoints} ${t.rewards.pointsUnit}${bonusNote}!`,
          'gold'
        );
        void refreshPointsBalance();
      } else {
        setFormFeedback({
          type: 'error',
          message: data.error || 'Unable to claim daily check-in',
        });
      }
    } catch {
      setFormFeedback({
        type: 'error',
        message: isId
          ? 'Gagal terhubung ke server saat check-in.'
          : 'Network error while claiming points',
      });
    } finally {
      setClaimingCheckin(false);
    }
  };

  const handleClaimMilestone = async (milestoneMinutes: number) => {
    if (!user) {
      openAuthModal();
      return;
    }
    if (claimingMilestoneMinutes !== null) return;
    setClaimingMilestoneMinutes(milestoneMinutes);
    setFormFeedback(null);
    try {
      const res = await fetch('/api/points/claim', {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          action: 'watch_milestone',
          milestoneMinutes,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        awardedPoints?: number;
        error?: string;
        summary?: UserPointsSummary;
      };
      if (res.status === 503) {
        setDbAvailable(false);
        setDbErrorMsg(data.error || 'Database PostgreSQL belum terhubung.');
        return;
      }
      if (data.summary) {
        setSummary(data.summary);
        setLedgerRows(data.summary.ledger || []);
        setLedgerTotal(Number(data.summary.ledgerTotal ?? (data.summary.ledger || []).length));
      }
      if (res.ok && data.ok) {
        const awarded = Number(data.awardedPoints) || 0;
        pushToast(
          `+${awarded.toLocaleString()} ${t.rewards.pointsUnit} (${milestoneMinutes} ${t.rewards.milestoneMinSuffix})!`,
          'gold'
        );
        void refreshPointsBalance();
      } else {
        setFormFeedback({
          type: 'error',
          message:
            data.error ||
            (isId ? 'Gagal mengklaim bonus milestone.' : 'Unable to claim milestone bonus'),
        });
      }
    } catch {
      setFormFeedback({
        type: 'error',
        message: isId
          ? 'Gagal terhubung ke server saat klaim milestone.'
          : 'Network error while claiming milestone bonus',
      });
    } finally {
      setClaimingMilestoneMinutes(null);
    }
  };

  const handleRequestWithdrawConfirmation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      openAuthModal();
      return;
    }
    setFormFeedback(null);

    if (!dbAvailable) {
      setFormFeedback({
        type: 'error',
        message:
          dbErrorMsg ||
          'Database PostgreSQL belum terhubung sehingga penarikan belum dapat diproses.',
      });
      return;
    }

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
        message: isId ? 'Saldo poin aktif tidak mencukupi.' : 'Insufficient active points balance.',
      });
      return;
    }

    if (!destinationCheck.valid) {
      setFormFeedback({
        type: 'error',
        message: destinationCheck.error || destinationCheck.hint,
      });
      return;
    }

    if (holderNameInput.trim().length < 2) {
      setFormFeedback({
        type: 'error',
        message: isId
          ? 'Masukkan nama lengkap pemilik rekening/akun tujuan.'
          : 'Enter the account holder full name (min 2 chars).',
      });
      return;
    }

    // Generate a fresh idempotencyKey per confirmation modal intent
    pendingIdempotencyRef.current = generateIdempotencyKey();
    setConfirmOpen(true);
  };

  const handleConfirmWithdraw = async () => {
    if (!user || submittingPayout) return;
    setSubmittingPayout(true);
    setFormFeedback(null);
    try {
      const res = await fetch('/api/points/redeem', {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          method: effectiveMethod,
          bankCode: effectiveMethod === 'bank_transfer' ? selectedBankCode : undefined,
          network: activeNetworkLabel,
          pointsSpent: parsedPoints,
          destinationAccount: destinationInput.trim(),
          accountHolderName: holderNameInput.trim(),
          idempotencyKey: pendingIdempotencyRef.current,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        summary?: UserPointsSummary;
      };
      if (res.status === 503) {
        setDbAvailable(false);
        setDbErrorMsg(data.error || 'Database PostgreSQL belum terhubung.');
        setConfirmOpen(false);
        return;
      }
      if (data.summary) {
        setSummary(data.summary);
        setLedgerRows(data.summary.ledger || []);
        setLedgerTotal(Number(data.summary.ledgerTotal ?? (data.summary.ledger || []).length));
        setPayoutRows(data.summary.payouts || []);
        setPayoutTotal(Number(data.summary.payoutsTotal ?? (data.summary.payouts || []).length));
      }

      if (res.ok && data.ok) {
        setConfirmOpen(false);
        setDestinationInput('');
        setFormFeedback({ type: 'success', message: t.rewards.withdrawSuccess });
        pushToast(t.rewards.withdrawSuccess, 'gold');
        void refreshPointsBalance();
        void loadLiveFeed();
      } else {
        setConfirmOpen(false);
        setFormFeedback({
          type: 'error',
          message: data.error || 'Failed to submit withdrawal request',
        });
      }
    } catch {
      setConfirmOpen(false);
      setFormFeedback({
        type: 'error',
        message: isId
          ? 'Gangguan jaringan saat mengirim pengajuan penarikan.'
          : 'Network error while submitting request',
      });
    } finally {
      setSubmittingPayout(false);
    }
  };

  const referralShareUrl = useMemo(() => {
    if (!referralSummary?.referralCode) return '';
    return getProductionReferralUrl(referralSummary.referralCode);
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

  const handleShareReferralLink = async () => {
    if (!referralShareUrl) return;
    const shareTitle = isId
      ? 'Nonton Drama Dapat Saldo di KanoDrama'
      : 'Earn Points Watching Dramas on KanoDrama';
    const shareText = isId
      ? `Yuk gabung KanoDrama pakai link referral saya & tonton 1 jam untuk bonus +${config.referralBonusPoints.toLocaleString()} poin!`
      : `Join KanoDrama with my referral link & watch 1h to unlock +${config.referralBonusPoints.toLocaleString()} pts!`;

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: referralShareUrl,
        });
        return;
      } catch {
        // User cancelled or Web Share unavailable; fall through to copy
      }
    }
    await handleCopyReferralLink();
  };

  const handleBindReferralCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !bindCodeInput.trim()) return;
    setBindingRef(true);
    setBindFeedback(null);
    try {
      const res = await fetch('/api/referrals/bind', {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ referralCode: bindCodeInput.trim().toUpperCase() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        bound?: boolean;
        reason?: string;
        error?: string;
      };
      if (res.status === 503) {
        setDbAvailable(false);
        setBindFeedback({
          type: 'error',
          message: data.error || 'Database PostgreSQL belum terhubung.',
        });
        return;
      }
      if (data.bound) {
        setBindCodeInput('');
        setBindFeedback({
          type: 'success',
          message: isId
            ? 'Kode referral berhasil terhubung! Tonton aktif 60 menit untuk mengaktifkan bonus.'
            : 'Referral code linked! Watch 60 active minutes to qualify the bonus.',
        });
        void loadPointsData();
      } else {
        const reasonMap: Record<string, string> = {
          self_referral: isId
            ? 'Tidak dapat menggunakan kode referral milik sendiri.'
            : 'Self-referral is not allowed.',
          invalid_code: isId
            ? 'Kode referral tidak ditemukan.'
            : 'Referral code not found.',
          already_referred: isId
            ? 'Akun ini sudah terhubung dengan pengundang.'
            : 'Your account already has a referrer.',
          same_email: isId
            ? 'Email pengundang dan penerima tidak boleh sama.'
            : 'Cannot bind referral between matching emails.',
          duplicate_device: isId
            ? 'Perangkat yang sama terdeteksi pada akun pengundang.'
            : 'Shared device detected with referrer account.',
          daily_limit: isId
            ? 'Batas harian undangan kode ini tercapai.'
            : 'Referrer daily invite limit reached.',
          weekly_limit: isId
            ? 'Batas mingguan undangan kode ini tercapai.'
            : 'Referrer weekly invite limit reached.',
        };
        setBindFeedback({
          type: 'error',
          message:
            (data.reason && reasonMap[data.reason]) ||
            data.error ||
            (isId ? 'Kode referral tidak dapat dikaitkan.' : 'Unable to bind referral code.'),
        });
      }
    } catch {
      setBindFeedback({
        type: 'error',
        message: isId ? 'Gagal menghubungi server.' : 'Network error.',
      });
    } finally {
      setBindingRef(false);
    }
  };

  const renderPayoutStatusBadge = (status: PayoutStatus) => {
    switch (status) {
      case 'paid':
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-[11px] font-bold text-emerald-300">
            <CheckCircle2 className="w-3 h-3" />
            {status === 'completed'
              ? isId
                ? 'Selesai'
                : 'Completed'
              : t.rewards.statusPaid}
          </span>
        );
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-500/15 border border-sky-500/30 text-[11px] font-bold text-sky-300">
            <ShieldCheck className="w-3 h-3" />
            {t.rewards.statusApproved}
          </span>
        );
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-500/15 border border-indigo-500/30 text-[11px] font-bold text-indigo-300">
            <RefreshCw className="w-3 h-3" />
            {isId ? 'Diproses' : 'Processing'}
          </span>
        );
      case 'rejected':
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/15 border border-rose-500/30 text-[11px] font-bold text-rose-300">
            <AlertCircle className="w-3 h-3" />
            {status === 'failed'
              ? isId
                ? 'Gagal (Refund)'
                : 'Failed (Refunded)'
              : t.rewards.statusRejected}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-[11px] font-bold text-amber-300">
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
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-[11px] font-bold text-emerald-300">
            <CheckCircle2 className="w-3 h-3" />
            {t.rewards.referralStatusQualified}
          </span>
        );
      case 'rejected_fraud':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/15 border border-rose-500/30 text-[11px] font-bold text-rose-300">
            <AlertCircle className="w-3 h-3" />
            {t.rewards.referralStatusRejected}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-[11px] font-bold text-amber-300">
            <Clock className="w-3 h-3" />
            {t.rewards.referralStatusPending}
          </span>
        );
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
  const levelTiers = useMemo(
    () =>
      config.levelTiers && config.levelTiers.length > 0
        ? config.levelTiers
        : DEFAULT_CONFIG.levelTiers || [],
    [config.levelTiers]
  );

  const activeLevelInfo = useMemo<AccountLevelStatus>(() => {
    if (summary?.levelInfo) return summary.levelInfo;
    const baseTier = levelTiers[0] || {
      level: 1,
      tierId: 'bronze' as const,
      tierName: 'Bronze',
      minTotalEarned: 0,
      minVerifiedWatchSeconds: 0,
      multiplier: 1.0,
      bonusPercent: 0,
      watchMinutePoints: config.watchMinutePoints || 20,
      dailyCheckinPoints: config.dailyCheckinPoints || 500,
      watchEpisodePoints: config.watchEpisodePoints || 200,
      dailyMissionMilestones: config.dailyMissionMilestones || [],
    };
    const secondTier = levelTiers[1] || null;
    return {
      level: baseTier.level,
      tierId: baseTier.tierId,
      tierName: baseTier.tierName,
      multiplier: baseTier.multiplier,
      bonusPercent: baseTier.bonusPercent,
      watchMinutePoints: baseTier.watchMinutePoints,
      dailyCheckinPoints: baseTier.dailyCheckinPoints,
      watchEpisodePoints: baseTier.watchEpisodePoints,
      dailyMissionMilestones: baseTier.dailyMissionMilestones,
      totalEarned: 0,
      verifiedWatchSeconds: 0,
      nextTier: secondTier
        ? {
            level: secondTier.level,
            tierId: secondTier.tierId,
            tierName: secondTier.tierName,
            multiplier: secondTier.multiplier,
            bonusPercent: secondTier.bonusPercent,
            minTotalEarned: secondTier.minTotalEarned,
            minVerifiedWatchSeconds: secondTier.minVerifiedWatchSeconds,
            remainingPoints: secondTier.minTotalEarned,
            remainingWatchSeconds: secondTier.minVerifiedWatchSeconds,
          }
        : null,
      progressPct: 0,
    };
  }, [summary?.levelInfo, levelTiers, config]);

  const effectiveWatchMinutePoints = activeLevelInfo.watchMinutePoints || config.watchMinutePoints || 20;
  const effectiveDailyCheckinPoints = activeLevelInfo.dailyCheckinPoints || config.dailyCheckinPoints || 500;
  const effectiveWatchEpisodePoints = activeLevelInfo.watchEpisodePoints || config.watchEpisodePoints || 200;

  const todayWatchPointsEarned = Math.max(0, summary?.todayWatchPointsEarned ?? 0);
  const effectiveMilestoneConfigs =
    activeLevelInfo.dailyMissionMilestones && activeLevelInfo.dailyMissionMilestones.length > 0
      ? activeLevelInfo.dailyMissionMilestones
      : config.dailyMissionMilestones || [];
  const rawLevelWatchMax =
    missionMaxMinutes * effectiveWatchMinutePoints +
    effectiveMilestoneConfigs.reduce((acc, m) => acc + m.bonusPoints, 0);
  const dailyWatchCap = Math.max(
    effectiveWatchMinutePoints,
    config.maxDailyWatchPoints || 10000
  );
  const maxWatchMissionPoints = Math.min(dailyWatchCap, rawLevelWatchMax);
  const oneUsdtPoints = Math.max(1000, config.pointsPerUsd || 100000);

  const checkinStreak = summary?.checkinStreak ?? 0;
  const cycleDayProgress =
    checkinStreak > 0 ? ((checkinStreak - 1) % 7) + 1 : 0;
  const activeCheckinDay = summary?.dailyCheckinClaimedToday
    ? Math.max(1, cycleDayProgress)
    : Math.min(7, cycleDayProgress + 1);
  const weeklyCheckinMaxPoints =
    effectiveDailyCheckinPoints * 7 + 50;

  const tierMeta = useMemo(() => {
    const id = activeLevelInfo.tierId;
    if (id === 'platinum') {
      return {
        label: isId ? `Level Platinum` : `Platinum level`,
        badgeClass: 'border-cyan-300/50 bg-cyan-500/15 text-cyan-200',
        barClass: 'from-cyan-400 to-indigo-400',
      };
    }
    if (id === 'gold') {
      return {
        label: isId ? `Level Gold` : `Gold level`,
        badgeClass: 'border-yellow-400/50 bg-yellow-500/15 text-yellow-200',
        barClass: 'from-amber-400 to-yellow-300',
      };
    }
    if (id === 'silver') {
      return {
        label: isId ? `Level Silver` : `Silver level`,
        badgeClass: 'border-slate-300/45 bg-slate-400/15 text-slate-100',
        barClass: 'from-slate-300 to-slate-100',
      };
    }
    return {
      label: isId ? `Level Bronze` : `Bronze level`,
      badgeClass: 'border-amber-500/35 bg-amber-500/10 text-amber-200/90',
      barClass: 'from-[#F43F5E] to-[#FBBF24]',
    };
  }, [activeLevelInfo.tierId, isId]);

  const milestoneStatuses: DailyMissionMilestoneStatus[] =
    summary?.milestones && summary.milestones.length > 0
      ? summary.milestones
      : effectiveMilestoneConfigs.map((m) => ({
          ...m,
          reached: todayMissionMinutes >= m.minutes,
          claimed: false,
          claimedAt: null,
        }));

  const ledgerMaxPage = Math.max(0, Math.ceil(ledgerTotal / LEDGER_PAGE_SIZE) - 1);
  const payoutMaxPage = Math.max(0, Math.ceil(payoutTotal / PAYOUT_PAGE_SIZE) - 1);

  return (
    <div className="space-y-5">
      {/* Honest PostgreSQL Disconnected Alert */}
      {!dbAvailable && (
        <div
          role="alert"
          className="rounded-2xl bg-rose-950/35 border border-rose-500/40 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="flex items-start gap-3">
            <Database className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs sm:text-sm font-bold text-rose-200">
                {isId
                  ? 'Database PostgreSQL Belum Terhubung (Mode Diagnostik)'
                  : 'PostgreSQL Database Not Connected'}
              </p>
              <p className="text-xs text-rose-200/85 leading-relaxed">
                {dbErrorMsg ||
                  (isId
                    ? 'Variabel lingkungan DATABASE_URL belum dikonfigurasi pada server. Sistem tidak menggunakan penyimpanan lokal agar saldo poin, misi, referral, dan penarikan tetap sinkron dan aman.'
                    : 'Server DATABASE_URL environment variable is not configured. Points, missions, referrals, and withdrawals require PostgreSQL.')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadPointsData()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-500/20 border border-rose-400/40 text-xs font-bold text-rose-100 hover:bg-rose-500/30 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{isId ? 'Cek Ulang Koneksi' : 'Retry Connection'}</span>
          </button>
        </div>
      )}

      {/* 1. Coin Balance Hero Card (Matching Screenshot Reference) */}
      <section className="relative overflow-hidden rounded-3xl border border-rose-500/25 bg-gradient-to-br from-[#2B101E] via-[#17111C] to-[#100F16] p-5 sm:p-6 shadow-[0_18px_48px_rgba(0,0,0,0.45)]">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -top-12 w-56 h-56 rounded-full bg-rose-500/20 blur-3xl"
        />
        <div className="relative flex items-center justify-between gap-3 sm:gap-4">
          <div className="space-y-3 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm sm:text-base font-bold text-[#FDE68A]">
                {isId ? 'Saldo Koin' : 'Coin balance'}
              </span>
              {user && (
                <button
                  type="button"
                  onClick={() => void loadPointsData()}
                  disabled={loading}
                  aria-label="Refresh points data"
                  className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-[#D4D4D8] transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold ${tierMeta.badgeClass}`}
              >
                <Star className="w-3.5 h-3.5" />
                <span>{tierMeta.label}</span>
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-emerald-500/35 bg-emerald-500/10 text-[11px] font-bold text-emerald-300 tabular-nums">
                {activeLevelInfo.multiplier.toFixed(1)}x{' '}
                {activeLevelInfo.bonusPercent > 0
                  ? `(+${activeLevelInfo.bonusPercent}%)`
                  : isId
                  ? '(Standar)'
                  : '(Base)'}
              </span>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <GoldCoinIcon className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 drop-shadow-[0_4px_12px_rgba(245,158,11,0.45)]" />
                <span className="text-4xl sm:text-5xl font-extrabold text-white tabular-nums tracking-tight leading-none">
                  {user ? (summary?.balance ?? 0).toLocaleString() : '0'}
                </span>
                <span className="text-sm sm:text-base font-semibold text-[#D4D4D8] self-end pb-1">
                  {t.rewards.pointsUnit}
                </span>
              </div>

              <p className="text-xs text-[#D4D4D8]/85 tabular-nums pl-0.5">
                {user ? (
                  <>
                    {t.rewards.estimatedValue}:{' '}
                    <strong className="text-white">
                      {formatUsd(summary?.estimatedUsd ?? 0)}
                    </strong>{' '}
                    ·{' '}
                    <strong className="text-emerald-300">
                      {formatIdr(summary?.estimatedIdr ?? 0)}
                    </strong>
                  </>
                ) : (
                  <>
                    {oneUsdtPoints.toLocaleString()} {t.rewards.pointsUnit} = 1 USDT ({formatIdr(config.usdToIdrRate)}) ·{' '}
                    {config.minPayoutPointsIdr.toLocaleString()} {t.rewards.pointsUnit} ={' '}
                    {formatIdr(config.minPayoutIdr)}
                  </>
                )}
              </p>
            </div>

            {!user && (
              <div className="pt-0.5">
                <button
                  type="button"
                  onClick={() => openAuthModal()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-[#F43F5E] to-[#DB2777] hover:brightness-110 text-xs sm:text-sm font-bold text-white shadow-lg transition-all"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>{t.auth.continueBtn}</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center justify-center shrink-0">
            <GiftBoxHeroIllustration />
          </div>
        </div>

        {/* Account Level Progression & Active Rate Perks */}
        <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-white">
                {activeLevelInfo.nextTier
                  ? isId
                    ? `Progres ke Level ${activeLevelInfo.nextTier.tierName} (${activeLevelInfo.nextTier.multiplier.toFixed(1)}x)`
                    : `Progress to ${activeLevelInfo.nextTier.tierName} (${activeLevelInfo.nextTier.multiplier.toFixed(1)}x)`
                  : isId
                  ? 'Level Maksimal Tercapai (Platinum 1.6x)'
                  : 'Max Level Reached (Platinum 1.6x)'}
              </span>
              <span className="text-[#A1A1AA] tabular-nums">
                {activeLevelInfo.progressPct}%
              </span>
            </div>

            <button
              type="button"
              onClick={() => setShowLevelTiers((prev) => !prev)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#FDE68A] hover:text-white transition-colors"
            >
              <span>
                {showLevelTiers
                  ? isId
                    ? 'Tutup Rincian Level'
                    : 'Hide Level Tiers'
                  : isId
                  ? 'Lihat Semua Level (4)'
                  : 'View All Levels (4)'}
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform ${
                  showLevelTiers ? 'rotate-180' : ''
                }`}
              />
            </button>
          </div>

          <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${tierMeta.barClass} transition-all duration-500`}
              style={{
                width: `${Math.max(activeLevelInfo.progressPct > 0 ? 4 : 0, activeLevelInfo.progressPct)}%`,
              }}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#D4D4D8]">
            <span className="tabular-nums">
              {isId
                ? `Perolehan aktif: +${effectiveWatchMinutePoints} poin/mnt · +${effectiveDailyCheckinPoints} check-in · +${effectiveWatchEpisodePoints} ep baru`
                : `Active rates: +${effectiveWatchMinutePoints} pts/min · +${effectiveDailyCheckinPoints} check-in · +${effectiveWatchEpisodePoints} new ep`}
            </span>
            {activeLevelInfo.nextTier && (
              <span className="text-[#A1A1AA] tabular-nums">
                {isId
                  ? `Kurang ${activeLevelInfo.nextTier.remainingPoints.toLocaleString()} poin atau ${Math.ceil(activeLevelInfo.nextTier.remainingWatchSeconds / 60).toLocaleString()} mnt nonton`
                  : `${activeLevelInfo.nextTier.remainingPoints.toLocaleString()} pts or ${Math.ceil(activeLevelInfo.nextTier.remainingWatchSeconds / 60).toLocaleString()} min watch to unlock`}
              </span>
            )}
          </div>

          {showLevelTiers && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-1">
              {levelTiers.map((tier) => {
                const isCurrent = tier.tierId === activeLevelInfo.tierId;
                const isUnlocked = tier.level <= activeLevelInfo.level;
                const reqHours = Math.round(tier.minVerifiedWatchSeconds / 3600);
                return (
                  <div
                    key={tier.tierId}
                    className={`rounded-2xl p-3 border text-xs space-y-1.5 transition-colors ${
                      isCurrent
                        ? 'bg-white/10 border-amber-400/50 text-white'
                        : isUnlocked
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-[#E4E4E7]'
                        : 'bg-black/25 border-white/10 text-[#A1A1AA]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-white">
                        Lv.{tier.level} {tier.tierName}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums ${
                          isCurrent
                            ? 'bg-amber-400 text-[#09090B]'
                            : 'bg-white/10 text-[#FDE68A]'
                        }`}
                      >
                        {tier.multiplier.toFixed(1)}x
                      </span>
                    </div>
                    <p className="text-[11px] tabular-nums">
                      +{tier.watchMinutePoints} {isId ? 'poin/mnt' : 'pts/min'} · +{tier.dailyCheckinPoints}{' '}
                      check-in
                    </p>
                    <p className="text-[10px] text-[#A1A1AA] tabular-nums">
                      {tier.minTotalEarned === 0
                        ? isId
                          ? 'Level awal akun baru'
                          : 'Starter account tier'
                        : isId
                        ? `Syarat: ${tier.minTotalEarned.toLocaleString()} poin atau ${reqHours} jam nonton`
                        : `Req: ${tier.minTotalEarned.toLocaleString()} pts or ${reqHours}h watch`}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Compact Ledger Summary Strip when signed in */}
        {user && (
          <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-3 gap-3 text-xs">
            <div>
              <p className="text-[11px] text-[#A1A1AA]">
                {isId ? 'Total Diperoleh' : 'Lifetime Earned'}
              </p>
              <p className="font-extrabold text-emerald-300 tabular-nums mt-0.5">
                +{(summary?.totalEarned ?? 0).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-[#A1A1AA]">
                {isId ? 'Tertahan Payout' : 'Held Pending'}
              </p>
              <p className="font-extrabold text-amber-300 tabular-nums mt-0.5">
                {(summary?.totalHeld ?? 0).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-[#A1A1AA]">
                {isId ? 'Batas Hari Ini' : 'Daily Cap'}
              </p>
              <p className="font-extrabold text-white tabular-nums mt-0.5">
                {(summary?.todayEarned ?? 0).toLocaleString()} /{' '}
                {(summary?.maxDailyEarnPoints ?? config.maxDailyEarnPoints).toLocaleString()}
              </p>
            </div>
          </div>
        )}
      </section>

      {/* 2. Daily Check-in Card (7-Day Visual Streak + Pill CTA + Nested WIB Status Card) */}
      <section className="rounded-3xl bg-[#121117] border border-white/10 p-4 sm:p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-0.5">
            <p className="text-xs font-medium text-[#A1A1AA]">
              {isId ? 'Check-in harian' : 'Daily check-in'}
            </p>
            <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight tabular-nums">
              {isId ? `Streak ${checkinStreak} hari` : `${checkinStreak}-day streak`}
            </h2>
          </div>

          <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#1C1A24] border border-white/10 text-sm font-bold text-white tabular-nums">
            <Flame className="w-4 h-4 text-[#FB7185]" />
            <span>{checkinStreak}</span>
          </div>
        </div>

        {/* 7-Day Progressive Coin Tiles */}
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2.5">
          {[1, 2, 3, 4, 5, 6, 7].map((dayNum) => {
            const isActiveDay = dayNum === activeCheckinDay;
            const isPastCompleted =
              summary?.dailyCheckinClaimedToday
                ? dayNum < cycleDayProgress
                : dayNum <= cycleDayProgress;
            const dayPoints =
              dayNum === 7
                ? effectiveDailyCheckinPoints + 50
                : effectiveDailyCheckinPoints;
            const coinLevel: 1 | 2 | 3 | 4 =
              dayNum <= 2 ? 1 : dayNum <= 4 ? 2 : dayNum <= 6 ? 3 : 4;

            return (
              <div
                key={dayNum}
                title={
                  dayNum === 7
                    ? isId
                      ? `Hari ke-7: +${dayPoints} poin (termasuk bonus +50)`
                      : `Day 7: +${dayPoints} pts (incl. +50 bonus)`
                    : `${isId ? 'Hari' : 'Day'} ${dayNum}: +${dayPoints}`
                }
                className={`relative rounded-2xl py-2.5 px-1 sm:px-2 flex flex-col items-center justify-between gap-1.5 border transition-all ${
                  isActiveDay
                    ? 'bg-gradient-to-b from-[#F43F5E] to-[#9F1239] border-[#FDA4AF]/60 text-white shadow-[0_8px_22px_rgba(225,29,72,0.32)]'
                    : isPastCompleted
                    ? 'bg-[#171A21] border-emerald-500/40 text-white'
                    : 'bg-[#191721] border-white/5 text-[#D4D4D8]'
                }`}
              >
                <span
                  className={`text-[10px] sm:text-xs font-semibold whitespace-nowrap ${
                    isActiveDay ? 'text-white' : 'text-[#A1A1AA]'
                  }`}
                >
                  {isId ? `H-${dayNum}` : `Day ${dayNum}`}
                </span>

                <CoinStackArt level={coinLevel} />

                <span
                  className={`text-[11px] sm:text-xs font-extrabold tabular-nums ${
                    isActiveDay
                      ? 'text-white'
                      : isPastCompleted
                      ? 'text-emerald-300'
                      : 'text-[#FDE68A]'
                  }`}
                >
                  +{dayPoints}
                </span>

                {isPastCompleted && !isActiveDay && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-emerald-500 text-[#09090B] flex items-center justify-center shadow">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Full-Width Pill Check-In CTA */}
        <button
          type="button"
          onClick={handleDailyCheckin}
          disabled={
            Boolean(user) &&
            (!dbAvailable ||
              claimingCheckin ||
              Boolean(summary?.dailyCheckinClaimedToday) ||
              (summary?.cooldownSecondsRemaining ?? 0) > 0)
          }
          className={`w-full py-3.5 px-5 rounded-full text-sm font-bold flex items-center justify-center gap-2 transition-all ${
            summary?.dailyCheckinClaimedToday
              ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 cursor-default'
              : 'bg-gradient-to-r from-[#F43F5E] to-[#DB2777] text-white shadow-[0_10px_28px_rgba(225,29,72,0.32)] hover:brightness-110 disabled:opacity-55 disabled:cursor-not-allowed'
          }`}
        >
          {summary?.dailyCheckinClaimedToday ? (
            <>
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{t.rewards.dailyCheckinDone}</span>
            </>
          ) : (summary?.cooldownSecondsRemaining ?? 0) > 0 ? (
            <>
              <Clock className="w-4 h-4 shrink-0" />
              <span>
                {t.rewards.cooldownWait} {summary?.cooldownSecondsRemaining}s
              </span>
            </>
          ) : !user ? (
            <>
              <Play className="w-4 h-4 fill-current shrink-0" />
              <span>
                {isId
                  ? `Masuk & Klaim Check-in (+${effectiveDailyCheckinPoints} Poin)`
                  : `Sign in to Check In (+${effectiveDailyCheckinPoints} pts)`}
              </span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-current shrink-0" />
              <span>
                {claimingCheckin
                  ? '...'
                  : `${t.rewards.dailyCheckinBtn.replace(/\(\+[^)]+\)/, '').trim()} (+${effectiveDailyCheckinPoints} ${t.rewards.pointsUnit})`}
              </span>
            </>
          )}
        </button>

        {/* Centered Weekly Summary */}
        <div className="text-center space-y-1.5 pt-0.5">
          <p className="text-sm sm:text-base font-bold text-white tabular-nums">
            {isId ? (
              <>
                Kumpulkan hingga{' '}
                <span className="text-[#FB7185]">{weeklyCheckinMaxPoints}</span>{' '}
                poin minggu ini
              </>
            ) : (
              <>
                Collect up to{' '}
                <span className="text-[#FB7185]">{weeklyCheckinMaxPoints}</span>{' '}
                points this week
              </>
            )}
          </p>
          <p className="text-xs text-[#A1A1AA] max-w-lg mx-auto leading-relaxed">
            {isId
              ? 'Check-in, milestone, dan batas harian direset serentak setiap hari pukul 00:00 WIB (17:00 UTC). Hadiah bertambah dengan bonus +50 poin pada hari ke-7 beruntun.'
              : 'Daily check-ins, milestones, and daily caps reset together once per day at 17:00 UTC (00:00 WIB). Keep a 7-day consecutive streak to unlock a +50 pts bonus.'}
          </p>
        </div>

        {/* Nested Reset Protection & Verified Progress Card (Matching Screenshot Inner Box) */}
        <div className="rounded-2xl bg-[#181620] border border-white/10 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-lg bg-slate-500/15 border border-white/10 flex items-center justify-center text-slate-300 shrink-0">
                <Shield className="w-4 h-4" />
              </span>
              <span className="text-sm font-bold text-white">
                {isId ? 'Sinkronisasi Reset Server & Anti-Curang' : 'Server Reset Sync & Verified Watch'}
              </span>
            </div>

            <span className="inline-flex items-center px-3 py-1 rounded-full border border-amber-500/40 bg-amber-500/10 text-[11px] font-semibold text-amber-200">
              <ResetCountdown lang={language} nextResetAt={summary?.nextResetAt} />
            </span>
          </div>

          <p className="text-xs text-[#A1A1AA] leading-relaxed">
            {isId
              ? 'Durasi menonton diverifikasi otomatis oleh server pada kecepatan 1x dengan tab aktif agar poin & kualifikasi referral aman.'
              : 'Watch duration is server-verified at 1x playback speed with an active tab so your points and referral streak stay protected.'}
          </p>

          <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-[#121117] border border-white/5 text-xs">
            <span className="inline-flex items-center gap-2 text-[#D4D4D8]">
              <PlayCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{t.rewards.verifiedWatchProgress}</span>
            </span>
            <span className="font-bold text-emerald-300 tabular-nums">
              {verifiedWatchMinutes} {t.rewards.minutesUnit}
            </span>
          </div>
        </div>
      </section>

      {/* 3. Daily Watching Bonus Card (Hybrid: Auto Per-Minute + Claimable Milestone Buttons) */}
      <section className="rounded-3xl bg-[#121117] border border-white/10 p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-[#381828] border border-rose-500/25 flex items-center justify-center text-[#FB7185] shrink-0">
              <Play className="w-4 h-4 fill-current" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base sm:text-lg font-extrabold text-white">
                  {t.rewards.dailyWatchingTitle}
                </h2>
                {activeLevelInfo.multiplier > 1 && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/35 text-[10px] font-bold text-emerald-300 tabular-nums">
                    {activeLevelInfo.tierName} {activeLevelInfo.multiplier.toFixed(1)}x
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#A1A1AA] tabular-nums">
                +{effectiveWatchMinutePoints} {t.rewards.pointsUnit}/{t.rewards.milestoneMinSuffix} ({t.rewards.dailyWatchingAutoBadge.toLowerCase()},{' '}
                {missionMaxMinutes} {t.rewards.milestoneMinSuffix}) + {t.rewards.milestoneClaimBtn}
              </p>
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-semibold text-[#D4D4D8] tabular-nums">
            <Clock className="w-3.5 h-3.5 text-[#FBBF24] shrink-0" />
            <span>
              {t.rewards.dailyWatchingCapLabel}: {dailyWatchCap.toLocaleString()} {t.rewards.pointsUnit}
            </span>
          </span>
        </div>

        <div className="flex items-baseline gap-2">
          <GoldCoinIcon className="w-7 h-7 self-center shrink-0" />
          <span className="text-3xl font-extrabold text-white tabular-nums tracking-tight">
            {todayWatchPointsEarned.toLocaleString()}
          </span>
          <span className="text-lg font-bold text-[#A1A1AA] tabular-nums">
            /{maxWatchMissionPoints.toLocaleString()} {t.rewards.pointsUnit}
          </span>
        </div>

        {/* 4 Hybrid Watch Cards (Auto Per-Minute + 3 Claimable Milestone Cards) */}
        {(() => {
          const nextUnreachedIdx = milestoneStatuses.findIndex((m) => !m.reached);
          const hasUnclaimedReady = milestoneStatuses.some((m) => m.reached && !m.claimed);
          return (
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5">
                {/* Base Auto Per-Minute Card */}
                <div
                  className={`rounded-2xl p-3 border flex flex-col items-center justify-between gap-2 text-center transition-colors ${
                    todayMissionMinutes < 15
                      ? 'bg-[#1E141B] border-[#F43F5E]'
                      : 'bg-[#191721] border-emerald-500/40'
                  }`}
                >
                  <div className="flex flex-col items-center gap-1">
                    <GoldCoinIcon className="w-6 h-6 sm:w-7 sm:h-7" />
                    <span className="text-xs sm:text-sm font-extrabold text-[#FBBF24] tabular-nums">
                      +{effectiveWatchMinutePoints}/{t.rewards.milestoneMinSuffix}
                    </span>
                    <span className="text-[11px] text-[#A1A1AA] tabular-nums">
                      {t.rewards.dailyWatchingActiveUnit}
                    </span>
                  </div>
                  <span className="w-full py-1.5 px-2 rounded-xl bg-white/5 border border-white/10 text-[10px] sm:text-[11px] font-bold text-[#E4E4E7] inline-flex items-center justify-center gap-1">
                    <Sparkles className="w-3 h-3 text-[#FBBF24] shrink-0" />
                    <span>{t.rewards.dailyWatchingAutoBadge}</span>
                  </span>
                </div>

                {milestoneStatuses.map((tier, idx) => {
                  const isNextTarget = idx === nextUnreachedIdx;
                  const isReadyToClaim = tier.reached && !tier.claimed;
                  const isClaimingThis = claimingMilestoneMinutes === tier.minutes;
                  const progressMin = Math.min(todayMissionMinutes, tier.minutes);

                  return (
                    <div
                      key={tier.minutes}
                      className={`relative rounded-2xl p-3 border flex flex-col items-center justify-between gap-2 text-center transition-colors ${
                        tier.claimed
                          ? 'bg-emerald-500/10 border-emerald-500/45'
                          : isReadyToClaim
                          ? 'bg-[#26121C] border-[#F43F5E] shadow-[0_0_20px_rgba(244,63,94,0.2)]'
                          : isNextTarget
                          ? 'bg-[#1E141B] border-[#F43F5E]/65'
                          : 'bg-[#191721] border-white/10'
                      }`}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <GoldCoinIcon className="w-6 h-6 sm:w-7 sm:h-7" />
                        <span
                          className={`text-xs sm:text-sm font-extrabold tabular-nums ${
                            tier.claimed
                              ? 'text-emerald-300'
                              : isReadyToClaim
                              ? 'text-white'
                              : 'text-[#FBBF24]'
                          }`}
                        >
                          +{tier.bonusPoints.toLocaleString()} {t.rewards.pointsUnit}
                        </span>
                        <span className="text-[11px] text-[#A1A1AA] tabular-nums">
                          {tier.minutes} {t.rewards.milestoneMinSuffix}
                        </span>
                      </div>

                      {tier.claimed ? (
                        <button
                          type="button"
                          disabled
                          className="w-full py-1.5 px-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-[10px] sm:text-[11px] font-bold text-emerald-300 inline-flex items-center justify-center gap-1 cursor-default"
                        >
                          <Check className="w-3 h-3 stroke-[3] shrink-0" />
                          <span>{t.rewards.milestoneClaimedBtn}</span>
                        </button>
                      ) : isReadyToClaim ? (
                        <button
                          type="button"
                          onClick={() => void handleClaimMilestone(tier.minutes)}
                          disabled={claimingMilestoneMinutes !== null || !dbAvailable}
                          className="w-full py-1.5 px-2 rounded-xl bg-gradient-to-r from-[#F43F5E] to-[#FB7185] hover:brightness-110 active:scale-[0.98] disabled:opacity-60 text-[10px] sm:text-[11px] font-extrabold text-white shadow-md transition-all cursor-pointer inline-flex items-center justify-center gap-1"
                        >
                          <Gift className="w-3 h-3 shrink-0" />
                          <span>
                            {isClaimingThis
                              ? t.rewards.milestoneClaimingBtn
                              : t.rewards.milestoneClaimBtn}
                          </span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled
                          className="w-full py-1.5 px-2 rounded-xl bg-white/5 border border-white/10 text-[10px] sm:text-[11px] font-semibold text-[#A1A1AA] cursor-not-allowed tabular-nums inline-flex items-center justify-center gap-1"
                        >
                          <Lock className="w-3 h-3 shrink-0 opacity-75" />
                          <span>
                            {progressMin}/{tier.minutes} {t.rewards.milestoneMinSuffix}
                          </span>
                        </button>
                      )}

                      {tier.claimed && (
                        <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-emerald-500 text-[#09090B] flex items-center justify-center shadow">
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {hasUnclaimedReady && (
                <p className="text-[11px] font-medium text-rose-200 bg-rose-500/10 border border-rose-500/30 rounded-xl px-3 py-2 flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-[#FBBF24] shrink-0" />
                  <span>{t.rewards.milestoneUnclaimedHint}</span>
                </p>
              )}
            </div>
          );
        })()}

        {/* Clean Progress Rows */}
        <div className="space-y-3 pt-1">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs sm:text-sm">
              <span className="text-[#D4D4D8] font-medium">
                {t.rewards.minutesWatchedLabel}
              </span>
              <span className="font-bold text-white tabular-nums">
                {todayMissionMinutes}/{missionMaxMinutes} {t.rewards.milestoneMinSuffix}
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#F43F5E] to-[#FBBF24] transition-all duration-500"
                style={{ width: `${Math.max(todayMissionMinutes > 0 ? 3 : 0, missionWatchPct)}%` }}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs sm:text-sm">
              <span className="text-[#D4D4D8] font-medium">
                {t.rewards.watchingPointsLabel}
              </span>
              <span className="font-bold text-white tabular-nums">
                {todayWatchPointsEarned.toLocaleString()}/{maxWatchMissionPoints.toLocaleString()}{' '}
                {t.rewards.pointsUnit}
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#F43F5E] to-emerald-400 transition-all duration-500"
                style={{
                  width: `${Math.max(
                    todayWatchPointsEarned > 0 ? 3 : 0,
                    Math.min(
                      100,
                      Math.round(
                        (todayWatchPointsEarned / Math.max(1, maxWatchMissionPoints)) * 100
                      )
                    )
                  )}%`,
                }}
              />
            </div>
          </div>

          <div className="pt-1 flex items-center justify-between gap-2 text-xs text-[#A1A1AA]">
            <span className="inline-flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#FBBF24] shrink-0" />
              <span>
                {t.rewards.todaysCheckinLabel}:{' '}
                {summary?.dailyCheckinClaimedToday
                  ? `${t.rewards.doneLabel} ✓`
                  : t.rewards.notYetLabel}
              </span>
            </span>
            <span className="text-[11px] tabular-nums">{missionWatchPct}%</span>
          </div>
        </div>
      </section>

      {/* Referral Hub (Always Uses Production https://kano-drama.xyz/?ref=...) */}
      <section
        id="referral-program"
        className="rounded-2xl bg-[#111015] border border-[#D4AF37]/25 p-5 sm:p-6 space-y-5"
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

          <div className="px-3 py-1.5 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/30 text-xs font-extrabold text-[#D4AF37] tabular-nums whitespace-nowrap">
            +{(referralSummary?.referralBonusPoints ?? config.referralBonusPoints).toLocaleString()}{' '}
            {t.rewards.pointsUnit} / {qualifyMinutes} {t.rewards.minutesUnit}
          </div>
        </div>

        {!user ? (
          <div className="p-4 rounded-xl bg-[#0B0B0F] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs sm:text-sm font-bold text-white">
                {isId
                  ? 'Dapatkan Link Referral KanoDrama Pribadi Anda'
                  : 'Get Your Permanent KanoDrama Referral Link'}
              </p>
              <p className="text-xs text-[#A1A1AA] leading-relaxed">
                {t.rewards.referralRule1h}
              </p>
            </div>
            <button
              type="button"
              onClick={() => openAuthModal()}
              className="px-5 py-2.5 min-h-[42px] rounded-xl bg-[#D4AF37] text-[#09090B] text-xs font-extrabold hover:brightness-110 transition-all whitespace-nowrap shrink-0"
            >
              {isId ? 'Masuk & Ambil Kode' : 'Sign In for Code'}
            </button>
          </div>
        ) : !referralSummary ? (
          <div className="p-4 rounded-xl bg-[#0B0B0F] border border-white/10 text-xs text-[#A1A1AA]">
            {dbAvailable
              ? t.sections.loading
              : isId
              ? 'Menunggu koneksi database PostgreSQL untuk memuat kode referral Anda.'
              : 'Waiting for PostgreSQL database connection to load referral data.'}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-6 p-4 rounded-xl bg-[#0B0B0F] border border-white/10 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#A1A1AA] font-semibold">
                    {t.rewards.referralLinkLabel}
                  </span>
                  <span className="text-[#D4AF37] font-mono font-bold">
                    {t.rewards.referralCodeLabel}: {referralSummary.referralCode}
                  </span>
                </div>

                <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={referralShareUrl}
                    onFocus={(e) => e.currentTarget.select()}
                    aria-label={t.rewards.referralLinkLabel}
                    className="flex-1 min-w-0 min-h-[40px] px-3 py-2 rounded-lg bg-[#16151C] border border-white/10 text-xs text-white font-mono truncate focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void handleCopyReferralLink()}
                    className="inline-flex items-center gap-1.5 px-3.5 min-h-[40px] rounded-lg bg-[#D4AF37] text-[#09090B] text-xs font-extrabold hover:brightness-110 transition-all whitespace-nowrap shrink-0"
                  >
                    {copiedRef ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedRef ? (isId ? 'Disalin' : 'Copied') : t.rewards.copyReferralLink}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleShareReferralLink()}
                    className="inline-flex items-center gap-1.5 px-3.5 min-h-[40px] rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-bold text-white transition-all whitespace-nowrap shrink-0"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>{isId ? 'Bagikan' : 'Share'}</span>
                  </button>
                </div>

                {/* Manual Referral Code Bind */}
                <form onSubmit={handleBindReferralCode} className="pt-2 border-t border-white/10 space-y-2">
                  <label className="block text-[11px] font-medium text-[#A1A1AA]">
                    {isId
                      ? 'Punya kode referral teman? Masukkan sekali di sini:'
                      : 'Have a friend referral code? Enter it once here:'}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={bindCodeInput}
                      onChange={(e) => setBindCodeInput(e.target.value.toUpperCase())}
                      placeholder="KDXXXXXXXX"
                      maxLength={20}
                      className="flex-1 min-w-0 min-h-[36px] px-3 py-1.5 rounded-lg bg-[#16151C] border border-white/10 text-xs font-mono text-white uppercase placeholder:text-[#71717A] focus:border-[#D4AF37] focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={bindingRef || !bindCodeInput.trim()}
                      className="inline-flex items-center gap-1 px-3 min-h-[36px] rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-bold text-white disabled:opacity-45 whitespace-nowrap shrink-0"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      <span>{bindingRef ? '...' : isId ? 'Tautkan' : 'Bind'}</span>
                    </button>
                  </div>
                  {bindFeedback && (
                    <p
                      className={`text-[11px] font-medium ${
                        bindFeedback.type === 'success' ? 'text-emerald-300' : 'text-rose-300'
                      }`}
                    >
                      {bindFeedback.message}
                    </p>
                  )}
                </form>
              </div>

              <div className="lg:col-span-6 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3.5 rounded-xl bg-[#0B0B0F] border border-white/10 flex flex-col justify-center">
                  <p className="text-[11px] text-[#A1A1AA]">{t.rewards.referralTotalInvited}</p>
                  <p className="text-xl font-extrabold text-white tabular-nums mt-1">
                    {referralSummary.stats.totalInvited}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-[#0B0B0F] border border-white/10 flex flex-col justify-center">
                  <p className="text-[11px] text-[#A1A1AA]">{t.rewards.referralPendingCount}</p>
                  <p className="text-xl font-extrabold text-amber-300 tabular-nums mt-1">
                    {referralSummary.stats.pendingCount}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-[#0B0B0F] border border-white/10 flex flex-col justify-center">
                  <p className="text-[11px] text-[#A1A1AA]">{t.rewards.referralQualifiedCount}</p>
                  <p className="text-xl font-extrabold text-emerald-300 tabular-nums mt-1">
                    {referralSummary.stats.qualifiedCount}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl bg-[#0B0B0F] border border-white/10 flex flex-col justify-center">
                  <p className="text-[11px] text-[#A1A1AA]">{t.rewards.referralBonusEarned}</p>
                  <p className="text-xl font-extrabold text-[#D4AF37] tabular-nums mt-1">
                    +{referralSummary.stats.totalBonusEarned.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            {referralSummary.referrals.length === 0 ? (
              <div className="p-4 rounded-xl bg-[#0B0B0F] border border-white/10 flex items-center gap-3 text-xs text-[#A1A1AA]">
                <Users className="w-4 h-4 text-[#D4AF37] shrink-0" />
                <span>{t.rewards.referralEmpty}</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-1">
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
                      className="p-3.5 rounded-xl bg-[#0B0B0F] border border-white/10 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-white">
                          {ref.maskedReferee}
                        </span>
                        {renderReferralStatusBadge(ref.status)}
                      </div>
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
                  );
                })}
              </div>
            )}
          </>
        )}
      </section>

      {/* Categorized Withdrawal Form + Real Live Payout Feed */}
      <div id="withdraw-section" className="grid grid-cols-1 xl:grid-cols-12 gap-6 scroll-mt-20">
        <form
          onSubmit={handleRequestWithdrawConfirmation}
          className="xl:col-span-7 rounded-3xl bg-[#121117] border border-white/10 p-5 sm:p-6 space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-[#FBBF24]">
                <Wallet className="w-4 h-4" />
              </span>
              <div>
                <h2 className="text-base sm:text-lg font-extrabold text-white">
                  {t.rewards.withdrawTitle}
                </h2>
                <p className="text-[11px] text-[#A1A1AA]">
                  {isId
                    ? 'Pilih metode pencairan yang diinginkan'
                    : 'Choose your preferred payout method'}
                </p>
              </div>
            </div>

            <div className="inline-flex p-1 rounded-xl bg-[#0B0B0F] border border-white/10">
              <button
                type="button"
                onClick={() => {
                  setCurrencyTab('IDR');
                  setBankDropdownOpen(false);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
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
                onClick={() => {
                  setCurrencyTab('USD');
                  setBankDropdownOpen(false);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
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

          {currencyTab === 'IDR' ? (
            <div className="space-y-3.5">
              {/* Tidy 6-Option Method Grid (5 E-Wallets + 1 Transfer Bank card) */}
              <div className="space-y-2">
                <span className="block text-xs font-semibold text-[#D4D4D8]">
                  {isId
                    ? 'Metode Pencairan Indonesia (Min Rp 50.000)'
                    : 'Indonesian Payout Methods (Min Rp 50,000)'}
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {idrEwallets.map((m) => {
                    const active = effectiveMethod === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setSelectedMethod(m.id);
                          setBankDropdownOpen(false);
                          if (parsedPoints < m.minPoints) {
                            setPointsInput(String(m.minPoints));
                          }
                        }}
                        className={`p-3 rounded-xl border flex items-center gap-2.5 text-left transition-all ${
                          active
                            ? 'bg-[#D4AF37]/15 border-[#D4AF37] text-white shadow-sm'
                            : 'bg-[#0B0B0F] border-white/10 text-[#D4D4D8] hover:border-white/25'
                        }`}
                      >
                        <PaymentMethodLogo method={m.id} size="sm" />
                        <div className="min-w-0">
                          <p className="text-xs font-bold truncate">{m.label}</p>
                          <p className="text-[10px] text-[#A1A1AA]">E-Wallet</p>
                        </div>
                      </button>
                    );
                  })}

                  {idrBankMethod && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMethod('bank_transfer');
                        if (parsedPoints < idrBankMethod.minPoints) {
                          setPointsInput(String(idrBankMethod.minPoints));
                        }
                      }}
                      className={`p-3 rounded-xl border flex items-center gap-2.5 text-left transition-all ${
                        effectiveMethod === 'bank_transfer'
                          ? 'bg-[#D4AF37]/15 border-[#D4AF37] text-white shadow-sm'
                          : 'bg-[#0B0B0F] border-white/10 text-[#D4D4D8] hover:border-white/25'
                      }`}
                    >
                      <PaymentMethodLogo
                        method="bank_transfer"
                        bankCode={
                          effectiveMethod === 'bank_transfer'
                            ? selectedBankCode
                            : undefined
                        }
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold truncate">
                          {isId ? 'Transfer Bank' : 'Bank Transfer'}
                        </p>
                        <p className="text-[10px] text-[#A1A1AA] truncate">
                          {effectiveMethod === 'bank_transfer' && selectedBankObj
                            ? selectedBankObj.shortName
                            : `${banks.length} Bank`}
                        </p>
                      </div>
                    </button>
                  )}
                </div>
              </div>

              {/* Clean Single-Row Searchable Bank Dropdown — Shown ONLY when Transfer Bank is selected */}
              {idrBankMethod && effectiveMethod === 'bank_transfer' && (
                <div ref={bankDropdownRef} className="relative space-y-1.5">
                  <label className="block text-xs font-semibold text-[#D4D4D8]">
                    {isId ? 'Pilih Bank Tujuan' : 'Select Destination Bank'}
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setBankSearchQuery('');
                      setBankDropdownOpen((prev) => !prev);
                    }}
                    aria-expanded={bankDropdownOpen}
                    className="w-full min-h-[46px] px-3.5 py-2.5 rounded-xl bg-[#0B0B0F] border border-white/15 hover:border-[#D4AF37]/60 flex items-center justify-between gap-3 text-left transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <PaymentMethodLogo
                        method="bank_transfer"
                        bankCode={selectedBankObj?.code}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-bold text-white truncate">
                          {selectedBankObj?.label || selectedBankCode}
                        </p>
                        {selectedBankObj && (
                          <p className="text-[11px] text-[#A1A1AA] tabular-nums">
                            {isId
                              ? `Nomor rekening ${
                                  selectedBankObj.minDigits === selectedBankObj.maxDigits
                                    ? `${selectedBankObj.minDigits}`
                                    : `${selectedBankObj.minDigits}-${selectedBankObj.maxDigits}`
                                } digit`
                              : `${selectedBankObj.minDigits}-${selectedBankObj.maxDigits} digits`}
                          </p>
                        )}
                      </div>
                    </div>
                    <ChevronDown
                      className={`w-4 h-4 text-[#A1A1AA] shrink-0 transition-transform ${
                        bankDropdownOpen ? 'rotate-180 text-[#D4AF37]' : ''
                      }`}
                    />
                  </button>

                  {bankDropdownOpen && (
                    <div className="absolute left-0 right-0 top-full mt-1.5 z-30 rounded-2xl bg-[#16151E] border border-white/15 shadow-[0_18px_40px_rgba(0,0,0,0.8)] overflow-hidden">
                      <div className="p-2.5 border-b border-white/10">
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-[#71717A] absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            value={bankSearchQuery}
                            onChange={(e) => setBankSearchQuery(e.target.value)}
                            placeholder={
                              isId ? 'Cari nama atau kode bank...' : 'Search bank name...'
                            }
                            autoFocus
                            className="w-full pl-8 pr-3 py-2 rounded-lg bg-[#0B0B0F] border border-white/10 focus:border-[#D4AF37] focus:outline-none text-xs text-white placeholder:text-[#71717A]"
                          />
                        </div>
                      </div>

                      <div className="max-h-60 overflow-y-auto divide-y divide-white/5 p-1">
                        {filteredBanks.length === 0 ? (
                          <p className="py-4 text-center text-xs text-[#A1A1AA]">
                            {isId ? 'Bank tidak ditemukan' : 'No matching bank'}
                          </p>
                        ) : (
                          filteredBanks.map((b) => {
                            const isPicked = selectedBankCode === b.code;
                            return (
                              <button
                                key={b.code}
                                type="button"
                                onClick={() => {
                                  setSelectedBankCode(b.code);
                                  setSelectedMethod('bank_transfer');
                                  setBankDropdownOpen(false);
                                }}
                                className={`w-full px-3 py-2.5 rounded-xl flex items-center justify-between gap-2 text-left transition-colors ${
                                  isPicked
                                    ? 'bg-[#D4AF37]/15 text-white'
                                    : 'text-[#D4D4D8] hover:bg-white/5'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <PaymentMethodLogo
                                    method="bank_transfer"
                                    bankCode={b.code}
                                    size="sm"
                                  />
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold truncate">{b.label}</p>
                                    <p className="text-[10px] text-[#A1A1AA] tabular-nums">
                                      {b.minDigits === b.maxDigits
                                        ? `${b.minDigits} digit`
                                        : `${b.minDigits}-${b.maxDigits} digit`}
                                    </p>
                                  </div>
                                </div>
                                {isPicked && (
                                  <Check className="w-4 h-4 text-[#D4AF37] shrink-0" />
                                )}
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <span className="block text-xs font-semibold text-[#D4D4D8]">
                  {isId ? 'Metode Penarikan Global & Crypto (Min $5.00 USD)' : 'Global & Crypto Payouts (Min $5.00 USD)'}
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {usdGlobalMethods.map((m) => {
                    const active = effectiveMethod === m.id;
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
                        className={`p-3 rounded-xl border flex items-center gap-2.5 text-left transition-all ${
                          active
                            ? 'bg-[#D4AF37]/15 border-[#D4AF37] text-white'
                            : 'bg-[#0B0B0F] border-white/10 text-[#D4D4D8] hover:border-white/25'
                        }`}
                      >
                        <PaymentMethodLogo method={m.id} size="md" />
                        <div className="min-w-0">
                          <p className="text-xs font-bold truncate">{m.label}</p>
                          <p className="text-[11px] text-[#A1A1AA] tabular-nums">
                            Min {formatUsd(config.minPayoutUsd)}
                          </p>
                        </div>
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedMethod(selectedUsdtMethod);
                      const minPts = usdtMethodBase?.minPoints || config.minPayoutPointsUsd;
                      if (parsedPoints < minPts) setPointsInput(String(minPts));
                    }}
                    className={`p-3 rounded-xl border flex items-center gap-2.5 text-left transition-all ${
                      effectiveMethod.startsWith('usdt_')
                        ? 'bg-[#D4AF37]/15 border-[#D4AF37] text-white'
                        : 'bg-[#0B0B0F] border-white/10 text-[#D4D4D8] hover:border-white/25'
                    }`}
                  >
                    <PaymentMethodLogo method={selectedUsdtMethod} network={activeNetworkLabel} size="md" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate">USDT Stablecoin</p>
                      <p className="text-[11px] text-[#A1A1AA] tabular-nums">
                        Polygon · TRC20 · BEP20 · ERC20
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {effectiveMethod.startsWith('usdt_') && (
                <div className="space-y-1.5">
                  <span className="block text-xs font-semibold text-[#D4D4D8]">
                    {isId ? 'Pilih Jaringan Wallet USDT' : 'Select USDT Network'}
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {usdtNetworks.map((net) => {
                      const active = effectiveMethod === net.method;
                      return (
                        <button
                          key={net.method}
                          type="button"
                          onClick={() => {
                            setSelectedUsdtMethod(net.method);
                            setSelectedMethod(net.method);
                          }}
                          className={`px-3 py-2 rounded-lg border text-xs font-bold transition-colors ${
                            active
                              ? 'bg-emerald-500/15 border-emerald-400 text-emerald-300'
                              : 'bg-[#0B0B0F] border-white/10 text-[#A1A1AA] hover:text-white'
                          }`}
                        >
                          {net.network}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Points Amount + Quick Fill + Live Estimation */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[#0B0B0F] border border-white/10 focus:border-[#D4AF37] focus:outline-none text-sm text-white tabular-nums disabled:opacity-50"
              />
              <div className="flex flex-wrap gap-1.5">
                {[
                  {
                    label: isId ? 'Min' : 'Min',
                    val: activeMethodObj.minPoints,
                  },
                  ...(summary && summary.balance > activeMethodObj.minPoints
                    ? [
                        {
                          label: '50%',
                          val: Math.max(
                            activeMethodObj.minPoints,
                            Math.floor(summary.balance / 2)
                          ),
                        },
                        {
                          label: 'Max',
                          val: summary.balance,
                        },
                      ]
                    : [
                        { label: '100K', val: 100000 },
                        { label: '200K', val: 200000 },
                      ]),
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    disabled={!user}
                    onClick={() => setPointsInput(String(preset.val))}
                    className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-semibold text-[#E4E4E7] tabular-nums disabled:opacity-40"
                  >
                    {preset.label} ({preset.val.toLocaleString()})
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-[#A1A1AA] tabular-nums">
                {activeMethodObj.currency === 'IDR'
                  ? `Min: ${formatIdr(config.minPayoutIdr)} (${activeMethodObj.minPoints.toLocaleString()} ${t.rewards.pointsUnit})`
                  : `Min: ${formatUsd(config.minPayoutUsd)} (${activeMethodObj.minPoints.toLocaleString()} ${t.rewards.pointsUnit})`}
              </p>
            </div>

            <div className="space-y-2">
              <span className="block text-xs font-semibold text-[#D4D4D8]">
                {t.rewards.estimatedReceive}
              </span>
              <div className="min-h-[44px] px-4 py-2.5 rounded-xl bg-[#0B0B0F] border border-[#D4AF37]/35 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <PaymentMethodLogo
                    method={effectiveMethod}
                    bankCode={
                      effectiveMethod === 'bank_transfer'
                        ? selectedBankCode
                        : undefined
                    }
                    network={activeNetworkLabel}
                    size="sm"
                  />
                  <span className="text-base font-extrabold text-[#D4AF37] tabular-nums truncate">
                    {currencyTab === 'IDR'
                      ? formatIdr(estimatedReceiveIdr)
                      : formatUsd(estimatedReceiveUsd)}
                  </span>
                </div>
                <span className="text-[11px] text-[#A1A1AA] tabular-nums shrink-0">
                  {currencyTab === 'IDR'
                    ? formatUsd(estimatedReceiveUsd)
                    : formatIdr(estimatedReceiveIdr)}
                </span>
              </div>
              <p className="text-[11px] text-[#71717A] tabular-nums">
                1 USD = {formatIdr(config.usdToIdrRate)} ·{' '}
                {getMethodDisplayLabel(
                  effectiveMethod,
                  selectedBankCode,
                  activeNetworkLabel
                )}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-[#D4D4D8]">
                {t.rewards.destinationLabel}
              </label>
              <input
                type="text"
                value={destinationInput}
                onChange={(e) => setDestinationInput(e.target.value)}
                disabled={!user}
                required
                placeholder={destinationCheck.hint}
                className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[#0B0B0F] border focus:outline-none text-sm text-white placeholder:text-[#71717A] disabled:opacity-50 ${
                  destinationInput && !destinationCheck.valid
                    ? 'border-rose-500/60 focus:border-rose-400'
                    : 'border-white/10 focus:border-[#D4AF37]'
                }`}
              />
              {destinationInput && destinationCheck.error && (
                <p className="text-[11px] text-rose-300">{destinationCheck.error}</p>
              )}
            </div>

            <div className="space-y-1.5">
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
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[#0B0B0F] border border-white/10 focus:border-[#D4AF37] focus:outline-none text-sm text-white placeholder:text-[#71717A] disabled:opacity-50"
              />
            </div>
          </div>

          {formFeedback && (
            <div
              className={`p-3.5 rounded-xl border text-xs font-medium flex items-center gap-2 ${
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
                disabled={submittingPayout || !dbAvailable}
                className="px-6 py-2.5 min-h-[44px] rounded-xl cd-accent-bg text-xs sm:text-sm font-bold text-white shadow-lg hover:brightness-110 transition-all disabled:opacity-55 whitespace-nowrap shrink-0"
              >
                {submittingPayout ? t.rewards.submittingWithdraw : t.rewards.submitWithdraw}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => openAuthModal()}
                className="px-6 py-2.5 min-h-[44px] rounded-xl cd-accent-bg text-xs sm:text-sm font-bold text-white shadow-lg whitespace-nowrap shrink-0"
              >
                {t.auth.continueBtn}
              </button>
            )}
          </div>
        </form>

        {/* Real Live Payout History Feed (No Simulated Data) */}
        <div className="xl:col-span-5 rounded-2xl bg-[#111015] border border-white/10 p-5 sm:p-6 space-y-4">
          <div className="space-y-0.5">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>{t.rewards.liveFeedTitle}</span>
            </h2>
            <p className="text-xs text-[#A1A1AA]">{t.rewards.liveFeedSubtitle}</p>
          </div>

          {liveFeed.length === 0 ? (
            <div className="p-6 rounded-xl bg-[#0B0B0F] border border-white/10 text-center space-y-1.5">
              <Coins className="w-6 h-6 text-[#D4AF37]/70 mx-auto" />
              <p className="text-xs font-semibold text-white">
                {isId
                  ? 'Belum ada riwayat penarikan selesai terbaru'
                  : 'No recent completed payouts yet'}
              </p>
              <p className="text-[11px] text-[#71717A] leading-relaxed">
                {isId
                  ? 'Feed ini hanya menampilkan pencairan nyata yang telah disetujui atau dibayar dari database KanoDrama.'
                  : 'This feed only displays verified approved/paid withdrawals recorded in PostgreSQL.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/10 border border-white/10 rounded-xl bg-[#0B0B0F] max-h-[460px] overflow-y-auto">
              {liveFeed.map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <PaymentMethodLogo method={item.method} size="sm" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">
                        {item.maskedUser} · {item.countryCode} · {item.methodLabel}
                      </p>
                      <p className="text-[11px] text-[#71717A] tabular-nums">
                        <RelativeTimeText iso={item.createdAt} lang={language} />
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-xs sm:text-sm font-extrabold text-emerald-300 tabular-nums">
                      {item.currency === 'IDR'
                        ? formatIdr(item.idrAmount)
                        : formatUsd(item.usdAmount)}
                    </p>
                    <span className="text-[10px] font-semibold text-emerald-400/90 uppercase">
                      {item.status === 'paid' || item.status === 'completed'
                        ? t.rewards.statusPaid
                        : t.rewards.statusApproved}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Paginated User Payout History & Auditable Ledger */}
      {user && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-2xl bg-[#111015] border border-white/10 p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm sm:text-base font-bold text-white">
                {t.rewards.historyPayoutsTitle}{' '}
                <span className="text-xs font-normal text-[#A1A1AA] tabular-nums">
                  ({payoutTotal})
                </span>
              </h3>
              {payoutTotal > PAYOUT_PAGE_SIZE && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={payoutPage <= 0 || payoutLoading}
                    onClick={() => {
                      const next = Math.max(0, payoutPage - 1);
                      setPayoutPage(next);
                      void loadPayoutsPage(next);
                    }}
                    className="p-1.5 rounded-lg bg-[#0B0B0F] border border-white/10 text-[#D4D4D8] disabled:opacity-40"
                    aria-label="Previous payout page"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[11px] text-[#A1A1AA] px-1.5 tabular-nums">
                    {payoutPage + 1}/{payoutMaxPage + 1}
                  </span>
                  <button
                    type="button"
                    disabled={payoutPage >= payoutMaxPage || payoutLoading}
                    onClick={() => {
                      const next = Math.min(payoutMaxPage, payoutPage + 1);
                      setPayoutPage(next);
                      void loadPayoutsPage(next);
                    }}
                    className="p-1.5 rounded-lg bg-[#0B0B0F] border border-white/10 text-[#D4D4D8] disabled:opacity-40"
                    aria-label="Next payout page"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {payoutRows.length === 0 ? (
              <p className="text-xs text-[#A1A1AA] py-6 text-center">
                {t.rewards.noPayouts}
              </p>
            ) : (
              <div className="divide-y divide-white/10 border border-white/10 rounded-xl bg-[#0B0B0F] max-h-[380px] overflow-y-auto">
                {payoutRows.map((p) => (
                  <div key={p.id} className="p-3.5 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <PaymentMethodLogo
                          method={p.method}
                          bankCode={p.bankCode}
                          network={p.network}
                          size="sm"
                        />
                        <span className="text-xs font-bold text-white truncate tabular-nums">
                          {getMethodDisplayLabel(p.method, p.bankCode, p.network)} ·{' '}
                          {p.currency === 'IDR'
                            ? formatIdr(p.idrAmount)
                            : formatUsd(p.usdAmount)}
                        </span>
                      </div>
                      {renderPayoutStatusBadge(p.status)}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#A1A1AA]">
                      <span className="truncate max-w-[250px] font-mono">
                        {p.accountHolderName} · {p.destinationMasked || p.destinationAccount}
                      </span>
                      <span className="tabular-nums">
                        -{p.pointsSpent.toLocaleString()} {t.rewards.pointsUnit} ·{' '}
                        <RelativeTimeText iso={p.createdAt} lang={language} />
                      </span>
                    </div>
                    {p.adminNote && (
                      <p className="text-[11px] text-[#D4D4D8] bg-white/5 px-2.5 py-1.5 rounded-lg">
                        {p.adminNote}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-[#111015] border border-white/10 p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm sm:text-base font-bold text-white">
                {t.rewards.historyLedgerTitle}{' '}
                <span className="text-xs font-normal text-[#A1A1AA] tabular-nums">
                  ({ledgerTotal})
                </span>
              </h3>
              {ledgerTotal > LEDGER_PAGE_SIZE && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={ledgerPage <= 0 || ledgerLoading}
                    onClick={() => {
                      const next = Math.max(0, ledgerPage - 1);
                      setLedgerPage(next);
                      void loadLedgerPage(next);
                    }}
                    className="p-1.5 rounded-lg bg-[#0B0B0F] border border-white/10 text-[#D4D4D8] disabled:opacity-40"
                    aria-label="Previous ledger page"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[11px] text-[#A1A1AA] px-1.5 tabular-nums">
                    {ledgerPage + 1}/{ledgerMaxPage + 1}
                  </span>
                  <button
                    type="button"
                    disabled={ledgerPage >= ledgerMaxPage || ledgerLoading}
                    onClick={() => {
                      const next = Math.min(ledgerMaxPage, ledgerPage + 1);
                      setLedgerPage(next);
                      void loadLedgerPage(next);
                    }}
                    className="p-1.5 rounded-lg bg-[#0B0B0F] border border-white/10 text-[#D4D4D8] disabled:opacity-40"
                    aria-label="Next ledger page"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {ledgerRows.length === 0 ? (
              <p className="text-xs text-[#A1A1AA] py-6 text-center">
                {t.rewards.noLedger}
              </p>
            ) : (
              <div className="divide-y divide-white/10 border border-white/10 rounded-xl bg-[#0B0B0F] max-h-[380px] overflow-y-auto">
                {ledgerRows.map((row) => {
                  const isEarn = row.type === 'earn';
                  return (
                    <div
                      key={row.id}
                      className="p-3 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
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
                            <RelativeTimeText iso={row.createdAt} lang={language} />
                            {typeof row.balanceAfter === 'number'
                              ? ` · Saldo: ${row.balanceAfter.toLocaleString()}`
                              : ''}
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

      {/* Crawlable /rewards Public Guide, Official Rate Table, Supported Channels & FAQ */}
      <RewardsSeoContent
        language={language}
        usdToIdrRate={config.usdToIdrRate}
        pointsPerUsd={config.pointsPerUsd}
        minPayoutIdr={config.minPayoutIdr}
        minPayoutUsd={config.minPayoutUsd}
        minPayoutPointsIdr={config.minPayoutPointsIdr}
        minPayoutPointsUsd={config.minPayoutPointsUsd}
        dailyCheckinPoints={effectiveDailyCheckinPoints}
        watchEpisodePoints={effectiveWatchEpisodePoints}
        watchMinutePoints={effectiveWatchMinutePoints}
        dailyMissionMilestones={effectiveMilestoneConfigs}
        levelTiers={levelTiers}
        referralBonusPoints={config.referralBonusPoints}
        maxDailyEarnPoints={config.maxDailyEarnPoints}
        isSignedIn={Boolean(user)}
        onActionSignIn={() => openAuthModal()}
      />

      {/* Withdrawal Confirmation Modal */}
      {confirmOpen && (
        <div
          className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="withdraw-confirm-title"
          onClick={() => !submittingPayout && setConfirmOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-[#14131A] border border-[#D4AF37]/40 p-5 sm:p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <PaymentMethodLogo
                  method={effectiveMethod}
                  bankCode={
                    effectiveMethod === 'bank_transfer'
                      ? selectedBankCode
                      : undefined
                  }
                  network={activeNetworkLabel}
                  size="md"
                />
                <div>
                  <h3
                    id="withdraw-confirm-title"
                    className="text-base font-extrabold text-white"
                  >
                    {isId ? 'Konfirmasi Penarikan Saldo' : 'Confirm Withdrawal Request'}
                  </h3>
                  <p className="text-xs text-[#A1A1AA]">
                    {getMethodDisplayLabel(
                      effectiveMethod,
                      selectedBankCode,
                      activeNetworkLabel
                    )}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={submittingPayout}
                onClick={() => setConfirmOpen(false)}
                className="p-1.5 rounded-lg text-[#A1A1AA] hover:text-white hover:bg-white/10"
                aria-label="Close confirmation"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-xl bg-[#0B0B0F] border border-white/10 divide-y divide-white/10 text-xs">
              <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
                <span className="text-[#A1A1AA]">
                  {isId ? 'Poin Ditukarkan' : 'Points Debited'}
                </span>
                <span className="font-bold text-white tabular-nums">
                  {parsedPoints.toLocaleString()} {t.rewards.pointsUnit}
                </span>
              </div>
              <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
                <span className="text-[#A1A1AA]">
                  {isId ? 'Estimasi Diterima' : 'Estimated Payout'}
                </span>
                <span className="font-extrabold text-[#D4AF37] tabular-nums">
                  {currencyTab === 'IDR'
                    ? `${formatIdr(estimatedReceiveIdr)} (${formatUsd(estimatedReceiveUsd)})`
                    : `${formatUsd(estimatedReceiveUsd)} (${formatIdr(estimatedReceiveIdr)})`}
                </span>
              </div>
              <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
                <span className="text-[#A1A1AA]">
                  {t.rewards.destinationLabel}
                </span>
                <span className="font-mono font-semibold text-white truncate max-w-[200px]">
                  {destinationInput.trim()}
                </span>
              </div>
              <div className="px-3.5 py-2.5 flex items-center justify-between gap-2">
                <span className="text-[#A1A1AA]">
                  {t.rewards.accountHolderLabel}
                </span>
                <span className="font-semibold text-white truncate max-w-[200px]">
                  {holderNameInput.trim()}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-[#A1A1AA] leading-relaxed">
              {isId
                ? 'Pastikan nomor rekening/e-wallet atau alamat wallet sudah benar. Poin akan langsung ditahan pada ledger saat pengajuan dikirim.'
                : 'Verify your account number or wallet address carefully. Points are immediately held in the ledger upon submission.'}
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                disabled={submittingPayout}
                onClick={() => setConfirmOpen(false)}
                className="px-4 py-2 min-h-[40px] rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-[#D4D4D8]"
              >
                {isId ? 'Periksa Lagi' : 'Review'}
              </button>
              <button
                type="button"
                disabled={submittingPayout}
                onClick={() => void handleConfirmWithdraw()}
                className="px-5 py-2 min-h-[40px] rounded-xl cd-accent-bg text-xs font-extrabold text-white shadow-lg hover:brightness-110 disabled:opacity-60"
              >
                {submittingPayout
                  ? t.rewards.submittingWithdraw
                  : isId
                  ? 'Kirim Penarikan'
                  : 'Confirm & Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
