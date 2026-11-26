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
  Compass,
  Copy,
  Database,
  Flame,
  Gift,
  Globe2,
  Link2,
  Lock,
  MessageCircle,
  Play,
  PlayCircle,
  RefreshCw,
  Search,
  Send,
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
import { getClientDeviceFingerprint, getProductionReferralUrl } from '../config/auth';
import { DEFAULT_SITE_ORIGIN } from '../i18n/helpers';
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
  dailyCheckinDay7Points?: number;
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
  dailyCheckinDay7Points?: number;
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
  firstLoginBonusPoints?: number;
  bindReferralBonusPoints?: number;
  dailySocialSharePoints?: number;
  dailyCheckinPoints: number;
  dailyCheckinDay7Points?: number;
  watchMinutePoints: number;
  dailyMissionMaxWatchSeconds: number;
  dailyMissionMilestones: DailyMissionMilestoneConfig[];
  episodeBonusPoints?: number;
  episodeBonusMinWatchSeconds?: number;
  maxDailyEpisodeBonusCount?: number;
  referralQualifySeconds: number;
  referralBonusPoints: number;
  referralOngoingStepSeconds?: number;
  referralOngoingBonusPoints?: number;
  referralOngoingMaxSteps?: number;
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
  ongoingBonusEarned?: number;
  ongoingStepsAwarded?: number;
  ongoingMaxSteps?: number;
  nextOngoingTargetSeconds?: number | null;
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
  bindReferralBonusPoints?: number;
  referralOngoingStepSeconds?: number;
  referralOngoingBonusPoints?: number;
  referralOngoingMaxSteps?: number;
  hasReferrer?: boolean;
  referredBy?: {
    status: ReferralStatus;
    referralCode: string;
    bindBonusAwarded: boolean;
    createdAt: string;
  } | null;
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
    ongoingBonusEarned?: number;
  };
  referrals: UserReferralItemView[];
}

