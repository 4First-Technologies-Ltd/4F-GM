'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { IconUsers, IconUserCircle, IconStore, IconCheck } from '@/components/icons';
import UserModal from '@/components/UserModal';
import { adminFetch } from '@/lib/api';

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: 'CONSUMER' | 'VENDOR';
  emailVerified: boolean;
  isSuspended: boolean;
  createdAt: string;
  vendorProfile: { status: 'PENDING' | 'APPROVED' | 'REJECTED' } | null;
  _count: { orders: number };
}

const TABS = ['ALL', 'CONSUMER', 'VENDOR'] as const;
const TAB_LABEL: Record<(typeof TABS)[number], string> = { ALL: 'All', CONSUMER: 'Consumers', VENDOR: 'Vendors' };

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>('ALL');
  const [query, setQuery] = useState('');
  const [openUserId, setOpenUserId] = useState<string | null | undefined>(undefined);

  const load = useCallback(() => {
    adminFetch('/users')
      .then((res) => res.json())
      .then((data) => setUsers(data.users));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const list = users ?? [];
    return {
      total: list.length,
      consumers: list.filter((u) => u.role === 'CONSUMER').length,
      vendors: list.filter((u) => u.role === 'VENDOR').length,
      verified: list.filter((u) => u.emailVerified).length
    };
  }, [users]);

  const filtered = useMemo(() => {
    let list = users ?? [];
    if (tab !== 'ALL') list = list.filter((u) => u.role === tab);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
    }
    return list;
  }, [users, tab, query]);

  return (
    <>
      <h1>All Users</h1>

      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-icon" aria-hidden="true">
            <IconUsers />
          </span>
          <div className="value">{stats.total}</div>
          <div className="label">Total users</div>
        </div>
        <div className="stat-card">
          <span className="stat-icon" aria-hidden="true">
            <IconUserCircle />
          </span>
          <div className="value">{stats.consumers}</div>
          <div className="label">Consumers</div>
        </div>
        <div className="stat-card">
          <span className="stat-icon" aria-hidden="true">
            <IconStore />
          </span>
          <div className="value">{stats.vendors}</div>
          <div className="label">Vendors</div>
        </div>
        <div className="stat-card">
          <span className="stat-icon" aria-hidden="true">
            <IconCheck />
          </span>
          <div className="value">{stats.verified}</div>
          <div className="label">Verified</div>
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
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            placeholder="Search by name or email"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ minWidth: 240 }}
          />
          <button type="button" className="btn btn-approve" style={{ width: 'auto' }} onClick={() => setOpenUserId(null)}>
            Add user
          </button>
        </div>
      </div>

      <div className="card">
        {!users ? (
          <p className="loading-state">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="empty-state">No users found.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Verified</th>
                <th>Orders</th>
                <th>Joined</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="clickable-row" onClick={() => setOpenUserId(u.id)}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>
                    {u.role}
                    {u.role === 'VENDOR' && u.vendorProfile && (
                      <>
                        {' '}
                        <span className={`badge badge-${u.vendorProfile.status.toLowerCase()}`}>
                          {u.vendorProfile.status}
                        </span>
                      </>
                    )}
                    {u.isSuspended && (
                      <>
                        {' '}
                        <span className="badge badge-rejected">Suspended</span>
                      </>
                    )}
                  </td>
                  <td>{u.emailVerified ? 'Yes' : 'No'}</td>
                  <td>{u._count.orders}</td>
                  <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {openUserId !== undefined && (
        <UserModal
          userId={openUserId}
          onClose={() => setOpenUserId(undefined)}
          onChanged={load}
        />
      )}
    </>
  );
}
