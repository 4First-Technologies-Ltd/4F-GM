'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { IconUserCircle, IconCheck, IconWallet, IconPackage } from '@/components/icons';
import { formatNaira } from '@/lib/format';
import UserModal from '@/components/UserModal';
import { adminFetch } from '@/lib/api';

interface Customer {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
  orderCount: number;
  totalSpend: number;
  addressCount: number;
}

const TABS = ['ALL', 'VERIFIED', 'UNVERIFIED'] as const;
const TAB_LABEL: Record<(typeof TABS)[number], string> = { ALL: 'All', VERIFIED: 'Verified', UNVERIFIED: 'Unverified' };

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>('ALL');
  const [query, setQuery] = useState('');
  const [openUserId, setOpenUserId] = useState<string | null | undefined>(undefined);

  const load = useCallback(() => {
    adminFetch('/customers')
      .then((res) => res.json())
      .then((data) => setCustomers(data.customers));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const list = customers ?? [];
    return {
      total: list.length,
      verified: list.filter((c) => c.emailVerified).length,
      totalSpend: list.reduce((sum, c) => sum + c.totalSpend, 0),
      totalOrders: list.reduce((sum, c) => sum + c.orderCount, 0)
    };
  }, [customers]);

  const filtered = useMemo(() => {
    let list = customers ?? [];
    if (tab === 'VERIFIED') list = list.filter((c) => c.emailVerified);
    if (tab === 'UNVERIFIED') list = list.filter((c) => !c.emailVerified);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
    }
    return list;
  }, [customers, tab, query]);

  return (
    <>
      <h1>Customers</h1>

      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-icon" aria-hidden="true">
            <IconUserCircle />
          </span>
          <div className="value">{stats.total}</div>
          <div className="label">Total customers</div>
        </div>
        <div className="stat-card">
          <span className="stat-icon" aria-hidden="true">
            <IconCheck />
          </span>
          <div className="value">{stats.verified}</div>
          <div className="label">Verified</div>
        </div>
        <div className="stat-card">
          <span className="stat-icon" aria-hidden="true">
            <IconPackage />
          </span>
          <div className="value">{stats.totalOrders}</div>
          <div className="label">Total orders</div>
        </div>
        <div className="stat-card">
          <span className="stat-icon" aria-hidden="true">
            <IconWallet />
          </span>
          <div className="value">{formatNaira(stats.totalSpend)}</div>
          <div className="label">Total spend</div>
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
        <input
          placeholder="Search by name or email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ minWidth: 240 }}
        />
      </div>

      <div className="card">
        {!customers ? (
          <p className="loading-state">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="empty-state">No customers found.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Verified</th>
                <th>Orders</th>
                <th>Total spend</th>
                <th>Addresses</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="clickable-row" onClick={() => setOpenUserId(c.id)}>
                  <td>{c.name}</td>
                  <td>{c.email}</td>
                  <td>{c.emailVerified ? 'Yes' : 'No'}</td>
                  <td>{c.orderCount}</td>
                  <td>{formatNaira(c.totalSpend)}</td>
                  <td>{c.addressCount}</td>
                  <td>{new Date(c.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {openUserId !== undefined && (
        <UserModal userId={openUserId} onClose={() => setOpenUserId(undefined)} onChanged={load} />
      )}
    </>
  );
}