interface PointsLedgerItem {
  id: string;
  userId: string;
  type: 'earn' | 'redeem';
  points: number;
  description: string;
  eventCode?: string;
  eventMeta?: Record<string, string | number | boolean | null>;
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
  todayEpisodeBonusCount?: number;
  maxDailyEpisodeBonusCount?: number;
  episodeBonusPoints?: number;
  levelInfo?: AccountLevelStatus;
  estimatedUsd: number;
  estimatedIdr: number;
  lastClaimAt: string | null;
  cooldownSecondsRemaining: number;
  dailyCheckinClaimedToday: boolean;
  checkinStreak?: number;
  recentCheckins?: string[];
  dailySocialShareClaimedToday?: boolean;
  dailySocialShareClaimedAt?: string | null;
  dailySocialShareChannel?: string | null;
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
  maxDailyWatchPoints: 5500,
  claimCooldownSeconds: 45,
  firstLoginBonusPoints: 25000,
  bindReferralBonusPoints: 200,
  dailySocialSharePoints: 1000,
  dailyCheckinPoints: 1000,
  dailyCheckinDay7Points: 2000,
  watchMinutePoints: 40,
  dailyMissionMaxWatchSeconds: 3600,
  dailyMissionMilestones: [
    { minutes: 15, bonusPoints: 300 },
    { minutes: 30, bonusPoints: 600 },
    { minutes: 60, bonusPoints: 1200 },
  ],
  episodeBonusPoints: 500,
  episodeBonusMinWatchSeconds: 20,
  maxDailyEpisodeBonusCount: 3,
  referralQualifySeconds: 3600,
  referralBonusPoints: 5000,
  referralOngoingStepSeconds: 3600,
  referralOngoingBonusPoints: 500,
  referralOngoingMaxSteps: 10,
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
      watchMinutePoints: 40,
      dailyCheckinPoints: 1000,
      dailyCheckinDay7Points: 2000,
      dailyMissionMilestones: [
        { minutes: 15, bonusPoints: 300 },
        { minutes: 30, bonusPoints: 600 },
        { minutes: 60, bonusPoints: 1200 },
      ],
    },
    {
      level: 2,
      tierId: 'silver',
      tierName: 'Silver',
      minTotalEarned: 35000,
      minVerifiedWatchSeconds: 7200,
      multiplier: 1.2,
      bonusPercent: 20,
      watchMinutePoints: 48,
      dailyCheckinPoints: 1200,
      dailyCheckinDay7Points: 2400,
      dailyMissionMilestones: [
        { minutes: 15, bonusPoints: 360 },
        { minutes: 30, bonusPoints: 720 },
        { minutes: 60, bonusPoints: 1440 },
      ],
    },
    {
      level: 3,
      tierId: 'gold',
      tierName: 'Gold',
      minTotalEarned: 80000,
      minVerifiedWatchSeconds: 36000,
      multiplier: 1.4,
      bonusPercent: 40,
      watchMinutePoints: 56,
      dailyCheckinPoints: 1400,
      dailyCheckinDay7Points: 2800,
      dailyMissionMilestones: [
        { minutes: 15, bonusPoints: 420 },
        { minutes: 30, bonusPoints: 840 },
        { minutes: 60, bonusPoints: 1680 },
      ],
    },
    {
      level: 4,
      tierId: 'platinum',
      tierName: 'Platinum',
      minTotalEarned: 160000,
      minVerifiedWatchSeconds: 108000,
      multiplier: 1.6,
      bonusPercent: 60,
      watchMinutePoints: 64,
      dailyCheckinPoints: 1600,
      dailyCheckinDay7Points: 3200,
      dailyMissionMilestones: [
        { minutes: 15, bonusPoints: 480 },
        { minutes: 30, bonusPoints: 960 },
        { minutes: 60, bonusPoints: 1920 },
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
  if (lang === 'id') {
    if (diffSec < 15) return 'baru saja';
    if (diffSec < 60) return `${diffSec} dtk lalu`;
    const mins = Math.floor(diffSec / 60);
    if (mins < 60) return `${mins} mnt lalu`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} jam lalu`;
    return `${Math.floor(hrs / 24)} hr lalu`;
  }
  if (lang === 'cn') {
    if (diffSec < 15) return '刚刚';
    if (diffSec < 60) return `${diffSec}秒前`;
    const mins = Math.floor(diffSec / 60);
    if (mins < 60) return `${mins}分钟前`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}小时前`;
    return `${Math.floor(hrs / 24)}天前`;
  }
  if (lang === 'vi') {
    if (diffSec < 15) return 'vừa xong';
    if (diffSec < 60) return `${diffSec} giây trước`;
    const mins = Math.floor(diffSec / 60);
    if (mins < 60) return `${mins} phút trước`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} giờ trước`;
    return `${Math.floor(hrs / 24)} ngày trước`;
  }
  if (diffSec < 15) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatLedgerDescription(
  row: PointsLedgerItem,
  rewardsDict: {
    ledgerWelcomeBonus: string;
    ledgerDailyCheckin: string;
    ledgerWatchMinute: string;
    ledgerWatchMilestone: string;
    ledgerWatchEpisode: string;
    ledgerReferralBind: string;
    ledgerReferralQualify: string;
    ledgerReferralOngoing?: string;
    ledgerDailySocialShare: string;
    ledgerPayoutRequest: string;
    ledgerPayoutRefund: string;
    ledgerPayoutFailed: string;
    ledgerPayoutRejected: string;
  }
): string {
  const ref = String(row.referenceId || '');
  const desc = String(row.description || '');
  let code = String(row.eventCode || '').trim();
  const meta: Record<string, string | number | boolean | null> = {
    ...(row.eventMeta || {}),
  };

  if (!code) {
    if (ref.startsWith('welcome_login:')) {
      code = 'welcome_login';
    } else if (ref.startsWith('checkin:')) {
      code = 'daily_checkin';
    } else if (ref.startsWith('social_share:')) {
      code = 'daily_social_share';
    } else if (ref.startsWith('watch_min:')) {
      code = 'watch_minute';
    } else if (ref.startsWith('mission_')) {
      code = 'watch_milestone';
    } else if (ref.startsWith('watch:')) {
      code = 'watch_episode';
    } else if (ref.startsWith('referral:bind:')) {
      code = 'referral_bind';
    } else if (ref.startsWith('referral:ongoing:')) {
      code = 'referral_ongoing';
    } else if (ref.startsWith('referral:')) {
      code = 'referral_qualify';
    } else if (ref.startsWith('payout:')) {
      code = 'payout_request';
    } else if (ref.startsWith('refund:payout:')) {
      code = 'payout_refund';
    }
  }

  const level = Number(meta.level) || 0;
  const tierName = typeof meta.tierName === 'string' ? meta.tierName : '';
  const multiplier = Number(meta.multiplier) || 1;
  const levelSuffix =
    level > 1 && tierName && multiplier > 1 ? ` · ${tierName} ${multiplier}x` : '';

  switch (code) {
    case 'welcome_login':
      return rewardsDict.ledgerWelcomeBonus;
    case 'daily_checkin': {
      const dayMatch = /Hari ke-(\d+)/i.exec(desc);
      const streakDay = Number(meta.streakDay) || Number(dayMatch?.[1]) || 1;
      return `${rewardsDict.ledgerDailyCheckin.replace('{day}', String(streakDay))}${levelSuffix}`;
    }
    case 'watch_minute': {
      const minMatch = /Menit\s+(\d+)\s*\/\s*(\d+)/i.exec(desc) || /:m(\d+)$/.exec(ref);
      const minute = Number(meta.minute) || Number(minMatch?.[1]) || 1;
      const maxMinutes = Number(meta.maxMinutes) || (minMatch && minMatch[2] ? Number(minMatch[2]) : 60);
      return `${rewardsDict.ledgerWatchMinute
        .replace('{minute}', String(minute))
        .replace('{max}', String(maxMinutes))}${levelSuffix}`;
    }
    case 'watch_milestone': {
      const msMatch = /(\d+)\s*Menit/i.exec(desc) || /^mission_(\d+)m:/.exec(ref);
      const milestoneMinutes = Number(meta.milestoneMinutes) || Number(msMatch?.[1]) || 15;
      return `${rewardsDict.ledgerWatchMilestone.replace('{minutes}', String(milestoneMinutes))}${levelSuffix}`;
    }
    case 'watch_episode': {
      const epNum = Number(meta.episodeNumber) || Number(desc.match(/\bEp\s*(\d+)/i)?.[1]) || 0;
      const title = typeof meta.title === 'string' ? meta.title : '';
      const provider = typeof meta.provider === 'string' ? meta.provider : '';
      const subject = title && epNum
        ? `: ${title} Ep ${epNum}`
        : provider && epNum
        ? ` (${provider} Ep ${epNum})`
        : epNum
        ? ` (Ep ${epNum})`
        : '';
      return `${rewardsDict.ledgerWatchEpisode}${subject}${levelSuffix}`;
    }
    case 'referral_bind': {
      const refCode =
        (typeof meta.referralCode === 'string' && meta.referralCode) ||
        /\((KD[A-F0-9]+)\)/i.exec(desc)?.[1] ||
        '';
      return refCode
        ? `${rewardsDict.ledgerReferralBind} (${refCode})`
        : rewardsDict.ledgerReferralBind;
    }
    case 'referral_qualify':
      return rewardsDict.ledgerReferralQualify;
    case 'referral_ongoing': {
      const stepMatch = /:s(\d+)$/.exec(ref) || /Tahap\s*(\d+)/i.exec(desc);
      const step = Number(meta.ongoingStep) || Number(stepMatch?.[1]) || 1;
      const maxSteps = Number(meta.totalStepsMax) || 10;
      const tpl =
        rewardsDict.ledgerReferralOngoing ||
        'Ongoing Referral Watch Bonus (Step {step}/{max})';
      return tpl.replace('{step}', String(step)).replace('{max}', String(maxSteps));
    }
    case 'daily_social_share': {
      const channelRaw =
        (typeof meta.shareChannel === 'string' && meta.shareChannel.toLowerCase()) || '';
      const channelNameMap: Record<string, string> = {
        whatsapp: 'WhatsApp',
        telegram: 'Telegram',
        x: 'X',
        twitter: 'X',
        facebook: 'Facebook',
        copy_link: 'Copy Link',
        native_share: 'Share',
      };
      const channelLabel =
        channelNameMap[channelRaw] ||
        /\(([^)]+)\)/.exec(desc)?.[1] ||
        'Social';
      return rewardsDict.ledgerDailySocialShare.replace('{channel}', channelLabel);
    }
    case 'payout_request': {
      const match = /^Penarikan\s+(.+?)\s+\(([A-Z]+)\)$/.exec(desc);
      const methodLabel =
        (typeof meta.methodLabel === 'string' && meta.methodLabel) || match?.[1] || '';
      const currency =
        (typeof meta.currency === 'string' && meta.currency) || match?.[2] || '';
      const base = rewardsDict.ledgerPayoutRequest.replace('{method}', methodLabel).trim();
      return currency ? `${base} (${currency})` : base;
    }
    case 'payout_refund': {
      const payoutStatus =
        meta.payoutStatus === 'failed' || /Penarikan Gagal/i.test(desc)
          ? 'failed'
          : 'rejected';
      const statusText =
        payoutStatus === 'failed'
          ? rewardsDict.ledgerPayoutFailed
          : rewardsDict.ledgerPayoutRejected;
      const pid =
        (typeof meta.payoutId === 'string' && meta.payoutId) ||
        /#([a-z0-9-]+)/i.exec(desc)?.[1] ||
        ref.replace('refund:payout:', '').slice(0, 8);
      return `${rewardsDict.ledgerPayoutRefund} (${statusText})${pid ? ` #${pid}` : ''}`;
    }
    default:
      return desc;
  }
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

async function copyTextWithFallback(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to execCommand textarea fallback
  }
  try {
    if (typeof document === 'undefined') return false;
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const copied = document.execCommand('copy');
    document.body.removeChild(ta);
    return copied;
  } catch {
    return false;
  }
}

export const RewardsPayoutSection: React.FC = () => {
  const {
    t,
    language,
    user,
    authLoading,
    pointsDbConnected,
    pointsDbError,
    openAuthModal,
    openBlockedAccountPopup,
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
  const [claimingSocialShare, setClaimingSocialShare] = useState<string | null>(null);
  const [shareFeedback, setShareFeedback] = useState<{
    type: 'error' | 'success';
    message: string;
  } | null>(null);
  const pendingSocialShareRef = useRef<boolean>(false);

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
  useEffect(() => {
    setCurrencyTab(isId ? 'IDR' : 'USD');
    setBankDropdownOpen(false);
  }, [isId]);
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
  const [showCheckinDetails, setShowCheckinDetails] = useState(false);
  const [showReferralDetails, setShowReferralDetails] = useState(false);

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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncAfterExternalShare = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (!pendingSocialShareRef.current) return;
      pendingSocialShareRef.current = false;
      void loadPointsData();
      void refreshPointsBalance();
    };
    window.addEventListener('focus', syncAfterExternalShare);
    document.addEventListener('visibilitychange', syncAfterExternalShare);
    return () => {
      window.removeEventListener('focus', syncAfterExternalShare);
      document.removeEventListener('visibilitychange', syncAfterExternalShare);
    };
  }, [loadPointsData, refreshPointsBalance]);

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
          awardedEpisodePoints?: number;
          referralOngoingBonusAwarded?: number;
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
          detail.awardedWatchPoints > 0) ||
        (typeof detail?.awardedEpisodePoints === 'number' &&
          detail.awardedEpisodePoints > 0) ||
        (typeof detail?.referralOngoingBonusAwarded === 'number' &&
          detail.referralOngoingBonusAwarded > 0)
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
        reason?: string;
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
      if (res.status === 403 || data.reason === 'anti_cheat_blocked') {
        openBlockedAccountPopup({ reason: data.error, source: 'claim' });
        setFormFeedback({
          type: 'error',
          message: data.error || 'Account restricted by 1-device protection.',
        });
        return;
      }
      if (res.ok && data.ok) {
        const awarded = Number(data.awardedPoints) || effectiveDailyCheckinPoints;
        const bonusNote =
          data.streakBonus && data.streakBonus > 0
            ? isId
              ? `Termasuk bonus streak +${data.streakBonus.toLocaleString()}`
              : `Includes +${data.streakBonus.toLocaleString()} streak bonus`
            : isId
            ? 'Check-in harian berhasil diklaim'
            : 'Daily check-in reward claimed';
        pushToast(
          `+${awarded.toLocaleString()} ${t.rewards.pointsUnit}`,
          'gold',
          {
            variant: 'points',
            points: awarded,
            balance:
              typeof data.summary?.balance === 'number'
                ? data.summary.balance
                : null,
            title: isId ? 'Check-in Harian Masuk' : 'Daily Check-In Credited',
            subtitle: bonusNote,
            durationMs: 4200,
          }
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
        reason?: string;
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
      if (res.status === 403 || data.reason === 'anti_cheat_blocked') {
        openBlockedAccountPopup({ reason: data.error, source: 'claim' });
        setFormFeedback({
          type: 'error',
          message: data.error || 'Account restricted by 1-device protection.',
        });
        return;
      }
      if (res.ok && data.ok) {
        const awarded = Number(data.awardedPoints) || 0;
        pushToast(
          `+${awarded.toLocaleString()} ${t.rewards.pointsUnit} (${milestoneMinutes} ${t.rewards.milestoneMinSuffix})!`,
          'gold',
          {
            variant: 'points',
            points: awarded,
            balance:
              typeof data.summary?.balance === 'number'
                ? data.summary.balance
                : null,
            title: isId ? 'Bonus Milestone Nonton' : 'Watch Milestone Bonus',
            category: `${milestoneMinutes} ${t.rewards.milestoneMinSuffix}`,
            subtitle: isId
              ? 'Target menonton aktif tercapai'
              : 'Active watch milestone completed',
            durationMs: 4200,
          }
        );
        if (typeof window !== 'undefined' && awarded > 0) {
          window.dispatchEvent(
            new CustomEvent('kd:points-updated', {
              detail: {
                source: 'watch_milestone',
                awardedMilestonePoints: awarded,
                summary: data.summary,
              },
            })
          );
        }
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

  const handleClaimDailySocialShare = async (
    channel: 'whatsapp' | 'telegram' | 'x' | 'facebook' | 'copy_link' | 'native_share'
  ) => {
    if (!user) {
      openAuthModal();
      return;
    }
    setShareFeedback(null);
    const shareTargetUrl = referralShareUrl || DEFAULT_SITE_ORIGIN;

    if (channel === 'copy_link') {
      await copyTextWithFallback(shareTargetUrl);
    } else if (
      channel === 'native_share' &&
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function'
    ) {
      try {
        await navigator.share({
          title: isId ? 'Nonton Drama Gratis di KanoDrama' : 'Watch Asian Dramas on KanoDrama',
          text: isId
            ? 'Nonton drama China & short drama sub Indo HD di KanoDrama!'
            : 'Stream Asian & short dramas in HD on KanoDrama!',
          url: shareTargetUrl,
        });
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        // Ignore non-abort share sheet errors and allow fallback
      }
    }

    if (summary?.dailySocialShareClaimedToday) {
      if (channel === 'copy_link') {
        pushToast(t.rewards.referralCopied, 'gold');
      } else {
        setShareFeedback({
          type: 'success',
          message: isId
            ? 'Tugas share media sosial hari ini sudah diklaim.'
            : 'Daily social share reward already claimed today.',
        });
      }
      return;
    }

    if (claimingSocialShare !== null) return;

    if (!dbAvailable) {
      const offlineMsg =
        dbErrorMsg ||
        (isId
          ? 'Server reward belum terhubung. Muat ulang halaman atau coba lagi sebentar.'
          : 'Rewards database is currently unavailable. Please try again shortly.');
      setShareFeedback({ type: 'error', message: offlineMsg });
      pushToast(offlineMsg, 'error');
      return;
    }

    if (channel !== 'copy_link' && channel !== 'native_share') {
      pendingSocialShareRef.current = true;
    }

    setClaimingSocialShare(channel);
    setFormFeedback(null);
    try {
      const res = await fetch('/api/points/claim', {
        method: 'POST',
        credentials: 'include',
        keepalive: true,
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          action: 'daily_social_share',
          channel,
          lang: language,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        reason?: string;
        awardedPoints?: number;
        error?: string;
        summary?: UserPointsSummary;
      };
      if (res.status === 503) {
        setDbAvailable(false);
        const msg = data.error || 'Database PostgreSQL belum terhubung.';
        setDbErrorMsg(msg);
        setShareFeedback({ type: 'error', message: msg });
        pushToast(msg, 'error');
        return;
      }
      if (data.summary) {
        setSummary(data.summary);
        setLedgerRows(data.summary.ledger || []);
        setLedgerTotal(Number(data.summary.ledgerTotal ?? (data.summary.ledger || []).length));
      }
      if (res.ok && data.ok) {
        pendingSocialShareRef.current = false;
        const awarded = Number(data.awardedPoints) || config.dailySocialSharePoints || 1000;
        const channelLabelMap: Record<string, string> = {
          whatsapp: 'WhatsApp',
          telegram: 'Telegram',
          x: 'X',
          facebook: 'Facebook',
          copy_link: 'Copy Link',
          native_share: 'Share',
        };
        const successMsg = `+${awarded.toLocaleString()} ${t.rewards.pointsUnit} · ${t.rewards.dailyShareSuccess.replace(
          '{channel}',
          channelLabelMap[channel] || channel
        )}`;
        setShareFeedback({ type: 'success', message: successMsg });
        pushToast(successMsg, 'gold', {
          variant: 'points',
          points: awarded,
          balance:
            typeof data.summary?.balance === 'number'
              ? data.summary.balance
              : null,
          title: isId ? 'Bonus Share Harian' : 'Daily Share Reward',
          category: channelLabelMap[channel] || channel,
          subtitle: isId
            ? 'Tugas share media sosial selesai'
            : 'Daily social share mission completed',
          durationMs: 4200,
        });
        void refreshPointsBalance();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('kd:points-updated', {
              detail: {
                source: 'daily_social_share',
                summary: data.summary,
                pointsBalance: data.summary?.balance ?? null,
              },
            })
          );
        }
      } else if (res.status === 403 || data.reason === 'anti_cheat_blocked') {
        pendingSocialShareRef.current = false;
        const errMsg =
          data.error ||
          (isId
            ? 'Akun ini dibatasi karena 1 perangkat hanya dapat dipakai untuk 1 akun utama.'
            : 'Account restricted by 1-device primary account policy.');
        setShareFeedback({ type: 'error', message: errMsg });
        openBlockedAccountPopup({ reason: errMsg, source: 'share' });
      } else if (res.status === 409 || data.reason === 'duplicate_claim') {
        pendingSocialShareRef.current = false;
        const dupMsg =
          data.error ||
          (isId
            ? 'Tugas share media sosial hari ini sudah diklaim.'
            : 'Daily social share reward has already been claimed today.');
        setShareFeedback({ type: 'success', message: dupMsg });
        pushToast(dupMsg, 'neutral');
        void refreshPointsBalance();
      } else {
        pendingSocialShareRef.current = false;
        const errMsg =
          data.error ||
          (isId
            ? 'Gagal mengklaim bonus share media sosial harian.'
            : 'Unable to claim daily social share reward.');
        setShareFeedback({ type: 'error', message: errMsg });
        pushToast(errMsg, 'error');
      }
    } catch {
      const netMsg = isId
        ? 'Gagal terhubung ke server saat klaim tugas share. Kembali ke tab ini atau coba Salin Link.'
        : 'Network error while claiming daily social share reward. Please retry or use Copy Link.';
      setShareFeedback({ type: 'error', message: netMsg });
      pushToast(netMsg, 'error');
    } finally {
      setClaimingSocialShare(null);
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
        body: JSON.stringify({
          referralCode: bindCodeInput.trim().toUpperCase(),
          deviceFingerprint: getClientDeviceFingerprint(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        bound?: boolean;
        bindBonusAwarded?: number;
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
        const bindBonus = Math.max(0, Number(data.bindBonusAwarded) || 0);
        setBindFeedback({
          type: 'success',
          message: isId
            ? `Bind referral berhasil!${bindBonus > 0 ? ` Bonus Bind Referral +${bindBonus.toLocaleString()} poin langsung masuk.` : ''} Tonton aktif 60 menit untuk membuka Bonus Referral +${(referralSummary?.referralBonusPoints ?? config.referralBonusPoints).toLocaleString()} poin bagi pengundang.`
            : `Referral bound!${bindBonus > 0 ? ` +${bindBonus.toLocaleString()} pts Bind Referral bonus credited.` : ''} Complete 60m verified watch time to unlock the +${(referralSummary?.referralBonusPoints ?? config.referralBonusPoints).toLocaleString()} pts Referral reward for your inviter.`,
        });
        if (bindBonus > 0) {
          pushToast(`+${bindBonus.toLocaleString()} ${t.rewards.pointsUnit}`, 'gold', {
            variant: 'points',
            points: bindBonus,
            title: isId ? 'Bonus Bind Referral' : 'Referral Bind Bonus',
            subtitle: isId
              ? 'Kode undangan berhasil ditautkan'
              : 'Referral code linked successfully',
            durationMs: 4200,
          });
          void refreshPointsBalance();
        }
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
          account_not_new: isId
            ? 'Bind kode referral hanya tersedia untuk akun baru yang belum memiliki riwayat referral.'
            : 'Referral binding is only available for newly registered accounts.',
          fraud_signal_match: isId
            ? 'Validasi anti-cheat mendeteksi aktivitas mencurigakan pada akun/jaringan ini.'
            : 'Anti-cheat validation blocked this referral binding.',
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
      watchMinutePoints: config.watchMinutePoints || 40,
      dailyCheckinPoints: config.dailyCheckinPoints || 1000,
      dailyCheckinDay7Points: config.dailyCheckinDay7Points || 2000,
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
      dailyCheckinDay7Points: baseTier.dailyCheckinDay7Points,
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

  const effectiveFirstLoginBonusPoints = Math.max(0, config.firstLoginBonusPoints ?? 25000);
  const effectiveWatchMinutePoints = activeLevelInfo.watchMinutePoints || config.watchMinutePoints || 40;
  const effectiveDailyCheckinPoints = activeLevelInfo.dailyCheckinPoints || config.dailyCheckinPoints || 1000;
  const effectiveDailyCheckinDay7Points =
    activeLevelInfo.dailyCheckinDay7Points ||
    config.dailyCheckinDay7Points ||
    Math.round(effectiveDailyCheckinPoints * 2);
  const effectiveEpisodeBonusPoints = Math.max(
    0,
    summary?.episodeBonusPoints ?? config.episodeBonusPoints ?? 500
  );
  const effectiveMaxDailyEpisodes = Math.max(
    1,
    summary?.maxDailyEpisodeBonusCount ?? config.maxDailyEpisodeBonusCount ?? 3
  );
  const todayEpisodeBonusCount = Math.max(0, summary?.todayEpisodeBonusCount ?? 0);
  const ongoingStepMinutes = Math.max(
    1,
    Math.round(
      (referralSummary?.referralOngoingStepSeconds ??
        config.referralOngoingStepSeconds ??
        3600) / 60
    )
  );
  const ongoingBonusPerStep = Math.max(
    0,
    referralSummary?.referralOngoingBonusPoints ?? config.referralOngoingBonusPoints ?? 500
  );
  const ongoingMaxSteps = Math.max(
    1,
    referralSummary?.referralOngoingMaxSteps ?? config.referralOngoingMaxSteps ?? 10
  );
  const ongoingMaxTotalPoints = ongoingBonusPerStep * ongoingMaxSteps;

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
    config.maxDailyWatchPoints || 5500
  );
  const maxWatchMissionPoints = Math.min(dailyWatchCap, rawLevelWatchMax);
  const oneUsdtPoints = Math.max(1000, config.pointsPerUsd || 100000);

  const checkinStreak = summary?.checkinStreak ?? 0;
  const cycleDayProgress =
    checkinStreak > 0 ? ((checkinStreak - 1) % 7) + 1 : 0;
  const activeCheckinDay = summary?.dailyCheckinClaimedToday
    ? Math.max(1, cycleDayProgress)
    : Math.min(7, cycleDayProgress + 1);
  const todayCheckinRewardPoints =
    activeCheckinDay === 7
      ? effectiveDailyCheckinDay7Points
      : effectiveDailyCheckinPoints;
  const weeklyCheckinMaxPoints =
    effectiveDailyCheckinPoints * 6 + effectiveDailyCheckinDay7Points;

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
      {/* Database Disconnected Alert */}
      {!dbAvailable && (
        <div
          role="alert"
          className="rounded-2xl bg-rose-950/30 border border-rose-500/35 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="flex items-start gap-3">
            <Database className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-xs sm:text-sm font-bold text-rose-200">
                {isId ? 'Koneksi Database Belum Aktif' : 'Database Not Connected'}
              </p>
              <p className="text-xs text-rose-200/80 leading-relaxed">
                {dbErrorMsg ||
                  (isId
                    ? 'Saldo poin dan penarikan membutuhkan koneksi PostgreSQL aktif pada server.'
                    : 'Points and withdrawals require an active PostgreSQL connection on the server.')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadPointsData()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-500/15 border border-rose-400/35 text-xs font-bold text-rose-100 hover:bg-rose-500/25 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>{isId ? 'Coba Lagi' : 'Retry'}</span>
          </button>
        </div>
      )}

      {/* 1. Coin Balance Hero Card */}
      <section className="rounded-2xl border border-white/10 bg-gradient-to-b from-[#17141D] to-[#121117] p-5 sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-3 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs sm:text-sm font-semibold text-[#D4D4D8]">
                {t.rewards.balanceTitle}
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[11px] font-semibold tabular-nums ${tierMeta.badgeClass}`}
              >
                <Star className="w-3 h-3" />
                <span>
                  {activeLevelInfo.tierName} · {activeLevelInfo.multiplier.toFixed(1)}x
                </span>
              </span>
              {user && (
                <button
                  type="button"
                  onClick={() => void loadPointsData()}
                  disabled={loading}
                  aria-label="Refresh points data"
                  className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-[#A1A1AA] hover:text-white transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                </button>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center gap-2.5">
                <GoldCoinIcon className="w-8 h-8 sm:w-9 sm:h-9 shrink-0" />
                {authLoading && !user ? (
                  <span className="inline-block w-32 h-10 sm:h-11 rounded-xl skeleton-espresso" />
                ) : (
                  <span className="text-3xl sm:text-5xl font-extrabold text-white tabular-nums tracking-tight leading-none">
                    {user ? (summary?.balance ?? 0).toLocaleString() : '0'}
                  </span>
                )}
                <span className="text-sm sm:text-base font-medium text-[#A1A1AA] self-end pb-0.5">
                  {t.rewards.pointsUnit}
                </span>
              </div>

              <p className="text-xs text-[#A1A1AA] tabular-nums">
                {authLoading && !user ? (
                  <span className="inline-block w-52 h-3.5 rounded skeleton-espresso align-middle" />
                ) : user ? (
                  isId ? (
                    <>
                      {t.rewards.estimatedValue}:{' '}
                      <strong className="text-white font-semibold">
                        {formatUsd(summary?.estimatedUsd ?? 0)}
                      </strong>{' '}
                      ·{' '}
                      <strong className="text-emerald-300 font-semibold">
                        {formatIdr(summary?.estimatedIdr ?? 0)}
                      </strong>
                    </>
                  ) : (
                    <>
                      {t.rewards.estimatedValue}:{' '}
                      <strong className="text-emerald-300 font-semibold">
                        {(summary?.estimatedUsd ?? 0).toFixed(2)} USDT
                      </strong>
                    </>
                  )
                ) : isId ? (
                  <>
                    {oneUsdtPoints.toLocaleString()} {t.rewards.pointsUnit} = 1 USDT ({formatIdr(config.usdToIdrRate)}) · Min tarik{' '}
                    {formatIdr(config.minPayoutIdr)}
                  </>
                ) : (
                  <>
                    {oneUsdtPoints.toLocaleString()} {t.rewards.pointsUnit} = 1 USDT · Min payout{' '}
                    {config.minPayoutUsd.toFixed(2)} USDT
                  </>
                )}
              </p>
            </div>

            {!user && !authLoading && (
              <div className="pt-1 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => openAuthModal()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#E11D48] hover:bg-[#F43F5E] text-xs sm:text-sm font-bold text-white transition-colors"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>{t.auth.continueBtn}</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
                <span className="text-xs font-medium text-[#FDE68A] tabular-nums">
                  {isId
                    ? `Langsung dapat +${effectiveFirstLoginBonusPoints.toLocaleString()} poin saat masuk pertama kali`
                    : `Get +${effectiveFirstLoginBonusPoints.toLocaleString()} pts on first sign-in`}
                </span>
              </div>
            )}
          </div>

          <div className="hidden sm:flex items-center justify-center shrink-0 opacity-90">
            <GiftBoxHeroIllustration />
          </div>
        </div>

        {/* Compact Level Progress + Collapsible Details */}
        <div className="mt-4 pt-4 border-t border-white/10 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-[#E4E4E7]">
                {activeLevelInfo.nextTier
                  ? isId
                    ? `Menuju ${activeLevelInfo.nextTier.tierName} (${activeLevelInfo.nextTier.multiplier.toFixed(1)}x)`
                    : `Next: ${activeLevelInfo.nextTier.tierName} (${activeLevelInfo.nextTier.multiplier.toFixed(1)}x)`
                  : isId
                  ? 'Level tertinggi (Platinum 1.6x)'
                  : 'Top tier reached (Platinum 1.6x)'}
              </span>
              <span className="text-[#A1A1AA] tabular-nums">
                {activeLevelInfo.progressPct}%
              </span>
            </div>

            <button
              type="button"
              onClick={() => setShowLevelTiers((prev) => !prev)}
              aria-expanded={showLevelTiers}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-[#A1A1AA] hover:text-white transition-colors"
            >
              <span>
                {showLevelTiers
                  ? isId
                    ? 'Tutup detail'
                    : 'Hide details'
                  : isId
                  ? 'Detail level & ringkasan'
                  : 'Level & summary'}
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform ${
                  showLevelTiers ? 'rotate-180' : ''
                }`}
              />
            </button>
          </div>

          <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${tierMeta.barClass} transition-[width] duration-500 ease-out`}
              style={{
                width: `${Math.max(activeLevelInfo.progressPct > 0 ? 4 : 0, activeLevelInfo.progressPct)}%`,
              }}
            />
          </div>

          {showLevelTiers && (
            <div className="space-y-3 pt-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#A1A1AA]">
                <span className="tabular-nums">
                  {isId
                    ? `Tarif aktif: +${effectiveWatchMinutePoints} poin/mnt · +${effectiveDailyCheckinPoints.toLocaleString()} check-in`
                    : `Active rate: +${effectiveWatchMinutePoints} pts/min · +${effectiveDailyCheckinPoints.toLocaleString()} check-in`}
                </span>
                {activeLevelInfo.nextTier && (
                  <span className="tabular-nums">
                    {isId
                      ? `Butuh ${activeLevelInfo.nextTier.remainingPoints.toLocaleString()} poin atau ${Math.ceil(activeLevelInfo.nextTier.remainingWatchSeconds / 60).toLocaleString()} mnt lagi`
                      : `${activeLevelInfo.nextTier.remainingPoints.toLocaleString()} pts or ${Math.ceil(activeLevelInfo.nextTier.remainingWatchSeconds / 60).toLocaleString()}m left`}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                {levelTiers.map((tier) => {
                  const isCurrent = tier.tierId === activeLevelInfo.tierId;
                  const isUnlocked = tier.level <= activeLevelInfo.level;
                  const reqHours = Math.round(tier.minVerifiedWatchSeconds / 3600);
                  return (
                    <div
                      key={tier.tierId}
                      className={`rounded-xl p-3 border text-xs space-y-1 transition-colors ${
                        isCurrent
                          ? 'bg-white/10 border-amber-400/50 text-white'
                          : isUnlocked
                          ? 'bg-emerald-500/10 border-emerald-500/25 text-[#E4E4E7]'
                          : 'bg-[#0B0B0F] border-white/10 text-[#A1A1AA]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-white">
                          Lv.{tier.level} {tier.tierName}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums ${
                            isCurrent
                              ? 'bg-amber-400 text-[#09090B]'
                              : 'bg-white/10 text-[#FDE68A]'
                          }`}
                        >
                          {tier.multiplier.toFixed(1)}x
                        </span>
                      </div>
                      <p className="text-[11px] tabular-nums">
                        +{tier.watchMinutePoints} {isId ? 'poin/mnt' : 'pts/min'} · +{tier.dailyCheckinPoints.toLocaleString()}{' '}
                        check-in
                      </p>
                      <p className="text-[10px] text-[#A1A1AA] tabular-nums">
                        {tier.minTotalEarned === 0
                          ? isId
                            ? 'Level awal'
                            : 'Starter tier'
                          : isId
                          ? `${tier.minTotalEarned.toLocaleString()} poin / ${reqHours} jam`
                          : `${tier.minTotalEarned.toLocaleString()} pts / ${reqHours}h watch`}
                      </p>
                    </div>
                  );
                })}
              </div>

              {user && (
                <div className="pt-3 border-t border-white/10 grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <p className="text-[11px] text-[#A1A1AA]">
                      {isId ? 'Total Terkumpul' : 'Total Earned'}
                    </p>
                    <p className="font-bold text-emerald-300 tabular-nums mt-0.5">
                      +{(summary?.totalEarned ?? 0).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-[#A1A1AA]">
                      {isId ? 'Sedang Diproses' : 'Held Pending'}
                    </p>
                    <p className="font-bold text-amber-300 tabular-nums mt-0.5">
                      {(summary?.totalHeld ?? 0).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-[#A1A1AA]">
                      {isId ? 'Batas Hari Ini' : 'Daily Limit'}
                    </p>
                    <p className="font-bold text-white tabular-nums mt-0.5">
                      {(summary?.todayEarned ?? 0).toLocaleString()} /{' '}
                      {(summary?.maxDailyEarnPoints ?? config.maxDailyEarnPoints).toLocaleString()}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* 2. Daily Check-in Card */}
      <section className="rounded-2xl bg-[#121117] border border-white/10 p-4 sm:p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-0.5">
            <p className="text-xs font-medium text-[#A1A1AA]">
              {isId ? 'Check-in harian' : 'Daily check-in'}
            </p>
            <h2 className="text-lg sm:text-xl font-extrabold text-white tracking-tight tabular-nums">
              {isId ? `Streak ${checkinStreak} hari` : `${checkinStreak}-day streak`}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-full border border-white/10 bg-[#181620] text-[11px]">
              <ResetCountdown lang={language} nextResetAt={summary?.nextResetAt} />
            </span>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1C1A24] border border-white/10 text-xs sm:text-sm font-bold text-white tabular-nums">
              <Flame className="w-3.5 h-3.5 text-[#FB7185]" />
              <span>{checkinStreak}</span>
            </div>
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
                ? effectiveDailyCheckinDay7Points
                : effectiveDailyCheckinPoints;
            const coinLevel: 1 | 2 | 3 | 4 =
              dayNum <= 2 ? 1 : dayNum <= 4 ? 2 : dayNum <= 6 ? 3 : 4;

            return (
              <div
                key={dayNum}
                title={
                  dayNum === 7
                    ? isId
                      ? `Hari ke-7: +${dayPoints.toLocaleString()} poin`
                      : `Day 7: +${dayPoints.toLocaleString()} pts`
                    : `${isId ? 'Hari' : 'Day'} ${dayNum}: +${dayPoints.toLocaleString()}`
                }
                className={`relative rounded-xl py-2.5 px-1 sm:px-2 flex flex-col items-center justify-between gap-1.5 border transition-colors ${
                  isActiveDay
                    ? 'bg-[#E11D48]/90 border-rose-300/60 text-white'
                    : isPastCompleted
                    ? 'bg-[#171A21] border-emerald-500/35 text-white'
                    : 'bg-[#181620] border-white/10 text-[#D4D4D8]'
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
                  className={`text-[11px] sm:text-xs font-bold tabular-nums ${
                    isActiveDay
                      ? 'text-white'
                      : isPastCompleted
                      ? 'text-emerald-300'
                      : 'text-[#FDE68A]'
                  }`}
                >
                  +{dayPoints.toLocaleString()}
                </span>

                {isPastCompleted && !isActiveDay && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-emerald-500 text-[#09090B] flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 stroke-[3]" />
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Check-In CTA */}
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
          className={`w-full py-3 px-5 rounded-full text-sm font-bold flex items-center justify-center gap-2 transition-colors ${
            summary?.dailyCheckinClaimedToday
              ? 'bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 cursor-default'
              : 'bg-[#E11D48] hover:bg-[#F43F5E] text-white disabled:opacity-55 disabled:cursor-not-allowed'
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
          ) : authLoading && !user ? (
            <span className="inline-block w-36 h-4 rounded skeleton-espresso" />
          ) : !user ? (
            <>
              <Play className="w-4 h-4 fill-current shrink-0" />
              <span>
                {isId
                  ? `Masuk & Check-in (+${todayCheckinRewardPoints.toLocaleString()} poin)`
                  : `Sign in to Check In (+${todayCheckinRewardPoints.toLocaleString()} pts)`}
              </span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-current shrink-0" />
              <span>
                {claimingCheckin
                  ? '...'
                  : `${t.rewards.dailyCheckinBtn.replace(/\(\+[^)]+\)/, '').trim()} (+${todayCheckinRewardPoints.toLocaleString()} ${t.rewards.pointsUnit})`}
              </span>
            </>
          )}
        </button>

        {/* Compact Weekly Footer + Collapsible Verification Info */}
        <div className="pt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-[#A1A1AA]">
          <span className="tabular-nums">
            {isId
              ? `H-1–H-6 +${effectiveDailyCheckinPoints.toLocaleString()} · H-7 +${effectiveDailyCheckinDay7Points.toLocaleString()} (maks ${weeklyCheckinMaxPoints.toLocaleString()}/minggu)`
              : `Days 1–6 +${effectiveDailyCheckinPoints.toLocaleString()} · Day 7 +${effectiveDailyCheckinDay7Points.toLocaleString()} (up to ${weeklyCheckinMaxPoints.toLocaleString()}/wk)`}
          </span>

          <button
            type="button"
            onClick={() => setShowCheckinDetails((prev) => !prev)}
            aria-expanded={showCheckinDetails}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-[#A1A1AA] hover:text-white transition-colors"
          >
            <span>{isId ? 'Info verifikasi' : 'Verification info'}</span>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${
                showCheckinDetails ? 'rotate-180' : ''
              }`}
            />
          </button>
        </div>

        {showCheckinDetails && (
          <div className="rounded-xl bg-[#0B0B0F] border border-white/10 p-3.5 space-y-2.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 font-semibold text-white">
                <Shield className="w-3.5 h-3.5 text-[#A1A1AA]" />
                <span>
                  {isId ? 'Aturan waktu & reset' : 'Reset & verification rules'}
                </span>
              </span>
              <ResetCountdown lang={language} nextResetAt={summary?.nextResetAt} />
            </div>
            <p className="text-[#A1A1AA] leading-relaxed">
              {isId
                ? 'Check-in, misi nonton, dan batas harian direset setiap pukul 00.00 WIB. Durasi nonton dihitung otomatis saat diputar 1x dengan tab aktif.'
                : 'Daily check-ins, watch missions, and daily caps reset at 17:00 UTC. Active watch time counts at 1x speed while the tab stays visible.'}
            </p>
            {user && (
              <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/10">
                <span className="inline-flex items-center gap-1.5 text-[#D4D4D8]">
                  <PlayCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>{t.rewards.verifiedWatchProgress}</span>
                </span>
                <span className="font-bold text-emerald-300 tabular-nums">
                  {verifiedWatchMinutes} {t.rewards.minutesUnit}
                </span>
              </div>
            )}
          </div>
        )}
      </section>

      {/* 3. Daily Watching Bonus Card */}
      <section className="rounded-2xl bg-[#121117] border border-white/10 p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-[#261620] border border-rose-500/20 flex items-center justify-center text-[#FB7185] shrink-0">
              <Play className="w-4 h-4 fill-current" />
            </span>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">
                {t.rewards.dailyWatchingTitle}
              </h2>
              <p className="text-xs text-[#A1A1AA] tabular-nums">
                +{effectiveWatchMinutePoints} {t.rewards.pointsUnit}/{t.rewards.milestoneMinSuffix} ({missionMaxMinutes} {t.rewards.milestoneMinSuffix}) + bonus milestone
              </p>
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-medium text-[#D4D4D8] tabular-nums">
            <Clock className="w-3.5 h-3.5 text-[#FBBF24] shrink-0" />
            <span>
              {t.rewards.dailyWatchingCapLabel}: {dailyWatchCap.toLocaleString()} {t.rewards.pointsUnit}
            </span>
          </span>
        </div>

        <div className="flex items-baseline gap-2">
          <GoldCoinIcon className="w-6 h-6 self-center shrink-0" />
          <span className="text-2xl sm:text-3xl font-extrabold text-white tabular-nums tracking-tight">
            {todayWatchPointsEarned.toLocaleString()}
          </span>
          <span className="text-sm sm:text-base font-semibold text-[#A1A1AA] tabular-nums">
            / {maxWatchMissionPoints.toLocaleString()} {t.rewards.pointsUnit}
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
                  className={`rounded-xl p-3 border flex flex-col items-center justify-between gap-2 text-center transition-colors ${
                    todayMissionMinutes < 15
                      ? 'bg-[#1A141A] border-rose-500/40'
                      : 'bg-[#181620] border-emerald-500/35'
                  }`}
                >
                  <div className="flex flex-col items-center gap-1">
                    <GoldCoinIcon className="w-6 h-6" />
                    <span className="text-xs sm:text-sm font-bold text-[#FBBF24] tabular-nums">
                      +{effectiveWatchMinutePoints}/{t.rewards.milestoneMinSuffix}
                    </span>
                    <span className="text-[11px] text-[#A1A1AA] tabular-nums">
                      {t.rewards.dailyWatchingActiveUnit}
                    </span>
                  </div>
                  <span className="w-full py-1.5 px-2 rounded-lg bg-white/5 border border-white/10 text-[10px] sm:text-[11px] font-semibold text-[#E4E4E7] inline-flex items-center justify-center gap-1">
                    <Sparkles className="w-3 h-3 text-[#FBBF24] shrink-0" />
                    <span>{t.rewards.dailyWatchingAutoBadge}</span>
                  </span>
                </div>

                {milestoneStatuses.map((tier, idx) => {
                  const isNextTarget = idx === nextUnreachedIdx;
                  const isReadyToClaim = tier.reached && !tier.claimed;
                  const isClaimingThis = claimingMilestoneMinutes === tier.minutes;
                  const progressMin = Math.min(todayMissionMinutes, tier.minutes);
                  const tierProgressPct = Math.min(
                    100,
                    Math.round((progressMin / Math.max(1, tier.minutes)) * 100)
                  );

                  return (
                    <div
                      key={tier.minutes}
                      aria-live="polite"
                      className={`relative rounded-xl p-3 border flex flex-col items-center justify-between gap-2 text-center transition-colors ${
                        tier.claimed
                          ? 'bg-emerald-500/10 border-emerald-500/35'
                          : isReadyToClaim
                          ? 'bg-[#22131B] border-[#F43F5E]/80'
                          : isNextTarget
                          ? 'bg-[#1A141A] border-rose-500/35'
                          : 'bg-[#181620] border-white/10'
                      }`}
                    >
                      <div className="flex flex-col items-center gap-1 w-full">
                        <GoldCoinIcon className="w-6 h-6" />
                        <span
                          className={`text-xs sm:text-sm font-bold tabular-nums ${
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
                        {!tier.reached && !tier.claimed && (
                          <div className="w-full h-1 rounded-full bg-white/10 overflow-hidden mt-0.5">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-[#F43F5E] to-[#FBBF24] transition-[width] duration-500 ease-out"
                              style={{ width: `${Math.max(progressMin > 0 ? 6 : 0, tierProgressPct)}%` }}
                            />
                          </div>
                        )}
                      </div>

                      {tier.claimed ? (
                        <button
                          type="button"
                          disabled
                          className="w-full py-1.5 px-2 rounded-lg bg-emerald-500/15 border border-emerald-500/35 text-[10px] sm:text-[11px] font-bold text-emerald-300 inline-flex items-center justify-center gap-1 cursor-default"
                        >
                          <Check className="w-3 h-3 stroke-[3] shrink-0" />
                          <span>{t.rewards.milestoneClaimedBtn}</span>
                        </button>
                      ) : isReadyToClaim ? (
                        <button
                          type="button"
                          onClick={() => void handleClaimMilestone(tier.minutes)}
                          disabled={claimingMilestoneMinutes !== null || !dbAvailable}
                          className="w-full py-1.5 px-2 rounded-lg bg-[#E11D48] hover:bg-[#F43F5E] active:scale-[0.98] disabled:opacity-60 text-[10px] sm:text-[11px] font-bold text-white transition-colors cursor-pointer inline-flex items-center justify-center gap-1"
                        >
                          <Gift className={`w-3 h-3 shrink-0 ${isClaimingThis ? 'animate-spin' : ''}`} />
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
                          className="w-full py-1.5 px-2 rounded-lg bg-white/5 border border-white/10 text-[10px] sm:text-[11px] font-medium text-[#A1A1AA] cursor-not-allowed tabular-nums inline-flex items-center justify-center gap-1"
                        >
                          <Lock className="w-3 h-3 shrink-0 opacity-75" />
                          <span>
                            {progressMin}/{tier.minutes} {t.rewards.milestoneMinSuffix}
                          </span>
                        </button>
                      )}

                      {tier.claimed && (
                        <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-emerald-500 text-[#09090B] flex items-center justify-center">
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {hasUnclaimedReady && (
                <p
                  role="status"
                  aria-live="polite"
                  className="text-xs font-medium text-rose-200 bg-rose-500/10 border border-rose-500/25 rounded-xl px-3 py-2 flex items-center gap-2"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#FBBF24] shrink-0" />
                  <span>{t.rewards.milestoneUnclaimedHint}</span>
                </p>
              )}
            </div>
          );
        })()}

        {/* Clean Progress Rows */}
        <div className="space-y-3 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
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
              <div className="flex items-center justify-between text-xs">
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
          </div>

          <div className="pt-2.5 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="inline-flex items-center gap-2 text-[#D4D4D8]">
              <Sparkles className="w-3.5 h-3.5 text-[#FBBF24] shrink-0" />
              <span>
                {isId
                  ? `Bonus selesai episode (+${effectiveEpisodeBonusPoints.toLocaleString()} poin/episode)`
                  : `Episode completion bonus (+${effectiveEpisodeBonusPoints.toLocaleString()} pts/episode)`}
              </span>
            </span>
            <span className="font-semibold text-[#FDE68A] tabular-nums">
              {todayEpisodeBonusCount} / {effectiveMaxDailyEpisodes}{' '}
              {isId ? 'hari ini' : 'today'}
            </span>
          </div>
        </div>
      </section>

      {/* 3B. Daily Social Media Share Task */}
      <section className="rounded-2xl bg-[#121117] border border-white/10 p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-[#192033] border border-sky-500/25 flex items-center justify-center text-sky-300 shrink-0">
              <Share2 className="w-4 h-4" />
            </span>
            <div className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white">
                  {t.rewards.dailyShareTitle}
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/30 text-[11px] font-bold text-[#FDE68A] tabular-nums">
                  +{(config.dailySocialSharePoints ?? 1000).toLocaleString()} {t.rewards.pointsUnit}/
                  {isId ? 'hari' : 'day'}
                </span>
              </div>
              <p className="text-xs text-[#A1A1AA]">
                {t.rewards.dailyShareSubtitle}
              </p>
            </div>
          </div>

          {user && (
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold ${
                summary?.dailySocialShareClaimedToday
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                  : 'bg-white/5 border-white/10 text-[#D4D4D8]'
              }`}
            >
              {summary?.dailySocialShareClaimedToday ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {t.rewards.dailyShareClaimedLabel}
                    {summary.dailySocialShareChannel
                      ? ` (${summary.dailySocialShareChannel.toUpperCase()})`
                      : ''}
                  </span>
                </>
              ) : (
                <span>{t.rewards.dailyShareReadyLabel}</span>
              )}
            </span>
          )}
        </div>

        {!user ? (
          <div className="p-4 rounded-xl bg-[#0B0B0F] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-xs text-[#A1A1AA]">{t.rewards.dailyShareHint}</p>
            <button
              type="button"
              onClick={() => openAuthModal()}
              className="px-4 py-2 min-h-[40px] rounded-xl bg-[#D4AF37] text-[#09090B] text-xs font-extrabold hover:brightness-110 transition-all whitespace-nowrap shrink-0"
            >
              {isId
                ? `Masuk & Klaim +${(config.dailySocialSharePoints ?? 1000).toLocaleString()} Poin`
                : `Sign In & Claim +${(config.dailySocialSharePoints ?? 1000).toLocaleString()} pts`}
            </button>
          </div>
        ) : (() => {
          const shareUrl = referralShareUrl || DEFAULT_SITE_ORIGIN;
          const shareCaption = isId
            ? `Nonton drama China & short drama HD gratis di KanoDrama + kumpulkan poin saldo! ${shareUrl}`
            : `Stream Asian & short dramas in HD on KanoDrama and earn daily rewards! ${shareUrl}`;
          const waHref = `https://wa.me/?text=${encodeURIComponent(shareCaption)}`;
          const tgHref = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(
            isId ? 'Nonton drama HD gratis di KanoDrama!' : 'Watch Asian dramas in HD on KanoDrama!'
          )}`;
          const xHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
            isId ? 'Nonton drama HD gratis di KanoDrama!' : 'Watch Asian dramas in HD on KanoDrama!'
          )}&url=${encodeURIComponent(shareUrl)}`;
          const fbHref = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
          const claimedToday = Boolean(summary?.dailySocialShareClaimedToday);
          const busy = claimingSocialShare !== null;
          const canNativeShare =
            typeof navigator !== 'undefined' && typeof navigator.share === 'function';

          return (
            <div className="space-y-3">
              <p className="text-xs text-[#D4D4D8]">{t.rewards.dailyShareHint}</p>
              <div className={`grid grid-cols-2 ${canNativeShare ? 'sm:grid-cols-6' : 'sm:grid-cols-5'} gap-2`}>
                <a
                  href={waHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    if (!claimedToday && !busy) void handleClaimDailySocialShare('whatsapp');
                  }}
                  aria-disabled={busy}
                  className={`min-h-[42px] px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    claimedToday
                      ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200'
                      : 'bg-[#181620] border-white/10 hover:border-emerald-400/60 text-white'
                  }`}
                >
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>{claimingSocialShare === 'whatsapp' ? '...' : 'WhatsApp'}</span>
                </a>

                <a
                  href={tgHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    if (!claimedToday && !busy) void handleClaimDailySocialShare('telegram');
                  }}
                  aria-disabled={busy}
                  className={`min-h-[42px] px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    claimedToday
                      ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200'
                      : 'bg-[#181620] border-white/10 hover:border-sky-400/60 text-white'
                  }`}
                >
                  <Send className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span>{claimingSocialShare === 'telegram' ? '...' : 'Telegram'}</span>
                </a>

                <a
                  href={xHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    if (!claimedToday && !busy) void handleClaimDailySocialShare('x');
                  }}
                  aria-disabled={busy}
                  className={`min-h-[42px] px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    claimedToday
                      ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200'
                      : 'bg-[#181620] border-white/10 hover:border-white/40 text-white'
                  }`}
                >
                  <span className="font-black text-xs leading-none">𝕏</span>
                  <span>{claimingSocialShare === 'x' ? '...' : 'X / Twitter'}</span>
                </a>

                <a
                  href={fbHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    if (!claimedToday && !busy) void handleClaimDailySocialShare('facebook');
                  }}
                  aria-disabled={busy}
                  className={`min-h-[42px] px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    claimedToday
                      ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200'
                      : 'bg-[#181620] border-white/10 hover:border-[#3B82F6]/60 text-white'
                  }`}
                >
                  <span className="font-black text-xs text-[#3B82F6] leading-none">f</span>
                  <span>{claimingSocialShare === 'facebook' ? '...' : 'Facebook'}</span>
                </a>

                {canNativeShare && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleClaimDailySocialShare('native_share')}
                    className={`min-h-[42px] px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-60 ${
                      claimedToday
                        ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200'
                        : 'bg-[#181620] border-white/10 hover:border-amber-400/60 text-white'
                    }`}
                  >
                    <Share2 className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                    <span className="truncate">
                      {claimingSocialShare === 'native_share'
                        ? '...'
                        : isId
                        ? 'Bagikan'
                        : 'Share'}
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleClaimDailySocialShare('copy_link')}
                  className={`${canNativeShare ? '' : 'col-span-2 sm:col-span-1 '}min-h-[42px] px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-60 ${
                    claimedToday
                      ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200'
                      : 'bg-[#D4AF37]/15 border-[#D4AF37]/40 hover:bg-[#D4AF37]/25 text-[#FDE68A]'
                  }`}
                >
                  {claimedToday ? (
                    <Check className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span className="truncate">
                    {claimingSocialShare === 'copy_link'
                      ? '...'
                      : claimedToday
                      ? t.rewards.dailyShareClaimedLabel
                      : t.rewards.dailyShareCopyBtn}
                  </span>
                </button>
              </div>

              {shareFeedback && (
                <div
                  role="status"
                  className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                    shareFeedback.type === 'error'
                      ? 'bg-red-500/10 border-red-500/30 text-red-200'
                      : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                  }`}
                >
                  {shareFeedback.type === 'error' ? (
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  )}
                  <span>{shareFeedback.message}</span>
                </div>
              )}
            </div>
          );
        })()}
      </section>

      {/* Referral Hub */}
      <section
        id="referral-program"
        className="rounded-2xl bg-[#121117] border border-white/10 p-4 sm:p-6 space-y-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1 max-w-2xl">
            <div className="flex items-center gap-2">
              <Gift className="w-4 h-4 text-[#D4AF37]" />
              <h2 className="text-base sm:text-lg font-bold text-white">
                {t.rewards.referralTitle}
              </h2>
            </div>
            <p className="text-xs text-[#A1A1AA] leading-relaxed">
              {t.rewards.referralSubtitle}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowReferralDetails((prev) => !prev)}
            aria-expanded={showReferralDetails}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-[#A1A1AA] hover:text-white transition-colors shrink-0"
          >
            <span>{isId ? 'Rincian bonus' : 'Bonus details'}</span>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${
                showReferralDetails ? 'rotate-180' : ''
              }`}
            />
          </button>
        </div>

        {/* Collapsible 3-Tier Referral, Bind & Ongoing Breakdown */}
        {showReferralDetails && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-[#0B0B0F] border border-white/10 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#FDE68A]">
                  {isId ? '1. Bonus Referral Utama' : '1. Main Referral'}
                </span>
                <span className="text-xs font-bold text-white tabular-nums">
                  +{(referralSummary?.referralBonusPoints ?? config.referralBonusPoints).toLocaleString()}{' '}
                  {t.rewards.pointsUnit}
                </span>
              </div>
              <p className="text-[11px] text-[#A1A1AA] leading-relaxed">
                {isId
                  ? `Cair setelah teman nonton aktif minimal ${qualifyMinutes} menit (1 jam).`
                  : `Unlocked after your friend completes ${qualifyMinutes} min (1 hour) of verified watching.`}
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-[#0B0B0F] border border-white/10 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-emerald-300">
                  {isId ? '2. Bonus Bind Kode' : '2. Bind Bonus'}
                </span>
                <span className="text-xs font-bold text-white tabular-nums">
                  +
                  {(
                    referralSummary?.bindReferralBonusPoints ??
                    config.bindReferralBonusPoints ??
                    200
                  ).toLocaleString()}{' '}
                  {t.rewards.pointsUnit}
                </span>
              </div>
              <p className="text-[11px] text-[#A1A1AA] leading-relaxed">
                {isId
                  ? `Otomatis masuk saat daftar lewat tautan ?ref= atau bind kode 1x di bawah.`
                  : `Credited on ?ref= sign-up or 1-time code binding below.`}
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-[#0B0B0F] border border-white/10 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-sky-300">
                  {isId ? '3. Bonus Lanjutan' : '3. Ongoing Watch'}
                </span>
                <span className="text-xs font-bold text-white tabular-nums">
                  +{ongoingBonusPerStep.toLocaleString()} / {ongoingStepMinutes}{' '}
                  {t.rewards.milestoneMinSuffix}
                </span>
              </div>
              <p className="text-[11px] text-[#A1A1AA] leading-relaxed">
                {isId
                  ? `Tiap tambahan ${ongoingStepMinutes} menit nonton teman yang sudah valid memberi +${ongoingBonusPerStep.toLocaleString()} poin (maks ${ongoingMaxSteps}x / +${ongoingMaxTotalPoints.toLocaleString()} poin).`
                  : `Every extra ${ongoingStepMinutes} min watched by a qualified friend gives +${ongoingBonusPerStep.toLocaleString()} pts (up to ${ongoingMaxSteps}x / +${ongoingMaxTotalPoints.toLocaleString()} pts).`}
              </p>
            </div>
          </div>
        )}

        {authLoading && !user ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4" aria-busy="true">
            <div className="lg:col-span-6 p-4 rounded-xl bg-[#0B0B0F] border border-white/10 space-y-3">
              <div className="h-3.5 w-40 rounded skeleton-espresso" />
              <div className="h-10 w-full rounded-lg skeleton-espresso" />
            </div>
            <div className="lg:col-span-6 p-4 rounded-xl bg-[#0B0B0F] border border-white/10 space-y-3">
              <div className="h-3.5 w-36 rounded skeleton-espresso" />
              <div className="h-10 w-full rounded-lg skeleton-espresso" />
            </div>
          </div>
        ) : !user ? (
          <div className="p-4 rounded-xl bg-[#0B0B0F] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs sm:text-sm font-bold text-white">
                {isId
                  ? 'Ambil Link Referral KanoDrama'
                  : 'Get Your KanoDrama Referral Link'}
              </p>
              <p className="text-xs text-[#A1A1AA] leading-relaxed">
                {t.rewards.referralRule1h}
              </p>
            </div>
            <button
              type="button"
              onClick={() => openAuthModal()}
              className="px-5 py-2.5 min-h-[40px] rounded-xl bg-[#D4AF37] text-[#09090B] text-xs font-extrabold hover:brightness-110 transition-all whitespace-nowrap shrink-0"
            >
              {isId ? 'Masuk & Ambil Kode' : 'Sign In for Code'}
            </button>
          </div>
        ) : !referralSummary ? (
          dbAvailable ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4" aria-busy="true">
              <div className="lg:col-span-6 p-4 rounded-xl bg-[#0B0B0F] border border-white/10 space-y-3">
                <div className="h-3.5 w-40 rounded skeleton-espresso" />
                <div className="h-10 w-full rounded-lg skeleton-espresso" />
              </div>
              <div className="lg:col-span-6 p-4 rounded-xl bg-[#0B0B0F] border border-white/10 space-y-3">
                <div className="h-3.5 w-36 rounded skeleton-espresso" />
                <div className="h-10 w-full rounded-lg skeleton-espresso" />
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-[#0B0B0F] border border-white/10 text-xs text-[#A1A1AA]">
              {isId
                ? 'Menunggu koneksi database untuk memuat data referral.'
                : 'Waiting for database connection to load referral data.'}
            </div>
          )
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

                {/* Bind Referral Status OR Manual Bind Code Form (200 pts) */}
                {referralSummary.hasReferrer && referralSummary.referredBy ? (
                  <div className="pt-2.5 border-t border-white/10 space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <span className="inline-flex items-center gap-1.5 font-bold text-emerald-300">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span>
                          {isId
                            ? `Terhubung ke kode ${referralSummary.referredBy.referralCode}`
                            : `Bound to ${referralSummary.referredBy.referralCode}`}
                        </span>
                      </span>
                      <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-bold text-emerald-300 tabular-nums">
                        {referralSummary.referredBy.bindBonusAwarded
                          ? `+${(
                              referralSummary.bindReferralBonusPoints ??
                              config.bindReferralBonusPoints ??
                              200
                            ).toLocaleString()} ${t.rewards.pointsUnit}`
                          : renderReferralStatusBadge(referralSummary.referredBy.status)}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#A1A1AA] leading-relaxed">
                      {referralSummary.referredBy.status === 'qualified'
                        ? isId
                          ? 'Target nonton 60 menit selesai dan bonus referral sudah masuk.'
                          : '60-minute active watch target met and referral bonus credited.'
                        : isId
                        ? `Nonton aktif kamu: ${Math.min(
                            qualifyMinutes,
                            Math.floor(referralSummary.verifiedWatchSeconds / 60)
                          )} / ${qualifyMinutes} menit.`
                        : `Your active watch progress: ${Math.min(
                            qualifyMinutes,
                            Math.floor(referralSummary.verifiedWatchSeconds / 60)
                          )} / ${qualifyMinutes} min.`}
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleBindReferralCode} className="pt-2 border-t border-white/10 space-y-2">
                    <label className="block text-[11px] font-medium text-[#A1A1AA]">
                      {isId
                        ? `Punya kode referral? Masukkan sekali untuk +${(
                            referralSummary.bindReferralBonusPoints ??
                            config.bindReferralBonusPoints ??
                            200
                          ).toLocaleString()} poin:`
                        : `Have a referral code? Bind once for +${(
                            referralSummary.bindReferralBonusPoints ??
                            config.bindReferralBonusPoints ??
                            200
                          ).toLocaleString()} pts:`}
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
                        <span>{bindingRef ? '...' : isId ? 'Bind Kode' : 'Bind'}</span>
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
                )}
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
                  {(referralSummary.stats.ongoingBonusEarned ?? 0) > 0 && (
                    <p className="text-[10px] text-sky-300 tabular-nums mt-0.5">
                      {isId
                        ? `Termasuk +${(referralSummary.stats.ongoingBonusEarned ?? 0).toLocaleString()} lanjutan`
                        : `Incl. +${(referralSummary.stats.ongoingBonusEarned ?? 0).toLocaleString()} ongoing`}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {referralSummary.referrals.length === 0 ? (
              <div className="p-4 rounded-xl bg-[#0B0B0F] border border-white/10 flex items-center gap-3 text-xs text-[#A1A1AA]">
                <Users className="w-4 h-4 text-[#D4AF37] shrink-0" />
                <span>{t.rewards.referralEmpty}</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[340px] overflow-y-auto pr-1">
                {referralSummary.referrals.map((ref) => {
                  const totalWatchedMin = Math.floor(ref.verifiedWatchSeconds / 60);
                  const watchedMin = Math.min(qualifyMinutes, totalWatchedMin);
                  const reqMin = Math.max(1, Math.round(ref.requiredWatchSeconds / 60));
                  const ongoingSteps = Math.max(0, ref.ongoingStepsAwarded ?? 0);
                  const ongoingMax = Math.max(1, ref.ongoingMaxSteps ?? ongoingMaxSteps);
                  const ongoingEarned = Math.max(0, ref.ongoingBonusEarned ?? 0);
                  const nextOngoingMin = ref.nextOngoingTargetSeconds
                    ? Math.round(ref.nextOngoingTargetSeconds / 60)
                    : null;
                  const totalItemBonus =
                    (ref.status === 'qualified' ? ref.bonusPoints : 0) + ongoingEarned;
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
                          {ref.status === 'qualified'
                            ? `${totalWatchedMin} ${t.rewards.minutesUnit}`
                            : `${watchedMin} / ${reqMin} ${t.rewards.minutesUnit}`}
                        </span>
                        <span className="text-[#D4AF37] font-bold">
                          +{(ref.status === 'qualified' ? totalItemBonus : ref.bonusPoints).toLocaleString()}{' '}
                          {t.rewards.pointsUnit}
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
                      {ref.status === 'qualified' && (
                        <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-sky-300/90 tabular-nums pt-0.5">
                          <span>
                            {isId
                              ? `Lanjutan: Tahap ${ongoingSteps}/${ongoingMax} (+${ongoingEarned.toLocaleString()} ${t.rewards.pointsUnit})`
                              : `Ongoing: Step ${ongoingSteps}/${ongoingMax} (+${ongoingEarned.toLocaleString()} ${t.rewards.pointsUnit})`}
                          </span>
                          {nextOngoingMin ? (
                            <span className="text-[#A1A1AA]">
                              {isId ? `Berikutnya ${nextOngoingMin} mnt` : `Next at ${nextOngoingMin}m`}
                            </span>
                          ) : (
                            <span className="text-emerald-300">
                              {isId ? 'Maks. tercapai' : 'Max reached'}
                            </span>
                          )}
                        </div>
                      )}
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
          className="xl:col-span-7 rounded-2xl bg-[#121117] border border-white/10 p-5 sm:p-6 space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-[#FBBF24]">
                <Wallet className="w-4 h-4" />
              </span>
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white">
                  {t.rewards.withdrawTitle}
                </h2>
                <p className="text-[11px] text-[#A1A1AA]">
                  {isId
                    ? 'Pilih metode pencairan'
                    : 'Choose payout method'}
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
                      : isId
                      ? formatUsd(estimatedReceiveUsd)
                      : `${estimatedReceiveUsd.toFixed(2)} USDT`}
                  </span>
                </div>
                <span className="text-[11px] text-[#A1A1AA] tabular-nums shrink-0">
                  {currencyTab === 'IDR'
                    ? isId
                      ? formatUsd(estimatedReceiveUsd)
                      : `${estimatedReceiveUsd.toFixed(2)} USDT`
                    : isId
                    ? formatIdr(estimatedReceiveIdr)
                    : `~$${estimatedReceiveUsd.toFixed(2)} USD`}
                </span>
              </div>
              <p className="text-[11px] text-[#71717A] tabular-nums">
                {isId || currencyTab === 'IDR'
                  ? `1 USD = ${formatIdr(config.usdToIdrRate)}`
                  : `${oneUsdtPoints.toLocaleString()} ${t.rewards.pointsUnit} = 1 USDT`}{' '}
                ·{' '}
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
            {authLoading && !user ? (
              <div className="w-40 min-h-[44px] rounded-xl skeleton-espresso" aria-hidden="true" />
            ) : user ? (
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

        {/* Real Live Payout History Feed */}
        <div className="xl:col-span-5 rounded-2xl bg-[#121117] border border-white/10 p-5 sm:p-6 space-y-4">
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
                  ? 'Belum ada pencairan terbaru'
                  : 'No recent payouts yet'}
              </p>
              <p className="text-[11px] text-[#71717A] leading-relaxed">
                {isId
                  ? 'Daftar ini hanya menampilkan pencairan yang sudah disetujui atau dibayar.'
                  : 'Only approved or completed withdrawals are shown here.'}
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

            {payoutLoading && payoutRows.length === 0 ? (
              <div className="space-y-2.5" aria-busy="true">
                {Array.from({ length: 3 }).map((_, idx) => (
                  <div key={idx} className="p-3.5 rounded-xl bg-[#0B0B0F] border border-white/10 space-y-2">
                    <div className="h-3.5 w-44 rounded skeleton-espresso" />
                    <div className="h-3 w-64 rounded skeleton-espresso" />
                  </div>
                ))}
              </div>
            ) : payoutRows.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-[#0B0B0F] py-8 px-4 text-center space-y-2">
                <Wallet className="w-7 h-7 text-[#71717A] mx-auto" />
                <p className="text-xs text-[#A1A1AA]">{t.rewards.noPayouts}</p>
              </div>
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

            {ledgerLoading && ledgerRows.length === 0 ? (
              <div className="space-y-2.5" aria-busy="true">
                {Array.from({ length: 3 }).map((_, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-[#0B0B0F] border border-white/10 space-y-2">
                    <div className="h-3.5 w-40 rounded skeleton-espresso" />
                    <div className="h-3 w-52 rounded skeleton-espresso" />
                  </div>
                ))}
              </div>
            ) : ledgerRows.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-[#0B0B0F] py-8 px-4 text-center space-y-3">
                <Coins className="w-7 h-7 text-[#71717A] mx-auto" />
                <p className="text-xs text-[#A1A1AA]">{t.rewards.noLedger}</p>
                <a
                  href={`${DEFAULT_SITE_ORIGIN}/explore`}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                    e.preventDefault();
                    window.dispatchEvent(
                      new CustomEvent('kd:navigate-path', {
                        detail: { path: '/explore' },
                      })
                    );
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-semibold text-white transition-colors"
                >
                  <Compass className="w-3.5 h-3.5 text-[#D4AF37]" />
                  <span>{t.nav.explore}</span>
                </a>
              </div>
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
                            {formatLedgerDescription(row, t.rewards)}
                          </p>
                          <p className="text-[11px] text-[#71717A] tabular-nums">
                            <RelativeTimeText iso={row.createdAt} lang={language} />
                            {typeof row.balanceAfter === 'number'
                              ? ` · ${t.rewards.balanceLabel}: ${row.balanceAfter.toLocaleString()}`
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
        firstLoginBonusPoints={effectiveFirstLoginBonusPoints}
        bindReferralBonusPoints={config.bindReferralBonusPoints ?? 200}
        dailyCheckinPoints={effectiveDailyCheckinPoints}
        dailyCheckinDay7Points={effectiveDailyCheckinDay7Points}
        watchMinutePoints={effectiveWatchMinutePoints}
        dailyMissionMilestones={effectiveMilestoneConfigs}
        levelTiers={levelTiers}
        referralBonusPoints={config.referralBonusPoints}
        referralOngoingStepSeconds={config.referralOngoingStepSeconds ?? 3600}
        referralOngoingBonusPoints={config.referralOngoingBonusPoints ?? 500}
        referralOngoingMaxSteps={config.referralOngoingMaxSteps ?? 10}
        episodeBonusPoints={effectiveEpisodeBonusPoints}
        maxDailyEpisodeBonusCount={effectiveMaxDailyEpisodes}
        dailySocialSharePoints={config.dailySocialSharePoints ?? 1000}
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
                    ? `${formatIdr(estimatedReceiveIdr)} (${
                        isId
                          ? formatUsd(estimatedReceiveUsd)
                          : `${estimatedReceiveUsd.toFixed(2)} USDT`
                      })`
                    : isId
                    ? `${formatUsd(estimatedReceiveUsd)} (${formatIdr(estimatedReceiveIdr)})`
                    : `${estimatedReceiveUsd.toFixed(2)} USDT`}
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
                ? 'Pastikan nomor tujuan atau alamat wallet sudah benar. Poin langsung ditahan saat pengajuan dikirim.'
                : 'Double-check your receiving account or wallet address. Points are held once submitted.'}
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
