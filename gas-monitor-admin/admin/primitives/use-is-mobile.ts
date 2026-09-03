'use client';

import { useEffect, useState } from 'react';

/**
 * Prefer CSS for layout switching; a JS-measured layout flashes on first paint.
 * Use this ONLY where the DOM must genuinely differ — a drawer instead of a
 * sidebar, cards instead of a table.
 */
export function useMediaQuery(query: string): boolean {
  // Starts false on the server so SSR and the first client render agree; the
  // effect corrects it immediately. Guessing true here causes hydration errors.
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, [query]);

  return matches;
}

export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767px)');
}
