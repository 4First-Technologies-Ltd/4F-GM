'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { staffApi, type GasListing, type StaffBranch } from '@/lib/api';
import { formatNaira } from '@/lib/format';
import { Button } from '@/components/motion/button/base';

const GAS_TYPE_LABEL: Record<string, string> = {
  COOKING: 'Cooking gas',
  MEDICAL: 'Medical oxygen',
  INDUSTRIAL: 'Industrial gas',
  BULK: 'Bulk LPG',
  OTHER: 'Other'
};

/**
 * Stock only. Price, sizes and which branch a listing belongs to stay with the
 * vendor owner, and the server refuses anything else.
 */
export function ManagerStock() {
  const [branches, setBranches] = useState<StaffBranch[]>([]);
  const [listings, setListings] = useState<GasListing[] | null>(null);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [b, l] = await Promise.all([staffApi.me(), staffApi.getListings()]);
      setBranches(b);
      setListings(l);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load stock.');
      setListings((l) => l ?? []);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(l: GasListing) {
    setBusyId(l.id);
    setError(null);
    try {
      const updated = await staffApi.setStock(l.id, !l.inStock);
      setListings((all) => (all ?? []).map((x) => (x.id === l.id ? { ...x, inStock: updated.inStock } : x)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update stock.');
    } finally {
      setBusyId(null);
    }
  }

  const shown = (listings ?? []).filter((l) => filter === 'all' || l.branchId === filter);
  const multi = branches.length > 1;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-1">Stock</h2>
        <p className="text-sm text-muted-foreground">Mark products in or out of stock.</p>
      </div>

      {error && (
        <div
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>{error}</div>
        </div>
      )}

      {multi && (
        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Filter by branch">
          {[{ id: 'all', name: 'All branches' }, ...branches].map((b) => (
            <button
              key={b.id}
              type="button"
              role="tab"
              aria-selected={filter === b.id}
              onClick={() => setFilter(b.id)}
              className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                filter === b.id ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}

      {listings === null && <p className="text-sm text-muted-foreground">Loading…</p>}
      {listings && shown.length === 0 && !error && (
        <p className="text-sm text-muted-foreground">No listings for your branch yet.</p>
      )}

      <ul className="space-y-3">
        {shown.map((l) => (
          <li key={l.id} className="flex items-center justify-between gap-4 rounded-xl bg-card border border-border p-4">
            <div className="min-w-0">
              <p className="font-medium text-foreground">{l.customName || GAS_TYPE_LABEL[l.gasType] || l.gasType}</p>
              <p className="text-sm text-muted-foreground">
                {formatNaira(l.pricePerKg)}/kg · {[...l.cylinderSizes, l.otherSizes].filter(Boolean).join(', ')}
              </p>
              {multi && <p className="text-xs text-muted-foreground">{branches.find((b) => b.id === l.branchId)?.name}</p>}
            </div>
            <div className="flex flex-shrink-0 items-center gap-3">
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  l.inStock ? 'bg-green-100/50 text-green-700' : 'bg-red-100/50 text-red-700'
                }`}
              >
                {l.inStock ? 'In stock' : 'Out of stock'}
              </span>
              <Button type="button" size="sm" variant="secondary" disabled={busyId === l.id} onClick={() => toggle(l)}>
                {l.inStock ? 'Mark out' : 'Mark in'}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
