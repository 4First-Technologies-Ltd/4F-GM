'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ResourceConfig } from './types';

/**
 * The ONE list-state hook.
 *
 * Owns filter/search/page/sort state (in the URL), fetching, abort-on-supersede,
 * and debounced search. Modules never own any of this — the previous
 * implementation re-created it in seven separate page files.
 *
 * Filter state lives in the URL because support engineers share links to
 * filtered views; that is most of what the job is.
 */

const SEARCH_DEBOUNCE_MS = 350;

export type ResourceStatus = 'loading' | 'refetching' | 'success' | 'empty' | 'error';

export function useResource<T>(config: ResourceConfig<T>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const page = Number(searchParams.get('page') ?? 1) || 1;
  const pageSize = Number(searchParams.get('size') ?? config.defaultPageSize ?? 20) || 20;
  const searchParam = searchParams.get('q') ?? '';
  const sortField = searchParams.get('sort') ?? config.defaultSort?.field;
  const sortDir = (searchParams.get('dir') as 'asc' | 'desc') ?? config.defaultSort?.direction ?? 'desc';

  const filterKeys = useMemo(() => (config.filters ?? []).map((f) => f.key), [config.filters]);

  const filters = useMemo(() => {
    const out: Record<string, string | undefined> = {};
    for (const key of filterKeys) {
      const v = searchParams.get(key);
      if (v) out[key] = v;
    }
    return out;
  }, [searchParams, filterKeys]);

  const [searchInput, setSearchInput] = useState(searchParam);
  const [debouncedSearch, setDebouncedSearch] = useState(searchParam);

  const [rows, setRows] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [serverFiltered, setServerFiltered] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [nonce, setNonce] = useState(0);

  const abortRef = useRef<AbortController | null>(null);

  const write = useCallback(
    (mutate: (p: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParams.toString());
      mutate(next);
      const qs = next.toString();
      // `scroll: false` keeps the operator's position when paging a long table.
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  const setPage = useCallback((p: number) => write((n) => n.set('page', String(p))), [write]);

  const setPageSize = useCallback(
    (n: number) =>
      write((p) => {
        p.set('size', String(n));
        p.set('page', '1');
      }),
    [write]
  );

  const setFilter = useCallback(
    (key: string, value: string | undefined) =>
      write((p) => {
        if (!value) p.delete(key);
        else p.set(key, value);
        p.set('page', '1');
      }),
    [write]
  );

  const resetFilters = useCallback(
    () =>
      write((p) => {
        for (const key of filterKeys) p.delete(key);
        p.delete('q');
        p.set('page', '1');
      }),
    [write, filterKeys]
  );

  const toggleSort = useCallback(
    (field: string) =>
      write((p) => {
        const nextDir = p.get('sort') === field && p.get('dir') === 'asc' ? 'desc' : 'asc';
        p.set('sort', field);
        p.set('dir', nextDir);
        p.set('page', '1');
      }),
    [write]
  );

  // Debounced search, mirrored into the URL.
  useEffect(() => {
    if (searchInput === debouncedSearch) return;
    const t = setTimeout(() => {
      setDebouncedSearch(searchInput);
      write((p) => {
        if (searchInput) p.set('q', searchInput);
        else p.delete('q');
        p.set('page', '1');
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
    // `write` changes identity on every URL write; including it would re-arm
    // the timer in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const filterKey = JSON.stringify(filters);

  useEffect(() => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    setError(null);

    config.data
      .list({
        page,
        pageSize,
        search: debouncedSearch || undefined,
        filters,
        sort: sortField ? { field: sortField, direction: sortDir } : undefined,
        signal: ac.signal
      })
      .then((res) => {
        if (ac.signal.aborted) return;
        setRows(res.rows);
        setTotal(res.total);
        setServerFiltered(res.serverFiltered !== false);
        setHasLoaded(true);
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted || (e as Error)?.name === 'AbortError') return;
        setError(e instanceof Error ? e : new Error(String(e)));
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });

    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, debouncedSearch, filterKey, sortField, sortDir, nonce]);

  const activeFilterCount = Object.values(filters).filter(Boolean).length + (debouncedSearch ? 1 : 0);

  const status: ResourceStatus = error
    ? 'error'
    : loading && !hasLoaded
      ? 'loading'
      : loading
        ? 'refetching'
        : rows.length === 0
          ? 'empty'
          : 'success';

  return {
    rows,
    total,
    status,
    error,
    isFiltered: activeFilterCount > 0,
    serverFiltered,
    page,
    pageSize,
    setPage,
    setPageSize,
    search: searchInput,
    setSearch: setSearchInput,
    filters,
    setFilter,
    resetFilters,
    activeFilterCount,
    sort: sortField ? { field: sortField, direction: sortDir } : undefined,
    toggleSort,
    refresh: () => setNonce((n) => n + 1)
  };
}
