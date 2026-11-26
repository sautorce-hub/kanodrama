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
          q: 'Bagaimana cara mengumpulkan poin di KanoDrama?',
          a: `Login pertama langsung dapat +${firstLoginBonusPoints.toLocaleString()} poin. Setelah itu, kamu bisa dapat poin dari check-in harian (+${dailyCheckinPoints.toLocaleString()} poin/hari, H-7 +${dailyCheckinDay7Points.toLocaleString()} poin), share harian (+${dailySocialSharePoints.toLocaleString()} poin/hari), selesai episode (+${episodeBonusPoints.toLocaleString()} poin, maks. ${maxDailyEpisodeBonusCount}/hari), dan nonton aktif kecepatan 1x (+${watchMinutePoints} poin/menit hingga 60 menit/hari plus milestone 15m/30m/60m), dengan batas harian ${maxDailyEarnPoints.toLocaleString()} poin.`,
        },
        {
          q: 'Berapa nilai tukar poin dan minimum penarikan?',
          a: `Kurs acuan adalah ${pointsPerUsd.toLocaleString()} poin = 1 USDT ($1.00 USD / ${formattedRateIdr}), atau ${usd5Points.toLocaleString()} poin = $5.00 USD. Penarikan Rupiah (DANA, GoPay, OVO, ShopeePay, LinkAja, dan transfer bank) mulai dari ${formattedMinIdr} (${minPayoutPointsIdr.toLocaleString()} poin). Untuk PayPal, Wise, atau USDT mulai dari $${minPayoutUsd.toFixed(2)} USD (${minPayoutPointsUsd.toLocaleString()} poin).`,
        },
        {
          q: `Bagaimana aturan bonus referral (+${referralBonusPoints.toLocaleString()} poin) & bind kode (+${bindReferralBonusPoints.toLocaleString()} poin)?`,
          a: `Teman yang daftar lewat tautan ?ref= atau memasukkan kode sekali langsung dapat +${bindReferralBonusPoints.toLocaleString()} poin. Kamu dapat +${referralBonusPoints.toLocaleString()} poin setelah teman menonton aktif 1 jam (60 menit), lalu +${referralOngoingBonusPoints.toLocaleString()} poin lagi setiap tambahan ${ongoingStepMinutes} menit nonton (maks. ${referralOngoingMaxSteps} tahap / +${ongoingMaxTotalPoints.toLocaleString()} poin).`,
        },
        {
          q: 'Kapan check-in dan misi harian direset?',
          a: 'Check-in harian, misi nonton, klaim milestone, tugas share, dan batas harian direset otomatis setiap pukul 00.00 WIB.',
        },
      ]
    : [
        {
          q: 'How do I earn points on KanoDrama?',
          a: `Your first sign-in grants +${firstLoginBonusPoints.toLocaleString()} pts. Keep earning via daily check-ins (+${dailyCheckinPoints.toLocaleString()} pts/day, Day 7 +${dailyCheckinDay7Points.toLocaleString()} pts), daily social share (+${dailySocialSharePoints.toLocaleString()} pts/day), finishing episodes (+${episodeBonusPoints.toLocaleString()} pts up to ${maxDailyEpisodeBonusCount}/day), and active 1x-speed watching (+${watchMinutePoints} pts/min up to 60 min/day plus 15m/30m/60m milestones), capped at ${maxDailyEarnPoints.toLocaleString()} pts/day.`,
        },
        {
          q: 'What is the exchange rate and minimum withdrawal?',
          a: `The base rate is ${pointsPerUsd.toLocaleString()} pts = 1 USDT ($1.00 USD), or ${usd5Points.toLocaleString()} pts = ${minPayoutUsd.toFixed(2)} USDT. PayPal, Wise, and USDT payouts start at $${minPayoutUsd.toFixed(2)} USD (${minPayoutPointsUsd.toLocaleString()} pts).`,
        },
        {
          q: `How do Referral (+${referralBonusPoints.toLocaleString()} pts) and Bind (+${bindReferralBonusPoints.toLocaleString()} pts) bonuses work?`,
          a: `Friends get +${bindReferralBonusPoints.toLocaleString()} pts when signing up via your ?ref= link or binding your code once. You unlock +${referralBonusPoints.toLocaleString()} pts after they watch 1 hour (60 min) actively, plus +${referralOngoingBonusPoints.toLocaleString()} pts for each extra ${ongoingStepMinutes} min watched (up to ${referralOngoingMaxSteps} steps / +${ongoingMaxTotalPoints.toLocaleString()} pts).`,
        },
        {
          q: 'When do daily missions and check-ins reset?',
          a: 'Daily check-ins, watch missions, milestone claims, social share tasks, and daily caps reset automatically at 17:00 UTC.',
        },
      ];

  return (
    <section
      aria-labelledby="kanodrama-rewards-guide-heading"
      className="rounded-2xl bg-[#121117] border border-white/10 divide-y divide-white/10"
    >
      {/* Guide Header */}
      <div className="p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5 max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#D4AF37]">
            {isId ? 'Panduan Poin KanoDrama' : 'KanoDrama Rewards Guide'}
          </p>
          <h2
            id="kanodrama-rewards-guide-heading"
            className="text-lg sm:text-xl font-bold text-white tracking-tight"
          >
            {isId
              ? 'Nonton Drama Favorit & Tukar Poin ke E-Wallet, Bank, atau USD'
              : 'Watch Dramas & Cash Out to E-Wallets, Bank Transfer, or USD'}
          </h2>
          <p className="text-xs sm:text-sm text-[#A1A1AA] leading-relaxed">
            {isId
              ? 'Kumpulkan poin dari check-in WIB, nonton aktif, tugas harian, dan referral, lalu tarik langsung saat saldo memenuhi batas minimum.'
              : 'Earn points from daily UTC check-ins, active watch time, sharing, and referrals, then cash out once you meet the minimum threshold.'}
          </p>
        </div>

        {!isSignedIn && onActionSignIn && (
          <button
            type="button"
            onClick={onActionSignIn}
            className="px-5 py-2.5 min-h-[42px] rounded-xl bg-[#D4AF37] text-[#09090B] text-xs sm:text-sm font-extrabold hover:brightness-110 transition-all whitespace-nowrap shrink-0"
          >
            {isId ? 'Masuk & Mulai' : 'Sign In & Start'}
          </button>
        )}
      </div>

      {/* Rate & Rule Summary Table */}
      <div className="p-5 sm:p-6 space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <Coins className="w-4 h-4 text-[#D4AF37]" />
          <span>
            {isId
              ? 'Rincian Poin & Aturan Penarikan'
              : 'Earning Rates & Withdrawal Rules'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[#A1A1AA]">
                <th className="py-2.5 pr-4 font-semibold">
                  {isId ? 'Aktivitas' : 'Activity'}
                </th>
                <th className="py-2.5 pr-4 font-semibold">
                  {isId ? 'Poin / Nilai' : 'Reward / Rate'}
                </th>
                <th className="py-2.5 font-semibold">
                  {isId ? 'Catatan' : 'Notes'}
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
                  {isId ? '1x saat pertama masuk' : 'Once on first sign-in'}
                </td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 font-medium">
                  {isId ? 'Nonton Aktif' : 'Active Watching'}
                </td>
                <td className="py-2.5 pr-4 font-bold text-[#D4AF37] tabular-nums">
                  +{watchMinutePoints} {isId ? 'poin/mnt (maks 60 mnt)' : 'pts/min (max 60m)'}
                </td>
                <td className="py-2.5 text-[#A1A1AA]">
                  {isId ? 'Kecepatan 1x, tab aktif' : '1x speed, active tab'}
                </td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 font-medium">
                  {isId ? 'Milestone Harian' : 'Daily Milestones'}
                </td>
                <td className="py-2.5 pr-4 font-bold text-white tabular-nums">
                  {milestoneSummaryText}
                </td>
                <td className="py-2.5 text-[#A1A1AA]">
                  {isId ? 'Reset 00.00 WIB' : 'Resets 17:00 UTC'}
                </td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 font-medium">
                  {isId ? 'Level Akun' : 'Account Levels'}
                </td>
                <td className="py-2.5 pr-4 font-bold text-[#D4AF37] tabular-nums">
                  {tierSummaryText}
                </td>
                <td className="py-2.5 text-[#A1A1AA]">
                  {isId ? 'Naik otomatis dari poin/durasi nonton' : 'Auto-upgrades with points or watch time'}
                </td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 font-medium">
                  {isId ? 'Check-in Harian' : 'Daily Check-in'}
                </td>
                <td className="py-2.5 pr-4 font-bold text-[#D4AF37] tabular-nums">
                  +{dailyCheckinPoints.toLocaleString()}{' '}
                  {isId
                    ? `poin/hari (H-7 +${dailyCheckinDay7Points.toLocaleString()})`
                    : `pts/day (Day 7 +${dailyCheckinDay7Points.toLocaleString()})`}
                </td>
                <td className="py-2.5 text-[#A1A1AA]">
                  {isId
                    ? `Maks ${(dailyCheckinPoints * 6 + dailyCheckinDay7Points).toLocaleString()} poin/minggu · 00.00 WIB`
                    : `Up to ${(dailyCheckinPoints * 6 + dailyCheckinDay7Points).toLocaleString()} pts/wk · 17:00 UTC`}
                </td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 font-medium">
                  {isId ? 'Share Sosmed Harian' : 'Daily Social Share'}
                </td>
                <td className="py-2.5 pr-4 font-bold text-[#FDE68A] tabular-nums">
                  +{dailySocialSharePoints.toLocaleString()} {isId ? 'poin/hari' : 'pts/day'}
                </td>
                <td className="py-2.5 text-[#A1A1AA]">
                  {isId ? '1x per hari (reset 00.00 WIB)' : 'Once daily (resets 17:00 UTC)'}
                </td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 font-medium">
                  {isId ? 'Selesai Episode' : 'Episode Finished'}
                </td>
                <td className="py-2.5 pr-4 font-bold text-[#FDE68A] tabular-nums">
                  +{episodeBonusPoints.toLocaleString()} {isId ? `poin (maks ${maxDailyEpisodeBonusCount}/hr)` : `pts (max ${maxDailyEpisodeBonusCount}/day)`}
                </td>
                <td className="py-2.5 text-[#A1A1AA]">
                  {isId ? 'Min 20 dtk per episode unik' : 'Min 20s per unique episode'}
                </td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 font-medium">
                  {isId ? 'Referral & Bind' : 'Referral & Bind'}
                </td>
                <td className="py-2.5 pr-4 font-bold text-emerald-300 tabular-nums">
                  +{bindReferralBonusPoints.toLocaleString()} bind · +{referralBonusPoints.toLocaleString()} + +{referralOngoingBonusPoints.toLocaleString()}/{ongoingStepMinutes}m
                </td>
                <td className="py-2.5 text-[#A1A1AA]">
                  {isId
                    ? `+${referralBonusPoints.toLocaleString()} setelah 1 jam; +${referralOngoingBonusPoints.toLocaleString()} tiap +${ongoingStepMinutes} mnt (maks ${referralOngoingMaxSteps}x)`
                    : `+${referralBonusPoints.toLocaleString()} after 1h; +${referralOngoingBonusPoints.toLocaleString()} per extra ${ongoingStepMinutes}m (max ${referralOngoingMaxSteps}x)`}
                </td>
              </tr>
              <tr>
                <td className="py-2.5 pr-4 font-medium">
                  {isId ? 'Kurs & Minimum Tarik' : 'Rate & Min Payout'}
                </td>
                <td className="py-2.5 pr-4 font-bold text-white tabular-nums">
                  {isId
                    ? `${pointsPerUsd.toLocaleString()} poin = 1 USDT (${formattedRateIdr})`
                    : `${pointsPerUsd.toLocaleString()} pts = 1 USDT ($1.00 USD)`}
                </td>
                <td className="py-2.5 text-[#A1A1AA] tabular-nums">
                  {isId
                    ? `Min ${formattedMinIdr} (${minPayoutPointsIdr.toLocaleString()} poin) · USD $${minPayoutUsd.toFixed(2)} (${minPayoutPointsUsd.toLocaleString()} poin)`
                    : `Min ${minPayoutUsd.toFixed(2)} USDT ($${minPayoutUsd.toFixed(2)} USD · ${minPayoutPointsUsd.toLocaleString()} pts)`}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Supported Payout Channels Showcase */}
      <div className="p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <Wallet className="w-4 h-4 text-emerald-400" />
          <span>
            {isId
              ? 'Metode Pencairan yang Tersedia'
              : 'Supported Withdrawal Methods'}
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
              ? 'Semua perolehan poin, bonus referral, dan status penarikan tercatat otomatis di mutasi akun.'
              : 'All earned points, referral bonuses, and payout updates are logged in your transaction history.'}
          </span>
        </p>
      </div>
    </section>
  );
};
