'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

type Slide = {
  src: string;
  alt: string;
};

const SLIDES: Slide[] = [
  { src: '/images/hero/kitchen-wife.jpg', alt: 'A happy customer cooking safely in her kitchen with a monitored gas cylinder' },
  { src: '/images/hero/hospital-cylinders.jpg', alt: 'A hospital maintenance room with gas cylinders tracked by 4FG monitor devices' },
  { src: '/images/hero/restaurant-kitchen.jpg', alt: 'A busy restaurant kitchen running on 4FG-monitored gas supply' },
  { src: '/images/hero/vendor-phone.jpeg', alt: 'A happy gas vendor checking live orders on his phone' }
];

const INTERVAL_MS = 3000;

export default function HeroSlider() {
  const [active, setActive] = useState(0);
  const reducedMotion = useRef(false);

  useEffect(() => {
    reducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion.current) return;

    const id = setInterval(() => {
      setActive((current) => (current + 1) % SLIDES.length);
    }, INTERVAL_MS);

    return () => clearInterval(id);
  }, []);

  return (
    <div className="hero-photo" aria-hidden={false}>
      {SLIDES.map((slide, index) => (
        <Image
          key={slide.src}
          src={slide.src}
          alt={index === active ? slide.alt : ''}
          fill
          sizes="100vw"
          priority={index === 0}
          loading={index === 0 ? undefined : 'lazy'}
          className={`hero-photo-slide${index === active ? ' is-active' : ''}`}
        />
      ))}
      <div className="hero-photo-scrim" />
      <div className="hero-photo-dots" role="tablist" aria-label="Background photo selector">
        {SLIDES.map((slide, index) => (
          <button
            key={slide.src}
            type="button"
            role="tab"
            aria-selected={index === active}
            aria-label={`Show slide ${index + 1}`}
            className={`hero-photo-dot${index === active ? ' is-active' : ''}`}
            onClick={() => setActive(index)}
          />
        ))}
      </div>
    </div>
  );
}
