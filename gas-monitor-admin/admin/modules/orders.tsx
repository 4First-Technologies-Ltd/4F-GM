import { useEffect, useState } from 'react';
import type { ResourceConfig } from '@/admin/resource/types';
import { createDataSource } from '@/admin/data/source';
import { adminFetch } from '@/lib/api';
import { formatDateTime, formatNaira, formatRelative, shortId } from '@/admin/primitives/format';
import { StatusBadge } from '@/admin/primitives/status-badge';
import { can } from '@/admin/permissions/can';
import { useAdminSession } from '@/lib/admin-session-context';
import type { OrderRow, RiderRow } from './types';

/**
 * Orders — READ-ONLY, with one exception.
 *
 * No status-transition endpoint exists: order state is driven by the consumer
 * and vendor flows and by the Paystack webhook, so `readOnly: true` suppresses
 * the generic row actions (which would go through `data.update`, i.e. PATCH
 * /orders/:id and touch `status`).
 *
 * Rider assignment is different: it's a dedicated endpoint
 * (PATCH /orders/:id/rider) that only ever writes `riderId`/`assignedAt`,
 * never `status` or payment fields, so it's wired up separately below via
 * `detail.extra` rather than through the generic data source.
 *
 * Payment state is surfaced here because there is no Payment entity — Paystack
 * fields live on Order.
 */

const data = createDataSource<OrderRow>({
  path: '/orders',
  singleKey: 'order',
  supports: { get: true }
});

export const ordersModule: ResourceConfig<OrderRow> = {
  resource: 'orders',
  label: 'Orders',
  labelSingular: 'Order',
  readOnly: true,

  primaryKey: 'id',
  displayField: 'id',

  columns: [
    {
      key: 'id',
      header: 'Order',
      accessor: (o) => o.id,
      priority: 1,
      render: (o) => (
        <>
          <span style={{ fontFamily: 'var(--font-mono)' }}>{shortId(o.id)}</span>
          <span className="adm-td-sub">{o.consumer.name}</span>
        </>
      )
    },
    { key: 'status', header: 'Status', accessor: (o) => o.status, type: 'status', sortable: true, priority: 1 },
    {
      key: 'vendor',
      header: 'Vendor',
      accessor: (o) => o.vendor?.businessName ?? o.supplierName,
      priority: 2
    },
    { key: 'cylinderSize', header: 'Size', accessor: (o) => o.cylinderSize, priority: 3 },
    { key: 'quantity', header: 'Qty', accessor: (o) => o.quantity, type: 'number', priority: 3 },
    {
      key: 'totalAmount',
      header: 'Total',
      accessor: (o) => o.totalAmount,
      type: 'currency',
      sortable: true,
      priority: 1
    },
    {
      key: 'rider',
      header: 'Rider',
      accessor: (o) => o.rider?.user.name ?? null,
      priority: 2,
      render: (o) => (o.rider ? o.rider.user.name : <span className="adm-muted">Unassigned</span>)
    },
    {
      key: 'payment',
      header: 'Payment',
      accessor: (o) => o.paystackStatus,
      priority: 3,
      render: (o) =>
        o.paystackStatus ? (
          <StatusBadge value={o.paystackStatus.toUpperCase()} />
        ) : (
          <span className="adm-muted">—</span>
        )
    },
    {
      key: 'createdAt',
      header: 'Placed',
      accessor: (o) => o.createdAt,
      type: 'relative-date',
      sortable: true,
      priority: 2,
      render: (o) => <span title={formatDateTime(o.createdAt)}>{formatRelative(o.createdAt)}</span>
    }
  ],

  filters: [
    {
      key: 'status',
      label: 'Status',
      type: 'segmented',
      options: [
        { value: 'PENDING', label: 'Pending' },
        { value: 'CONFIRMED', label: 'Confirmed' },
        { value: 'DELIVERED', label: 'Delivered' },
        { value: 'CANCELLED', label: 'Cancelled' }
      ]
    }
  ],

  search: { placeholder: 'Search by ref, customer, vendor or address…' },
  defaultSort: { field: 'createdAt', direction: 'desc' },

  detail: {
    title: (o) => `Order ${shortId(o.id)}`,
    subtitle: (o) => `${o.consumer.name} · ${formatNaira(o.totalAmount)}`,
    statusField: 'status',
    sections: [
      {
        title: 'Order',
        fields: [
          { key: 'id', label: 'Full ID', accessor: (o) => o.id, full: true },
          { key: 'size', label: 'Cylinder size', accessor: (o) => o.cylinderSize },
          { key: 'qty', label: 'Quantity', accessor: (o) => o.quantity, type: 'number' },
          { key: 'total', label: 'Total', accessor: (o) => o.totalAmount, type: 'currency' },
          { key: 'placed', label: 'Placed', accessor: (o) => o.createdAt, type: 'date' },
          { key: 'address', label: 'Delivery address', accessor: (o) => o.deliveryAddress, full: true }
        ]
      },
      {
        title: 'Parties',
        fields: [
          { key: 'customer', label: 'Customer', accessor: (o) => o.consumer.name },
          { key: 'customerEmail', label: 'Customer email', accessor: (o) => o.consumer.email },
          {
            key: 'vendorName',
            label: 'Vendor',
            accessor: (o) => o.vendor?.businessName ?? o.supplierName
          }
        ]
      },
      {
        title: 'Payment',
        fields: [
          { key: 'paystackRef', label: 'Paystack reference', accessor: (o) => o.paystackRef, full: true },
          {
            key: 'paystackStatus',
            label: 'Paystack status',
            accessor: (o) => (o.paystackStatus ? o.paystackStatus.toUpperCase() : null),
            type: 'status'
          }
        ]
      }
    ],
    extra: (o) => <OrderRiderAssign order={o} />
  },

  permissions: { read: 'orders.read', assignRider: 'orders.assignRider' },

  data,

  emptyState: {
    title: 'No orders yet',
    description: 'Orders appear here as customers place them in the consumer app.'
  }
};

