'use client';

import { useEffect, useRef } from 'react';
import { clamp } from '@/lib/three/animationUtils';

/**
 * Tracks how far the given section has been scrolled through, as 0-1.
 * Returns a mutable ref (not React state) so the 60fps scroll handler never
 * triggers a React re-render — only the R3F render loop reads this value.
 */
export function useScrollProgress(sectionRef: React.RefObject<HTMLElement>) {
  const progressRef = useRef(0);
  const tickingRef = useRef(false);

  useEffect(() => {
    const compute = () => {
      tickingRef.current = false;
      const el = sectionRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const viewportH = window.innerHeight;
      const scrollable = rect.height - viewportH;
      if (scrollable <= 0) {
        progressRef.current = rect.top <= 0 ? 1 : 0;
        return;
      }
      progressRef.current = clamp(-rect.top / scrollable);
    };

    const onScrollOrResize = () => {
      if (tickingRef.current) return;
      tickingRef.current = true;
      requestAnimationFrame(compute);
    };

    compute();
    window.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize);
      window.removeEventListener('resize', onScrollOrResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return progressRef;
}
