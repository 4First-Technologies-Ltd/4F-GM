'use client';

import Image from 'next/image';
import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PhoneMockupProps {
  src: string;
  alt: string;
  className?: string;
}

export function PhoneMockup({ src, alt, className }: PhoneMockupProps) {
  return (
    <div className={cn('relative mx-auto', className)}>
      {/* Phone frame outer shadow */}
      <div className="relative mx-auto h-[600px] w-[320px] rounded-[45px] border-[8px] border-gray-900 bg-gray-950 shadow-2xl">
        {/* Notch */}
        <div className="absolute left-1/2 top-0 z-20 h-6 w-40 -translate-x-1/2 rounded-b-3xl bg-gray-950" />

        {/* Screen bezel/border */}
        <div className="absolute inset-1 rounded-[40px] bg-black overflow-hidden">
          {/* Screen content */}
          <div className="relative h-full w-full overflow-hidden bg-white">
            <Image
              src={src}
              alt={alt}
              fill
              className="object-cover"
              priority
              unoptimized
            />
          </div>
        </div>

        {/* Glossy overlay */}
        <div className="absolute inset-0 rounded-[45px] pointer-events-none">
          <div className="absolute inset-0 rounded-[45px] bg-gradient-to-br from-white/20 via-transparent to-transparent" />
        </div>
      </div>

      {/* Home indicator */}
      <div className="absolute bottom-2 left-1/2 h-1 w-32 -translate-x-1/2 rounded-full bg-gray-900" />
    </div>
  );
}
