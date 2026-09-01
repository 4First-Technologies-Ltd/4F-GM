'use client';

import { Canvas } from '@react-three/fiber';
import { Suspense, useMemo } from 'react';
import { ProgressProvider } from '@/components/experience/ProgressContext';
import { PRODUCT_CONFIG } from '@/lib/three/productConfig';
import ProductScene from '@/components/product/ProductScene';

interface ProductCanvasProps {
  targetRef: React.MutableRefObject<number>;
  explosionScale: number;
  orbitScale: number;
  radiusScale: number;
  reducedMotion: boolean;
  labelsEnabled: boolean;
}

/**
 * The only client-only-rendered piece: the actual WebGL canvas. Kept in its own module,
 * dynamically imported with ssr:false, so the rest of the page (headings, copy, fallback
 * list) stays server-rendered and crawlable.
 */
export default function ProductCanvas({
  targetRef,
  explosionScale,
  orbitScale,
  radiusScale,
  reducedMotion,
  labelsEnabled
}: ProductCanvasProps) {
  const dpr = useMemo<[number, number]>(() => [1, Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio : 1)], []);

  return (
    <Canvas
      shadows={!reducedMotion}
      dpr={dpr}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ fov: PRODUCT_CONFIG.camera.fov, near: 0.1, far: 30 }}
    >
      <Suspense fallback={null}>
        <ProgressProvider
          targetRef={targetRef}
          explosionScale={explosionScale}
          orbitScale={orbitScale}
          radiusScale={radiusScale}
          reducedMotion={reducedMotion}
          labelsEnabled={labelsEnabled}
        >
          <ProductScene />
        </ProgressProvider>
      </Suspense>
    </Canvas>
  );
}
