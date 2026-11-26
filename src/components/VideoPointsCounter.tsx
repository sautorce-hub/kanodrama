import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Clock, Coins, Flame, Gift, Pause, Sparkles } from 'lucide-react';
import { useDramaContext } from '../context/DramaContext';

interface VideoPointsCounterProps {
  isPlaying: boolean;
  isBuffering?: boolean;
  playbackRate: number;
  isMiniPlayer?: boolean;
  onNavigateRewards?: () => void;
  placement?: 'inline-left' | 'top-left' | 'top-right';
  belowTopHud?: boolean;
  className?: string;
}

interface CoinBurstState {
  id: number;
  amount: number;
}

const COIN_BURST_PARTICLES: ReadonlyArray<{
  cls: string;
  kind: 'coin' | 'spark';
}> = [
  { cls: 'coin-burst-p0', kind: 'coin' },
  { cls: 'coin-burst-p1', kind: 'coin' },
  { cls: 'coin-burst-p2', kind: 'coin' },
  { cls: 'coin-burst-p3', kind: 'coin' },
  { cls: 'coin-burst-p4', kind: 'coin' },
  { cls: 'coin-burst-p5', kind: 'coin' },
  { cls: 'coin-burst-p6', kind: 'spark' },
  { cls: 'coin-burst-p7', kind: 'spark' },
  { cls: 'coin-burst-p8', kind: 'spark' },
  { cls: 'coin-burst-p9', kind: 'spark' },
  { cls: 'coin-burst-p10', kind: 'spark' },
  { cls: 'coin-burst-p11', kind: 'spark' },
];

