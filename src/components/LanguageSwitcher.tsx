import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Globe, Loader2, Sparkles } from 'lucide-react';
import { useDramaContext } from '../context/DramaContext';
import { SUPPORTED_LANGUAGES, getLanguageMeta } from '../i18n/helpers';
import type { LanguageCode, LanguagePreference } from '../types/drama';

interface LanguageSwitcherProps {
  variant?: 'header' | 'footer' | 'drawer';
  loading?: boolean;
  onChangeLanguage?: (lang: LanguageCode) => void;
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({
  variant = 'header',
  loading = false,
  onChangeLanguage,
}) => {
  const { language, languagePreference, t, setLanguagePreference } =
    useDramaContext();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const currentMeta = getLanguageMeta(language);
  const isAuto = languagePreference === 'auto';

  const handleSelect = (pref: LanguagePreference) => {
    const resolved = setLanguagePreference(pref);
    setOpen(false);
    if (onChangeLanguage) {
      onChangeLanguage(resolved);
    } else if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('hd:change-language', {
          detail: { lang: resolved, pref },
        })
      );
    }
  };

  const isFooter = variant === 'footer';
  const isDrawer = variant === 'drawer';

  const renderOptions = () => (
    <>
      <button
        type="button"
        role="option"
        aria-selected={isAuto}
        onClick={() => handleSelect('auto')}
        className={`w-full px-3.5 py-2 text-left text-xs flex items-center justify-between gap-2 transition-colors ${
          isAuto
            ? 'cd-accent-text bg-[var(--cd-accent-soft)] font-semibold'
            : 'text-[#FAFAFA] hover:bg-white/5'
        }`}
      >
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 cd-accent-text shrink-0" />
            <span className="truncate">{t.languageSwitcher.autoLabel}</span>
          </span>
          <span className="block text-[10px] text-[#A1A1AA] font-normal mt-0.5 truncate">
            {t.languageSwitcher.autoDesc}
          </span>
        </span>
        {isAuto && <Check className="w-3.5 h-3.5 cd-accent-text shrink-0" />}
      </button>

      <div className="my-1 border-t border-white/10" />

      {SUPPORTED_LANGUAGES.map((l) => {
        const active = !isAuto && language === l.code;
        return (
          <button
            key={l.code}
            type="button"
            role="option"
            aria-selected={active}
            onClick={() => handleSelect(l.code)}
            className={`w-full px-3.5 py-2 text-left text-xs flex items-center justify-between gap-2 transition-colors ${
              active
                ? 'cd-accent-text bg-[var(--cd-accent-soft)] font-semibold'
                : 'text-[#FAFAFA] hover:bg-white/5'
            }`}
          >
            <span className="inline-flex items-center gap-2 min-w-0">
              <span aria-hidden="true" className="shrink-0 text-sm leading-none">
                {l.flag}
              </span>
              <span className="truncate">{l.label}</span>
              <span className="shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-[#A1A1AA]">
                {l.shortLabel}
              </span>
            </span>
            {active && <Check className="w-3.5 h-3.5 cd-accent-text shrink-0" />}
          </button>
        );
      })}
    </>
  );

  if (isDrawer) {
    return (
      <div ref={containerRef} className="w-full">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          disabled={loading}
          aria-label={t.languageSwitcher.label}
          aria-expanded={open}
          aria-haspopup="listbox"
          className="w-full px-3 py-2.5 rounded-xl bg-black/30 border border-white/10 hover:border-[var(--cd-accent)]/60 text-xs font-medium text-[#FAFAFA] flex items-center justify-between gap-2 transition-colors"
        >
          <span className="inline-flex items-center gap-2 min-w-0">
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 cd-accent-text animate-spin shrink-0" />
            ) : (
              <Globe className="w-3.5 h-3.5 cd-accent-text shrink-0" />
            )}
            <span className="text-[#A1A1AA] shrink-0">
              {t.languageSwitcher.label}
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5 min-w-0">
            <span aria-hidden="true" className="shrink-0">
              {currentMeta.flag}
            </span>
            <span className="truncate font-semibold text-white">
              {isAuto
                ? `${t.languageSwitcher.autoShort} (${currentMeta.shortLabel})`
                : `${currentMeta.label} (${currentMeta.shortLabel})`}
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-[#A1A1AA] shrink-0 transition-transform ${
                open ? 'rotate-180' : ''
              }`}
            />
          </span>
        </button>

        {open && (
          <div
            role="listbox"
            aria-label={t.languageSwitcher.label}
            className="mt-2 w-full max-h-56 overflow-y-auto overscroll-contain rounded-xl bg-[#0F0F13] border border-white/10 py-1.5"
          >
            {renderOptions()}
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        disabled={loading}
        aria-label={t.languageSwitcher.label}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={
          isFooter
            ? 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-[#141211] border border-white/15 hover:border-[var(--cd-accent)] text-xs font-medium text-[#FAFAFA] transition-colors'
            : 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--cd-surface)] border border-[var(--cd-border)] hover:border-white/25 text-xs font-medium text-[#FAFAFA] whitespace-nowrap shrink-0 transition-colors'
        }
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 cd-accent-text animate-spin" />
        ) : isFooter ? (
          <Globe className="w-3.5 h-3.5 cd-accent-text shrink-0" />
        ) : (
          <span aria-hidden="true">{currentMeta.flag}</span>
        )}

        <span className={isFooter ? 'inline' : 'hidden lg:inline'}>
          {isAuto
            ? `${t.languageSwitcher.autoShort} (${currentMeta.shortLabel})`
            : `${currentMeta.label} (${currentMeta.shortLabel})`}
        </span>
        {!isFooter && (
          <span className="lg:hidden uppercase">
            {isAuto ? currentMeta.shortLabel : currentMeta.code}
          </span>
        )}
        <ChevronDown
          className={`w-3.5 h-3.5 text-[#A1A1AA] transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label={t.languageSwitcher.label}
          className={`absolute ${
            isFooter ? 'bottom-full mb-2 left-0' : 'right-0 mt-2'
          } w-64 max-h-[min(75dvh,420px)] overflow-y-auto overscroll-contain rounded-2xl bg-[#141418]/95 backdrop-blur-xl border border-white/15 shadow-2xl py-1.5 z-50`}
        >
          {renderOptions()}
        </div>
      )}
    </div>
  );
};
