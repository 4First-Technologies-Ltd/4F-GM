'use client';

import type { FilterDef } from '@/admin/resource/types';

/**
 * For any list over a few hundred rows, filtering IS the feature. So:
 * status filters are always-visible chips, search is debounced by the hook and
 * never requires Enter, state lives in the URL, and Reset appears only when
 * something is active.
 */
export function FilterBar({
  search,
  filters,
  values,
  onChange,
  onReset,
  activeCount,
  localOnlyWarning = false
}: {
  search?: { value: string; onChange: (v: string) => void; placeholder: string };
  filters: FilterDef[];
  values: Record<string, string | undefined>;
  onChange: (key: string, value: string | undefined) => void;
  onReset: () => void;
  activeCount: number;
  localOnlyWarning?: boolean;
}) {
  const inline = filters.filter((f) => !f.secondary && f.type === 'segmented');
  const rest = filters.filter((f) => f.secondary || f.type !== 'segmented');

  return (
    <div className="adm-filter-bar">
      <div className="adm-filter-bar-main">
        {search && (
          <input
            type="search"
            className="adm-input adm-search"
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            placeholder={search.placeholder}
            aria-label={search.placeholder}
          />
        )}
        {inline.map((f) => (
          <div key={f.key} className="adm-segmented" role="group" aria-label={f.label}>
            <button
              type="button"
              className="adm-segment"
              aria-pressed={!values[f.key]}
              onClick={() => onChange(f.key, undefined)}
            >
              All
            </button>
            {f.options.map((o) => (
              <button
                key={o.value}
                type="button"
                className="adm-segment"
                aria-pressed={values[f.key] === o.value}
                onClick={() => onChange(f.key, o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="adm-filter-bar-aux">
        {rest.map((f) => (
          <label key={f.key} className="adm-field">
            <span className="adm-sr-only">{f.label}</span>
            <select
              className="adm-input"
              style={{ width: 'auto' }}
              value={values[f.key] ?? ''}
              onChange={(e) => onChange(f.key, e.target.value || undefined)}
              aria-label={f.label}
            >
              <option value="">{f.label}: all</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        ))}

        {activeCount > 0 && (
          <button type="button" className="adm-btn adm-btn--ghost" onClick={onReset}>
            Reset ({activeCount})
          </button>
        )}
      </div>

      {localOnlyWarning && (
        <p className="adm-filter-note" role="note">
          This endpoint does not support server-side filtering — results are narrowed within the
          current page only.
        </p>
      )}
    </div>
  );
}
