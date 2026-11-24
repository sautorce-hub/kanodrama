import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CalendarCheck2,
  Check,
  CheckCircle2,
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
  PlayCircle,
  RefreshCw,
  Share2,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useDramaContext } from '../context/DramaContext';
import { getProductionReferralUrl } from '../config/auth';
import { PaymentMethodLogo } from './PaymentMethodLogo';
import { RewardsSeoContent } from './RewardsSeoContent';

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
    { id: 'shopeepay', label: 'ShopeePay', currency: 'IDR', countryCode: 'ID', minPoints: 54946, category: 'ewallet_idr' },
    { id: 'linkaja', label: 'LinkAja', currency: 'IDR', countryCode: 'ID', minPoints: 54946, category: 'ewallet_idr' },
    { id: 'bank_transfer', label: 'Transfer Bank (IDR)', currency: 'IDR', countryCode: 'ID', minPoints: 54946, category: 'bank_idr' },
    { id: 'paypal', label: 'PayPal', currency: 'USD', countryCode: 'US', minPoints: 100000, category: 'global_usd' },
    { id: 'wise', label: 'Wise', currency: 'USD', countryCode: 'MY', minPoints: 100000, category: 'global_usd' },
    { id: 'usdt_polygon', label: 'USDT (Polygon)', currency: 'USD', countryCode: 'SG', minPoints: 100000, category: 'crypto_usd' },
    { id: 'usdt_trc20', label: 'USDT (TRC20)', currency: 'USD', countryCode: 'PH', minPoints: 100000, category: 'crypto_usd' },
    { id: 'usdt_bep20', label: 'USDT (BEP20)', currency: 'USD', countryCode: 'SG', minPoints: 100000, category: 'crypto_usd' },
    { id: 'usdt_erc20', label: 'USDT (ERC20)', currency: 'USD', countryCode: 'SG', minPoints: 100000, category: 'crypto_usd' },
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

