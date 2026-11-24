import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  X,
  Check,
  Menu,
  Palette,
  User,
  Flame,
  Home,
  Compass,
  Clock,
  Crown,
  Sparkles,
  Mic,
  Bookmark,
  LayoutDashboard,
  Layers,
  Clapperboard,
  Coins,
} from 'lucide-react';
import { CoffeeDramaLogo } from './CoffeeDramaLogo';
import { PWAInstallButton } from './PWAInstallBanner';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useDramaContext } from '../context/DramaContext';
import { DEFAULT_SITE_ORIGIN } from '../i18n/helpers';
import type {
  AccentThemeId,
  LanguageCode,
  NavTab,
  ProviderId,
} from '../types/drama';

interface NavbarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  languageLoading: boolean;
  onChangeLanguage: (lang: LanguageCode) => void;
  onOpenSearchModal: () => void;
}

interface DesktopSidebarProps {
  activeTab: NavTab;
  selectedProvider: ProviderId;
  hasActiveSubRoute: boolean;
  onSelectTab: (tab: NavTab) => void;
  onOpenProviderHub: () => void;
}

const ACCENT_PRESETS: { id: AccentThemeId; name: string; color: string }[] = [
  { id: 'crimson', name: 'Crimson Noir', color: '#EF4444' },
  { id: 'gold', name: 'Espresso Gold', color: '#D4AF37' },
  { id: 'rose', name: 'Royal Rose', color: '#E11D48' },
  { id: 'emerald', name: 'Emerald Jade', color: '#10B981' },
];

function getNavTabPath(tab: NavTab): string {
  switch (tab) {
    case 'movies':
      return '/movies';
    case 'providers':
      return '/providers';
    case 'explore':
    case 'anime':
    case 'dubbing':
      return '/explore';
    case 'ranking':
      return '/trending';
    case 'terbaru':
      return '/latest';
    case 'vip':
      return '/vip';
    case 'mylist':
    case 'dashboard':
      return '/account';
    case 'rewards':
      return '/rewards';
    default:
      return '/';
  }
}

function isPlainLeftClick(e: React.MouseEvent): boolean {
  return !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey && e.button === 0;
}

