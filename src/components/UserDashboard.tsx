import React, { useEffect, useState } from 'react';
import {
  Bookmark,
  Check,
  CheckCircle2,
  Clapperboard,
  Clock,
  Coins,
  Crown,
  Flame,
  FolderOpen,
  Heart,
  History,
  Lock,
  MessageSquare,
  Play,
  Settings,
  Trash2,
  User,
} from 'lucide-react';
import { useDramaContext } from '../context/DramaContext';
import { RewardsPayoutSection } from './RewardsPayoutSection';
import { SUPPORTED_LANGUAGES } from '../i18n/helpers';
import { formatPlaybackClock, getDramaPath, getWatchPath } from '../utils/seo';
import type {
  AccentThemeId,
  DramaItem,
  EpisodeComment,
  LanguageCode,
  MediaProviderName,
  SubtitleStyleConfig,
} from '../types/drama';

interface UserDashboardProps {
  onSelectDrama: (drama: DramaItem) => void;
  onPlayDrama: (drama: DramaItem, episode?: number, resumeTimeSec?: number) => void;
  onBackToHome: () => void;
  initialSubTab?: DashboardSubTab;
  initialWatchlistCategory?: 'movie' | 'drama';
  standaloneRewards?: boolean;
}

type DashboardSubTab = 'profile' | 'rewards' | 'watchlist' | 'history' | 'comments';

const ACCENT_OPTIONS: { id: AccentThemeId; label: string; hex: string }[] = [
  { id: 'crimson', label: 'Crimson Noir', hex: '#EF4444' },
  { id: 'gold', label: 'Espresso Gold', hex: '#D4AF37' },
  { id: 'rose', label: 'Royal Rose', hex: '#E11D48' },
  { id: 'emerald', label: 'Emerald Jade', hex: '#10B981' },
];