// Isolated WIB (UTC+7) 00:00 reset countdown widget
const WibResetCountdown: React.FC<{ lang: string }> = React.memo(({ lang }) => {
  const [label, setLabel] = useState('');

  useEffect(() => {
    const update = () => {
      const now = Date.now();
      const wibMs = now + 7 * 3600 * 1000;
      const elapsedToday = wibMs % (24 * 3600 * 1000);
      const remSec = Math.max(0, Math.floor((24 * 3600 * 1000 - elapsedToday) / 1000));
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
  }, []);

  return (
    <span className="tabular-nums font-mono text-[11px] text-[#A1A1AA]">
      {lang === 'id' ? `Reset 00:00 WIB (${label})` : `Resets 00:00 WIB (${label})`}
    </span>
  );
});
WibResetCountdown.displayName = 'WibResetCountdown';

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
  const [selectedUsdtMethod, setSelectedUsdtMethod] =
    useState<PayoutMethod>('usdt_polygon');
  const [pointsInput, setPointsInput] = useState<string>(() =>
    language === 'id' ? '54946' : '100000'
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
          `+${data.awardedPoints || config.dailyCheckinPoints} ${t.rewards.pointsUnit}${bonusNote}!`,
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
  const todayWatchPointsEarned = Math.max(0, summary?.todayWatchPointsEarned ?? 0);
  const maxWatchMissionPoints =
    missionMaxMinutes * (config.watchMinutePoints || 5) +
    (config.dailyMissionMilestones || []).reduce((acc, m) => acc + m.bonusPoints, 0);
  const usd5Points = Math.max(1000, config.pointsPerUsd * 5);

  const checkinStreak = summary?.checkinStreak ?? 0;
  const milestoneStatuses: DailyMissionMilestoneStatus[] =
    summary?.milestones && summary.milestones.length > 0
      ? summary.milestones
      : (config.dailyMissionMilestones || []).map((m) => ({
          ...m,
          reached: todayMissionMinutes >= m.minutes,
          claimed: todayMissionMinutes >= m.minutes,
          claimedAt: null,
        }));

  const ledgerMaxPage = Math.max(0, Math.ceil(ledgerTotal / LEDGER_PAGE_SIZE) - 1);
  const payoutMaxPage = Math.max(0, Math.ceil(payoutTotal / PAYOUT_PAGE_SIZE) - 1);

  return (
    <div className="space-y-6">
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

      {/* Wallet Overview & Daily Check-In + Streak */}
      <section className="rounded-2xl bg-[#111015] border border-[#D4AF37]/30 divide-y divide-white/10">
        {!user ? (
          <div className="p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/35 flex items-center justify-center shrink-0 text-[#D4AF37]">
                <Lock className="w-5 h-5" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-lg sm:text-xl font-extrabold text-white">
                  {t.rewards.loginRequiredTitle}
                </h2>
                <p className="text-xs sm:text-sm text-[#D4D4D8] leading-relaxed max-w-2xl">
                  {t.rewards.loginRequiredDesc}
                </p>
                <p className="text-xs text-[#D4AF37] font-semibold tabular-nums">
                  {usd5Points.toLocaleString()} {t.rewards.pointsUnit} = $5.00 USD ·{' '}
                  {config.minPayoutPointsIdr.toLocaleString()} {t.rewards.pointsUnit} ={' '}
                  {formatIdr(config.minPayoutIdr)}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => openAuthModal()}
              className="px-6 py-2.5 min-h-[44px] rounded-xl cd-accent-bg text-xs sm:text-sm font-bold text-white shadow-lg hover:brightness-110 transition-all whitespace-nowrap shrink-0"
            >
              {t.auth.continueBtn}
            </button>
          </div>
        ) : (
          <>
            {/* Top Balance + Action Row */}
            <div className="p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#D4AF37]">
                  <Coins className="w-4 h-4" />
                  <span>{t.rewards.balanceTitle}</span>
                  <span className="text-white/25">·</span>
                  <WibResetCountdown lang={language} />
                </div>
                <div className="flex items-baseline gap-2.5">
                  <span className="text-3xl sm:text-4xl font-extrabold text-white tabular-nums tracking-tight">
                    {(summary?.balance ?? 0).toLocaleString()}
                  </span>
                  <span className="text-sm font-semibold text-[#D4AF37]">
                    {t.rewards.pointsUnit}
                  </span>
                </div>
                <p className="text-xs text-[#A1A1AA] tabular-nums">
                  {t.rewards.estimatedValue}:{' '}
                  <strong className="text-white">
                    {formatUsd(summary?.estimatedUsd ?? 0)}
                  </strong>{' '}
                  ·{' '}
                  <strong className="text-emerald-300">
                    {formatIdr(summary?.estimatedIdr ?? 0)}
                  </strong>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleDailyCheckin}
                  disabled={
                    !dbAvailable ||
                    claimingCheckin ||
                    Boolean(summary?.dailyCheckinClaimedToday) ||
                    (summary?.cooldownSecondsRemaining ?? 0) > 0
                  }
                  className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] rounded-xl bg-[#D4AF37] text-[#09090B] text-xs sm:text-sm font-extrabold hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
                >
                  <Sparkles className="w-4 h-4 shrink-0" />
                  <span>
                    {summary?.dailyCheckinClaimedToday
                      ? t.rewards.dailyCheckinDone
                      : (summary?.cooldownSecondsRemaining ?? 0) > 0
                      ? `${t.rewards.cooldownWait} ${summary?.cooldownSecondsRemaining}s`
                      : `${t.rewards.dailyCheckinBtn.replace(/\(\+[^)]+\)/, '').trim()} (+${config.dailyCheckinPoints} ${t.rewards.pointsUnit})`}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => void loadPointsData()}
                  disabled={loading}
                  aria-label="Refresh points data"
                  className="p-2.5 min-h-[44px] min-w-[44px] rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[#D4D4D8] flex items-center justify-center transition-colors shrink-0"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* 4-Column Wallet Accounting Strip + 7-Day WIB Streak */}
            <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-white/10">
              <div className="p-4 sm:p-5 space-y-1">
                <p className="text-[11px] font-medium text-[#A1A1AA]">
                  {isId ? 'Total Poin Diperoleh' : 'Lifetime Points Earned'}
                </p>
                <p className="text-lg sm:text-xl font-extrabold text-emerald-300 tabular-nums">
                  +{(summary?.totalEarned ?? 0).toLocaleString()}
                </p>
              </div>
              <div className="p-4 sm:p-5 space-y-1">
                <p className="text-[11px] font-medium text-[#A1A1AA]">
                  {isId ? 'Tertahan untuk Penarikan' : 'Held in Pending Payouts'}
                </p>
                <p className="text-lg sm:text-xl font-extrabold text-amber-300 tabular-nums">
                  {(summary?.totalHeld ?? 0).toLocaleString()}
                </p>
              </div>
              <div className="p-4 sm:p-5 space-y-1">
                <p className="text-[11px] font-medium text-[#A1A1AA]">
                  {isId ? 'Total Poin Ditarik' : 'Total Points Withdrawn'}
                </p>
                <p className="text-lg sm:text-xl font-extrabold text-white tabular-nums">
                  {(summary?.totalWithdrawn ?? summary?.totalRedeemed ?? 0).toLocaleString()}
                </p>
              </div>
              <div className="p-4 sm:p-5 space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#A1A1AA] font-medium">
                    {t.rewards.dailyProgress}
                  </span>
                  <span className="text-white font-bold tabular-nums">
                    {(summary?.todayEarned ?? 0).toLocaleString()} /{' '}
                    {(summary?.maxDailyEarnPoints ?? config.maxDailyEarnPoints).toLocaleString()}
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#D4AF37] to-[#EF4444] rounded-full transition-all duration-300"
                    style={{ width: `${Math.max(2, dailyPct)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* 7-Day WIB Streak & Verified Watch Status Bar */}
            <div className="p-4 sm:px-6 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#0B0B0F]/60">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-white">
                  <CalendarCheck2 className="w-4 h-4 text-[#D4AF37]" />
                  <span>
                    {isId ? 'Streak Check-In WIB:' : 'WIB Check-In Streak:'}{' '}
                    <span className="text-[#D4AF37] tabular-nums">
                      {checkinStreak} {isId ? 'hari' : 'days'}
                    </span>
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5, 6, 7].map((dayNum) => {
                    const filled = checkinStreak > 0 && ((checkinStreak - 1) % 7) + 1 >= dayNum;
                    return (
                      <span
                        key={dayNum}
                        title={
                          dayNum === 7
                            ? isId
                              ? 'Hari ke-7: +50 bonus poin'
                              : 'Day 7: +50 bonus pts'
                            : `Day ${dayNum}`
                        }
                        className={`w-6 h-6 rounded-md text-[10px] font-bold flex items-center justify-center border tabular-nums ${
                          filled
                            ? 'bg-[#D4AF37]/20 border-[#D4AF37] text-[#D4AF37]'
                            : 'bg-white/[0.03] border-white/10 text-[#71717A]'
                        }`}
                      >
                        {dayNum === 7 ? '7+' : dayNum}
                      </span>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs text-[#A1A1AA] tabular-nums">
                <PlayCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  {t.rewards.verifiedWatchProgress}:{' '}
                  <strong className="text-emerald-300">
                    {verifiedWatchMinutes} {t.rewards.minutesUnit}
                  </strong>{' '}
                  ({isId ? 'Hari ini' : 'Today'}:{' '}
                  {Math.floor(todayWatchSeconds / 60)} {t.rewards.minutesUnit})
                </span>
              </div>
            </div>
          </>
        )}
      </section>

      {/* Daily Watch Mission (Max 1h/day + 15m/30m/60m Milestones) */}
      <section className="rounded-2xl bg-[#111015] border border-emerald-500/25 p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-[#EF4444]" />
              <h2 className="text-base sm:text-lg font-bold text-white">
                {isId
                  ? 'Misi Harian Nonton (Maks. 1 Jam / Hari)'
                  : 'Daily Watch Missions (Max 1 Hour / Day)'}
              </h2>
            </div>
            <p className="text-xs text-[#A1A1AA]">
              {isId
                ? `Counter aktif di video player (kecepatan 1x, tab aktif, tidak buffering): +${config.watchMinutePoints} poin/menit hingga ${missionMaxMinutes} menit/hari + bonus milestone.`
                : `Active player counter (1x speed, visible tab, non-buffering): +${config.watchMinutePoints} pts/min up to ${missionMaxMinutes} min/day + milestone bonuses.`}
            </p>
          </div>

          <div className="px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-xs font-extrabold text-emerald-300 tabular-nums whitespace-nowrap">
            +{todayWatchPointsEarned.toLocaleString()} / {maxWatchMissionPoints.toLocaleString()}{' '}
            {t.rewards.pointsUnit}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-[#D4D4D8]">
              {isId
                ? 'Progres Nonton Hari Ini (Reset 00:00 WIB)'
                : "Today's Verified Watch Progress (Resets 00:00 WIB)"}
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          <div className="p-3.5 rounded-xl bg-[#0B0B0F] border border-white/10 flex flex-col justify-between gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white">
                {isId ? 'Nonton Aktif / Menit' : 'Active Watch / Min'}
              </span>
              <span className="text-xs font-extrabold text-[#D4AF37] tabular-nums">
                +{config.watchMinutePoints} {t.rewards.pointsUnit}
              </span>
            </div>
            <p className="text-[11px] text-[#A1A1AA] tabular-nums">
              {todayMissionMinutes}/{missionMaxMinutes} {t.rewards.minutesUnit} · Maks{' '}
              {(missionMaxMinutes * config.watchMinutePoints).toLocaleString()}{' '}
              {t.rewards.pointsUnit}
            </p>
          </div>

          {milestoneStatuses.map((tier) => (
            <div
              key={tier.minutes}
              className={`p-3.5 rounded-xl border flex flex-col justify-between gap-1.5 transition-colors ${
                tier.reached
                  ? 'bg-emerald-500/10 border-emerald-500/35'
                  : 'bg-[#0B0B0F] border-white/10'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-white">
                  {isId ? `Milestone ${tier.minutes} Menit` : `${tier.minutes}-Min Milestone`}
                </span>
                <span
                  className={`text-xs font-extrabold tabular-nums ${
                    tier.reached ? 'text-emerald-300' : 'text-[#D4AF37]'
                  }`}
                >
                  +{tier.bonusPoints} {t.rewards.pointsUnit}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#A1A1AA] tabular-nums">
                  {Math.min(todayMissionMinutes, tier.minutes)}/{tier.minutes}{' '}
                  {t.rewards.minutesUnit}
                </span>
                <span
                  className={`font-bold ${
                    tier.reached ? 'text-emerald-300' : 'text-[#71717A]'
                  }`}
                >
                  {tier.reached
                    ? isId
                      ? 'Terklaim'
                      : 'Credited'
                    : isId
                    ? 'Berjalan'
                    : 'In Progress'}
                </span>
              </div>
            </div>
          ))}
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
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <form
          onSubmit={handleRequestWithdrawConfirmation}
          className="xl:col-span-7 rounded-2xl bg-[#111015] border border-white/10 p-5 sm:p-6 space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-[#D4AF37]" />
              <h2 className="text-base sm:text-lg font-bold text-white">
                {t.rewards.withdrawTitle}
              </h2>
            </div>

            <div className="inline-flex p-1 rounded-xl bg-[#0B0B0F] border border-white/10">
              <button
                type="button"
                onClick={() => setCurrencyTab('IDR')}
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
                onClick={() => setCurrencyTab('USD')}
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
            <div className="space-y-4">
              {/* Group 1: E-Wallet Indonesia */}
              <div className="space-y-2">
                <span className="block text-xs font-semibold text-[#D4D4D8]">
                  {isId ? 'E-Wallet Indonesia (Min Rp 50.000)' : 'Indonesia E-Wallets (Min Rp 50,000)'}
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                  {idrEwallets.map((m) => {
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
                        className={`p-2.5 rounded-xl border flex items-center gap-2 text-left transition-all ${
                          active
                            ? 'bg-[#D4AF37]/15 border-[#D4AF37] text-white'
                            : 'bg-[#0B0B0F] border-white/10 text-[#D4D4D8] hover:border-white/25'
                        }`}
                      >
                        <PaymentMethodLogo method={m.id} size="sm" />
                        <span className="text-xs font-bold truncate">{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Group 2: Transfer Bank Lokal Indonesia */}
              {idrBankMethod && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#D4D4D8]">
                      {isId ? 'Transfer Bank Lokal Indonesia (10 Bank)' : 'Indonesian Bank Transfer (10 Banks)'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedMethod('bank_transfer');
                        if (parsedPoints < idrBankMethod.minPoints) {
                          setPointsInput(String(idrBankMethod.minPoints));
                        }
                      }}
                      className={`text-[11px] font-bold px-2.5 py-1 rounded-md border transition-colors ${
                        effectiveMethod === 'bank_transfer'
                          ? 'bg-[#D4AF37]/20 border-[#D4AF37] text-[#D4AF37]'
                          : 'bg-[#0B0B0F] border-white/10 text-[#A1A1AA] hover:text-white'
                      }`}
                    >
                      {effectiveMethod === 'bank_transfer'
                        ? isId
                          ? 'Dipilih: Transfer Bank'
                          : 'Selected: Bank Transfer'
                        : isId
                        ? 'Pilih Transfer Bank'
                        : 'Use Bank Transfer'}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {banks.map((b) => {
                      const active =
                        effectiveMethod === 'bank_transfer' &&
                        selectedBankCode === b.code;
                      return (
                        <button
                          key={b.code}
                          type="button"
                          onClick={() => {
                            setSelectedMethod('bank_transfer');
                            setSelectedBankCode(b.code);
                            if (parsedPoints < idrBankMethod.minPoints) {
                              setPointsInput(String(idrBankMethod.minPoints));
                            }
                          }}
                          className={`p-2 rounded-xl border flex items-center gap-2 text-left transition-all ${
                            active
                              ? 'bg-[#D4AF37]/15 border-[#D4AF37] text-white'
                              : 'bg-[#0B0B0F] border-white/10 text-[#D4D4D8] hover:border-white/25'
                          }`}
                        >
                          <PaymentMethodLogo method="bank_transfer" bankCode={b.code} size="sm" />
                          <span className="text-xs font-bold truncate">{b.shortName}</span>
                        </button>
                      );
                    })}
                  </div>
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
        dailyCheckinPoints={config.dailyCheckinPoints}
        watchEpisodePoints={config.watchEpisodePoints}
        watchMinutePoints={config.watchMinutePoints}
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