export const DesktopSidebar: React.FC<DesktopSidebarProps> = ({
  activeTab,
  selectedProvider,
  hasActiveSubRoute,
  onSelectTab,
  onOpenProviderHub,
}) => {
  const { t, language, user, myListItems, pointsBalance } = useDramaContext();
  const rewardsLabel = language === 'id' ? 'Poin & Referral' : 'Points & Referral';

  const primaryItems: Array<{
    id: NavTab;
    label: string;
    icon: React.ReactNode;
    badge?: number;
  }> = [
    { id: 'home', label: t.nav.home, icon: <Home className="w-4 h-4 shrink-0" /> },
    {
      id: 'explore',
      label: t.nav.explore,
      icon: <Compass className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'ranking',
      label: t.nav.trending,
      icon: <Flame className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'terbaru',
      label: t.nav.latest,
      icon: <Clock className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'vip',
      label: t.nav.vip,
      icon: <Crown className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'anime',
      label: t.nav.anime,
      icon: <Sparkles className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'dubbing',
      label: t.nav.dubbed,
      icon: <Mic className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'mylist',
      label: t.nav.watchlist,
      icon: <Bookmark className="w-4 h-4 shrink-0" />,
      badge: myListItems.length > 0 ? myListItems.length : undefined,
    },
    {
      id: 'rewards',
      label: rewardsLabel,
      icon: <Coins className="w-4 h-4 shrink-0 text-[#D4AF37]" />,
      badge:
        user && typeof pointsBalance === 'number' ? pointsBalance : undefined,
    },
    {
      id: 'dashboard',
      label: t.nav.dashboard,
      icon: <LayoutDashboard className="w-4 h-4 shrink-0" />,
    },
  ];

  const isMoviesActive = !hasActiveSubRoute && activeTab === 'movies';

  return (
    <aside
      aria-label="Desktop Sidebar Navigation"
      className="hidden md:flex fixed left-0 top-14 sm:top-16 bottom-0 z-30 w-[72px] lg:w-[216px] flex-col justify-between bg-[var(--cd-bg)]/95 backdrop-blur-xl border-r border-white/10 p-2.5 lg:p-3.5"
    >
      <div className="flex-1 overflow-y-auto scrollbar-none space-y-1">
        {primaryItems.map((item) => {
          const isActive = !hasActiveSubRoute && activeTab === item.id;
          const itemPath = getNavTabPath(item.id);
          return (
            <a
              key={item.id}
              href={`${DEFAULT_SITE_ORIGIN}${itemPath}`}
              onClick={(e) => {
                if (!isPlainLeftClick(e)) return;
                e.preventDefault();
                onSelectTab(item.id);
              }}
              title={item.label}
              aria-current={isActive ? 'page' : undefined}
              className={`w-full min-h-[42px] px-2.5 lg:px-3 py-2 rounded-xl flex items-center justify-center lg:justify-between gap-2.5 text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-[var(--cd-accent-soft)] border border-[var(--cd-accent)]/50 cd-accent-text font-semibold'
                  : 'border border-transparent text-[#A1A1AA] hover:text-white hover:bg-white/5'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                {item.icon}
                <span className="hidden lg:inline truncate">{item.label}</span>
              </span>
              {typeof item.badge === 'number' && (
                <span className="hidden lg:inline-flex px-1.5 py-0.5 rounded-full bg-white/10 text-[10px] font-bold tabular-nums text-white shrink-0">
                  {item.badge}
                </span>
              )}
            </a>
          );
        })}

        <a
          href={`${DEFAULT_SITE_ORIGIN}/providers`}
          onClick={(e) => {
            if (!isPlainLeftClick(e)) return;
            e.preventDefault();
            onOpenProviderHub();
          }}
          title={t.nav.providers}
          aria-current={!hasActiveSubRoute && activeTab === 'providers' ? 'page' : undefined}
          className={`w-full min-h-[42px] px-2.5 lg:px-3 py-2 rounded-xl flex items-center justify-center lg:justify-between gap-2.5 text-xs font-medium transition-colors ${
            !hasActiveSubRoute &&
            (activeTab === 'providers' || selectedProvider !== 'All')
              ? 'bg-white/10 border border-white/20 text-white font-semibold'
              : 'border border-transparent text-[#A1A1AA] hover:text-white hover:bg-white/5'
          }`}
        >
          <span className="flex items-center gap-2.5 min-w-0">
            <Layers className="w-4 h-4 shrink-0 text-[#D4AF37]" />
            <span className="hidden lg:inline truncate">{t.nav.providers}</span>
          </span>
          {selectedProvider !== 'All' && (
            <span className="hidden lg:inline text-[10px] font-semibold text-[#D4AF37] truncate max-w-[68px]">
              {selectedProvider}
            </span>
          )}
        </a>
      </div>

      {/* Bottom Anchored Movies Route Link */}
      <div className="pt-3 mt-2 border-t border-white/10 shrink-0">
        <a
          href={`${DEFAULT_SITE_ORIGIN}/movies`}
          onClick={(e) => {
            if (!isPlainLeftClick(e)) return;
            e.preventDefault();
            onSelectTab('movies');
          }}
          title={t.nav.movies}
          aria-current={isMoviesActive ? 'page' : undefined}
          className={`w-full min-h-[46px] px-2.5 lg:px-3.5 py-2.5 rounded-xl flex items-center justify-center lg:justify-start gap-2.5 text-xs font-bold transition-all border ${
            isMoviesActive
              ? 'cd-accent-bg border-[var(--cd-accent)] text-white shadow-lg'
              : 'bg-[var(--cd-surface)] border-white/10 text-white hover:border-[var(--cd-accent)] hover:bg-[var(--cd-accent-soft)]'
          }`}
        >
          <Clapperboard
            className={`w-4 h-4 shrink-0 ${
              isMoviesActive ? 'text-white' : 'cd-accent-text'
            }`}
          />
          <span className="hidden lg:inline truncate">{t.nav.movies}</span>
        </a>
      </div>
    </aside>
  );
};

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onSelectTab,
  languageLoading,
  onChangeLanguage,
  onOpenSearchModal,
}) => {
  const {
    language,
    t,
    user,
    streak,
    pointsBalance,
    openAuthModal,
    myListItems,
    accentTheme,
    setAccentTheme,
    highContrast,
    setHighContrast,
  } = useDramaContext();
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [avatarBroken, setAvatarBroken] = useState(false);

  const rightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setAvatarBroken(false);
  }, [user?.photoURL]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (rightRef.current && !rightRef.current.contains(e.target as Node)) {
        setThemeMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setThemeMenuOpen(false);
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  // Keep Movies at the very bottom of the navigation drawer
  const mobileDrawerTabs: { id: NavTab; label: string; icon?: React.ReactNode }[] = [
    { id: 'home', label: t.nav.home },
    { id: 'explore', label: t.nav.explore },
    { id: 'ranking', label: t.nav.trending },
    { id: 'terbaru', label: t.nav.latest },
    { id: 'vip', label: t.nav.vip },
    { id: 'anime', label: t.nav.anime },
    { id: 'dubbing', label: t.nav.dubbed },
    {
      id: 'providers',
      label: t.nav.providers,
      icon: <Layers className="w-4 h-4 text-[#D4AF37]" />,
    },
    { id: 'mylist', label: t.nav.watchlist },
    {
      id: 'rewards',
      label: language === 'id' ? 'Poin & Referral' : 'Points & Referral',
      icon: <Coins className="w-4 h-4 text-[#D4AF37]" />,
    },
    { id: 'dashboard', label: t.nav.dashboard },
    {
      id: 'movies',
      label: t.nav.movies,
      icon: <Clapperboard className="w-4 h-4 cd-accent-text" />,
    },
  ];

  const mobileGridTabs = mobileDrawerTabs.filter(
    (tab) => tab.id !== 'rewards' && tab.id !== 'movies'
  );
  const mobileRewardsTab = mobileDrawerTabs.find((tab) => tab.id === 'rewards');
  const mobileMoviesTab = mobileDrawerTabs.find((tab) => tab.id === 'movies');

  return (
    <header className="sticky top-0 z-40 bg-[var(--cd-bg)]/95 backdrop-blur-xl border-b border-white/5">
      <div className="max-w-[1600px] mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4">
        {/* Left Zone: Brand Logo (never compressed or overlapped on mobile) */}
        <div className="flex items-center gap-3 shrink-0">
          <a
            href={`${DEFAULT_SITE_ORIGIN}/`}
            onClick={(e) => {
              if (!isPlainLeftClick(e)) return;
              e.preventDefault();
              onSelectTab('home');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cd-accent)] rounded-lg shrink-0 inline-flex"
            aria-label="KanoDrama Home"
          >
            <CoffeeDramaLogo />
          </a>
        </div>

        {/* Right Zone: Clean mobile controls (Search, Points, Menu); Theme & Language move into Mobile Drawer */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 min-w-0">
          <PWAInstallButton variant="header" />

          {/* Accent Theme & Contrast Customizer (Desktop / Tablet md+, moved to Mobile Drawer on phones) */}
          <div ref={rightRef} className="hidden md:block relative">
            <button
              type="button"
              onClick={() => {
                setThemeMenuOpen((prev) => !prev);
              }}
              aria-label={t.engagement.themeTitle}
              aria-expanded={themeMenuOpen}
              className="p-2 rounded-lg bg-[var(--cd-surface)] border border-[var(--cd-border)] hover:border-[var(--cd-accent)] text-[#FAFAFA] transition-colors"
            >
              <Palette className="w-4 h-4 cd-accent-text" />
            </button>

            {themeMenuOpen && (
              <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-[#141418]/95 backdrop-blur-xl border border-white/15 shadow-2xl p-3 z-50 space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#A1A1AA]">
                  {t.engagement.themeTitle}
                </p>
                <div className="space-y-1">
                  {ACCENT_PRESETS.map((preset) => {
                    const active = accentTheme === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setAccentTheme(preset.id)}
                        className={`w-full px-2.5 py-2 rounded-xl text-left text-xs flex items-center justify-between transition-colors ${
                          active
                            ? 'bg-white/10 text-white font-semibold'
                            : 'text-[#D4D4D8] hover:bg-white/5'
                        }`}
                      >
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-white/25"
                            style={{ backgroundColor: preset.color }}
                          />
                          <span>{preset.name}</span>
                        </span>
                        {active && <Check className="w-3.5 h-3.5 text-white" />}
                      </button>
                    );
                  })}
                </div>

                <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                  <span className="text-xs text-[#A1A1AA]">
                    {t.engagement.contrastLabel}
                  </span>
                  <button
                    type="button"
                    onClick={() => setHighContrast(!highContrast)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                      highContrast
                        ? 'cd-accent-bg border-[var(--cd-accent)] text-white'
                        : 'bg-[#18181D] border-white/10 text-[#D4D4D8]'
                    }`}
                  >
                    {highContrast
                      ? t.engagement.highContrast
                      : t.engagement.standardContrast}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Language Switcher (Desktop / Tablet md+, moved to Mobile Drawer on phones) */}
          <div className="hidden md:block">
            <LanguageSwitcher
              variant="header"
              loading={languageLoading}
              onChangeLanguage={onChangeLanguage}
            />
          </div>

          {/* Search Modal Button */}
          <button
            type="button"
            onClick={onOpenSearchModal}
            className="inline-flex items-center justify-center gap-1.5 p-2 md:px-3 md:py-1.5 rounded-lg bg-[var(--cd-surface)] border border-[var(--cd-border)] hover:border-[var(--cd-accent)] text-xs text-[#FAFAFA] hover:text-white transition-colors shrink-0"
            aria-label={t.nav.search}
          >
            <Search className="w-4 h-4 md:w-3.5 md:h-3.5 cd-accent-text" />
            <span className="hidden lg:inline text-[#A1A1AA]">
              {t.nav.search}
            </span>
          </button>

          {/* Direct Poin & Referral Shortcut (Compact on mobile, expanded on desktop) */}
          <a
            href={`${DEFAULT_SITE_ORIGIN}/rewards`}
            onClick={(e) => {
              if (!isPlainLeftClick(e)) return;
              e.preventDefault();
              onSelectTab('rewards');
            }}
            aria-label={language === 'id' ? 'Poin & Referral' : 'Points & Referral'}
            title={language === 'id' ? 'Poin, Referral & Penarikan' : 'Points, Referral & Payout'}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'rewards'
                ? 'bg-[#D4AF37] border-[#D4AF37] text-[#09090B] shadow'
                : 'bg-[#D4AF37]/15 border-[#D4AF37]/40 hover:border-[#D4AF37] text-[#FDE68A]'
            }`}
          >
            <Coins
              className={`w-3.5 h-3.5 shrink-0 ${
                activeTab === 'rewards' ? 'text-[#09090B]' : 'text-[#D4AF37]'
              }`}
            />
            <span className="tabular-nums max-w-[92px] sm:max-w-none truncate">
              {user && typeof pointsBalance === 'number' ? (
                <>
                  {pointsBalance.toLocaleString()}{' '}
                  <span className="hidden sm:inline">
                    {language === 'id' ? 'Poin' : 'Pts'}
                  </span>
                </>
              ) : (
                <>
                  <span className="sm:hidden">
                    {language === 'id' ? 'Poin' : 'Pts'}
                  </span>
                  <span className="hidden sm:inline">
                    {language === 'id' ? 'Poin & Referral' : 'Points & Referral'}
                  </span>
                </>
              )}
            </span>
          </a>

          {/* Daily Watch Streak Pill (Desktop lg+) */}
          {user && streak.count > 0 && (
            <button
              type="button"
              onClick={() => openAuthModal()}
              title={t.retention.streakRule}
              className="hidden lg:inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-orange-500/15 border border-orange-500/35 text-[11px] font-bold text-orange-300 whitespace-nowrap shrink-0"
            >
              <Flame className="w-3.5 h-3.5 text-orange-400 fill-orange-400" />
              <span className="tabular-nums">{streak.count}</span>
            </button>
          )}

          {/* Desktop Account / Google Sign-In Button */}
          <button
            type="button"
            onClick={() => openAuthModal()}
            aria-label={user ? t.nav.account : t.nav.login}
            className="hidden md:inline-flex items-center gap-2 px-2.5 py-1.5 rounded-full bg-[var(--cd-surface)] border border-[var(--cd-border)] hover:border-[var(--cd-accent)] text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0"
          >
            {user ? (
              <>
                {user.photoURL && !avatarBroken ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName}
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarBroken(true)}
                    className="w-5 h-5 rounded-full object-cover shrink-0 border border-white/25"
                  />
                ) : (
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                    style={{ backgroundColor: user.avatarColor }}
                  >
                    {user.avatarInitials}
                  </span>
                )}
                <span className="max-w-[90px] truncate">
                  {user.displayName.split(' ')[0]}
                </span>
              </>
            ) : (
              <>
                <User className="w-3.5 h-3.5 cd-accent-text" />
                <span>{t.nav.login}</span>
              </>
            )}
          </button>

          {/* Mobile Drawer Trigger */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="md:hidden p-2 rounded-lg bg-[var(--cd-surface)] border border-[var(--cd-border)] text-[#FAFAFA] hover:border-[var(--cd-accent)] transition-colors shrink-0"
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? (
              <X className="w-4 h-4" />
            ) : (
              <Menu className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Responsive Mobile Menu Drawer (Theme, Contrast, Language & Clean Navigation Grid) */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-white/10 bg-[var(--cd-bg)]/98 backdrop-blur-xl max-h-[calc(100dvh-3.5rem)] overflow-y-auto overscroll-contain px-3.5 py-3.5 space-y-3.5 shadow-2xl">
          {/* Display Theme, Contrast & Language Controls (moved from cramped mobile top bar) */}
          <div className="rounded-2xl bg-[var(--cd-surface)] border border-white/10 p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white">
                <Palette className="w-3.5 h-3.5 cd-accent-text" />
                <span>{t.engagement.themeTitle}</span>
              </span>
              <button
                type="button"
                onClick={() => setHighContrast(!highContrast)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                  highContrast
                    ? 'cd-accent-bg border-[var(--cd-accent)] text-white'
                    : 'bg-black/30 border-white/10 text-[#D4D4D8]'
                }`}
              >
                {highContrast
                  ? t.engagement.highContrast
                  : t.engagement.standardContrast}
              </button>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              {ACCENT_PRESETS.map((preset) => {
                const active = accentTheme === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setAccentTheme(preset.id)}
                    aria-label={preset.name}
                    aria-pressed={active}
                    className={`px-2 py-2 rounded-xl text-[11px] flex flex-col items-center justify-center gap-1 border transition-colors ${
                      active
                        ? 'bg-white/10 border-white/30 text-white font-semibold'
                        : 'bg-black/25 border-white/5 text-[#A1A1AA] hover:text-white'
                    }`}
                  >
                    <span
                      className="w-4 h-4 rounded-full border border-white/30 shrink-0"
                      style={{ backgroundColor: preset.color }}
                    />
                    <span className="truncate w-full text-center">
                      {preset.name.split(' ')[0]}
                    </span>
                  </button>
                );
              })}
            </div>

            <LanguageSwitcher
              variant="drawer"
              loading={languageLoading}
              onChangeLanguage={onChangeLanguage}
            />
          </div>

          {/* Primary Navigation Grid */}
          <div className="grid grid-cols-2 gap-1.5">
            {mobileGridTabs.map((tab) => {
              const isActive = activeTab === tab.id;
              const tabPath = getNavTabPath(tab.id);
              return (
                <a
                  key={tab.id}
                  href={`${DEFAULT_SITE_ORIGIN}${tabPath}`}
                  onClick={(e) => {
                    if (!isPlainLeftClick(e)) return;
                    e.preventDefault();
                    onSelectTab(tab.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-between gap-2 border transition-colors ${
                    isActive
                      ? 'bg-[var(--cd-accent-soft)] border-[var(--cd-accent)]/45 cd-accent-text font-semibold'
                      : 'bg-white/[0.03] border-white/5 text-[#FAFAFA] hover:bg-white/[0.07]'
                  }`}
                >
                  <span className="inline-flex items-center gap-2 min-w-0">
                    {tab.icon}
                    <span className="truncate">{tab.label}</span>
                  </span>
                  {tab.id === 'mylist' && myListItems.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-white/10 text-[10px] font-bold tabular-nums shrink-0">
                      {myListItems.length}
                    </span>
                  )}
                </a>
              );
            })}
          </div>

          {/* Dedicated Poin & Referral Shortcut Row */}
          {mobileRewardsTab && (
            <a
              href={`${DEFAULT_SITE_ORIGIN}/rewards`}
              onClick={(e) => {
                if (!isPlainLeftClick(e)) return;
                e.preventDefault();
                onSelectTab('rewards');
                setMobileMenuOpen(false);
              }}
              className={`w-full min-h-[42px] px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between gap-2 border transition-colors ${
                activeTab === 'rewards'
                  ? 'bg-[#D4AF37] border-[#D4AF37] text-[#09090B]'
                  : 'bg-[#D4AF37]/12 border-[#D4AF37]/35 text-[#FDE68A]'
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <Coins
                  className={`w-4 h-4 shrink-0 ${
                    activeTab === 'rewards' ? 'text-[#09090B]' : 'text-[#D4AF37]'
                  }`}
                />
                <span>{mobileRewardsTab.label}</span>
              </span>
              {user && typeof pointsBalance === 'number' && (
                <span className="tabular-nums font-extrabold">
                  {pointsBalance.toLocaleString()} {language === 'id' ? 'Poin' : 'Pts'}
                </span>
              )}
            </a>
          )}

          {/* Movies Anchored at Bottom */}
          {mobileMoviesTab && (
            <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2">
              <a
                href={`${DEFAULT_SITE_ORIGIN}/movies`}
                onClick={(e) => {
                  if (!isPlainLeftClick(e)) return;
                  e.preventDefault();
                  onSelectTab('movies');
                  setMobileMenuOpen(false);
                }}
                className={`flex-1 min-h-[42px] px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between border transition-colors ${
                  activeTab === 'movies'
                    ? 'cd-accent-bg border-[var(--cd-accent)] text-white'
                    : 'bg-white/[0.04] border-white/10 text-[#FAFAFA] hover:bg-white/[0.08]'
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  {mobileMoviesTab.icon}
                  <span>{mobileMoviesTab.label}</span>
                </span>
              </a>
              <PWAInstallButton
                variant="menu"
                onAction={() => setMobileMenuOpen(false)}
              />
            </div>
          )}
        </div>
      )}
    </header>
  );
};
