'use client';

import { useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { COMPONENT_STATES, ComponentKey } from '@/lib/three/productConfig';
import { useComponentTransform } from './useComponentTransform';
import { useProgress } from './ProgressContext';

const LABELED_KEYS = (Object.keys(COMPONENT_STATES) as ComponentKey[]).filter((k) => !!COMPONENT_STATES[k].label);

const VISIBILITY_THRESHOLD = 0.72;

function Label({ componentKey }: { componentKey: ComponentKey }) {
  const { ref, localProgressRef } = useComponentTransform(componentKey);
  const [visible, setVisible] = useState(false);

  useFrame(() => {
    const shouldShow = localProgressRef.current > VISIBILITY_THRESHOLD;
    if (shouldShow !== visible) setVisible(shouldShow);
  });

  return (
    <group ref={ref}>
      <Html center distanceFactor={7} style={{ pointerEvents: 'none' }} occlude={false}>
        <div
          style={{
            opacity: visible ? 1 : 0,
            transform: `translateY(${visible ? 0 : 6}px)`,
            transition: 'opacity 220ms ease-out, transform 220ms ease-out',
            padding: '4px 10px',
            borderRadius: 999,
            background: 'rgba(8, 16, 12, 0.72)',
            border: '1px solid rgba(255, 122, 48, 0.45)',
            color: '#f3f7f1',
            fontFamily: "'Fira Sans', system-ui, sans-serif",
            fontSize: 11,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap'
          }}
        >
          {COMPONENT_STATES[componentKey].label}
        </div>
      </Html>
    </group>
  );
}

export default function ProductLabels() {
  const { labelsEnabled } = useProgress();
  if (!labelsEnabled) return null;
  return (
    <>
      {LABELED_KEYS.map((key) => (
        <Label key={key} componentKey={key} />
      ))}
    </>
  );
}
