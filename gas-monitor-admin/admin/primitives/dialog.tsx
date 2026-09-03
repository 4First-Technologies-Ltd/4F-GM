'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Shared modal mechanics: focus moved in on open, trapped while open, Escape
 * closes, focus returned to the trigger on close, body scroll locked.
 *
 * The project had no dialog primitive, so this is generated rather than
 * composed. Both the confirm dialog and the detail drawer sit on it.
 */
function useDialogBehaviour(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    ref.current?.querySelector<HTMLElement>('button, [href], input, select, textarea')?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !ref.current) return;

      const focusables = ref.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      returnFocusRef.current?.focus?.();
    };
  }, [ref, onClose]);
}

/* --------------------------------------------------------------- confirm --- */

/**
 * Confirm PROPORTIONALLY: reversible single-record changes get no dialog at all,
 * irreversible ones name the record, and destructive ones require typing a
 * confirmation. Confirmation fatigue makes people click through the one that
 * mattered.
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  danger = false,
  typeToConfirm,
  onConfirm,
  onCancel
}: {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  typeToConfirm?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useDialogBehaviour(ref, onCancel);

  const unlocked = !typeToConfirm || typed === typeToConfirm;

  return (
    <div className="adm-scrim" onClick={onCancel}>
      <div
        ref={ref}
        className="adm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="adm-confirm-title"
        aria-describedby="adm-confirm-body"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="adm-confirm-title" className="adm-dialog-title">
          {title}
        </h2>
        <p id="adm-confirm-body" className="adm-dialog-body">
          {body}
        </p>

        {typeToConfirm && (
          <label className="adm-field">
            <span className="adm-field-label">
              Type <code>{typeToConfirm}</code> to confirm
            </span>
            <input
              className="adm-input"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        )}

        {error && <p className="adm-field-error">{error}</p>}

        <div className="adm-dialog-actions">
          <button type="button" className="adm-btn" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`adm-btn adm-btn--${danger ? 'danger' : 'primary'}`}
            disabled={!unlocked || busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onConfirm();
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- drawer --- */

/** Right-hand drawer — keeps the operator's place in the list behind it. */
export function Drawer({
  title,
  subtitle,
  headerExtra,
  footer,
  onClose,
  children
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  headerExtra?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogBehaviour(ref, onClose);

  return (
    <div className="adm-scrim adm-scrim--drawer" onClick={onClose}>
      <div
        ref={ref}
        className="adm-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="adm-drawer-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="adm-drawer-head">
          <div style={{ minWidth: 0 }}>
            <h2 id="adm-drawer-title" className="adm-page-title">
              {title}
            </h2>
            {subtitle && <p className="adm-page-meta">{subtitle}</p>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            {headerExtra}
            <button type="button" className="adm-btn adm-btn--icon" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        </header>
        <div className="adm-drawer-body">{children}</div>
        {footer && <footer className="adm-drawer-foot">{footer}</footer>}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- modal --- */

export function Modal({
  title,
  onClose,
  footer,
  wide = false,
  children
}: {
  title: string;
  onClose: () => void;
  footer?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogBehaviour(ref, onClose);

  return (
    <div className="adm-scrim" onClick={onClose}>
      <div
        ref={ref}
        className={`adm-dialog${wide ? ' adm-dialog--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="adm-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
          <h2 id="adm-modal-title" className="adm-dialog-title">
            {title}
          </h2>
          <button type="button" className="adm-btn adm-btn--icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
        {footer && <div className="adm-dialog-actions">{footer}</div>}
      </div>
    </div>
  );
}
