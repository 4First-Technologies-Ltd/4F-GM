'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { IconStore, IconBell, IconCheck, IconMinusCircle } from '@/components/icons';
import UserModal from '@/components/UserModal';
import { adminFetch } from '@/lib/api';

interface Vendor {
  id: string;
  businessName: string;
  businessAddress: string;
  phone: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  user: { id: string; name: string; email: string; createdAt: string };
  documents: { id: string; url: string; fileName: string }[];
  _count: { listings: number; orders: number };
}

const TABS = ['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const;

export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[] | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>('PENDING');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openUserId, setOpenUserId] = useState<string | null | undefined>(undefined);

  const load = useCallback(() => {
    adminFetch('/vendors')
      .then((res) => res.json())
      .then((data) => setVendors(data.vendors));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const list = vendors ?? [];
    return {
      total: list.length,
      pending: list.filter((v) => v.status === 'PENDING').length,
      approved: list.filter((v) => v.status === 'APPROVED').length,
      rejected: list.filter((v) => v.status === 'REJECTED').length
    };
  }, [vendors]);

  const filtered = useMemo(() => {
    const list = vendors ?? [];
    return tab === 'ALL' ? list : list.filter((v) => v.status === tab);
  }, [vendors, tab]);

  async function updateStatus(id: string, status: 'APPROVED' | 'REJECTED') {
    setBusyId(id);
    try {
      await adminFetch(`/vendors/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <h1>Vendors</h1>

      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-icon" aria-hidden="true">
            <IconStore />
          </span>
          <div className="value">{counts.total}</div>
          <div className="label">Total vendors</div>
        </div>
        <div className="stat-card">
          <span className="stat-icon" aria-hidden="true">
            <IconBell />
          </span>
          <div className="value">{counts.pending}</div>
          <div className="label">Awaiting review</div>
        </div>
        <div className="stat-card">
          <span className="stat-icon" aria-hidden="true">
            <IconCheck />
          </span>
          <div className="value">{counts.approved}</div>
          <div className="label">Approved</div>
        </div>
        <div className="stat-card">
          <span className="stat-icon" aria-hidden="true">
            <IconMinusCircle />
          </span>
          <div className="value">{counts.rejected}</div>
          <div className="label">Rejected</div>
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
              {t === 'ALL' ? 'All' : t.charAt(0) + t.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        {!vendors ? (
          <p className="loading-state">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="empty-state">No vendors match this filter.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Business</th>
                <th>Contact</th>
                <th>Documents</th>
                <th>Status</th>
                <th>Activity</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => (
                <tr key={v.id} className="clickable-row" onClick={() => setOpenUserId(v.user.id)}>
                  <td>
                    <strong>{v.businessName}</strong>
                    <br />
                    <span style={{ color: 'var(--muted)', fontSize: 13 }}>{v.businessAddress}</span>
                  </td>
                  <td>
                    {v.user.name}
                    <br />
                    <span style={{ color: 'var(--muted)', fontSize: 13 }}>{v.user.email}</span>
                    <br />
                    <span style={{ color: 'var(--muted)', fontSize: 13 }}>{v.phone}</span>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {v.documents.length === 0 ? (
                      <span style={{ color: 'var(--muted)' }}>None</span>
                    ) : (
                      v.documents.map((d) => (
                        <a key={d.id} href={d.url} target="_blank" rel="noreferrer" style={{ display: 'block' }}>
                          {d.fileName}
                        </a>
                      ))
                    )}
                  </td>
                  <td>
                    <span className={`badge badge-${v.status.toLowerCase()}`}>{v.status}</span>
                  </td>
                  <td>
                    {v._count.listings} listings
                    <br />
                    {v._count.orders} orders
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {v.status !== 'APPROVED' && (
                      <div className="row-actions">
                        <button
                          className="btn btn-small btn-approve"
                          disabled={busyId === v.id}
                          onClick={() => updateStatus(v.id, 'APPROVED')}
                        >
                          Approve
                        </button>
                        {v.status !== 'REJECTED' && (
                          <button
                            className="btn btn-small btn-reject"
                            disabled={busyId === v.id}
                            onClick={() => updateStatus(v.id, 'REJECTED')}
                          >
                            Reject
                          </button>
                        )}
                      </div>
                    )}
                  </td>
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
