'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Bookmark, MapPin, Trash2 } from 'lucide-react';
import { savedApi, type SavedListingRow } from '@/lib/api';
import { toCatalogListing } from '@/lib/marketplace';
import { formatNaira } from '@/lib/format';
import { SellerMark } from '@/components/marketplace/SellerMark';

export default function SavedPage() {
  const [rows, setRows] = useState<SavedListingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    savedApi
      .list()
      .then((list) => {
        if (!cancelled) setRows(list);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load your saved items.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const items = useMemo(() => rows.map((r) => ({ id: r.id, listing: toCatalogListing(r) })), [rows]);

  const remove = useCallback(async (id: string) => {
    setRemoving(id);
    setError(null);
    try {
      await savedApi.remove(id);
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove this item.');
    } finally {
      setRemoving(null);
    }
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-1 text-xl font-semibold text-foreground">Saved items</h2>
        <p className="text-sm text-muted-foreground">Listings you saved to come back to.</p>
      </div>

      {error && (
        <div
          className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
          <div>{error}</div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading your saved items…</p>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center">
          <Bookmark className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="font-medium text-foreground">Nothing saved yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Open a listing in the marketplace and choose &ldquo;Save &amp; continue shopping&rdquo; to keep it here.
          </p>
          <Link
            href="/marketplace"
            className="mt-4 inline-block text-sm font-medium text-primary hover:text-primary/80"
          >
            Browse the marketplace →
          </Link>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map(({ id, listing }) => (
            <li key={id} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
              <div className="flex items-start gap-3">
                <SellerMark listing={listing} size={44} className="h-11 w-11 rounded-lg" />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/marketplace/${id}`}
                    className="block truncate font-semibold text-foreground hover:text-primary"
                  >
                    {listing.title}
                  </Link>
                  <p className="truncate text-sm text-muted-foreground">{listing.vendor}</p>
                </div>
              </div>

              {(listing.city || listing.state) && (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 flex-none" />
                  <span className="truncate">{[listing.city, listing.state].filter(Boolean).join(', ')}</span>
                </p>
              )}

              <p className="font-mono text-2xl font-semibold text-foreground">
                {formatNaira(listing.pricePerKg ?? listing.price ?? 0)}
                <span className="ml-1 font-sans text-sm font-normal text-muted-foreground">/ kg</span>
              </p>

              <div className="mt-auto flex items-center gap-2">
                {listing.isOpen ? (
                  <Link
                    href={`/checkout?item=${id}`}
                    className="flex-1 rounded-full bg-primary px-4 py-2 text-center text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    Order now
                  </Link>
                ) : (
                  <span className="flex-1 rounded-full bg-muted px-4 py-2 text-center text-sm font-medium text-muted-foreground">
                    Out of stock
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => remove(id)}
                  disabled={removing === id}
                  aria-label={`Remove ${listing.title} from saved`}
                  className="flex h-9 w-9 flex-none items-center justify-center rounded-full border border-border text-muted-foreground hover:text-destructive disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
