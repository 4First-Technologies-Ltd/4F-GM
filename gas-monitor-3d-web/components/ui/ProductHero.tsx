'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useScrollProgress } from '@/lib/hooks/useScrollProgress';
import { usePrefersReducedMotion, useIsMobileViewport } from '@/lib/hooks/useMediaQuery';
import { PRODUCT_CONFIG } from '@/lib/three/productConfig';
import DebugPanel from './DebugPanel';

const ProductCanvas = dynamic(() => import('./ProductCanvas'), {
  ssr: false,
  loading: () => <div className="product-canvas-loading" aria-hidden="true" />
});

const HEADLINES = [
  { at: 0, title: 'Intelligent Gas Monitoring', body: 'A precision weight sensor, a cellular connection, and one clean readout.' },
  { at: 0.2, title: 'Precision Measurement', body: 'Four load cells and an HX711 amplifier turn cylinder weight into a live percentage.' },
  { at: 0.5, title: 'Connected Intelligence', body: 'An ESP32 and GSM module report every reading the moment it changes.' },
  { at: 0.75, title: 'Built From The Inside Out', body: "Here's everything packed inside the enclosure — engineered to just work." }
];

export default function ProductHero() {
  const sectionRef = useRef<HTMLElement>(null);
  const rawProgressRef = useScrollProgress(sectionRef as React.RefObject<HTMLElement>);
  const debugOverrideRef = useRef<number | null>(null);

  const reducedMotion = usePrefersReducedMotion();
  const isMobile = useIsMobileViewport(PRODUCT_CONFIG.responsive.mobileBreakpoint);
  const [labelsEnabled, setLabelsEnabled] = useState(true);
  const [headlineIndex, setHeadlineIndex] = useState(0);
  const [debugProgress, setDebugProgress] = useState(0);

  const targetRef = useMemo(() => {
    const ref = {} as React.MutableRefObject<number>;
    Object.defineProperty(ref, 'current', {
      get: () => debugOverrideRef.current ?? rawProgressRef.current
    });
    return ref;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const p = targetRef.current;
      let idx = 0;
      for (let i = 0; i < HEADLINES.length; i++) if (p >= HEADLINES[i].at) idx = i;
      setHeadlineIndex((prev) => (prev === idx ? prev : idx));
      setDebugProgress(p);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [targetRef]);

  const headline = HEADLINES[headlineIndex];

  return (
    <section ref={sectionRef} className="product-section" aria-label="Inside the 4FG Smart Gas Monitor">
      <div className="product-sticky">
        <ProductCanvas
          targetRef={targetRef}
          explosionScale={isMobile ? PRODUCT_CONFIG.responsive.mobileExplosionScale : 1}
          orbitScale={isMobile ? PRODUCT_CONFIG.responsive.mobileOrbitScale : 1}
          radiusScale={isMobile ? PRODUCT_CONFIG.responsive.mobileRadiusScale : 1}
          reducedMotion={reducedMotion}
          labelsEnabled={labelsEnabled}
        />

        <div className="product-overlay">
          <p className="product-eyebrow">4FG Smart Gas Monitor</p>
          <h2 className="product-title">{headline.title}</h2>
          <p className="product-body">{headline.body}</p>
          <p className="product-hint" aria-hidden="true">
            {headlineIndex === 0 ? 'Scroll to explore the technology' : ''}
          </p>
        </div>

        {/* Accessible fallback: the essential product facts exist in real HTML, not just the canvas. */}
        <div className="sr-only">
          <h3>What&apos;s inside the 4FG Smart Gas Monitor</h3>
          <ul>
            <li>ESP32 microcontroller for local processing and connectivity</li>
            <li>GSM module with dedicated antenna for cellular reporting</li>
            <li>Four load cells and an HX711 amplifier for precise weight-based gas level sensing</li>
            <li>Battery and power-management board for reliable standalone operation</li>
            <li>Front status display showing live gas level and connection state</li>
          </ul>
        </div>
      </div>

      {process.env.NODE_ENV === 'development' && (
        <DebugPanel
          progress={debugProgress}
          onScrub={(v) => {
            debugOverrideRef.current = v;
          }}
          onRelease={() => {
            debugOverrideRef.current = null;
          }}
          labelsEnabled={labelsEnabled}
          onToggleLabels={() => setLabelsEnabled((v) => !v)}
        />
      )}
    </section>
  );
}
