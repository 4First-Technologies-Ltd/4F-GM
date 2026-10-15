import type { ResourceConfig } from '@/admin/resource/types';
import { createDataSource } from '@/admin/data/source';
import { formatDateTime, formatNumber, formatRelative } from '@/admin/primitives/format';
import { StatusBadge } from '@/admin/primitives/status-badge';
import type { CompanyRow } from './types';

/**
 * Logistics companies — fleet owners who bring their own riders. Approving a
 * company is what vets its riders: they are assignable to orders only while the
 * company is APPROVED, so rejecting a company takes the whole fleet off the
 * road at once and approving it again brings them back.
 */

const data = createDataSource<CompanyRow>({
  path: '/companies',
  singleKey: 'company',
  supports: { get: true, update: true }
});

export const companiesModule: ResourceConfig<CompanyRow> = {
  resource: 'companies',
  label: 'Logistics companies',
  labelSingular: 'Company',

  primaryKey: 'id',
  displayField: 'companyName',
  userIdOf: (c) => c.user.id,

  columns: [
    {
      key: 'companyName',
      header: 'Company',
      accessor: (c) => c.companyName,
      sortable: true,
      priority: 1,
      render: (c) => (
        <>
          {c.companyName}
          <span className="adm-td-sub">{c.user.email}</span>
        </>
      )
    },
    { key: 'status', header: 'Status', accessor: (c) => c.status, type: 'status', sortable: true, priority: 1 },
    { key: 'riders', header: 'Riders', accessor: (c) => c._count.riders, type: 'number', priority: 1 },
    { key: 'phone', header: 'Phone', accessor: (c) => c.phone, priority: 2 },
    {
      key: 'createdAt',
      header: 'Registered',
      accessor: (c) => c.createdAt,
      type: 'relative-date',
      sortable: true,
      priority: 2,
      render: (c) => <span title={formatDateTime(c.createdAt)}>{formatRelative(c.createdAt)}</span>
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

  search: { placeholder: 'Search company, owner or email…' },
  defaultSort: { field: 'createdAt', direction: 'desc' },

  rowActions: [
    {
      key: 'approve',
      label: 'Approve',
      variant: 'primary',
      permission: 'companies.approve',
      disabledHint: 'Requires the Operations role',
      visible: (c) => c.status !== 'APPROVED',
      confirm: {
        title: 'Approve this company?',
        body: 'Its riders become assignable to orders, and any rider it invites is approved by joining. This is recorded in the audit log.',
        confirmLabel: 'Approve company'
      },
      run: async (company, h) => {
        await data.update!(company.id, { status: 'APPROVED' });
        h.toast(`${company.companyName} approved`);
        h.refresh();
      }
    },
    {
      key: 'reject',
      label: 'Reject',
      variant: 'danger',
      permission: 'companies.approve',
      disabledHint: 'Requires the Operations role',
      visible: (c) => c.status !== 'REJECTED',
      confirm: {
        title: 'Reject this company?',
        body: 'Every rider in its fleet stops being assignable to orders straight away (deliveries already out are not cancelled). This is recorded in the audit log and can be reversed by approving the company again.',
        confirmLabel: 'Reject company'
      },
      run: async (company, h) => {
        await data.update!(company.id, { status: 'REJECTED' });
        h.toast(`${company.companyName} rejected`);
        h.refresh();
      }
    }
  ],

  detail: {
    title: (c) => c.companyName,
    subtitle: (c) => `${c.user.name} · ${c.user.email}`,
    statusField: 'status',
    sections: [
      {
        title: 'Company',
        fields: [
          { key: 'phone', label: 'Phone', accessor: (c) => c.phone },
          { key: 'state', label: 'State', accessor: (c) => c.state },
          { key: 'city', label: 'City', accessor: (c) => c.city },
          { key: 'address', label: 'Address', accessor: (c) => c.address },
          { key: 'registered', label: 'Registered', accessor: (c) => c.createdAt, type: 'date' },
          { key: 'riderCount', label: 'Riders', accessor: (c) => formatNumber(c._count.riders) }
        ]
      },
      {
        title: 'Owner account',
        fields: [
          { key: 'ownerName', label: 'Name', accessor: (c) => c.user.name },
          { key: 'ownerEmail', label: 'Email', accessor: (c) => c.user.email },
          { key: 'joined', label: 'Account created', accessor: (c) => c.user.createdAt, type: 'date' }
        ]
      }
    ],
    extra: (c) => (
      <section className="adm-detail-section">
        <h3 className="adm-micro-label">Fleet ({c.riders?.length ?? 0})</h3>
        {!c.riders?.length ? (
          <p className="adm-muted">No riders have joined yet.</p>
        ) : (
          <ul className="adm-doc-list">
            {c.riders.map((r) => (
              <li key={r.id} className="adm-doc-item">
                <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                  {r.user.name}
                  <span className="adm-td-sub">
                    {r.user.email} · {r.phone}
                    {r.vehicleType ? ` · ${r.vehicleType}` : ''}
                    {r.plateNumber ? ` ${r.plateNumber}` : ''}
                  </span>
                </span>
                <StatusBadge value={r.status} />
              </li>
            ))}
          </ul>
        )}
        {!!c.invites?.length && (
          <>
            <h3 className="adm-micro-label" style={{ marginTop: 'var(--space-4)' }}>
              Pending invites ({c.invites.length})
            </h3>
            <ul className="adm-doc-list">
              {c.invites.map((i) => (
                <li key={i.id} className="adm-doc-item">
                  <span>{i.email}</span>
                  <span className="adm-muted">expires {formatRelative(i.expiresAt)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    )
  },

  permissions: {
    read: 'companies.read',
    update: 'companies.approve',
    approve: 'companies.approve'
  },

  data,

  emptyState: {
    title: 'No logistics companies yet',
    description: 'Companies appear here once someone signs up as a logistics company in the app.'
  }
};
