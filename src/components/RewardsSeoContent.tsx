import React, { useState } from 'react';
import { ChevronDown, Coins, Gift, Globe2, ShieldCheck, Wallet } from 'lucide-react';
import { PaymentMethodLogo } from './PaymentMethodLogo';

interface RewardsSeoContentProps {
  language: string;
  usdToIdrRate?: number;
  pointsPerUsd?: number;
  minPayoutIdr?: number;
  minPayoutUsd?: number;
  minPayoutPointsIdr?: number;
  minPayoutPointsUsd?: number;
  firstLoginBonusPoints?: number;
  bindReferralBonusPoints?: number;
  dailyCheckinPoints?: number;
  dailyCheckinDay7Points?: number;
  watchMinutePoints?: number;
  dailyMissionMilestones?: Array<{ minutes: number; bonusPoints: number }>;
  levelTiers?: Array<{
    level: number;
    tierName: string;
    multiplier: number;
    bonusPercent: number;
    watchMinutePoints: number;
    dailyCheckinPoints: number;
  }>;
  referralBonusPoints?: number;
  referralOngoingStepSeconds?: number;
  referralOngoingBonusPoints?: number;
  referralOngoingMaxSteps?: number;
  episodeBonusPoints?: number;
  maxDailyEpisodeBonusCount?: number;
  dailySocialSharePoints?: number;
  maxDailyEarnPoints?: number;
  isSignedIn?: boolean;
  onActionSignIn?: () => void;
}

const EWALLET_SHOWCASE = [
  { id: 'dana', label: 'DANA' },
  { id: 'gopay', label: 'GoPay' },
  { id: 'ovo', label: 'OVO' },
  { id: 'shopeepay', label: 'ShopeePay' },
  { id: 'linkaja', label: 'LinkAja' },
];

const BANK_SHOWCASE = [
  { code: 'BCA', label: 'BCA' },
  { code: 'BRI', label: 'BRI' },
  { code: 'BNI', label: 'BNI' },
  { code: 'MANDIRI', label: 'Mandiri' },
  { code: 'BSI', label: 'BSI' },
  { code: 'CIMB', label: 'CIMB Niaga' },
  { code: 'JAGO', label: 'Bank Jago' },
  { code: 'SEABANK', label: 'SeaBank' },
  { code: 'PERMATA', label: 'PermataBank' },
  { code: 'BTN', label: 'BTN' },
];

const GLOBAL_SHOWCASE = [
  { id: 'paypal', label: 'PayPal (USD)' },
  { id: 'wise', label: 'Wise Multi-Currency' },
  { id: 'usdt_polygon', label: 'USDT Polygon', network: 'POL' },
  { id: 'usdt_trc20', label: 'USDT TRC20', network: 'TRC' },
  { id: 'usdt_bep20', label: 'USDT BEP20', network: 'BEP' },
  { id: 'usdt_erc20', label: 'USDT ERC20', network: 'ERC' },
];

