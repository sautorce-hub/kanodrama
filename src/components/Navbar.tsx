import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  X,
  Globe,
  ChevronDown,
  Check,
  Menu,
  Loader2,
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
} from 'lucide-react';
import { CoffeeDramaLogo } from './CoffeeDramaLogo';
import { PWAInstallButton } from './PWAInstallBanner';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useDramaContext } from '../context/DramaContext';
import { DEFAULT_SITE_ORIGIN, getLanguageMeta } from '../i18n/helpers';
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
  const { t, user, myListItems } = useDramaContext();

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
    { id: 'dashboard', label: t.nav.dashboard },
    {
      id: 'movies',
      label: t.nav.movies,
      icon: <Clapperboard className="w-4 h-4 cd-accent-text" />,
    },
  ];

  const currentLang = getLanguageMeta(language);

  return (
    <header className="sticky top-0 z-40 bg-[var(--cd-bg)]/95 backdrop-blur-xl border-b border-white/5">
      <div className="max-w-[1600px] mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4">
        {/* Left Zone: Brand Logo */}
        <div className="flex items-center gap-4 min-w-0">
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

        {/* Right Zone: PWA Install, Theme Accent Switcher, Language Switcher, Search, Account */}
        <div ref={rightRef} className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <PWAInstallButton variant="header" />

          {/* Accent Theme & Contrast Customizer */}
          <div className="relative">
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

          {/* Language Switcher */}
          <LanguageSwitcher
            variant="header"
            loading={languageLoading}
            onChangeLanguage={onChangeLanguage}
          />

          {/* Search Modal Button */}
          <button
            type="button"
            onClick={onOpenSearchModal}
            className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-[var(--cd-surface)] border border-[var(--cd-border)] hover:border-[var(--cd-accent)] text-xs text-[#FAFAFA] hover:text-white transition-colors"
            aria-label={t.nav.search}
          >
            <Search className="w-3.5 h-3.5 cd-accent-text" />
            <span className="hidden lg:inline text-[#A1A1AA]">
              {t.nav.search}
            </span>
          </button>

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
            className="md:hidden p-2 rounded-lg text-[#FAFAFA] hover:bg-white/5"
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

      {/* Responsive Mobile Menu Drawer (Movies anchored at the very bottom) */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-white/10 bg-[var(--cd-bg)]/95 backdrop-blur-xl px-4 py-3 space-y-1">
          {mobileDrawerTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const isMoviesRow = tab.id === 'movies';
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
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium flex items-center justify-between ${
                  isMoviesRow ? 'mt-2 pt-3 border-t border-white/10' : ''
                } ${
                  isActive
                    ? 'bg-[var(--cd-accent-soft)] cd-accent-text font-semibold'
                    : 'text-[#FAFAFA] hover:bg-white/5'
                }`}
              >
                <span className="inline-flex items-center gap-2">
                  {tab.icon}
                  <span>{tab.label}</span>
                </span>
                {tab.id === 'mylist' && myListItems.length > 0 && (
                  <span className="text-xs tabular-nums">
                    {myListItems.length}
                  </span>
                )}
              </a>
            );
          })}
          <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2 text-xs text-[#A1A1AA]">
            <span className="inline-flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 cd-accent-text" />
              {currentLang.label} ({currentLang.shortLabel})
            </span>
            <PWAInstallButton
              variant="menu"
              onAction={() => setMobileMenuOpen(false)}
            />
          </div>
        </div>
      )}
    </header>
  );
};
