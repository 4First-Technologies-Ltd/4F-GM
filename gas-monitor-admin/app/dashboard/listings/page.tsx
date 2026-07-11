'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { IconTag, IconCheck, IconMinusCircle, IconPackage } from '@/components/icons';

interface Listing {
  id: string;
  gasType: string;
  customName: string | null;
  pricePerKg: number;
  cylinderSizes: string[];
  inStock: boolean;
  vendor: { businessName: string };
  _count: { orders: number };
}

const TABS = ['ALL', 'IN_STOCK', 'OUT_OF_STOCK'] as const;
const TAB_LABEL: Record<(typeof TABS)[number], string> = {
  ALL: 'All',
  IN_STOCK: 'In stock',
  OUT_OF_STOCK: 'Out of stock'
};

export default function ListingsPage() {
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>('ALL');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch('/api/listings')
      .then((res) => res.json())
      .then((data) => setListings(data.listings));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const list = listings ?? [];
    return {
      total: list.length,
      inStock: list.filter((l) => l.inStock).length,
      outOfStock: list.filter((l) => !l.inStock).length,
      totalOrders: list.reduce((sum, l) => sum + l._count.orders, 0)
    };
  }, [listings]);

  const filtered = useMemo(() => {
    const list = listings ?? [];
    if (tab === 'IN_STOCK') return list.filter((l) => l.inStock);
    if (tab === 'OUT_OF_STOCK') return list.filter((l) => !l.inStock);
    return list;
  }, [listings, tab]);

  async function toggleStock(id: string, current: boolean) {
    setBusyId(id);
    try {
      await fetch(`/api/listings/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inStock: !current })
      });
      load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <h1>Listings</h1>

      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-icon" aria-hidden="true">
            <IconTag />
          </span>
          <div className="value">{stats.total}</div>
          <div className="label">Total listings</div>
        </div>
        <div className="stat-card">
          <span className="stat-icon" aria-hidden="true">
            <IconCheck />
          </span>
          <div className="value">{stats.inStock}</div>
          <div className="label">In stock</div>
        </div>
        <div className="stat-card">
          <span className="stat-icon" aria-hidden="true">
            <IconMinusCircle />
          </span>
          <div className="value">{stats.outOfStock}</div>
          <div className="label">Out of stock</div>
        </div>
        <div className="stat-card">
          <span className="stat-icon" aria-hidden="true">
            <IconPackage />
          </span>
          <div className="value">{stats.totalOrders}</div>
          <div className="label">Orders placed</div>
        </div>
      </div>

      <div className="toolbar">
        <div className="filter-tabs">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              className={`filter-tab${tab === t ? ' active' : ''}`}
              onClick={() => setTab(t)}
            >
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        {!listings ? (
          <p className="loading-state">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="empty-state">No listings match this filter.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Type</th>
                <th>Sizes</th>
                <th>Price / kg</th>
                <th>Orders</th>
                <th>Stock</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id}>
                  <td>{l.vendor.businessName}</td>
                  <td>{l.customName ?? l.gasType}</td>
                  <td>{l.cylinderSizes.join(', ')}</td>
                  <td>₦{l.pricePerKg.toLocaleString()}</td>
                  <td>{l._count.orders}</td>
                  <td>
                    <span className={`badge badge-${l.inStock ? 'instock' : 'outofstock'}`}>
                      {l.inStock ? 'In stock' : 'Out of stock'}
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn btn-small"
                      style={{ background: 'var(--border)', color: 'var(--text)' }}
                      disabled={busyId === l.id}
                      onClick={() => toggleStock(l.id, l.inStock)}
                    >
                      Mark {l.inStock ? 'out of stock' : 'in stock'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
