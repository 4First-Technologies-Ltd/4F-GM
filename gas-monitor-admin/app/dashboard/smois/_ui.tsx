'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { getJson } from '@/admin/data/source';
import { Modal } from '@/admin/primitives/dialog';
import { ErrorState, LoadingState } from '@/admin/primitives/states';

/** Small shared pieces for the Social media operations pages. */

export interface Page<T> {
  data: T[];
  pagination: { total: number; page: number; limit: number; pages: number };
}

export interface AccountRef {
  id: string;
  name: string;
  platform: string;
  handle?: string;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  smosRole: string | null;
}

export const PLATFORM_LABEL: Record<string, string> = {
  FACEBOOK: 'Facebook', INSTAGRAM: 'Instagram', LINKEDIN: 'LinkedIn', X: 'X', TIKTOK: 'TikTok',
  YOUTUBE: 'YouTube', WHATSAPP: 'WhatsApp Business', PINTEREST: 'Pinterest', THREADS: 'Threads'
};

export const fmt = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('en-NG'));
export const fmtPct = (n: number | null | undefined) => (n == null ? '—' : `${n.toFixed(1)}%`);
export const fmtSigned = (n: number | null | undefined) => (n == null ? '—' : `${n > 0 ? '+' : ''}${n.toLocaleString('en-NG')}`);

export const isoDay = (d: Date) => d.toISOString().slice(0, 10);
export const todayIso = () => isoDay(new Date());
export const daysAgoIso = (n: number) => isoDay(new Date(Date.now() - n * 86400000));

/** GET with loading and error state. Pass null to wait (e.g. until a filter is chosen). */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (path === null) return;
    let cancelled = false;
    setLoading(true);
    getJson<T>(path)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [path, tick]);

  return { data, error, loading, reload };
}

export const useTeam = () => useApi<{ data: TeamMember[] }>('/smois/team');
export const useAccounts = () => useApi<Page<AccountRef & { assignments: { adminId: string; adminName: string; isPrimary: boolean }[] }>>('/smois/accounts?limit=100');

/** Wraps a request's states so each page does not repeat them. */
export function Async<T>({
  state,
  children,
  columns = 5
}: {
  state: { data: T | null; error: string | null; loading: boolean; reload: () => void };
  children: (data: T) => ReactNode;
  columns?: number;
}) {
  if (state.error) return <ErrorState error={new Error(state.error)} onRetry={state.reload} />;
  if (state.loading && !state.data) return <LoadingState columns={columns} rows={6} />;
  if (!state.data) return null;
  return <>{children(state.data)}</>;
}

export function PageShell({
  title,
  meta,
  actions,
  children
}: {
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="adm-page">
      <header className="adm-page-header">
        <div>
          <h1 className="adm-page-title">{title}</h1>
          {meta && <p className="adm-page-meta">{meta}</p>}
        </div>
        {actions && <div className="adm-page-actions">{actions}</div>}
      </header>
      {children}
    </div>
  );
}

/** Honest label for where a number comes from. */
export function ManualNote() {
  return (
    <p className="adm-filter-note">
      No social platform is connected yet. These figures are entered by the team and labelled with their source.
    </p>
  );
}

export function PeriodBar({
  from,
  to,
  onChange
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const preset = (label: string, f: () => [string, string]) => (
    <button key={label} type="button" className="adm-btn adm-btn--sm" onClick={() => onChange(...f())}>
      {label}
    </button>
  );
  const monthStart = (offset: number) => {
    const n = new Date();
    return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + offset, 1));
  };
  return (
    <div className="adm-filter-bar" style={{ flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'end' }}>
      <label className="adm-field">
        <span className="adm-field-label">From</span>
        <input type="date" className="adm-input" value={from} max={to} onChange={(e) => e.target.value && onChange(e.target.value, to)} />
      </label>
      <label className="adm-field">
        <span className="adm-field-label">To</span>
        <input type="date" className="adm-input" value={to} min={from} max={todayIso()} onChange={(e) => e.target.value && onChange(from, e.target.value)} />
      </label>
      {preset('Last 7 days', () => [daysAgoIso(6), todayIso()])}
      {preset('Last 30 days', () => [daysAgoIso(29), todayIso()])}
      {preset('This month', () => [isoDay(monthStart(0)), todayIso()])}
      {preset('Last month', () => [isoDay(monthStart(-1)), isoDay(new Date(monthStart(0).getTime() - 86400000))])}
      {preset('Last 90 days', () => [daysAgoIso(89), todayIso()])}
    </div>
  );
}

