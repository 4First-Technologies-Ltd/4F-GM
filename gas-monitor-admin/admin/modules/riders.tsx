import type { ResourceConfig } from '@/admin/resource/types';
import { createDataSource } from '@/admin/data/source';
import { formatDateTime, formatRelative } from '@/admin/primitives/format';
import { StatusBadge } from '@/admin/primitives/status-badge';
import type { RiderRow } from './types';

/**
 * Riders — delivery agents for marketplace orders. Not owned by any one
 * vendor: an approved rider is assignable to any vendor's order from the
 * Orders detail view (see `orders.tsx`).
 */

const data = createDataSource<RiderRow>({
  path: '/riders',
  singleKey: 'rider',
  supports: { get: true, update: true }
});

export const ridersModule: ResourceConfig<RiderRow> = {
  resource: 'riders',
  label: 'Riders',
  labelSingular: 'Rider',

  primaryKey: 'id',
  displayField: 'id',
  userIdOf: (r) => r.user.id,

  columns: [
    {
      key: 'name',
      header: 'Rider',
      accessor: (r) => r.user.name,
      priority: 1,
      render: (r) => (
        <>
          {r.user.name}
          <span className="adm-td-sub">{r.user.email}</span>
        </>
      )
    },
    { key: 'status', header: 'Status', accessor: (r) => r.status, type: 'status', sortable: true, priority: 1 },
    { key: 'phone', header: 'Phone', accessor: (r) => r.phone, priority: 2 },
    {
      key: 'vehicle',
      header: 'Vehicle',
      accessor: (r) => r.vehicleType ?? '—',
      priority: 3,
      render: (r) => (
        <>
          {r.vehicleType ?? '—'}
          {r.plateNumber ? <span className="adm-td-sub">{r.plateNumber}</span> : null}
        </>
      )
    },
    { key: 'orders', header: 'Orders', accessor: (r) => r._count.orders, type: 'number', priority: 1 },
    {
      key: 'createdAt',
      header: 'Registered',
      accessor: (r) => r.createdAt,
      type: 'relative-date',
      sortable: true,
      priority: 2,
      render: (r) => <span title={formatDateTime(r.createdAt)}>{formatRelative(r.createdAt)}</span>
    }
  ],

  filters: [
    {
      key: 'status',
      label: 'Status',
      type: 'segmented',
      options: [
        { value: 'PENDING', label: 'Pending' },
        { value: 'APPROVED', label: 'Approved' },
        { value: 'REJECTED', label: 'Rejected' }
      ]
    }
  ],

  search: { placeholder: 'Search rider, phone or email…' },
  defaultSort: { field: 'createdAt', direction: 'desc' },

  rowActions: [
    {
      key: 'approve',
      label: 'Approve',
      variant: 'primary',
      permission: 'riders.approve',
      disabledHint: 'Requires the Operations role',
      visible: (r) => r.status !== 'APPROVED',
      run: async (rider, h) => {
        await data.update!(rider.id, { status: 'APPROVED' });
        h.toast(`${rider.user.name} approved`);
        h.refresh();
      }
    },
    {
      key: 'reject',
      label: 'Reject',
      variant: 'danger',
      permission: 'riders.approve',
      disabledHint: 'Requires the Operations role',
      visible: (r) => r.status !== 'REJECTED',
      confirm: {
        title: 'Reject this rider?',
        body: 'They will no longer be assignable to orders. This is recorded in the audit log and can be reversed by approving them later.',
        confirmLabel: 'Reject rider'
      },
      run: async (rider, h) => {
        await data.update!(rider.id, { status: 'REJECTED' });
        h.toast(`${rider.user.name} rejected`);
        h.refresh();
      }
    }
  ],

  detail: {
    title: (r) => r.user.name,
    subtitle: (r) => `${r.phone} · ${r.user.email}`,
    statusField: 'status',
    sections: [
      {
        title: 'Rider',
        fields: [
          { key: 'phone', label: 'Phone', accessor: (r) => r.phone },
          { key: 'vehicleType', label: 'Vehicle type', accessor: (r) => r.vehicleType },
          { key: 'plateNumber', label: 'Plate number', accessor: (r) => r.plateNumber },
          {
            key: 'coords',
            label: 'Last known location',
            accessor: (r) => (r.lat != null && r.lng != null ? `${r.lat}, ${r.lng}` : null)
          },
          { key: 'registered', label: 'Registered', accessor: (r) => r.createdAt, type: 'date' }
        ]
      },
      {
        title: 'Account',
        fields: [
          { key: 'accountName', label: 'Name', accessor: (r) => r.user.name },
          { key: 'accountEmail', label: 'Email', accessor: (r) => r.user.email },
          { key: 'joined', label: 'Account created', accessor: (r) => r.user.createdAt, type: 'date' },
          { key: 'orderCount', label: 'Orders delivered', accessor: (r) => r._count.orders, type: 'number' }
        ]
      }
    ],
    extra: (r) => (
      <section className="adm-detail-section">
        <h3 className="adm-micro-label">Recent orders ({r.orders?.length ?? 0})</h3>
        {!r.orders?.length ? (
          <p className="adm-muted">No orders assigned yet.</p>
        ) : (
          <ul className="adm-doc-list">
            {r.orders.map((o) => (
              <li key={o.id} className="adm-doc-item">
                <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                  {o.deliveryAddress}
                  <span className="adm-td-sub">
                    <StatusBadge value={o.status} />
                  </span>
                </span>
                <span className="adm-muted" title={formatDateTime(o.assignedAt ?? o.createdAt)}>
                  {formatRelative(o.assignedAt ?? o.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    )
  },

  permissions: {
    read: 'riders.read',
    update: 'riders.approve',
    approve: 'riders.approve'
  },

  data,

  emptyState: {
    title: 'No riders yet',
    description: 'Riders appear here once someone signs up as a delivery agent.'
  }
};
