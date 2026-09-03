import type { ResourceConfig } from '@/admin/resource/types';
import { createDataSource } from '@/admin/data/source';
import { formatDateTime, formatNumber, formatRelative } from '@/admin/primitives/format';
import type { VendorRow } from './types';

/**
 * Vendors — the supply side, with the approval queue.
 *
 * Reduced mode: there is no rejection-reason field and no suspend flag on
 * VendorProfile, so those actions are not offered. Adding them needs a schema
 * change; see ADMIN_DASHBOARD_REPORT.md.
 */

const data = createDataSource<VendorRow>({
  path: '/vendors',
  singleKey: 'vendor',
  supports: { get: true, update: true }
});

export const vendorsModule: ResourceConfig<VendorRow> = {
  resource: 'vendors',
  label: 'Vendors',
  labelSingular: 'Vendor',

  primaryKey: 'id',
  displayField: 'businessName',

  columns: [
    {
      key: 'businessName',
      header: 'Business',
      accessor: (v) => v.businessName,
      sortable: true,
      priority: 1,
      render: (v) => (
        <>
          {v.businessName}
          <span className="adm-td-sub">{v.user.email}</span>
        </>
      )
    },
    { key: 'status', header: 'Status', accessor: (v) => v.status, type: 'status', sortable: true, priority: 1 },
    { key: 'owner', header: 'Owner', accessor: (v) => v.user.name, priority: 2 },
    { key: 'phone', header: 'Phone', accessor: (v) => v.phone, priority: 3 },
    {
      key: 'listings',
      header: 'Listings',
      accessor: (v) => v._count.listings,
      type: 'number',
      priority: 1
    },
    { key: 'orders', header: 'Orders', accessor: (v) => v._count.orders, type: 'number', priority: 1 },
    {
      key: 'docs',
      header: 'Docs',
      accessor: (v) => v.documents.length,
      type: 'number',
      priority: 3
    },
    {
      key: 'createdAt',
      header: 'Registered',
      accessor: (v) => v.createdAt,
      type: 'relative-date',
      sortable: true,
      priority: 2,
      render: (v) => <span title={formatDateTime(v.createdAt)}>{formatRelative(v.createdAt)}</span>
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

  search: { placeholder: 'Search business, owner or email…' },
  defaultSort: { field: 'createdAt', direction: 'desc' },

  rowActions: [
    {
      key: 'approve',
      label: 'Approve',
      variant: 'primary',
      permission: 'vendors.approve',
      disabledHint: 'Requires the Operations role',
      visible: (v) => v.status !== 'APPROVED',
      run: async (vendor, h) => {
        await data.update!(vendor.id, { status: 'APPROVED' });
        h.toast(`${vendor.businessName} approved`);
        h.refresh();
      }
    },
    {
      key: 'reject',
      label: 'Reject',
      variant: 'danger',
      permission: 'vendors.approve',
      disabledHint: 'Requires the Operations role',
      visible: (v) => v.status !== 'REJECTED',
      confirm: {
        title: 'Reject this vendor?',
        body: 'They will not be able to trade on the platform. This is recorded in the audit log and can be reversed by approving them later.',
        confirmLabel: 'Reject vendor'
      },
      run: async (vendor, h) => {
        await data.update!(vendor.id, { status: 'REJECTED' });
        h.toast(`${vendor.businessName} rejected`);
        h.refresh();
      }
    }
  ],

  detail: {
    title: (v) => v.businessName,
    subtitle: (v) => `${v.user.name} · ${v.user.email}`,
    statusField: 'status',
    sections: [
      {
        title: 'Business',
        fields: [
          { key: 'businessName', label: 'Name', accessor: (v) => v.businessName },
          { key: 'phone', label: 'Phone', accessor: (v) => v.phone },
          { key: 'address', label: 'Address', accessor: (v) => v.businessAddress, full: true },
          { key: 'bio', label: 'Bio', accessor: (v) => v.bio, full: true },
          {
            key: 'coords',
            label: 'Coordinates',
            accessor: (v) => (v.lat != null && v.lng != null ? `${v.lat}, ${v.lng}` : null)
          },
          { key: 'registered', label: 'Registered', accessor: (v) => v.createdAt, type: 'date' }
        ]
      },
      {
        title: 'Owner',
        fields: [
          { key: 'ownerName', label: 'Name', accessor: (v) => v.user.name },
          { key: 'ownerEmail', label: 'Email', accessor: (v) => v.user.email },
          { key: 'joined', label: 'Account created', accessor: (v) => v.user.createdAt, type: 'date' }
        ]
      },
      {
        title: 'Activity',
        fields: [
          { key: 'listingCount', label: 'Listings', accessor: (v) => formatNumber(v._count.listings) },
          { key: 'orderCount', label: 'Orders', accessor: (v) => formatNumber(v._count.orders) }
        ]
      }
    ],
    extra: (v) => (
      <section className="adm-detail-section">
        <h3 className="adm-micro-label">Documents ({v.documents.length})</h3>
        {v.documents.length === 0 ? (
          <p className="adm-muted">No documents uploaded.</p>
        ) : (
          <ul className="adm-doc-list">
            {v.documents.map((d) => (
              <li key={d.id} className="adm-doc-item">
                <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{d.fileName}</span>
                <a
                  className="adm-btn adm-btn--sm"
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open ${d.fileName} in a new tab`}
                >
                  Open
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    )
  },

  permissions: {
    read: 'vendors.read',
    update: 'vendors.approve',
    approve: 'vendors.approve'
  },

  data,

  emptyState: {
    title: 'No vendors yet',
    description: 'Vendors appear here when they sign up through the consumer app.'
  }
};