/**
 * Rider assignment widget for the order detail drawer. Keeps its own copy of
 * the assignment so the drawer reflects a change immediately — the generic
 * engine has no refresh hook available to `detail.extra`.
 */
function OrderRiderAssign({ order }: { order: OrderRow }) {
  const session = useAdminSession();
  const canAssign = can(session.role, 'orders.assignRider');

  const [riders, setRiders] = useState<RiderRow[] | null>(null);
  const [current, setCurrent] = useState(order.rider);
  const [selected, setSelected] = useState(order.rider?.id ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canAssign) return;
    let cancelled = false;
    adminFetch('/riders?status=APPROVED&limit=100')
      .then((res) => res.json())
      .then((body: { data?: RiderRow[] }) => {
        if (!cancelled) setRiders(body.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setRiders([]);
      });
    return () => {
      cancelled = true;
    };
  }, [canAssign]);

  async function assign(riderId: string | null) {
    setSaving(true);
    setError(null);
    try {
      const res = await adminFetch(`/orders/${order.id}/rider`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ riderId })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
      setCurrent(body.order?.rider ?? null);
      setSelected(riderId ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update rider');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="adm-detail-section">
      <h3 className="adm-micro-label">Delivery</h3>
      {current ? (
        <p>
          Assigned to <strong>{current.user.name}</strong>
          <span className="adm-td-sub">{current.phone}</span>
        </p>
      ) : (
        <p className="adm-muted">No rider assigned yet.</p>
      )}

      {canAssign && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
          <select
            className="adm-input"
            style={{ width: 'auto' }}
            value={selected}
            disabled={saving || riders === null}
            onChange={(e) => setSelected(e.target.value)}
            aria-label="Choose a rider"
          >
            <option value="">Select a rider…</option>
            {(riders ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.user.name} · {r.phone}
              </option>
            ))}
          </select>
          <button
            className="adm-btn adm-btn--sm adm-btn--primary"
            disabled={saving || !selected || selected === current?.id}
            onClick={() => assign(selected)}
          >
            {current ? 'Reassign' : 'Assign'}
          </button>
          {current && (
            <button className="adm-btn adm-btn--sm" disabled={saving} onClick={() => assign(null)}>
              Unassign
            </button>
          )}
        </div>
      )}

      {error && (
        <p role="alert" style={{ color: 'var(--error)', marginTop: 4 }}>
          {error}
        </p>
      )}
    </section>
  );
}
