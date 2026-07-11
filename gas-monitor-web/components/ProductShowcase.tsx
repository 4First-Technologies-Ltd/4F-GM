'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';

export interface ShowcaseSlide {
  src: string;
  alt: string;
  /** Slides on dark product photography get a dark frame so they blend in. */
  tone: 'dark' | 'light';
}

const ROTATE_MS = 5000;

export default function ProductShowcase({ slides }: { slides: ShowcaseSlide[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reducedMotion = useRef(false);

  useEffect(() => {
    reducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  useEffect(() => {
    if (paused || reducedMotion.current || slides.length < 2) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % slides.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [paused, slides.length]);

  return (
    <div
      className="product-showcase"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="4FG Monitor product gallery"
    >
      <div className={`product-showcase-frame is-${slides[index].tone}`}>
        {slides.map((slide, i) => (
          <div key={slide.src} className={`product-showcase-slide${i === index ? ' is-active' : ''}`} aria-hidden={i !== index}>
            <Image
              src={slide.src}
              alt={slide.alt}
              fill
              sizes="(max-width: 900px) 100vw, 480px"
              style={{ objectFit: 'contain' }}
              priority={i === 0}
            />
          </div>
        ))}
      </div>

      <div className="product-showcase-dots" role="tablist" aria-label="Choose product image">
        {slides.map((slide, i) => (
          <button
            key={slide.src}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={`Image ${i + 1} of ${slides.length}: ${slide.alt}`}
            className={`product-showcase-dot${i === index ? ' is-active' : ''}`}
            onClick={() => setIndex(i)}
          />
        ))}
      </div>
    </div>
  );
}
