import { adminFetch } from '@/lib/api';
import type { ListParams, ListResult, ResourceDataSource } from '@/admin/resource/types';

/**
 * Binds the resource engine to the project's EXISTING client (`lib/api.ts`).
 * No new fetch wrapper, no query library.
 *
 * The admin API's list contract (added alongside this refactor) is uniform:
 *   GET <path>?page&limit&q&sort&dir&<filters>  ->  { data, pagination: { total } }
 * Single-record reads return { <key>: T }.
 */

interface Paginated<T> {
  data: T[];
  pagination: { total: number; page: number; limit: number; pages: number };
}

async function unwrap<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}) as Record<string, unknown>);
  if (!res.ok) {
    // Surface the server's own message — never replace a real error with
    // "Something went wrong".
    throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  }
  return body as T;
}

export function buildQuery({ page, pageSize, search, filters, sort }: ListParams): string {
  const q = new URLSearchParams({ page: String(page), limit: String(pageSize) });
  if (search) q.set('q', search);
  if (sort) {
    q.set('sort', sort.field);
    q.set('dir', sort.direction);
  }
  for (const [key, value] of Object.entries(filters ?? {})) {
    if (value !== undefined && value !== '') q.set(key, value);
  }
  return q.toString();
}

export function createDataSource<T>(opts: {
  /** Collection path under /api/admin, e.g. "/vendors". */
  path: string;
  /** Envelope key on single-record reads, e.g. "vendor". */
  singleKey?: string;
  supports?: { get?: boolean; create?: boolean; update?: boolean; remove?: boolean };
}): ResourceDataSource<T> {
  const { path, singleKey, supports = {} } = opts;

  const source: ResourceDataSource<T> = {
    async list(params): Promise<ListResult<T>> {
      const res = await adminFetch(`${path}?${buildQuery(params)}`, { signal: params.signal });
      const body = await unwrap<Paginated<T>>(res);
      return { rows: body.data, total: body.pagination.total, serverFiltered: true };
    }
  };

  // Only attach what the API actually implements. The engine hides actions
  // whose method is absent.
  if (supports.get && singleKey) {
    source.get = async (id) => {
      const res = await adminFetch(`${path}/${id}`);
      const body = await unwrap<Record<string, T>>(res);
      return body[singleKey];
    };
  }
  if (supports.create && singleKey) {
    source.create = async (input) => {
      const res = await adminFetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input)
      });
      const body = await unwrap<Record<string, T>>(res);
      return body[singleKey];
    };
  }
  if (supports.update && singleKey) {
    source.update = async (id, input) => {
      const res = await adminFetch(`${path}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input)
      });
      const body = await unwrap<Record<string, T>>(res);
      return body[singleKey];
    };
  }
  if (supports.remove) {
    source.remove = async (id) => {
      const res = await adminFetch(`${path}/${id}`, { method: 'DELETE' });
      await unwrap<{ ok: true }>(res);
    };
  }

  return source;
}

/** For the non-resource endpoints: /stats, /analytics, /settings. */
export async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  return unwrap<T>(await adminFetch(path, init));
}

export async function patchJson<T>(path: string, body: unknown): Promise<T> {
  return unwrap<T>(
    await adminFetch(path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  );
}
