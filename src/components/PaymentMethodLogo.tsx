import React from 'react';

export interface PaymentMethodLogoProps {
  method: string;
  bankCode?: string;
  network?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

interface BrandVisualSpec {
  bg: string;
  fg: string;
  ring: string;
  code: string;
  title: string;
}

const BANK_SPECS: Record<string, BrandVisualSpec> = {
  BCA: {
    bg: '#005BAA',
    fg: '#FFFFFF',
    ring: 'rgba(0,91,170,0.45)',
    code: 'BCA',
    title: 'Bank Central Asia (BCA)',
  },
  BRI: {
    bg: '#00529C',
    fg: '#FFFFFF',
    ring: 'rgba(0,82,156,0.45)',
    code: 'BRI',
    title: 'Bank Rakyat Indonesia (BRI)',
  },
  BNI: {
    bg: '#F15A22',
    fg: '#FFFFFF',
    ring: 'rgba(241,90,34,0.45)',
    code: 'BNI',
    title: 'Bank Negara Indonesia (BNI)',
  },
  MANDIRI: {
    bg: '#003D79',
    fg: '#FDB913',
    ring: 'rgba(253,185,19,0.4)',
    code: 'MDR',
    title: 'Bank Mandiri',
  },
  BSI: {
    bg: '#00A39D',
    fg: '#FFFFFF',
    ring: 'rgba(0,163,157,0.45)',
    code: 'BSI',
    title: 'Bank Syariah Indonesia (BSI)',
  },
  CIMB: {
    bg: '#790008',
    fg: '#FFFFFF',
    ring: 'rgba(180,22,34,0.45)',
    code: 'CIMB',
    title: 'CIMB Niaga',
  },
  JAGO: {
    bg: '#F9B000',
    fg: '#111015',
    ring: 'rgba(249,176,0,0.45)',
    code: 'JAGO',
    title: 'Bank Jago',
  },
  SEABANK: {
    bg: '#EE4D2D',
    fg: '#FFFFFF',
    ring: 'rgba(238,77,45,0.45)',
    code: 'SEA',
    title: 'SeaBank Indonesia',
  },
  PERMATA: {
    bg: '#007A33',
    fg: '#FFFFFF',
    ring: 'rgba(0,122,51,0.45)',
    code: 'PRM',
    title: 'PermataBank',
  },
  BTN: {
    bg: '#004B87',
    fg: '#F7D117',
    ring: 'rgba(247,209,23,0.4)',
    code: 'BTN',
    title: 'Bank Tabungan Negara (BTN)',
  },
};

export const PaymentMethodLogo: React.FC<PaymentMethodLogoProps> = ({
  method,
  bankCode,
  network,
  size = 'md',
  className = '',
}) => {
  const normMethod = (method || '').toLowerCase().trim();
  const normBank = (bankCode || '').toUpperCase().trim();

  const dims =
    size === 'sm'
      ? 'w-7 h-7 rounded-lg text-[10px]'
      : size === 'lg'
      ? 'w-11 h-11 rounded-xl text-xs'
      : 'w-9 h-9 rounded-xl text-[11px]';

  // Indonesian E-Wallets with dedicated inline SVG marks
  if (normMethod === 'dana') {
    return (
      <span
        title="DANA"
        className={`inline-flex items-center justify-center shrink-0 overflow-hidden bg-[#108EE9] text-white border border-white/15 shadow-sm ${dims} ${className}`}
      >
        <svg viewBox="0 0 36 36" className="w-full h-full" aria-hidden="true">
          <rect width="36" height="36" rx="8" fill="#108EE9" />
          <path
            d="M8 14.5c4.5-2.6 8.2-2.6 12.2 0 3.2 2 5.6 2 7.8.4v6.8c-2.2 1.6-4.6 1.6-7.8-.4-4-2.6-7.7-2.6-12.2 0v-6.8Z"
            fill="#FFFFFF"
            fillOpacity="0.96"
          />
        </svg>
      </span>
    );
  }

  if (normMethod === 'gopay') {
    return (
      <span
        title="GoPay"
        className={`inline-flex items-center justify-center shrink-0 overflow-hidden bg-[#00AED6] text-white border border-white/15 shadow-sm ${dims} ${className}`}
      >
        <svg viewBox="0 0 36 36" className="w-full h-full" aria-hidden="true">
          <rect width="36" height="36" rx="8" fill="#00AED6" />
          <rect x="8" y="10" width="20" height="16" rx="4" fill="#FFFFFF" />
          <circle cx="22.5" cy="18" r="2.6" fill="#00AED6" />
        </svg>
      </span>
    );
  }

  if (normMethod === 'ovo') {
    return (
      <span
        title="OVO"
        className={`inline-flex items-center justify-center shrink-0 overflow-hidden bg-[#4C3494] text-white border border-white/15 shadow-sm ${dims} ${className}`}
      >
        <svg viewBox="0 0 36 36" className="w-full h-full" aria-hidden="true">
          <rect width="36" height="36" rx="8" fill="#4C3494" />
          <circle
            cx="18"
            cy="18"
            r="8.2"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="3.6"
          />
        </svg>
      </span>
    );
  }

  if (normMethod === 'shopeepay') {
    return (
      <span
        title="ShopeePay"
        className={`inline-flex items-center justify-center shrink-0 overflow-hidden bg-[#EE4D2D] text-white border border-white/15 shadow-sm ${dims} ${className}`}
      >
        <svg viewBox="0 0 36 36" className="w-full h-full" aria-hidden="true">
          <rect width="36" height="36" rx="8" fill="#EE4D2D" />
          <path
            d="M11 13.5h14l-1.2 13.5H12.2L11 13.5Z"
            fill="#FFFFFF"
            fillOpacity="0.96"
          />
          <path
            d="M14.5 13.5a3.5 3.5 0 0 1 7 0"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="2.2"
          />
          <path
            d="M15.8 22.8c1.5.9 4.4.8 4.4-1 0-1.6-4.1-1.3-4.1-2.9 0-1.4 2.5-1.7 4-.9"
            fill="none"
            stroke="#EE4D2D"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </span>
    );
  }

  if (normMethod === 'linkaja') {
    return (
      <span
        title="LinkAja"
        className={`inline-flex items-center justify-center shrink-0 overflow-hidden bg-[#E51C23] text-white border border-white/15 shadow-sm ${dims} ${className}`}
      >
        <svg viewBox="0 0 36 36" className="w-full h-full" aria-hidden="true">
          <rect width="36" height="36" rx="8" fill="#E51C23" />
          <path
            d="M12.5 11.5v13h11v-3.2h-7.4v-9.8h-3.6Z"
            fill="#FFFFFF"
          />
        </svg>
      </span>
    );
  }

  if (normMethod === 'paypal') {
    return (
      <span
        title="PayPal"
        className={`inline-flex items-center justify-center shrink-0 overflow-hidden bg-[#003087] text-white border border-white/15 shadow-sm ${dims} ${className}`}
      >
        <svg viewBox="0 0 36 36" className="w-full h-full" aria-hidden="true">
          <rect width="36" height="36" rx="8" fill="#003087" />
          <path
            d="M13 26l1.7-11.2h5.1c3 0 4.8 1.5 4.3 4.2-.5 2.9-2.8 4.2-5.7 4.2h-2l-.5 2.8H13Z"
            fill="#FFFFFF"
          />
          <path
            d="M16.2 22.8l1.2-7.8h4c2.3 0 3.7 1.1 3.3 3.3-.4 2.3-2.2 3.3-4.5 3.3h-1.8l-.2 1.2h-2Z"
            fill="#009CDE"
            fillOpacity="0.9"
          />
        </svg>
      </span>
    );
  }

  if (normMethod === 'wise') {
    return (
      <span
        title="Wise"
        className={`inline-flex items-center justify-center shrink-0 overflow-hidden bg-[#9FE870] text-[#163300] border border-white/15 shadow-sm ${dims} ${className}`}
      >
        <svg viewBox="0 0 36 36" className="w-full h-full" aria-hidden="true">
          <rect width="36" height="36" rx="8" fill="#9FE870" />
          <path
            d="M10.5 11.5h15.2l-3.4 4.2h4.2l-6.4 9h-4.1l3.6-5.2H13.5l2.8-3.8h-5.8Z"
            fill="#163300"
          />
        </svg>
      </span>
    );
  }

  if (normMethod.startsWith('usdt')) {
    const netLabel =
      network ||
      (normMethod === 'usdt_trc20'
        ? 'TRC'
        : normMethod === 'usdt_bep20'
        ? 'BEP'
        : normMethod === 'usdt_erc20'
        ? 'ERC'
        : 'POL');
    return (
      <span
        title={`USDT (${netLabel})`}
        className={`relative inline-flex items-center justify-center shrink-0 overflow-hidden bg-[#26A17B] text-white border border-white/15 shadow-sm ${dims} ${className}`}
      >
        <svg viewBox="0 0 36 36" className="w-full h-full" aria-hidden="true">
          <rect width="36" height="36" rx="8" fill="#26A17B" />
          <path
            d="M11 10.5h14v3.2h-5.2v2.4c3.6.3 6.2 1.2 6.2 2.2 0 1.1-2.6 2-6.2 2.2V27h-3.6v-6.5c-3.6-.2-6.2-1.1-6.2-2.2 0-1 2.6-1.9 6.2-2.2v-2.4H11v-3.2Z"
            fill="#FFFFFF"
          />
        </svg>
      </span>
    );
  }

  // Indonesian Banks (bank_transfer)
  if (normMethod === 'bank_transfer' || BANK_SPECS[normBank]) {
    const spec = BANK_SPECS[normBank];
    if (spec) {
      return (
        <span
          title={spec.title}
          style={{ backgroundColor: spec.bg, color: spec.fg }}
          className={`inline-flex items-center justify-center shrink-0 font-extrabold tracking-tight border border-white/15 shadow-sm select-none ${dims} ${className}`}
        >
          {spec.code}
        </span>
      );
    }
    return (
      <span
        title="Transfer Bank Indonesia"
        className={`inline-flex items-center justify-center shrink-0 overflow-hidden bg-[#1E293B] text-[#FDE68A] border border-white/15 shadow-sm ${dims} ${className}`}
      >
        <svg viewBox="0 0 36 36" className="w-full h-full" aria-hidden="true">
          <rect width="36" height="36" rx="8" fill="#1E293B" />
          <path d="M18 8l10 5v2H8v-2l10-5Z" fill="#FDE68A" />
          <path
            d="M10.5 17h3v7h-3zm6 0h3v7h-3zm6 0h3v7h-3zM8 25.5h20V28H8z"
            fill="#FFFFFF"
            fillOpacity="0.92"
          />
        </svg>
      </span>
    );
  }

  // Generic safe fallback monogram
  const fallbackCode = (normBank || normMethod || 'KD')
    .replace(/[^A-Z0-9]/gi, '')
    .slice(0, 3)
    .toUpperCase();

  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 bg-[#27272A] text-white font-bold border border-white/15 ${dims} ${className}`}
    >
      {fallbackCode || 'KD'}
    </span>
  );
};
