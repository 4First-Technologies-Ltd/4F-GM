import type { ResourceConfig } from '@/admin/resource/types';
import { createDataSource } from '@/admin/data/source';
import { formatDateTime, formatRelative, humaniseEnum, shortId } from '@/admin/primitives/format';
import type { AuditRow } from './types';

/**
 * Audit log — APPEND-ONLY.
 *
 * `readOnly` suppresses every mutating affordance in the engine. There is no
 * edit or delete endpoint either: an audit log that can be modified is not an
 * audit log.
 *
 * This module did not exist before this refactor — vendor approvals, user
 * deletions and admin changes left no record at all.
 */

const data = createDataSource<AuditRow>({ path: '/audit' });

const ACTION_OPTIONS = [
  'VENDOR_APPROVED',
  'VENDOR_REJECTED',
  'VENDOR_STATUS_RESET',
  'LISTING_STOCK_UPDATED',
  'USER_CREATED',
  'USER_UPDATED',
  'USER_SUSPENDED',
  'USER_UNSUSPENDED',
  'USER_DELETED',
  'ADMIN_CREATED',
  'ADMIN_UPDATED',
  'ADMIN_DEACTIVATED',
  'ADMIN_DELETED',
  'SETTINGS_UPDATED'
].map((value) => ({ value, label: humaniseEnum(value) }));

export const auditModule: ResourceConfig<AuditRow> = {
  resource: 'audit',
  label: 'Audit log',
  labelSingular: 'entry',
  readOnly: true,

  primaryKey: 'id',
  displayField: 'summary',

  columns: [
    {
      key: 'summary',
      header: 'Event',
      accessor: (a) => a.summary,
      priority: 1,
      render: (a) => (
        <>
          {a.summary}
          <span className="adm-td-sub">{humaniseEnum(a.action)}</span>
        </>
      )
    },
    {
      key: 'actor',
      header: 'Actor',
      accessor: (a) => a.actorName,
      priority: 1,
      render: (a) => (
        <>
          {a.actorName}
          <span className="adm-td-sub">{a.actorEmail}</span>
        </>
      )
    },
    { key: 'actorRole', header: 'Role', accessor: (a) => a.actorRole, type: 'status', priority: 3 },
    { key: 'resource', header: 'Resource', accessor: (a) => humaniseEnum(a.resource), priority: 3 },
    {
      key: 'createdAt',
      header: 'When',
      accessor: (a) => a.createdAt,
      type: 'relative-date',
      priority: 1,
      render: (a) => <span title={formatDateTime(a.createdAt)}>{formatRelative(a.createdAt)}</span>
    }
  ],

  filters: [
    {
      key: 'resource',
      label: 'Resource',
      type: 'segmented',
      options: [
        { value: 'vendor', label: 'Vendors' },
        { value: 'user', label: 'Users' },
        { value: 'listing', label: 'Listings' },
        { value: 'admin', label: 'Admins' },
        { value: 'settings', label: 'Settings' }
      ]
    },
    { key: 'action', label: 'Action', type: 'select', secondary: true, options: ACTION_OPTIONS }
  ],

  search: { placeholder: 'Search event, actor or record id…' },
  defaultPageSize: 50,

  detail: {
    title: (a) => humaniseEnum(a.action),
    subtitle: (a) => `${a.actorName} · ${formatDateTime(a.createdAt)}`,
    sections: [
      {
        title: 'Event',
        fields: [
          { key: 'summary', label: 'Summary', accessor: (a) => a.summary, full: true },
          { key: 'action', label: 'Action', accessor: (a) => humaniseEnum(a.action) },
          { key: 'resource', label: 'Resource', accessor: (a) => humaniseEnum(a.resource) },
          {
            key: 'resourceId',
            label: 'Record',
            accessor: (a) => a.resourceId,
            render: (a) =>
              a.resourceId ? (
                <span style={{ fontFamily: 'var(--font-mono)' }} title={a.resourceId}>
                  {shortId(a.resourceId)}
                </span>
              ) : (
                <span className="adm-muted">—</span>
              )
          },
          { key: 'when', label: 'When', accessor: (a) => a.createdAt, type: 'date' }
        ]
      },
      {
        title: 'Actor',
        fields: [
          { key: 'actorName', label: 'Name', accessor: (a) => a.actorName },
          { key: 'actorEmail', label: 'Email', accessor: (a) => a.actorEmail },
          { key: 'actorRole', label: 'Role', accessor: (a) => a.actorRole, type: 'status' },
          { key: 'actorId', label: 'Admin id', accessor: (a) => a.actorId }
        ]
      }
    ],
    extra: (a) =>
      a.metadata ? (
        <section className="adm-detail-section">
          <h3 className="adm-micro-label">Details</h3>
          <div className="adm-audit-meta">
            <pre>{JSON.stringify(a.metadata, null, 2)}</pre>
          </div>
        </section>
      ) : null
  },

  permissions: { read: 'audit.read' },

  data,

  emptyState: {
    title: 'No audit entries yet',
    description: 'Vendor approvals, account changes and settings edits are recorded here as they happen.'
  }
};
