/**
 * Resource engine contract — the boundary between the generic engine and the
 * per-module configuration.
 *
 * A module supplies data conforming to these types. It never re-implements the
 * list, detail, or form behaviour. If you are writing a second table component,
 * extend the engine instead.
 */

import type { ReactNode } from 'react';

/* ------------------------------------------------------------------ data --- */

export interface ListParams {
  page: number;
  pageSize: number;
  search?: string;
  filters?: Record<string, string | undefined>;
  sort?: { field: string; direction: 'asc' | 'desc' };
  signal?: AbortSignal;
}

export interface ListResult<T> {
  rows: T[];
  total: number;
  /** False when the server ignored filters and the engine narrowed locally. */
  serverFiltered?: boolean;
}

/**
 * Optional methods are ABSENT when the API does not support them, never stubbed.
 * The engine reads their absence to hide the corresponding actions — a missing
 * `update` correctly describes a read-only resource such as Orders.
 */
export interface ResourceDataSource<T> {
  list(params: ListParams): Promise<ListResult<T>>;
  get?(id: string): Promise<T>;
  create?(input: Record<string, unknown>): Promise<T>;
  update?(id: string, input: Record<string, unknown>): Promise<T>;
  remove?(id: string): Promise<void>;
}

/* --------------------------------------------------------------- columns --- */

export type ColumnType =
  | 'text'
  | 'number'
  | 'currency'
  | 'date'
  | 'relative-date'
  | 'status'
  | 'boolean';

export interface ColumnDef<T> {
  key: string;
  header: string;
  accessor: (row: T) => unknown;
  /** Only when a cell genuinely needs JSX. Prefer `type` — it covers most cases. */
  render?: (row: T) => ReactNode;
  type?: ColumnType;
  align?: 'left' | 'right' | 'center';
  sortable?: boolean;
  /** Sort key sent to the server when it differs from `key`. */
  sortField?: string;
  width?: string;
  /** 1 survives on the mobile card; 2 shows on tablet; 3 is desktop-only. */
  priority?: 1 | 2 | 3;
}

/* --------------------------------------------------------------- filters --- */

export interface FilterDef {
  key: string;
  label: string;
  /** `segmented` renders as always-visible chips; use it for <= 6 options. */
  type: 'segmented' | 'select';
  options: { value: string; label: string }[];
  /** Pushed behind the secondary controls rather than shown inline. */
  secondary?: boolean;
}

/* --------------------------------------------------------------- actions --- */

export interface ActionHelpers {
  refresh: () => void;
  toast: (message: string, kind?: 'success' | 'error') => void;
}

export interface ActionDef<C> {
  key: string;
  label: string;
  variant?: 'default' | 'primary' | 'danger';
  /** Hidden without this permission, unless `disabledHint` is set. */
  permission?: string;
  /** Shown as a tooltip on a disabled control instead of hiding it outright. */
  disabledHint?: string;
  confirm?: {
    title: string;
    body: string;
    confirmLabel: string;
    /** Require typing this exact value. For irreversible actions. */
    typeToConfirm?: (ctx: C) => string;
  };
  /** Contextual visibility, e.g. only show Approve while status is PENDING. */
  visible?: (ctx: C) => boolean;
  run: (ctx: C, helpers: ActionHelpers) => Promise<void>;
}

/* ---------------------------------------------------------------- detail --- */

export interface DetailField<T> {
  key: string;
  label: string;
  accessor: (row: T) => unknown;
  type?: ColumnType;
  render?: (row: T) => ReactNode;
  full?: boolean;
}

export interface DetailSection<T> {
  title: string;
  fields: DetailField<T>[];
}

export interface DetailConfig<T> {
  title: (row: T) => string;
  subtitle?: (row: T) => string;
  statusField?: string;
  sections: DetailSection<T>[];
  /** Rendered below the field sections — documents, related lists, etc. */
  extra?: (row: T) => ReactNode;
}

/* -------------------------------------------------------------- resource --- */

export interface ResourceConfig<T> {
  /** Permission prefix and URL-state namespace. */
  resource: string;
  /** The project's own terminology. */
  label: string;
  labelSingular: string;

  primaryKey: keyof T & string;
  /** The human-readable identifier: first column, and the detail title. */
  displayField: keyof T & string;

  columns: ColumnDef<T>[];
  filters?: FilterDef[];
  search?: { placeholder: string };
  defaultSort?: { field: string; direction: 'asc' | 'desc' };
  defaultPageSize?: number;

  rowActions?: ActionDef<T>[];
  headerActions?: ActionDef<void>[];

  detail?: DetailConfig<T>;

  permissions: {
    read: string;
    create?: string;
    update?: string;
    delete?: string;
    [custom: string]: string | undefined;
  };

  data: ResourceDataSource<T>;

  emptyState?: { title: string; description: string };

  /** Set for append-only resources: suppresses every mutating affordance. */
  readOnly?: boolean;
}

/* --------------------------------------------------------------- statuses --- */

export type StatusTone = 'success' | 'warning' | 'error' | 'info' | 'neutral';
