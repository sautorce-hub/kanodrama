import React, { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { useDramaContext } from '../context/DramaContext';

export const OfflineIndicator: React.FC = () => {
  const { t } = useDramaContext();
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div
      className="fixed bottom-20 md:bottom-6 left-4 z-50 flex items-center gap-2 rounded-full bg-[#1C1612]/95 border border-[#D4AF37]/60 px-3.5 py-2 text-xs font-medium text-[#FDE68A] shadow-xl backdrop-blur-md"
      role="status"
    >
      <WifiOff className="w-3.5 h-3.5 text-[#D4AF37]" />
      <span>{t.pwa.offlineBanner}</span>
    </div>
  );
};
