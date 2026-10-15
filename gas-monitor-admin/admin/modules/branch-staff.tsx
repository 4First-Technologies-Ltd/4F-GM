import type { ResourceConfig } from '@/admin/resource/types';
import { createDataSource } from '@/admin/data/source';
import { formatDate, formatDateTime, formatRelative } from '@/admin/primitives/format';
import type { BranchStaffRow } from './types';

/**
 * Branch staff — which managers can run which branch. Read-only: the vendor
 * owner invites and revokes; an admin who needs to cut access suspends the
 * branch (Vendors → detail) or the account (All users).
 */

const data = createDataSource<BranchStaffRow>({ path: '/branch-staff' });

const place = (r: BranchStaffRow) => [r.branch.city, r.branch.state].filter(Boolean).join(', ');

export const branchStaffModule: ResourceConfig<BranchStaffRow> = {
  resource: 'branchStaff',
  label: 'Branch staff',
  labelSingular: 'Manager',
  readOnly: true,

  primaryKey: 'id',
  displayField: 'email',

  columns: [
    {
      key: 'email',
      header: 'Manager',
      accessor: (r) => r.user?.name ?? r.email,
      sortable: true,
      priority: 1,
      render: (r) => (
        <>
          {r.user?.name ?? <span className="adm-muted">Not signed up yet</span>}
          <span className="adm-td-sub">{r.email}</span>
        </>
      )
    },
    {
      key: 'branch',
      header: 'Branch',
      accessor: (r) => r.branch.name,
      priority: 1,
      render: (r) => (
        <>
          {r.branch.name}
          <span className="adm-td-sub">{r.branch.vendor.businessName}</span>
        </>
      )
    },
    { key: 'status', header: 'Access', accessor: (r) => r.displayStatus, type: 'status', sortable: true, priority: 1 },
    {
      key: 'createdAt',
      header: 'Invited',
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
      label: 'Access',
      type: 'segmented',
      options: [
        { value: 'ACTIVE', label: 'Active' },
        { value: 'INVITED', label: 'Invited' },
        { value: 'EXPIRED', label: 'Expired' },
        { value: 'REVOKED', label: 'Revoked' }
      ]
    }
  ],

  search: { placeholder: 'Search manager, branch or business…' },
  defaultSort: { field: 'createdAt', direction: 'desc' },

  detail: {
    title: (r) => r.user?.name ?? r.email,
    subtitle: (r) => `${r.branch.name} · ${r.branch.vendor.businessName}`,
    statusField: 'displayStatus',
    sections: [
      {
        title: 'Access',
        fields: [
          { key: 'email', label: 'Invited email', accessor: (r) => r.email },
          { key: 'displayStatus', label: 'Status', accessor: (r) => r.displayStatus, type: 'status' },
          { key: 'createdAt', label: 'Invited', accessor: (r) => r.createdAt, type: 'date' },
          {
            key: 'expiresAt',
            label: 'Invite expires',
            accessor: (r) => (r.status === 'INVITED' ? formatDate(r.expiresAt) : null)
          },
          { key: 'updatedAt', label: 'Last changed', accessor: (r) => r.updatedAt, type: 'date' }
        ]
      },
      {
        title: 'Account',
        fields: [
          { key: 'name', label: 'Name', accessor: (r) => r.user?.name },
          { key: 'verified', label: 'Email verified', accessor: (r) => (r.user ? (r.user.emailVerified ? 'Yes' : 'No') : null) },
          { key: 'suspended', label: 'Account suspended', accessor: (r) => (r.user ? (r.user.isSuspended ? 'Yes' : 'No') : null) }
        ]
      },
      {
        title: 'Branch',
        fields: [
          { key: 'branch', label: 'Branch', accessor: (r) => r.branch.name },
          { key: 'vendor', label: 'Business', accessor: (r) => r.branch.vendor.businessName },
          { key: 'place', label: 'Location', accessor: (r) => place(r) },
          {
            key: 'branchState',
            label: 'Branch state',
            accessor: (r) => (r.branch.suspendedAt ? 'Suspended by 4FG' : r.branch.isActive ? 'Open' : 'Closed by the owner')
          }
        ]
      }
    ]
  },

  permissions: { read: 'branchStaff.read' },

  data,

  emptyState: {
    title: 'No branch managers yet',
    description: 'Managers appear here once a vendor invites them from the Branches screen in the app.'
  }
};
