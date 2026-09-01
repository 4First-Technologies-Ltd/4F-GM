'use client';

import { createContext, useContext, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { dampT, lerp } from '@/lib/three/animationUtils';

export interface ProgressContextValue {
  /** Smoothed 0-1 scroll progress, updated every R3F frame. Read via .current, never React state. */
  progressRef: React.MutableRefObject<number>;
  explosionScale: number;
  orbitScale: number;
  radiusScale: number;
  reducedMotion: boolean;
  labelsEnabled: boolean;
}

const ProgressContext = createContext<ProgressContextValue | null>(null);

export function useProgress() {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error('useProgress must be used within <ProgressProvider>');
  return ctx;
}

/**
 * Lives inside the Canvas. Owns the smoothed progress value (critically-damped toward the
 * raw scroll-derived target every frame) and exposes it + responsive tuning to descendants.
 */
export function ProgressProvider({
  targetRef,
  explosionScale,
  orbitScale,
  radiusScale,
  reducedMotion,
  labelsEnabled,
  children
}: {
  targetRef: React.MutableRefObject<number>;
  explosionScale: number;
  orbitScale: number;
  radiusScale: number;
  reducedMotion: boolean;
  labelsEnabled: boolean;
  children: React.ReactNode;
}) {
  const smoothedRef = useRef(0);

  useFrame((_, delta) => {
    const t = dampT(reducedMotion ? 10 : 6, Math.min(delta, 0.1));
    smoothedRef.current = lerp(smoothedRef.current, targetRef.current, t);
  });

  return (
    <ProgressContext.Provider
      value={{
        progressRef: smoothedRef,
        explosionScale,
        orbitScale,
        radiusScale,
        reducedMotion,
        labelsEnabled
      }}
    >
      {children}
    </ProgressContext.Provider>
  );
}