export const UserDashboard: React.FC<UserDashboardProps> = ({
  onSelectDrama,
  onPlayDrama,
  onBackToHome,
  initialSubTab = 'profile',
  initialWatchlistCategory = 'movie',
  standaloneRewards = false,
}) => {
  const {
    t,
    language,
    user,
    streak,
    pointsBalance,
    accountLevelInfo,
    refreshPointsBalance,
    openAuthModal,
    updateUserProfile,
    loadUserCommentHistory,
    accentTheme,
    highContrast,
    subtitleStyle,
    myListItems,
    dramaWatchlistItems,
    movieWatchlistItems,
    toggleMyList,
    likedDramaIds,
    watchHistory,
    removeHistoryItem,
    watchlistFolders,
    getDramaFolderId,
    assignDramaToFolder,
  } = useDramaContext();

  const [subTab, setSubTab] = useState<DashboardSubTab>(initialSubTab);
  const [watchlistCategory, setWatchlistCategory] = useState<'movie' | 'drama'>(
    initialWatchlistCategory
  );

  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  useEffect(() => {
    setWatchlistCategory(initialWatchlistCategory);
  }, [initialWatchlistCategory]);

  useEffect(() => {
    if (user) {
      void refreshPointsBalance();
    }
  }, [refreshPointsBalance, user]);

  useEffect(() => {
    const onNav = (evt: Event) => {
      const detail = (
        evt as CustomEvent<{
          tab?: string;
          subTab?: DashboardSubTab;
          watchlistCategory?: 'movie' | 'drama';
        }>
      ).detail;
      if (detail?.tab === 'dashboard' && detail?.subTab) {
        setSubTab(detail.subTab);
      }
      if (detail?.watchlistCategory) {
        setWatchlistCategory(detail.watchlistCategory);
      }
    };
    window.addEventListener('hd:navigate', onNav);
    return () => window.removeEventListener('hd:navigate', onNav);
  }, []);
  const [selectedFolder, setSelectedFolder] = useState<string>('all');
  const [displayNameInput, setDisplayNameInput] = useState<string>(
    user?.displayName || ''
  );
  const [bioInput, setBioInput] = useState<string>(user?.bio || '');
  const [prefLang, setPrefLang] = useState<LanguageCode>(
    user?.preferredLanguage || language
  );
  const [prefAccent, setPrefAccent] = useState<AccentThemeId>(accentTheme);
  const [prefContrast, setPrefContrast] = useState<boolean>(highContrast);
  const [prefSubStyle, setPrefSubStyle] =
    useState<SubtitleStyleConfig>(subtitleStyle);
  const [savingProfile, setSavingProfile] = useState(false);

  const [commentHistory, setCommentHistory] = useState<
    Array<
      EpisodeComment & {
        dramaId: string;
        provider: MediaProviderName;
        episodeNumber: number;
      }
    >
  >([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [avatarBroken, setAvatarBroken] = useState(false);

  useEffect(() => {
    setAvatarBroken(false);
    setDisplayNameInput(user?.displayName || '');
    setBioInput(user?.bio || '');
    setPrefLang(user?.preferredLanguage || language);
  }, [user, language]);

  useEffect(() => {
    setPrefAccent(accentTheme);
    setPrefContrast(highContrast);
    setPrefSubStyle(subtitleStyle);
  }, [accentTheme, highContrast, subtitleStyle]);

  useEffect(() => {
    if (subTab !== 'comments' || !user) return;
    let cancelled = false;
    setCommentsLoading(true);
    void loadUserCommentHistory()
      .then((rows) => {
        if (!cancelled) setCommentHistory(rows);
      })
      .finally(() => {
        if (!cancelled) setCommentsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [subTab, user, loadUserCommentHistory]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await updateUserProfile({
        displayName: displayNameInput.trim() || undefined,
        bio: bioInput,
        preferredLanguage: prefLang,
        accentTheme: prefAccent,
        highContrast: prefContrast,
        subtitleStyle: prefSubStyle,
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const activeCategoryItems =
    watchlistCategory === 'movie' ? movieWatchlistItems : dramaWatchlistItems;

  const filteredWatchlist =
    selectedFolder === 'all'
      ? activeCategoryItems
      : activeCategoryItems.filter(
          (d) => getDramaFolderId(d.bookId, d.provider) === selectedFolder
        );

  const tabs: Array<{ id: DashboardSubTab; label: string; icon: React.ReactNode }> = [
    {
      id: 'profile',
      label: t.dashboard.tabProfile,
      icon: <Settings className="w-4 h-4" />,
    },
    {
      id: 'rewards',
      label:
        user && typeof pointsBalance === 'number'
          ? `${language === 'id' ? 'Poin & Referral' : 'Points & Referral'} (${pointsBalance.toLocaleString()})`
          : language === 'id'
          ? 'Poin & Referral'
          : 'Points & Referral',
      icon: <Coins className="w-4 h-4 text-[#D4AF37]" />,
    },
    {
      id: 'watchlist',
      label: `${t.nav.watchlist} (${myListItems.length})`,
      icon: <Bookmark className="w-4 h-4" />,
    },
    {
      id: 'history',
      label: `${t.dashboard.tabHistory} (${watchHistory.length})`,
      icon: <History className="w-4 h-4" />,
    },
    {
      id: 'comments',
      label: t.dashboard.tabComments,
      icon: <MessageSquare className="w-4 h-4" />,
    },
  ];

  if (standaloneRewards) {
    return (
      <div className="max-w-[1200px] mx-auto px-3 sm:px-6 py-4 sm:py-6 pb-20 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-extrabold text-white tracking-tight truncate">
              {language === 'id' ? 'Pusat Koin & Hadiah' : 'Coins & Rewards'}
            </h1>
            <p className="text-[11px] sm:text-xs text-[#A1A1AA] truncate">
              {language === 'id'
                ? 'Check-in WIB, bonus nonton harian, referral & penarikan saldo'
                : 'UTC check-in, daily watching bonus, referrals & withdrawals'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {user && (
              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(
                    new CustomEvent('hd:navigate', {
                      detail: { tab: 'dashboard', subTab: 'profile' },
                    })
                  );
                }}
                className="px-3.5 py-2 min-h-[36px] rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white transition-colors whitespace-nowrap"
              >
                {t.dashboard.title}
              </button>
            )}
            <button
              type="button"
              onClick={onBackToHome}
              className="px-3.5 py-2 min-h-[36px] rounded-full bg-[#18181D] border border-white/10 hover:border-white/30 text-xs font-semibold text-white transition-colors whitespace-nowrap"
            >
              {t.sections.backToHome}
            </button>
          </div>
        </div>

        <RewardsPayoutSection />
      </div>
    );
  }

  return (
    <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-6 pb-16 space-y-6">
      {/* Top Account Banner & Stats */}
      <section className="rounded-3xl bg-[var(--cd-surface)] border border-white/10 p-5 sm:p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {user?.photoURL && !avatarBroken ? (
              <img
                src={user.photoURL}
                alt={user.displayName}
                referrerPolicy="no-referrer"
                onError={() => setAvatarBroken(true)}
                className="w-16 h-16 rounded-2xl object-cover border-2 border-white/20 shrink-0"
              />
            ) : (
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center text-lg font-extrabold text-white border-2 border-white/15 shrink-0"
                style={{ backgroundColor: user?.avatarColor || '#EF4444' }}
              >
                {user ? user.avatarInitials : <User className="w-7 h-7" />}
              </div>
            )}

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-white truncate">
                  {user ? user.displayName : t.dashboard.title}
                </h1>
                {user && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                {streak.isVipCoffeeLover && (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-[#D4AF37]">
                    <Crown className="w-3.5 h-3.5" />
                    <span>{t.dashboard.vipActive}</span>
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-[#A1A1AA] mt-0.5 truncate">
                {user?.email || t.dashboard.subtitle}
              </p>
              {user?.bio && (
                <p className="text-xs text-[#E4E4E7] mt-1.5 line-clamp-2 max-w-xl">
                  {user.bio}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {!user && (
              <button
                type="button"
                onClick={() => openAuthModal()}
                className="px-5 py-2.5 min-h-[44px] rounded-full cd-accent-bg text-xs sm:text-sm font-semibold text-white shadow-lg"
              >
                {language === 'id' ? 'Masuk / Daftar Akun' : 'Sign In / Register'}
              </button>
            )}
            <button
              type="button"
              onClick={onBackToHome}
              className="px-4 py-2.5 min-h-[44px] rounded-full bg-[#18181D] border border-white/10 hover:border-white/30 text-xs font-medium text-white transition-colors"
            >
              {t.sections.backToHome}
            </button>
          </div>
        </div>

        {/* KPI Metric Summary Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-2 border-t border-white/10">
          <div className="p-3.5 rounded-2xl bg-[#111015] border border-white/5">
            <div className="flex items-center gap-1.5 text-[11px] text-[#A1A1AA]">
              <Bookmark className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>{t.nav.watchlist}</span>
            </div>
            <p className="text-2xl font-extrabold text-white mt-1 tabular-nums">
              {myListItems.length}
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#111015] border border-white/5">
            <div className="flex items-center gap-1.5 text-[11px] text-[#A1A1AA]">
              <History className="w-3.5 h-3.5 cd-accent-text" />
              <span>{t.dashboard.statsHistory}</span>
            </div>
            <p className="text-2xl font-extrabold text-white mt-1 tabular-nums">
              {watchHistory.length}
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#111015] border border-white/5">
            <div className="flex items-center gap-1.5 text-[11px] text-[#A1A1AA]">
              <Heart className="w-3.5 h-3.5 text-rose-400" />
              <span>{t.dashboard.statsLiked}</span>
            </div>
            <p className="text-2xl font-extrabold text-white mt-1 tabular-nums">
              {likedDramaIds.length}
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-[#111015] border border-white/5">
            <div className="flex items-center gap-1.5 text-[11px] text-[#A1A1AA]">
              <Flame className="w-3.5 h-3.5 text-orange-400" />
              <span>{t.dashboard.streakLabel}</span>
            </div>
            <p className="text-2xl font-extrabold text-white mt-1 tabular-nums">
              {user ? Math.max(1, streak.count) : 0}d
            </p>
          </div>

          <button
            type="button"
            onClick={() => setSubTab('rewards')}
            className="p-3.5 rounded-2xl bg-gradient-to-br from-[#231B0E] to-[#111015] border border-[#D4AF37]/40 hover:border-[#D4AF37]/75 text-left transition-colors"
          >
            <div className="flex items-center justify-between gap-1.5 text-[11px] text-[#FDE68A]">
              <span className="inline-flex items-center gap-1.5">
                <Coins className="w-3.5 h-3.5 text-[#D4AF37]" />
                <span>{language === 'id' ? 'Poin & Referral' : 'Points & Referral'}</span>
              </span>
              {user && accountLevelInfo && (
                <span className="px-1.5 py-0.5 rounded bg-[#D4AF37]/20 text-[10px] font-bold text-[#FDE68A] border border-[#D4AF37]/30">
                  {accountLevelInfo.tierName} {accountLevelInfo.multiplier}x
                </span>
              )}
            </div>
            <p className="text-2xl font-extrabold text-white mt-1 tabular-nums">
              {user && typeof pointsBalance === 'number'
                ? pointsBalance.toLocaleString()
                : 0}
            </p>
          </button>
        </div>
      </section>

      {/* Dashboard Navigation Sub-Tabs */}
      <div
        className="flex flex-nowrap items-center gap-2 overflow-x-auto scrollbar-none pb-1"
        role="tablist"
        aria-label="Dashboard sections"
      >
        {tabs.map((tab) => {
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSubTab(tab.id)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 border transition-all ${
                active
                  ? 'cd-accent-bg border-[var(--cd-accent)] text-white shadow-md'
                  : 'bg-[var(--cd-surface)] border-white/10 text-[#D4D4D8] hover:border-white/30 hover:text-white'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Sub-Tab 1: Profile & Theater Preferences */}
      {subTab === 'profile' && (
        <form
          onSubmit={handleSaveProfile}
          className="rounded-3xl bg-[var(--cd-surface)] border border-white/10 p-5 sm:p-6 space-y-6"
        >
          {!user && (
            <div className="p-4 rounded-2xl bg-[var(--cd-accent-soft)] border border-[var(--cd-accent)]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-white">
                  {t.dashboard.signInRequiredTitle}
                </p>
                <p className="text-xs text-[#D4D4D8] mt-0.5">
                  {t.dashboard.signInRequiredDesc}
                </p>
              </div>
              <button
                type="button"
                onClick={() => openAuthModal()}
                className="px-4 py-2 min-h-[40px] rounded-full bg-white text-[#09090B] text-xs font-bold shrink-0"
              >
                {language === 'id' ? 'Masuk / Daftar' : 'Sign In / Register'}
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-[#D4D4D8]">
                {t.dashboard.displayNameLabel}
              </label>
              <input
                type="text"
                value={displayNameInput}
                onChange={(e) => setDisplayNameInput(e.target.value)}
                disabled={!user}
                placeholder="Kano Viewer"
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[#0D0C10] border border-white/10 focus:border-[var(--cd-accent)] focus:outline-none text-sm text-white disabled:opacity-50"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-[#D4D4D8]">
                {t.dashboard.languageLabel}
              </label>
              <select
                value={prefLang}
                onChange={(e) => setPrefLang(e.target.value as LanguageCode)}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-[#0D0C10] border border-white/10 focus:border-[var(--cd-accent)] focus:outline-none text-sm text-white"
              >
                {SUPPORTED_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label} ({l.shortLabel})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="block text-xs font-semibold text-[#D4D4D8]">
                {t.dashboard.bioLabel}
              </label>
              <textarea
                rows={3}
                value={bioInput}
                onChange={(e) => setBioInput(e.target.value)}
                disabled={!user}
                placeholder={t.dashboard.bioPlaceholder}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#0D0C10] border border-white/10 focus:border-[var(--cd-accent)] focus:outline-none text-sm text-white placeholder:text-[#71717A] disabled:opacity-50"
              />
            </div>
          </div>

          {/* Appearance & Subtitle Preferences */}
          <div className="pt-4 border-t border-white/10 space-y-4">
            <h2 className="text-sm font-bold text-white">
              {t.dashboard.preferencesLabel}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <span className="block text-xs text-[#A1A1AA]">
                  {t.engagement.themeTitle}
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {ACCENT_OPTIONS.map((opt) => {
                    const active = prefAccent === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setPrefAccent(opt.id)}
                        className={`min-h-[40px] px-3 py-2 rounded-xl border text-xs font-medium flex items-center gap-2 transition-colors ${
                          active
                            ? 'border-white bg-white/10 text-white'
                            : 'border-white/10 bg-[#0D0C10] text-[#D4D4D8] hover:border-white/25'
                        }`}
                      >
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: opt.hex }}
                        />
                        <span className="truncate">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <span className="block text-xs text-[#A1A1AA]">
                  {t.engagement.contrastLabel}
                </span>
                <button
                  type="button"
                  onClick={() => setPrefContrast((prev) => !prev)}
                  className={`w-full min-h-[44px] px-4 py-2 rounded-xl border text-xs font-semibold flex items-center justify-between transition-colors ${
                    prefContrast
                      ? 'cd-accent-bg border-[var(--cd-accent)] text-white'
                      : 'bg-[#0D0C10] border-white/10 text-[#D4D4D8]'
                  }`}
                >
                  <span>
                    {prefContrast
                      ? t.engagement.highContrast
                      : t.engagement.standardContrast}
                  </span>
                  {prefContrast && <Check className="w-4 h-4" />}
                </button>
              </div>

              <div className="space-y-2">
                <span className="block text-xs text-[#A1A1AA]">
                  {t.player.subtitleStyleLabel}
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['small', 'medium', 'large'] as const).map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() =>
                        setPrefSubStyle((s) => ({ ...s, fontSize: sz }))
                      }
                      className={`min-h-[44px] rounded-xl border text-xs font-semibold uppercase ${
                        prefSubStyle.fontSize === sz
                          ? 'cd-accent-bg border-[var(--cd-accent)] text-white'
                          : 'bg-[#0D0C10] border-white/10 text-[#A1A1AA]'
                      }`}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={savingProfile}
              className="px-6 py-2.5 min-h-[44px] rounded-full cd-accent-bg text-xs sm:text-sm font-semibold text-white shadow-lg hover:brightness-110 transition-all disabled:opacity-60"
            >
              {savingProfile ? t.sections.loading : t.dashboard.saveChanges}
            </button>
          </div>
        </form>
      )}

      {/* Sub-Tab 2: Points, Payout Requests & Live Payout History */}
      {subTab === 'rewards' && <RewardsPayoutSection />}

      {/* Sub-Tab 3: Separated Movie Watchlist (Login Required) & Drama Watchlist */}
      {subTab === 'watchlist' && (
        <section className="space-y-4">
          <div
            className="inline-flex flex-wrap items-center gap-2 p-1 rounded-2xl bg-[#111015] border border-white/10"
            role="tablist"
            aria-label="Watchlist categories"
          >
            <button
              type="button"
              role="tab"
              aria-selected={watchlistCategory === 'movie'}
              onClick={() => setWatchlistCategory('movie')}
              className={`inline-flex items-center gap-2 px-4 py-2 min-h-[40px] rounded-xl text-xs font-bold transition-all ${
                watchlistCategory === 'movie'
                  ? 'cd-accent-bg text-white shadow-md'
                  : 'text-[#A1A1AA] hover:text-white'
              }`}
            >
              <Clapperboard className="w-3.5 h-3.5" />
              <span>
                {t.moviesPage.watchlistTitle} ({user ? movieWatchlistItems.length : 0})
              </span>
              {!user && <Lock className="w-3 h-3 opacity-80" />}
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={watchlistCategory === 'drama'}
              onClick={() => setWatchlistCategory('drama')}
              className={`inline-flex items-center gap-2 px-4 py-2 min-h-[40px] rounded-xl text-xs font-bold transition-all ${
                watchlistCategory === 'drama'
                  ? 'cd-accent-bg text-white shadow-md'
                  : 'text-[#A1A1AA] hover:text-white'
              }`}
            >
              <Bookmark className="w-3.5 h-3.5" />
              <span>
                {t.sections.dramaWatchlistTitle} ({dramaWatchlistItems.length})
              </span>
            </button>
          </div>

          {watchlistCategory === 'movie' && !user ? (
            <div className="rounded-3xl bg-[var(--cd-surface)] border border-white/10 p-8 sm:p-10 text-center space-y-4 max-w-lg mx-auto">
              <div className="w-12 h-12 rounded-2xl bg-[var(--cd-accent-soft)] border border-[var(--cd-accent)]/40 flex items-center justify-center mx-auto cd-accent-text">
                <Lock className="w-5 h-5" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-lg font-bold text-white">
                  {t.moviesPage.watchlistLoginTitle}
                </h2>
                <p className="text-xs sm:text-sm text-[#A1A1AA] leading-relaxed">
                  {t.moviesPage.watchlistLoginDesc}
                </p>
              </div>
              <button
                type="button"
                onClick={() => openAuthModal(t.auth.gateWatchlistReason)}
                className="px-6 py-2.5 min-h-[44px] rounded-full cd-accent-bg text-xs sm:text-sm font-bold text-white shadow-lg"
              >
                {t.auth.continueBtn}
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-nowrap items-center gap-2 overflow-x-auto scrollbar-none pb-1">
                {watchlistFolders.map((folder) => {
                  const active = selectedFolder === folder.id;
                  return (
                    <button
                      key={folder.id}
                      type="button"
                      onClick={() => setSelectedFolder(folder.id)}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 min-h-[40px] rounded-xl border text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                        active
                          ? 'cd-accent-bg border-[var(--cd-accent)] text-white'
                          : 'bg-[var(--cd-surface)] border-white/10 text-[#D4D4D8] hover:border-white/30'
                      }`}
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>{folder.name}</span>
                    </button>
                  );
                })}
              </div>

              {filteredWatchlist.length === 0 ? (
                <div className="rounded-3xl bg-[var(--cd-surface)] border border-white/10 p-10 text-center space-y-3">
                  {watchlistCategory === 'movie' ? (
                    <Clapperboard className="w-8 h-8 text-[#71717A] mx-auto" />
                  ) : (
                    <Bookmark className="w-8 h-8 text-[#71717A] mx-auto" />
                  )}
                  <p className="text-sm text-[#A1A1AA]">
                    {watchlistCategory === 'movie'
                      ? t.moviesPage.watchlistEmpty
                      : t.sections.dramaWatchlistEmpty}
                  </p>
                </div>
              ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredWatchlist.map((drama) => {
                const currentFolder = getDramaFolderId(drama.bookId, drama.provider);
                const detailHref = getDramaPath(
                  drama.bookId,
                  drama.title,
                  drama.provider,
                  drama.slug
                );
                const watchHref = getWatchPath(
                  drama.bookId,
                  drama.title,
                  drama.provider,
                  drama.slug,
                  1
                );
                const isSingleMovie =
                  (drama.mediaType === 'movie' ||
                    drama.provider === 'LK21' ||
                    drama.provider === 'LookSeries') &&
                  Math.max(1, drama.chapterCount || 1) <= 1;
                return (
                  <div
                    key={`${drama.provider}-${drama.bookId}`}
                    className="rounded-2xl bg-[var(--cd-surface)] border border-white/10 p-3.5 flex gap-3.5"
                  >
                    <a
                      href={detailHref}
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                        e.preventDefault();
                        onSelectDrama(drama);
                      }}
                      className="w-20 aspect-[3/4] rounded-xl overflow-hidden bg-[#18181D] shrink-0 block"
                    >
                      {drama.cover ? (
                        <img
                          src={drama.cover}
                          alt={drama.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : null}
                    </a>

                    <div className="min-w-0 flex-1 flex flex-col justify-between gap-2">
                      <div>
                        <a
                          href={detailHref}
                          onClick={(e) => {
                            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                            e.preventDefault();
                            onSelectDrama(drama);
                          }}
                          className="text-sm font-bold text-white hover:underline text-left line-clamp-2 block"
                        >
                          {drama.title}
                        </a>
                        <p className="text-[11px] text-[#A1A1AA] mt-1 tabular-nums">
                          {drama.provider} ·{' '}
                          {isSingleMovie
                            ? drama.quality || 'Full Movie'
                            : `${drama.chapterCount} Episodes`}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <a
                          href={watchHref}
                          onClick={(e) => {
                            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                            e.preventDefault();
                            onPlayDrama(drama, 1);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 min-h-[34px] rounded-lg cd-accent-bg text-xs font-semibold text-white"
                        >
                          <Play className="w-3 h-3 fill-white" />
                          <span>Play</span>
                        </a>

                        <select
                          value={currentFolder}
                          onChange={(e) =>
                            assignDramaToFolder(
                              drama.bookId,
                              drama.provider,
                              e.target.value
                            )
                          }
                          aria-label="Assign folder"
                          className="min-h-[34px] px-2 py-1 rounded-lg bg-[#0D0C10] border border-white/10 text-[11px] text-[#E4E4E7]"
                        >
                          {watchlistFolders.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.name}
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          onClick={() => toggleMyList(drama)}
                          aria-label="Remove from watchlist"
                          className="p-2 rounded-lg bg-white/5 hover:bg-red-500/20 text-[#A1A1AA] hover:text-red-300 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
            </>
          )}
        </section>
      )}

      {/* Sub-Tab 3: Cloud-Synced Watch History */}
      {subTab === 'history' && (
        <section>
          {watchHistory.length === 0 ? (
            <div className="rounded-3xl bg-[var(--cd-surface)] border border-white/10 p-10 text-center space-y-2">
              <Clock className="w-8 h-8 text-[#71717A] mx-auto" />
              <p className="text-sm text-[#A1A1AA]">{t.dashboard.historyEmpty}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {watchHistory.map((entry) => {
                const detailHref = getDramaPath(
                  entry.drama.bookId,
                  entry.drama.title,
                  entry.drama.provider,
                  entry.drama.slug
                );
                const watchHref = getWatchPath(
                  entry.drama.bookId,
                  entry.drama.title,
                  entry.drama.provider,
                  entry.drama.slug,
                  entry.episode
                );
                return (
                <div
                  key={`${entry.provider}-${entry.bookId}`}
                  className="rounded-2xl bg-[var(--cd-surface)] border border-white/10 p-3.5 flex gap-3.5"
                >
                  <a
                    href={watchHref}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                      e.preventDefault();
                      onPlayDrama(entry.drama, entry.episode, entry.currentTime);
                    }}
                    className="w-20 aspect-[3/4] rounded-xl overflow-hidden bg-[#18181D] shrink-0 relative group block"
                  >
                    {entry.cover ? (
                      <img
                        src={entry.cover}
                        alt={entry.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : null}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Play className="w-5 h-5 text-white fill-white" />
                    </div>
                  </a>

                  <div className="min-w-0 flex-1 flex flex-col justify-between gap-2">
                    <div>
                      <a
                        href={detailHref}
                        onClick={(e) => {
                          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                          e.preventDefault();
                          onSelectDrama(entry.drama);
                        }}
                        className="text-sm font-bold text-white hover:underline line-clamp-2 block"
                      >
                        {entry.title}
                      </a>
                      <p className="text-[11px] text-[#D4AF37] font-semibold mt-1 tabular-nums">
                        {t.dashboard.jumpToEp} {entry.episode}
                        {entry.currentTime > 0
                          ? ` · ${formatPlaybackClock(entry.currentTime)}${
                              entry.duration > 0
                                ? ` / ${formatPlaybackClock(entry.duration)}`
                                : ''
                            }`
                          : ''}
                      </p>
                      <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden mt-2">
                        <div
                          className="h-full cd-accent-bg rounded-full"
                          style={{ width: `${Math.min(100, Math.max(4, entry.progress))}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <a
                        href={watchHref}
                        onClick={(e) => {
                          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
                          e.preventDefault();
                          onPlayDrama(entry.drama, entry.episode, entry.currentTime);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-lg cd-accent-bg text-xs font-semibold text-white"
                      >
                        <Play className="w-3 h-3 fill-white" />
                        <span>
                          {t.sections.resumeEp} {entry.episode}
                        </span>
                      </a>

                      <button
                        type="button"
                        onClick={() =>
                          removeHistoryItem(entry.bookId, entry.provider)
                        }
                        aria-label={t.sections.removeHistory}
                        className="p-2 rounded-lg bg-white/5 hover:bg-red-500/20 text-[#A1A1AA] hover:text-red-300 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Sub-Tab 4: User Comment History */}
      {subTab === 'comments' && (
        <section className="rounded-3xl bg-[var(--cd-surface)] border border-white/10 p-5 sm:p-6">
          {!user ? (
            <div className="text-center py-8 space-y-3">
              <MessageSquare className="w-8 h-8 text-[#71717A] mx-auto" />
              <p className="text-sm text-[#A1A1AA]">
                {t.dashboard.signInRequiredDesc}
              </p>
              <button
                type="button"
                onClick={() => openAuthModal()}
                className="px-5 py-2.5 min-h-[44px] rounded-full cd-accent-bg text-xs font-semibold text-white"
              >
                {t.auth.continueBtn}
              </button>
            </div>
          ) : commentsLoading ? (
            <p className="text-sm text-[#A1A1AA] py-8 text-center">
              {t.sections.loading}
            </p>
          ) : commentHistory.length === 0 ? (
            <p className="text-sm text-[#A1A1AA] py-8 text-center">
              {t.dashboard.commentsEmpty}
            </p>
          ) : (
            <div className="space-y-3">
              {commentHistory.map((cmt) => (
                <div
                  key={cmt.id}
                  className="p-4 rounded-2xl bg-[#0D0C10] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-[#D4AF37] tabular-nums">
                      {cmt.provider} · Drama #{cmt.dramaId} · EP {cmt.episodeNumber}
                    </p>
                    <p className="text-sm text-white">{cmt.text}</p>
                  </div>
                  <span className="text-[11px] text-[#71717A] tabular-nums shrink-0">
                    {new Date(cmt.createdAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
