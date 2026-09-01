'use client';

import { useState } from 'react';

interface DebugPanelProps {
  progress: number;
  onScrub: (value: number) => void;
  onRelease: () => void;
  labelsEnabled: boolean;
  onToggleLabels: () => void;
}

/** Development-only inspector. Never rendered when NODE_ENV !== 'development'. */
export default function DebugPanel({ progress, onScrub, onRelease, labelsEnabled, onToggleLabels }: DebugPanelProps) {
  const [manual, setManual] = useState(false);

  return (
    <div className="debug-panel">
      <div className="debug-row">
        <strong>scrollProgress</strong>
        <span>{progress.toFixed(3)}</span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.001}
        value={progress}
        onChange={(e) => {
          setManual(true);
          onScrub(Number(e.target.value));
        }}
      />
      <div className="debug-actions">
        <button
          type="button"
          onClick={() => {
            setManual(false);
            onRelease();
          }}
        >
          {manual ? 'Release to scroll' : 'Live scroll'}
        </button>
        <button
          type="button"
          onClick={() => {
            setManual(true);
            onScrub(0);
          }}
        >
          Reset (assembled)
        </button>
        <button
          type="button"
          onClick={() => {
            setManual(true);
            onScrub(1);
          }}
        >
          Full explode
        </button>
        <button type="button" onClick={onToggleLabels}>
          {labelsEnabled ? 'Hide labels' : 'Show labels'}
        </button>
      </div>
    </div>
  );
}