export function SimpleTable({ head, children, empty }: { head: string[]; children: ReactNode; empty?: string }) {
  return (
    <div className="adm-table-scroll">
      <table className="adm-table">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} className="adm-th" scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {empty && <p className="adm-muted" style={{ padding: 'var(--space-4)' }}>{empty}</p>}
    </div>
  );
}

export const Td = ({ children, sub, right }: { children: ReactNode; sub?: ReactNode; right?: boolean }) => (
  <td className={`adm-td${right ? ' adm-td--right' : ''}`}>
    {children}
    {sub && <span className="adm-td-sub">{sub}</span>}
  </td>
);

/** A form in a modal that shows the server's own error message. */
export function FormModal({
  title,
  onClose,
  onSubmit,
  submitLabel,
  disabled,
  wide,
  children
}: {
  title: string;
  onClose: () => void;
  onSubmit: () => Promise<unknown>;
  submitLabel: string;
  disabled?: boolean;
  wide?: boolean;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };
  return (
    <Modal title={title} onClose={onClose} wide={wide}>
      <form onSubmit={submit} style={{ display: 'grid', gap: 'var(--space-4)' }}>
        {children}
        {error && (
          <div className="adm-inline-error" role="alert">
            <span>{error}</span>
          </div>
        )}
        <div className="adm-dialog-actions">
          <button type="button" className="adm-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="adm-btn adm-btn--primary" disabled={busy || disabled}>
            {busy ? 'Saving…' : submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function TextField({
  label, value, onChange, type = 'text', required, help, placeholder, min, max
}: {
  label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean;
  help?: string; placeholder?: string; min?: string; max?: string;
}) {
  return (
    <label className="adm-field">
      <span className="adm-field-label">{label}</span>
      <input className="adm-input" type={type} value={value} required={required} placeholder={placeholder} min={min} max={max}
        onChange={(e) => onChange(e.target.value)} />
      {help && <span className="adm-field-help">{help}</span>}
    </label>
  );
}

export function TextArea({ label, value, onChange, rows = 4, required, help }: {
  label: string; value: string; onChange: (v: string) => void; rows?: number; required?: boolean; help?: string;
}) {
  return (
    <label className="adm-field">
      <span className="adm-field-label">{label}</span>
      <textarea className="adm-input" rows={rows} value={value} required={required} onChange={(e) => onChange(e.target.value)} />
      {help && <span className="adm-field-help">{help}</span>}
    </label>
  );
}

export function SelectField({ label, value, onChange, options, required, help }: {
  label: string; value: string; onChange: (v: string) => void; required?: boolean; help?: string;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="adm-field">
      <span className="adm-field-label">{label}</span>
      <select className="adm-input" value={value} required={required} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {help && <span className="adm-field-help">{help}</span>}
    </label>
  );
}

/** Numeric input where empty means "not recorded", not zero. */
export function NumField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <TextField label={label} type="number" value={value} onChange={onChange} min="0" placeholder="Not recorded" />;
}

export const toInt = (v: string): number | null => (v.trim() === '' ? null : Math.max(0, Math.floor(Number(v))));

/** Download rows as CSV. Quoting follows RFC 4180; values that start with = + - @ are neutralised for spreadsheets. */
export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const cell = (v: string | number | null | undefined) => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@]/.test(s) && Number.isNaN(Number(s))) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const blob = new Blob([rows.map((r) => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Debounced value, for search boxes. */
export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  const t = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    t.current = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t.current);
  }, [value, ms]);
  return v;
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'end', marginBottom: 'var(--space-4)' }}>{children}</div>;
}
