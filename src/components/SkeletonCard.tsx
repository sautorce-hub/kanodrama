import React from 'react';

interface SkeletonCardProps {
  ranked?: boolean;
  responsiveGrid?: boolean;
}

export const SkeletonCard: React.FC<SkeletonCardProps> = ({
  ranked = false,
  responsiveGrid = false,
}) => {
  return (
    <div
      className={`${
        responsiveGrid
          ? 'flex-[0_0_40%] w-[40%] min-w-[40%] shrink-0 snap-start sm:flex-auto sm:w-full sm:min-w-0 sm:shrink'
          : 'flex-[0_0_40%] w-[40%] min-w-[40%] shrink-0 sm:flex-none sm:w-[30%] sm:min-w-[30%] md:w-[calc(25%-15px)] md:min-w-[calc(25%-15px)] lg:w-[calc(20%-16px)] lg:min-w-[calc(20%-16px)] snap-start'
      } flex flex-col ${ranked ? 'pl-4 sm:pl-6' : ''}`}
      aria-hidden="true"
    >
      <div className="w-full aspect-[2/3] rounded-xl skeleton-espresso border border-white/10" />
      <div className="mt-2 px-0.5 space-y-1.5">
        <div className="h-3.5 w-4/5 rounded skeleton-espresso" />
        <div className="h-3 w-1/2 rounded skeleton-espresso" />
      </div>
    </div>
  );
};

export const HeroSkeleton: React.FC = () => {
  return (
    <section
      className="max-w-[1440px] mx-auto px-3 sm:px-8 pt-2 pb-3"
      aria-label="Loading Featured Drama"
    >
      <div className="relative w-full aspect-[3/4] max-h-[540px] sm:aspect-auto sm:h-[460px] md:h-[500px] lg:h-[540px] rounded-2xl sm:rounded-3xl overflow-hidden bg-[#141418] border border-white/10">
        <div className="absolute inset-0 skeleton-espresso opacity-50" />
        <div className="relative z-10 h-full p-5 sm:p-10 lg:p-14 flex flex-col justify-end sm:justify-center sm:pt-16 max-w-xl lg:max-w-2xl space-y-3">
          <div className="flex gap-2">
            <div className="h-5 w-24 rounded skeleton-espresso" />
            <div className="h-5 w-28 rounded skeleton-espresso" />
          </div>
          <div className="h-8 sm:h-11 w-3/4 rounded-lg skeleton-espresso" />
          <div className="h-4 w-full max-w-lg rounded skeleton-espresso" />
          <div className="h-4 w-2/3 rounded skeleton-espresso" />
          <div className="flex gap-3 pt-2">
            <div className="h-11 w-36 rounded-full skeleton-espresso" />
            <div className="h-11 w-32 rounded-full skeleton-espresso" />
          </div>
        </div>
      </div>
    </section>
  );
};

export const CarouselSkeleton: React.FC<{ ranked?: boolean }> = ({ ranked = false }) => {
  return (
    <section className="max-w-[1440px] mx-auto px-3 sm:px-8 py-4 sm:py-5" aria-hidden="true">
      <div className="flex items-center justify-between mb-3.5 sm:mb-4">
        <div className="h-6 w-44 rounded-lg skeleton-espresso" />
        <div className="h-4 w-16 rounded skeleton-espresso" />
      </div>
      <div className="flex gap-3 sm:gap-5 overflow-hidden">
        {Array.from({ length: 5 }).map((_, idx) => (
          <SkeletonCard key={idx} ranked={ranked} />
        ))}
      </div>
    </section>
  );
};

