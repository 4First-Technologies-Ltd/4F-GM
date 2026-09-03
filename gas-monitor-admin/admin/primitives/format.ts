import type { ColumnType } from '@/admin/resource/types';

/**
 * Cell formatting. `ColumnDef.type` drives it so most columns need no `render`.
 *
 * Hard rule: never render `undefined`, `null`, `NaN`, `Invalid Date`, or
 * `[object Object]`. Missing values are an em dash.
 */

const LOCALE = 'en-NG';
const EMPTY = '—';

export function formatNaira(amount: unknown): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return EMPTY;
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: n % 1 === 0 ? 0 : 2
  }).format(n);
}

/**
 * Compact form for stat cards only — never for table cells, where operators
 * compare exact figures. Pair with the precise value in a `title`.
 */
export function formatNairaCompact(amount: unknown): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return EMPTY;
  if (Math.abs(n) >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000) return `₦${Math.round(n / 1_000)}k`;
  return formatNaira(n);
}

export function formatNumber(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString(LOCALE) : EMPTY;
}

export function formatPercent(value: unknown, digits = 1): string {
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toFixed(digits)}%` : EMPTY;
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(value: unknown): string {
  const d = toDate(value);
  return d ? d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' }) : EMPTY;
}

export function formatDateTime(value: unknown): string {
  const d = toDate(value);
  return d
    ? d.toLocaleString(LOCALE, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
      })
    : EMPTY;
}

/** Pair with `title={formatDateTime(v)}` so the exact time stays reachable. */
export function formatRelative(value: unknown): string {
  const d = toDate(value);
  if (!d) return EMPTY;

  const diff = Date.now() - d.getTime();
  const future = diff < 0;
  const abs = Math.abs(diff);
  const min = Math.floor(abs / 60_000);
  const hr = Math.floor(abs / 3_600_000);
  const day = Math.floor(abs / 86_400_000);

  if (min < 1) return 'just now';
  let out: string;
  if (min < 60) out = `${min}m`;
  else if (hr < 24) out = `${hr}h`;
  else if (day < 30) out = `${day}d`;
  else return formatDate(d);

  return future ? `in ${out}` : `${out} ago`;
}

/** SCREAMING_SNAKE_CASE -> "Screaming snake case". The raw value is for the API. */
export function humaniseEnum(value: string): string {
  const words = value.toLowerCase().replace(/[_-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Short, stable identifier for a UUID primary key. */
export function shortId(id: unknown): string {
  const s = String(id ?? '');
  return s ? s.slice(0, 8) : EMPTY;
}

export function formatCell(value: unknown, col: { type?: ColumnType }): string {
  if (value === null || value === undefined || value === '') return EMPTY;
  switch (col.type) {
    case 'currency':
      return formatNaira(value);
    case 'number':
      return formatNumber(value);
    case 'date':
      return formatDate(value);
    case 'relative-date':
      return formatRelative(value);
    case 'boolean':
      return value ? 'Yes' : 'No';
    default:
      return String(value);
  }
}