export const RewardsSeoContent: React.FC<RewardsSeoContentProps> = ({
  language,
  usdToIdrRate = 18200,
  pointsPerUsd = 100000,
  minPayoutIdr = 50000,
  minPayoutUsd = 5,
  minPayoutPointsIdr = 274726,
  minPayoutPointsUsd = 500000,
  firstLoginBonusPoints = 25000,
  bindReferralBonusPoints = 200,
  dailyCheckinPoints = 1000,
  dailyCheckinDay7Points = 2000,
  watchMinutePoints = 40,
  dailyMissionMilestones = [
    { minutes: 15, bonusPoints: 300 },
    { minutes: 30, bonusPoints: 600 },
    { minutes: 60, bonusPoints: 1200 },
  ],
  levelTiers = [],
  referralBonusPoints = 5000,
  referralOngoingStepSeconds = 3600,
  referralOngoingBonusPoints = 500,
  referralOngoingMaxSteps = 10,
  episodeBonusPoints = 500,
  maxDailyEpisodeBonusCount = 3,
  dailySocialSharePoints = 1000,
  maxDailyEarnPoints = 25000,
  isSignedIn = false,
  onActionSignIn,
}) => {
  const isId = language === 'id';
  const [openFaqIdx, setOpenFaqIdx] = useState<number>(0);
  const [showAllBanks, setShowAllBanks] = useState<boolean>(false);

  const usd5Points = pointsPerUsd * 5;
  const formattedMinIdr = `Rp ${minPayoutIdr.toLocaleString('id-ID')}`;
  const formattedRateIdr = `Rp ${usdToIdrRate.toLocaleString('id-ID')}`;
  const ongoingStepMinutes = Math.max(1, Math.round(referralOngoingStepSeconds / 60));
  const ongoingMaxTotalPoints = referralOngoingBonusPoints * referralOngoingMaxSteps;
  const milestoneSummaryText = dailyMissionMilestones
    .map((ms) => `${ms.minutes}m (+${ms.bonusPoints.toLocaleString()})`)
    .join(' · ');
  const tierSummaryText =
    levelTiers.length > 0
      ? levelTiers
          .map((t) => `${t.tierName} ${t.multiplier}x`)
          .join(' → ')
      : 'Bronze 1.0x → Silver 1.2x → Gold 1.4x → Platinum 1.6x';

  const faqs = isId
    ? [
        {
          q: 'Bagaimana cara mendapatkan poin dari nonton drama & tugas harian di KanoDrama?',
          a: `Login ke akun KanoDrama untuk langsung memperoleh bonus login pertama +${firstLoginBonusPoints.toLocaleString()} poin (1x per akun), klaim tugas harian share ke media sosial +${dailySocialSharePoints.toLocaleString()} poin/hari, check-in harian +${dailyCheckinPoints.toLocaleString()} poin (Hari ke-7 +${dailyCheckinDay7Points.toLocaleString()} poin, total ${(dailyCheckinPoints * 6 + dailyCheckinDay7Points).toLocaleString()} poin/minggu), bonus selesai episode +${episodeBonusPoints.toLocaleString()} poin (maks. ${maxDailyEpisodeBonusCount} episode/hari), serta tonton drama Asia atau film secara aktif pada kecepatan 1x dengan tab browser tetap terlihat (+${watchMinutePoints} poin/menit otomatis maks 60 menit/hari dan bonus milestone 15m/30m/60m) hingga batas ${maxDailyEarnPoints.toLocaleString()} poin/hari.`,
        },
        {
          q: 'Berapa nilai tukar poin KanoDrama ke saldo DANA, bank lokal, atau USD?',
          a: `Nilai tukar resmi KanoDrama adalah ${pointsPerUsd.toLocaleString()} poin = 1 USDT ($1.00 USD / ${formattedRateIdr}), atau ${usd5Points.toLocaleString()} poin = $5.00 USD. Untuk penarikan Rupiah (DANA, GoPay, OVO, ShopeePay, LinkAja, atau Transfer Bank lokal), batas minimum adalah ${formattedMinIdr} (${minPayoutPointsIdr.toLocaleString()} poin). Untuk PayPal, Wise, atau USDT, batas minimum adalah $${minPayoutUsd.toFixed(2)} USD (${minPayoutPointsUsd.toLocaleString()} poin).`,
        },
        {
          q: `Apa beda Bonus Referral (+${referralBonusPoints.toLocaleString()} poin), Bind (+${bindReferralBonusPoints.toLocaleString()} poin) & Reward Lanjutan Referral Valid?`,
          a: `Bonus Bind Referral (+${bindReferralBonusPoints.toLocaleString()} poin) otomatis masuk saat mendaftar lewat tautan ?ref= teman atau bind kode 1x. Bonus Referral utama (+${referralBonusPoints.toLocaleString()} poin) cair ke pengundang setelah teman menyelesaikan 60 menit (1 jam) tontonan aktif terverifikasi. Selanjutnya, setiap teman valid melanjutkan menonton aktif +${ongoingStepMinutes} menit, pengundang kembali meraih +${referralOngoingBonusPoints.toLocaleString()} poin hingga maks. ${referralOngoingMaxSteps} tahap (+${ongoingMaxTotalPoints.toLocaleString()} poin lanjutan) dengan validasi anti-cheat server.`,
        },
        {
          q: 'Kapan misi menonton harian, tugas share media sosial, dan check-in direset?',
          a: 'Seluruh progres misi menonton harian, tugas share media sosial, klaim milestone, batas perolehan poin harian, dan klaim check-in dikunci pada satu periode server dan direset otomatis setiap pukul 00.00 WIB berdasarkan waktu server.',
        },
      ]
    : [
        {
          q: 'How do I earn watch points and daily task bonuses on KanoDrama?',
          a: `Sign in to receive a +${firstLoginBonusPoints.toLocaleString()} pts first-login bonus (once per account), claim the daily social media share task (+${dailySocialSharePoints.toLocaleString()} pts/day), check in daily (+${dailyCheckinPoints.toLocaleString()} pts, Day 7 +${dailyCheckinDay7Points.toLocaleString()} pts, ${(dailyCheckinPoints * 6 + dailyCheckinDay7Points).toLocaleString()} pts/week), finish episodes (+${episodeBonusPoints.toLocaleString()} pts/ep up to ${maxDailyEpisodeBonusCount}/day), and stream dramas or movies actively at 1x speed (+${watchMinutePoints} pts/min auto up to 60 min/day and claimable 15m/30m/60m milestones) up to ${maxDailyEarnPoints.toLocaleString()} pts/day.`,
        },
        {
          q: 'What is the points conversion rate and minimum withdrawal?',
          a: `Official rate: ${pointsPerUsd.toLocaleString()} points = 1 USDT ($1.00 USD), or ${usd5Points.toLocaleString()} points = ${minPayoutUsd.toFixed(2)} USDT. Minimum PayPal, Wise, or USDT payout is ${minPayoutUsd.toFixed(2)} USDT ($${minPayoutUsd.toFixed(2)} USD · ${minPayoutPointsUsd.toLocaleString()} pts).`,
        },
        {
          q: `How do Main Referral (+${referralBonusPoints.toLocaleString()} pts), Bind (+${bindReferralBonusPoints.toLocaleString()} pts) & Ongoing Watch Rewards work?`,
          a: `The +${bindReferralBonusPoints.toLocaleString()} pts Bind Referral bonus is credited on ?ref= signup or 1x code binding. The main +${referralBonusPoints.toLocaleString()} pts Referral bonus unlocks once the friend completes 60 minutes (1 hour) of verified active watching. When that qualified referral keeps watching actively, the inviter also earns +${referralOngoingBonusPoints.toLocaleString()} pts per extra ${ongoingStepMinutes} minutes up to ${referralOngoingMaxSteps} steps (+${ongoingMaxTotalPoints.toLocaleString()} extra pts) with anti-cheat verification.`,
        },
        {
          q: 'When do daily watch missions, social shares, and check-ins reset?',
          a: 'All daily check-ins, daily social media share tasks, milestone claims, daily caps, and watch missions are locked to a single canonical server period and reset automatically once per day at 17:00 UTC.',
        },
      ];

  return (
    <section
      aria-labelledby="kanodrama-rewards-guide-heading"
      className="rounded-2xl bg-[#111015] border border-white/10 divide-y divide-white/10"
    >
      {/* Editorial Hero Guide Header */}
      <div className="p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-2 max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-wider text-[#D4AF37]">
            {isId
              ? 'Program Reward KanoDrama · Poin Nonton & Referral'
              : 'KanoDrama Rewards · Watch & Referral Program'}
          </p>
          <h2
            id="kanodrama-rewards-guide-heading"
            className="text-xl sm:text-2xl font-extrabold text-white tracking-tight"
          >
            {isId
              ? 'Nonton Drama China & Short Drama Dapat Saldo DANA, Transfer Bank, & PayPal'
              : 'Watch Asian & Short Dramas to Earn Real E-Wallet, Bank & USD Rewards'}
          </h2>
          <p className="text-xs sm:text-sm text-[#D4D4D8] leading-relaxed">
            {isId
              ? 'KanoDrama menghadirkan program reward transparan berbasis server untuk penonton setia drama Asia dan film. Setiap menit menonton aktif, check-in harian WIB, milestone misi 1 jam, dan undangan referral tercatat permanen di database akun Anda.'
              : 'KanoDrama operates a transparent server-verified rewards ledger. Every minute of active streaming, UTC daily check-in, 1-hour mission milestone, and qualified friend invitation is permanently stored in your account.'}
          </p>
        </div>

        {!isSignedIn && onActionSignIn && (
          <button
            type="button"
            onClick={onActionSignIn}
            className="px-5 py-2.5 min-h-[44px] rounded-xl bg-[#D4AF37] text-[#09090B] text-xs sm:text-sm font-extrabold hover:brightness-110 transition-all whitespace-nowrap shrink-0"
          >
            {isId ? 'Masuk & Mulai Kumpulkan Poin' : 'Sign In & Start Earning'}
          </button>
        )}
      </div>

      {/* Transparent Rate & Rule Summary Table */}
      <div className="p-5 sm:p-6 space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <Coins className="w-4 h-4 text-[#D4AF37]" />
          <span>
            {isId
              ? 'Daftar Poin, Misi Harian & Ketentuan Penarikan Resmi'
              : 'Official Earning Rates, Daily Missions & Withdrawal Rules'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[#A1A1AA]">
                <th className="py-2.5 pr-4 font-semibold">
                  {isId ? 'Aktivitas / Ketentuan' : 'Activity / Policy'}
                </th>
                <th className="py-2.5 pr-4 font-semibold">
                  {isId ? 'Nilai / Nominal' : 'Amount / Rate'}
                </th>
                <th className="py-2.5 font-semibold">
                  {isId ? 'Validasi Server' : 'Server Verification'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10 text-[#E4E4E7]">
              <tr>
                <td className="py-2.5 pr-4 font-medium">
                  {isId ? 'Bonus Login Pertama' : 'First Login Bonus'}
                </td>
                <td className="py-2.5 pr-4 font-bold text-[#FDE68A] tabular-nums">
                  +{firstLoginBonusPoints.toLocaleString()} {isId ? 'poin' : 'pts'}
                </td>
                <td className="py-2.5 text-[#A1A1AA]">
                  {isId
                    ? 'Otomatis 1x per akun saat pertama kali masuk'
                    : 'Automatically credited once per account on first login'}
                </td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 font-medium">
                  {isId ? 'Nonton Drama / Film Aktif' : 'Active Drama / Movie Watch'}
                </td>
                <td className="py-2.5 pr-4 font-bold text-[#D4AF37] tabular-nums">
                  +{watchMinutePoints} {isId ? 'poin / menit (maks 60 mnt)' : 'pts / min (max 60m)'}
                </td>
                <td className="py-2.5 text-[#A1A1AA]">
                  {isId
                    ? 'Kecepatan 1x, tab aktif, tanpa buffering/skip'
                    : '1x speed, visible tab, non-buffering playback'}
                </td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 font-medium">
                  {isId ? 'Bonus Milestone Misi Harian' : 'Daily Watch Milestones'}
                </td>
                <td className="py-2.5 pr-4 font-bold text-white tabular-nums">
                  {milestoneSummaryText}
                </td>
                <td className="py-2.5 text-[#A1A1AA]">
                  {isId ? 'Reset otomatis setiap 00.00 WIB' : 'Resets daily at 17:00 UTC'}
                </td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 font-medium">
                  {isId ? 'Sistem Level Akun Bertingkat' : 'Tiered Account Levels'}
                </td>
                <td className="py-2.5 pr-4 font-bold text-[#D4AF37] tabular-nums">
                  {tierSummaryText}
                </td>
                <td className="py-2.5 text-[#A1A1AA]">
                  {isId
                    ? 'Naik level otomatis dari total poin atau jam nonton terverifikasi'
                    : 'Auto-upgraded from verified lifetime points or watch time'}
                </td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 font-medium">
                  {isId ? 'Check-In Harian & Streak' : 'Daily Check-In & Streak'}
                </td>
                <td className="py-2.5 pr-4 font-bold text-[#D4AF37] tabular-nums">
                  +{dailyCheckinPoints.toLocaleString()}{' '}
                  {isId
                    ? `poin / hari (H-7 +${dailyCheckinDay7Points.toLocaleString()})`
                    : `pts / day (Day 7 +${dailyCheckinDay7Points.toLocaleString()})`}
                </td>
                <td className="py-2.5 text-[#A1A1AA]">
                  {isId
                    ? `Total ${(dailyCheckinPoints * 6 + dailyCheckinDay7Points).toLocaleString()} poin/minggu · Reset 00.00 WIB`
                    : `Total ${(dailyCheckinPoints * 6 + dailyCheckinDay7Points).toLocaleString()} pts/week · Resets 17:00 UTC`}
                </td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 font-medium">
                  {isId ? 'Tugas Harian Share Media Sosial' : 'Daily Social Media Share'}
                </td>
                <td className="py-2.5 pr-4 font-bold text-[#FDE68A] tabular-nums">
                  +{dailySocialSharePoints.toLocaleString()} {isId ? 'poin / hari' : 'pts / day'}
                </td>
                <td className="py-2.5 text-[#A1A1AA]">
                  {isId
                    ? '1x per periode harian (reset 00.00 WIB, proteksi anti-spam)'
                    : 'Once per daily period (resets 17:00 UTC, anti-spam verified)'}
                </td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 font-medium">
                  {isId ? 'Bonus Selesai Episode (Misi Ringan)' : 'Episode Completion Bonus'}
                </td>
                <td className="py-2.5 pr-4 font-bold text-[#FDE68A] tabular-nums">
                  +{episodeBonusPoints.toLocaleString()} {isId ? `poin / ep (maks ${maxDailyEpisodeBonusCount}/hr)` : `pts / ep (max ${maxDailyEpisodeBonusCount}/day)`}
                </td>
                <td className="py-2.5 text-[#A1A1AA]">
                  {isId
                    ? 'Minimal 20 dtk tonton aktif & unik per episode, reset 00.00 WIB'
                    : 'Min 20s verified watch & unique per episode, resets 17:00 UTC'}
                </td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 font-medium">
                  {isId ? 'Bonus Referral, Bind & Lanjutan' : 'Referral, Bind & Ongoing Watch'}
                </td>
                <td className="py-2.5 pr-4 font-bold text-emerald-300 tabular-nums">
                  +{bindReferralBonusPoints.toLocaleString()} bind · +{referralBonusPoints.toLocaleString()} + +{referralOngoingBonusPoints.toLocaleString()}/{ongoingStepMinutes}m
                </td>
                <td className="py-2.5 text-[#A1A1AA]">
                  {isId
                    ? `+${referralBonusPoints.toLocaleString()} setelah 60 mnt; +${referralOngoingBonusPoints.toLocaleString()} tiap +${ongoingStepMinutes} mnt lanjutan (maks ${referralOngoingMaxSteps}x)`
                    : `+${referralBonusPoints.toLocaleString()} after 60m; +${referralOngoingBonusPoints.toLocaleString()} per extra ${ongoingStepMinutes}m (max ${referralOngoingMaxSteps}x)`}
                </td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 font-medium">
                  {isId ? 'Kurs Konversi & Minimum Withdraw' : 'Conversion Rate & Minimum Withdrawal'}
                </td>
                <td className="py-2.5 pr-4 font-bold text-white tabular-nums">
                  {isId
                    ? `${pointsPerUsd.toLocaleString()} pts = 1 USDT (${formattedRateIdr})`
                    : `${pointsPerUsd.toLocaleString()} pts = 1 USDT ($1.00 USD)`}
                </td>
                <td className="py-2.5 text-[#A1A1AA] tabular-nums">
                  {isId
                    ? `Min IDR ${formattedMinIdr} (${minPayoutPointsIdr.toLocaleString()} pts) · Min USD $${minPayoutUsd.toFixed(2)} (${minPayoutPointsUsd.toLocaleString()} pts)`
                    : `Min ${minPayoutUsd.toFixed(2)} USDT ($${minPayoutUsd.toFixed(2)} USD · ${minPayoutPointsUsd.toLocaleString()} pts)`}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Supported Payout Channels Showcase (ID E-Wallets, 10 Local Banks, Global USD/USDT) */}
      <div className="p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <Wallet className="w-4 h-4 text-emerald-400" />
          <span>
            {isId
              ? 'Metode Pencairan Resmi (E-Wallet, Bank Lokal Indonesia & Global USD)'
              : 'Supported Withdrawal Methods (Indonesia E-Wallets, Banks & Global USD)'}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="space-y-2.5">
            <p className="text-xs font-semibold text-[#D4AF37]">
              {isId ? 'E-Wallet Indonesia (Min Rp 50.000)' : 'Indonesia E-Wallets (Min Rp 50,000)'}
            </p>
            <div className="flex flex-wrap gap-2">
              {EWALLET_SHOWCASE.map((w) => (
                <div
                  key={w.id}
                  className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#0B0B0F] border border-white/10 text-xs font-semibold text-white"
                >
                  <PaymentMethodLogo method={w.id} size="sm" />
                  <span>{w.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-sky-300">
                {isId ? 'Transfer Bank Lokal (10 Bank)' : 'Indonesia Local Banks (10 Banks)'}
              </p>
              <button
                type="button"
                onClick={() => setShowAllBanks((prev) => !prev)}
                className="text-[11px] font-semibold text-[#A1A1AA] hover:text-white underline underline-offset-2"
              >
                {showAllBanks
                  ? isId
                    ? 'Ringkas'
                    : 'Show less'
                  : isId
                  ? `Lihat semua (${BANK_SHOWCASE.length})`
                  : `View all (${BANK_SHOWCASE.length})`}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {(showAllBanks ? BANK_SHOWCASE : BANK_SHOWCASE.slice(0, 4)).map((b) => (
                <div
                  key={b.code}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#0B0B0F] border border-white/10 text-xs font-semibold text-white"
                >
                  <PaymentMethodLogo method="bank_transfer" bankCode={b.code} size="sm" />
                  <span>{b.label}</span>
                </div>
              ))}
              {!showAllBanks && (
                <button
                  type="button"
                  onClick={() => setShowAllBanks(true)}
                  className="inline-flex items-center px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-[#D4D4D8]"
                >
                  +{BANK_SHOWCASE.length - 4} {isId ? 'bank lainnya' : 'more banks'}
                </button>
              )}
            </div>
          </div>

          <div className="space-y-2.5">
            <p className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
              <Globe2 className="w-3.5 h-3.5" />
              <span>
                {isId ? 'Global USD & USDT (Min $5.00)' : 'Global USD & USDT (Min $5.00)'}
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              {GLOBAL_SHOWCASE.map((g) => (
                <div
                  key={g.id}
                  className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[#0B0B0F] border border-white/10 text-xs font-semibold text-white"
                >
                  <PaymentMethodLogo method={g.id} network={g.network} size="sm" />
                  <span>{g.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Crawlable FAQ Accordion Matching FAQPage JSON-LD */}
      <div className="p-5 sm:p-6 space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <Gift className="w-4 h-4 text-[#D4AF37]" />
          <span>
            {isId
              ? 'Pertanyaan Umum Sistem Poin & Referral KanoDrama'
              : 'KanoDrama Points & Referral FAQ'}
          </span>
        </div>

        <div className="divide-y divide-white/10 border border-white/10 rounded-xl bg-[#0B0B0F]">
          {faqs.map((item, idx) => {
            const isOpen = openFaqIdx === idx;
            return (
              <div key={item.q}>
                <button
                  type="button"
                  onClick={() => setOpenFaqIdx(isOpen ? -1 : idx)}
                  aria-expanded={isOpen}
                  className="w-full px-4 py-3 text-left flex items-center justify-between gap-3 text-xs sm:text-sm font-semibold text-white hover:bg-white/[0.03] transition-colors"
                >
                  <span>{item.q}</span>
                  <ChevronDown
                    className={`w-4 h-4 text-[#A1A1AA] shrink-0 transition-transform ${
                      isOpen ? 'rotate-180 text-[#D4AF37]' : ''
                    }`}
                  />
                </button>
                {isOpen && (
                  <p className="px-4 pb-3.5 text-xs sm:text-sm text-[#A1A1AA] leading-relaxed">
                    {item.a}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-[11px] text-[#71717A] flex items-center gap-1.5 pt-1">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>
            {isId
              ? 'Setiap perubahan poin, bonus referral, dan status pencairan diaudit pada ledger transaksi server KanoDrama.'
              : 'Every point accrual, referral bonus, and withdrawal state change is recorded in the server transaction ledger.'}
          </span>
        </p>
      </div>
    </section>
  );
};
