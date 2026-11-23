'use client';

import { useEffect, type ReactNode } from 'react';

/** Bottom sheet on a phone, centred dialog from `md`. Closes on Escape or a tap outside. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-card p-5 pb-8 md:rounded-[28px]"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border md:hidden" />
        <h3 className="mb-4 text-lg font-extrabold text-foreground">{title}</h3>
        {children}
      </div>
    </div>
  );
}
