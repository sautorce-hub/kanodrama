import React, { useEffect, useRef, useState } from 'react';

interface LazySectionProps {
  children: React.ReactNode;
  fallback: React.ReactNode;
  rootMargin?: string;
  className?: string;
}

export const LazySection: React.FC<LazySectionProps> = ({
  children,
  fallback,
  rootMargin = '320px 0px',
  className = '',
}) => {
  const [visible, setVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visible) return;
    const el = containerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [visible, rootMargin]);

  return (
    <div ref={containerRef} className={className}>
      {visible ? children : fallback}
    </div>
  );
};
