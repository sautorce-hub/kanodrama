import React, { useState } from 'react';

interface LogoProps {
  className?: string;
}

export const KanoDramaLogo: React.FC<LogoProps> = ({ className = '' }) => {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div className={`inline-flex items-center gap-1.5 sm:gap-2.5 select-none shrink-0 ${className}`}>
      {imgFailed ? (
        <svg
          width="32"
          height="32"
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          className="w-7 h-7 sm:w-8 sm:h-8 shrink-0"
        >
          <rect width="64" height="64" rx="16" fill="#F1183A" />
          <path
            d="M19 15H26C27.5 15 28.5 16 28.5 17.5V29L41.5 16C42.5 15 44 14.7 45.2 15.2L49.5 17C51 17.6 51.5 19.6 50.3 20.8L37 34L50.5 46.5C51.7 47.7 51.2 49.6 49.6 50L43.5 51C42.2 51.2 40.9 50.7 40 49.6L28.5 39V48.5C28.5 50 27.5 51 26 51H19C17.5 51 16.5 50 16.5 48.5V17.5C16.5 16 17.5 15 19 15Z"
            fill="#FFFFFF"
          />
          <path d="M23.5 27.5L32.8 33L23.5 38.5V27.5Z" fill="#F1183A" />
        </svg>
      ) : (
        <img
          src="/assets/aistudio/file_000000005860821188dbaf696e0dbfa6_1a485403.png"
          alt="KanoDrama"
          width={1024}
          height={1024}
          decoding="async"
          onError={() => setImgFailed(true)}
          className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg object-cover shrink-0 shadow-sm"
        />
      )}
      <span className="font-brand inline-flex items-baseline text-[15px] sm:text-[19px] leading-none tracking-[-0.03em] whitespace-nowrap shrink-0">
        <span className="font-extrabold text-[#FAF7F0]">Kano</span>
        <span className="font-bold bg-gradient-to-r from-[#FDE7B0] via-[#F2C767] to-[#DBA23A] bg-clip-text text-transparent">
          Drama
        </span>
      </span>
    </div>
  );
};