function formatClockMmSs(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const VideoPointsCounter: React.FC<VideoPointsCounterProps> = ({
  isPlaying,
  isBuffering = false,
  playbackRate,
  isMiniPlayer = false,
  onNavigateRewards,
  placement = 'top-left',
  belowTopHud = false,
  className = '',
}) => {
  const {
    t,
    user,
    language,
    pointsBalance,
    todayWatchSeconds,
    todayWatchPointsEarned,
    dailyMissionMaxWatchSeconds,
    watchMinutePoints,
    dailyMissionMilestones,
    dailyMissionStatuses,
    accountLevelInfo,
    pointsPerUsd,
    openAuthModal,
    refreshPointsBalance,
  } = useDramaContext();

  const [expanded, setExpanded] = useState(false);
  const [displaySeconds, setDisplaySeconds] = useState<number>(todayWatchSeconds);
  const [tabHidden, setTabHidden] = useState<boolean>(
    typeof document !== 'undefined' ? document.hidden : false
  );
  const [coinBurst, setCoinBurst] = useState<CoinBurstState | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const burstSeqRef = useRef(0);
  const burstTimerRef = useRef<number | null>(null);

  const isId = language === 'id';
  const safeRate = Number(playbackRate) || 1;
  const speedValid = safeRate >= 0.75 && safeRate <= 1.25;
  const isActivelyCounting = Boolean(
    user && isPlaying && !isBuffering && speedValid && !tabHidden
  );
  const maxMissionSeconds = Math.max(60, dailyMissionMaxWatchSeconds || 3600);
  const maxMissionMinutes = Math.floor(maxMissionSeconds / 60);

  useEffect(() => {
    if (user && pointsBalance === null) {
      void refreshPointsBalance();
    }
  }, [user, pointsBalance, refreshPointsBalance]);

  useEffect(() => {
    if (!user) {
      setCoinBurst(null);
      return;
    }
    const onPointsUpdated = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          source?: string;
          awardedWatchPoints?: number;
          awardedMilestonePoints?: number;
          awardedEpisodePoints?: number;
        }>
      ).detail;
      if (!detail) return;
      const watchPts =
        typeof detail.awardedWatchPoints === 'number' && detail.awardedWatchPoints > 0
          ? Math.floor(detail.awardedWatchPoints)
          : 0;
      const milestonePts =
        typeof detail.awardedMilestonePoints === 'number' &&
        detail.awardedMilestonePoints > 0
          ? Math.floor(detail.awardedMilestonePoints)
          : 0;
      const episodePts =
        typeof detail.awardedEpisodePoints === 'number' && detail.awardedEpisodePoints > 0
          ? Math.floor(detail.awardedEpisodePoints)
          : 0;
      const awardedAmount = watchPts + milestonePts + episodePts;
      if (awardedAmount <= 0) return;

      burstSeqRef.current += 1;
      setCoinBurst({ id: burstSeqRef.current, amount: awardedAmount });
      if (burstTimerRef.current !== null) {
        window.clearTimeout(burstTimerRef.current);
      }
      burstTimerRef.current = window.setTimeout(() => {
        setCoinBurst(null);
        burstTimerRef.current = null;
      }, 920);
    };

    window.addEventListener('kd:points-updated', onPointsUpdated);
    return () => {
      window.removeEventListener('kd:points-updated', onPointsUpdated);
      if (burstTimerRef.current !== null) {
        window.clearTimeout(burstTimerRef.current);
        burstTimerRef.current = null;
      }
    };
  }, [user]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVis = () => setTabHidden(document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // Reconcile local ticking seconds with authoritative server seconds
  useEffect(() => {
    if (!user) {
      setDisplaySeconds(0);
      return;
    }
    setDisplaySeconds((prev) => {
      if (todayWatchSeconds === 0 && prev > 60) return 0;
      if (todayWatchSeconds > prev) return todayWatchSeconds;
      if (prev - todayWatchSeconds > 28) return todayWatchSeconds;
      return prev;
    });
  }, [user, todayWatchSeconds]);

  // Smooth 1-second local counter tick while playing validly
  useEffect(() => {
    if (!isActivelyCounting) return;
    const timer = window.setInterval(() => {
      setDisplaySeconds((prev) => {
        const cap = todayWatchSeconds + 16;
        return prev < cap ? prev + 1 : prev;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isActivelyCounting, todayWatchSeconds]);

  // Close popover on outside click
  useEffect(() => {
    if (!expanded) return;
    const onDocClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setExpanded(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [expanded]);

  if (isMiniPlayer) return null;

  const cappedMissionSec = Math.min(displaySeconds, maxMissionSeconds);
  const completedMinutes = Math.floor(cappedMissionSec / 60);
  const secIntoCurrentMin = displaySeconds % 60;
  const secRemainingForNext = 60 - secIntoCurrentMin;
  const missionDone = cappedMissionSec >= maxMissionSeconds;
  const missionPct = Math.min(
    100,
    Math.round((cappedMissionSec / maxMissionSeconds) * 100)
  );
  const oneUsdtPoints = Math.max(1000, pointsPerUsd || 100000);
  const balanceDisplay = Math.max(0, pointsBalance ?? 0);

  const statusText = isActivelyCounting
    ? isId
      ? 'AKTIF'
      : 'LIVE'
    : isBuffering
    ? 'BUFFER'
    : !speedValid
    ? '1x ONLY'
    : tabHidden
    ? 'TAB'
    : isId
    ? 'JEDA'
    : 'PAUSED';

  const handleOpenRewardsPage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(false);
    onNavigateRewards?.();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('kd:navigate', {
          detail: { tab: 'rewards' },
        })
      );
    }
  };

  const isLeftAligned = placement === 'inline-left' || placement === 'top-left';
  const positionClass =
    placement === 'inline-left'
      ? 'relative z-30 inline-flex flex-col items-start pointer-events-auto'
      : placement === 'top-right'
      ? `absolute ${
          belowTopHud
            ? 'top-[calc(max(10px,env(safe-area-inset-top))+62px)] sm:top-[72px]'
            : 'top-3 sm:top-4'
        } right-3 sm:right-4 z-30 flex flex-col items-end pointer-events-auto transition-[top] duration-200`
      : `absolute ${
          belowTopHud
            ? 'top-[calc(max(10px,env(safe-area-inset-top))+62px)] sm:top-[72px]'
            : 'top-3 sm:top-4'
        } left-3 sm:left-4 z-30 flex flex-col items-start pointer-events-auto transition-[top] duration-200`;

  if (!user) {
    return (
      <div
        ref={containerRef}
        data-hud-control="true"
        className={`${positionClass} ${className}`.trim()}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openAuthModal(
              isId
                ? `Masuk untuk mengumpulkan poin nonton (+${watchMinutePoints} poin/menit) & menukarnya ke DANA/PayPal`
                : `Sign in to earn watch points (+${watchMinutePoints} pts/min) & withdraw to PayPal/DANA`
            );
          }}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#09090B]/90 backdrop-blur-md border border-[#D4AF37]/45 text-xs font-bold text-white shadow-lg hover:border-[#D4AF37] hover:bg-[#141418]/95 transition-all whitespace-nowrap"
        >
          <Coins className="w-3.5 h-3.5 text-[#D4AF37] shrink-0" />
          <span className="tabular-nums">
            {isId ? 'Dapat Poin Nonton' : 'Earn Watch Pts'}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      data-hud-control="true"
      className={`${positionClass} ${isLeftAligned ? 'items-start' : 'items-end'} ${className}`.trim()}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setExpanded((prev) => !prev);
        }}
        aria-expanded={expanded}
        aria-label={isId ? 'Counter Poin Nonton & Misi Harian' : 'Live Watch Points Counter'}
        className={`relative group flex items-center gap-2 px-3 py-1.5 rounded-lg backdrop-blur-md border text-xs font-bold shadow-[0_8px_24px_rgba(0,0,0,0.65)] transition-all whitespace-nowrap ${
          coinBurst
            ? 'bg-[#09090B]/95 border-[#D4AF37] ring-1 ring-[#D4AF37]/60 text-white'
            : isActivelyCounting
            ? 'bg-[#09090B]/90 border-emerald-400/50 text-white hover:border-[#D4AF37]'
            : 'bg-[#09090B]/90 border-amber-400/40 text-[#D4D4D8] hover:border-white/40'
        }`}
      >
        {isActivelyCounting ? (
          <Sparkles className="w-3 h-3 text-emerald-400 shrink-0" />
        ) : (
          <Pause className="w-3 h-3 text-amber-400 shrink-0" />
        )}

        <span className="relative inline-flex items-center justify-center shrink-0">
          {coinBurst && (
            <span
              key={`burst-${coinBurst.id}`}
              aria-hidden="true"
              className="pointer-events-none absolute left-1/2 top-1/2 z-40"
            >
              <span className="coin-burst-ring absolute left-0 top-0 w-7 h-7 rounded-full border border-[#FDE68A]/85 bg-[#D4AF37]/20" />
              {COIN_BURST_PARTICLES.map((p) => (
                <span
                  key={p.cls}
                  className={`coin-burst-particle absolute left-0 top-0 rounded-full ${
                    p.kind === 'coin'
                      ? 'coin-burst-coin w-2.5 h-2.5'
                      : 'coin-burst-spark w-1.5 h-1.5'
                  } ${p.cls}`}
                />
              ))}
            </span>
          )}
          <Coins
            key={coinBurst ? `coin-${coinBurst.id}` : 'coin-idle'}
            className={`w-3.5 h-3.5 text-[#D4AF37] shrink-0 ${
              coinBurst ? 'coin-icon-pop' : ''
            }`}
          />
        </span>

        <span className="relative inline-flex items-center">
          {coinBurst && (
            <span
              key={`float-${coinBurst.id}`}
              aria-hidden="true"
              className="coin-float-up pointer-events-none absolute left-1/2 top-1/2 z-50 whitespace-nowrap text-[11px] sm:text-xs font-black tracking-tight text-[#FEF08A] drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)]"
            >
              +{coinBurst.amount.toLocaleString()} pts
            </span>
          )}
          <span
            key={coinBurst ? `bal-${coinBurst.id}` : 'bal-idle'}
            className={`tabular-nums font-extrabold transition-colors duration-300 ${
              coinBurst ? 'coin-balance-pop text-[#FDE68A]' : 'text-white'
            }`}
          >
            {balanceDisplay.toLocaleString()}
          </span>
        </span>

        <span className="text-[10px] text-[#A1A1AA] hidden sm:inline">pts</span>

        <span className="h-3 w-px bg-white/15" />

        {missionDone ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-300 tabular-nums">
            <CheckCircle2 className="w-3 h-3" />
            <span>60/60m</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#D4AF37] tabular-nums">
            <Clock className="w-3 h-3" />
            <span>{formatClockMmSs(displaySeconds)}</span>
            <span className="text-[10px] text-[#A1A1AA] font-semibold hidden md:inline">
              / {maxMissionMinutes}m
            </span>
          </span>
        )}
      </button>

      {expanded && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="mt-2 w-[275px] sm:w-[305px] max-w-[calc(100vw-1.5rem)] rounded-2xl bg-[#111015]/95 backdrop-blur-xl border border-[#D4AF37]/35 p-3.5 shadow-[0_18px_45px_rgba(0,0,0,0.85)] text-left space-y-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold text-[#D4AF37] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span>
                  {isId ? 'Counter Poin Langsung' : 'Live Watch Counter'}
                </span>
              </p>
              <p className="text-lg font-extrabold text-white tabular-nums mt-0.5">
                {balanceDisplay.toLocaleString()}{' '}
                <span className="text-xs font-semibold text-[#D4AF37]">
                  {isId ? 'poin' : 'pts'}
                </span>
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {accountLevelInfo && (
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#D4AF37]/15 text-[#FDE68A] border border-[#D4AF37]/35">
                  {accountLevelInfo.tierName} {accountLevelInfo.multiplier}x
                </span>
              )}
              <span
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                  isActivelyCounting
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                }`}
              >
                {statusText}
              </span>
            </div>
          </div>

          {/* Per-minute live progress */}
          <div className="p-2.5 rounded-xl bg-[#09090B]/90 border border-white/10 space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[#A1A1AA]">
                {missionDone
                  ? isId
                    ? 'Misi 1 Jam Hari Ini Selesai'
                    : '1h Daily Mission Completed'
                  : isId
                  ? `Menit berikutnya (+${watchMinutePoints} poin)`
                  : `Next minute (+${watchMinutePoints} pts)`}
              </span>
              <span className="text-white font-bold tabular-nums">
                {missionDone ? 'MAX' : `${secRemainingForNext}s`}
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#D4AF37] to-emerald-400 transition-all duration-500"
                style={{
                  width: `${missionDone ? 100 : Math.max(4, Math.round((secIntoCurrentMin / 60) * 100))}%`,
                }}
              />
            </div>
          </div>

          {/* Daily Mission 1h Cap */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="inline-flex items-center gap-1 font-semibold text-white">
                <Flame className="w-3.5 h-3.5 text-[#EF4444]" />
                <span>
                  {isId ? 'Misi Harian (Maks 1 Jam)' : 'Daily Mission (Max 1h)'}
                </span>
              </span>
              <span className="text-emerald-300 font-bold tabular-nums">
                {completedMinutes}/{maxMissionMinutes}m ({missionPct}%)
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#EF4444] via-[#D4AF37] to-emerald-400 transition-all duration-500"
                style={{ width: `${Math.max(3, missionPct)}%` }}
              />
            </div>
            <div className="grid grid-cols-3 gap-1.5 pt-1">
              {(dailyMissionMilestones || []).map((tier) => {
                const statusMatch = dailyMissionStatuses.find(
                  (m) => m.minutes === tier.minutes
                );
                const hit = statusMatch ? statusMatch.reached : completedMinutes >= tier.minutes;
                const claimed = Boolean(statusMatch?.claimed);
                return (
                  <div
                    key={tier.minutes}
                    className={`px-2 py-1 rounded-lg border text-center text-[10px] font-bold tabular-nums ${
                      claimed
                        ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300'
                        : hit
                        ? 'bg-[#F43F5E]/20 border-[#F43F5E]/55 text-rose-200'
                        : 'bg-white/5 border-white/10 text-[#A1A1AA]'
                    }`}
                  >
                    <div>
                      {tier.minutes}m{' '}
                      {claimed
                        ? '✓'
                        : hit
                        ? `· ${t.rewards.milestoneClaimBtn}`
                        : ''}
                    </div>
                    <div className="text-[#D4AF37]">+{tier.bonusPoints}</div>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-[#A1A1AA] tabular-nums">
              {isId
                ? `Terperoleh hari ini: +${todayWatchPointsEarned.toLocaleString()} ${t.rewards.pointsUnit} · Rate: ${oneUsdtPoints.toLocaleString()} ${t.rewards.pointsUnit} = 1 USDT`
                : `Earned today: +${todayWatchPointsEarned.toLocaleString()} ${t.rewards.pointsUnit} · Rate: ${oneUsdtPoints.toLocaleString()} ${t.rewards.pointsUnit} = 1 USDT`}
            </p>
          </div>

          <button
            type="button"
            onClick={handleOpenRewardsPage}
            className="w-full py-2 px-3 rounded-xl bg-[#D4AF37] text-[#09090B] text-xs font-extrabold flex items-center justify-center gap-1.5 hover:brightness-110 transition-all"
          >
            <Gift className="w-3.5 h-3.5" />
            <span>{isId ? 'Lihat Misi & Tarik Dana' : 'View Missions & Withdraw'}</span>
          </button>
        </div>
      )}
    </div>
  );
};
