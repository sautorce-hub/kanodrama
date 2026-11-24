import React, { useEffect, useState } from 'react';
import { X, HelpCircle, ChevronDown } from 'lucide-react';
import { useDramaContext } from '../context/DramaContext';

export const HelpCenterModal: React.FC = () => {
  const { t, helpModalOpen, setHelpModalOpen } = useDramaContext();
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  useEffect(() => {
    if (!helpModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setHelpModalOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [helpModalOpen, setHelpModalOpen]);

  if (!helpModalOpen) return null;

  return (
    <div
      onClick={() => setHelpModalOpen(false)}
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4 bg-black/80 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={t.help.title}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl bg-[#121013]/95 backdrop-blur-2xl border-t sm:border border-white/15 shadow-2xl overflow-hidden max-h-[85vh] flex flex-col"
      >
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[var(--cd-accent-soft)] border border-[var(--cd-accent)]/40 flex items-center justify-center">
              <HelpCircle className="w-4 h-4 cd-accent-text" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white leading-tight">
                {t.help.title}
              </h2>
              <p className="text-[11px] text-[#A1A1AA]">{t.help.subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setHelpModalOpen(false)}
            aria-label="Close help center"
            className="p-2 rounded-full bg-white/5 hover:bg-white/15 text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-2.5 pb-[max(24px,env(safe-area-inset-bottom))]">
          {t.help.faqs.map((faq, idx) => {
            const isOpen = openIndex === idx;
            return (
              <div
                key={idx}
                className="rounded-2xl bg-[#18161A] border border-white/10 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : idx)}
                  aria-expanded={isOpen}
                  className="w-full px-4 py-3.5 text-left flex items-center justify-between gap-3 hover:bg-white/5 transition-colors"
                >
                  <span className="text-xs sm:text-sm font-semibold text-white">
                    {faq.q}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-[#A1A1AA] shrink-0 transition-transform duration-200 ${
                      isOpen ? 'rotate-180 cd-accent-text' : ''
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="px-4 pb-3.5 text-xs text-[#D4D4D8] leading-relaxed border-t border-white/5 pt-2.5">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
