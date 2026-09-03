import type { ResourceConfig } from '@/admin/resource/types';
import { createDataSource } from '@/admin/data/source';
import { formatDateTime, formatRelative } from '@/admin/primitives/format';
import { StatusBadge } from '@/admin/primitives/status-badge';
import type { UserRow } from './types';

/**
 * Users — every account, consumer and vendor.
 *
 * Full mode: the API supports create, update, delete, suspend and search.
 * Delete is refused server-side for users with order history (409), and the
 * confirmation copy says so rather than letting the operator discover it.
 */

const data = createDataSource<UserRow>({
  path: '/users',
  singleKey: 'user',
  supports: { get: true, create: true, update: true, remove: true }
});

export const usersData = data;

export const usersModule: ResourceConfig<UserRow> = {
  resource: 'users',
  label: 'Users',
  labelSingular: 'User',

  primaryKey: 'id',
  displayField: 'name',

  columns: [
    {
      key: 'name',
      header: 'User',
      accessor: (u) => u.name,
      sortable: true,
      priority: 1,
      render: (u) => (
        <>
          {u.name}
          <span className="adm-td-sub">{u.email}</span>
        </>
      )
    },
    { key: 'role', header: 'Role', accessor: (u) => u.role, type: 'status', priority: 1 },
    {
      key: 'account',
      header: 'Account',
      accessor: (u) => (u.isSuspended ? 'SUSPENDED' : u.emailVerified ? 'VERIFIED' : 'UNVERIFIED'),
      type: 'status',
      priority: 1
    },
    {
      key: 'vendorStatus',
      header: 'Vendor',
      accessor: (u) => u.vendorProfile?.status ?? null,
      priority: 3,
      render: (u) =>
        u.vendorProfile ? (
          <StatusBadge value={u.vendorProfile.status} />
        ) : (
          <span className="adm-muted">—</span>
        )
    },
    { key: 'phone', header: 'Phone', accessor: (u) => u.phone, priority: 3 },
    { key: 'orders', header: 'Orders', accessor: (u) => u._count.orders, type: 'number', priority: 2 },
    {
      key: 'createdAt',
      header: 'Joined',
      accessor: (u) => u.createdAt,
      type: 'relative-date',
      sortable: true,
      priority: 2,
      render: (u) => <span title={formatDateTime(u.createdAt)}>{formatRelative(u.createdAt)}</span>
    }
  ],

  filters: [
    {
      key: 'role',
      label: 'Role',
      type: 'segmented',
      options: [
        { value: 'CONSUMER', label: 'Consumers' },
        { value: 'VENDOR', label: 'Vendors' }
      ]
    },
    {
      key: 'suspended',
      label: 'Suspension',
      type: 'select',
      secondary: true,
      options: [
        { value: 'true', label: 'Suspended' },
        { value: 'false', label: 'Active' }
      ]
    },
    {
      key: 'verified',
      label: 'Email',
      type: 'select',
      secondary: true,
      options: [
        { value: 'true', label: 'Verified' },
        { value: 'false', label: 'Unverified' }
      ]
    }
  ],

  search: { placeholder: 'Search name, email or phone…' },
  defaultSort: { field: 'createdAt', direction: 'desc' },

  rowActions: [
    {
      key: 'suspend',
      label: 'Suspend',
      variant: 'danger',
      permission: 'users.suspend',
      disabledHint: 'Requires the Operations role',
      visible: (u) => !u.isSuspended,
      confirm: {
        title: 'Suspend this account?',
        body: 'They will not be able to sign in or place orders. This is recorded in the audit log and can be reversed.',
        confirmLabel: 'Suspend'
      },
      run: async (user, h) => {
        await data.update!(user.id, { isSuspended: true });
        h.toast(`${user.name} suspended`);
        h.refresh();
      }
    },
    {
      key: 'reinstate',
      label: 'Reinstate',
      variant: 'primary',
      permission: 'users.suspend',
      disabledHint: 'Requires the Operations role',
      visible: (u) => u.isSuspended,
      run: async (user, h) => {
        await data.update!(user.id, { isSuspended: false });
        h.toast(`${user.name} reinstated`);
        h.refresh();
      }
    },
    {
      key: 'delete',
      label: 'Delete',
      variant: 'danger',
      permission: 'users.delete',
      disabledHint: 'Requires the Operations role',
      // The server refuses (409) when order history exists; only offer it where
      // it can actually succeed.
      visible: (u) => u._count.orders === 0,
      confirm: {
        title: 'Delete this account permanently?',
        body: 'This cannot be undone. Accounts with any order history cannot be deleted — suspend those instead.',
        confirmLabel: 'Delete account',
        typeToConfirm: (u) => u.email
      },
      run: async (user, h) => {
        await data.remove!(user.id);
        h.toast(`${user.name} deleted`);
        h.refresh();
      }
    }
  ],

  detail: {
    title: (u) => u.name,
    subtitle: (u) => u.email,
    sections: [
      {
        title: 'Account',
        fields: [
          { key: 'name', label: 'Name', accessor: (u) => u.name },
          { key: 'email', label: 'Email', accessor: (u) => u.email },
          { key: 'phone', label: 'Phone', accessor: (u) => u.phone },
          { key: 'role', label: 'Role', accessor: (u) => u.role, type: 'status' },
          {
            key: 'verified',
            label: 'Email verified',
            accessor: (u) => (u.emailVerified ? 'VERIFIED' : 'UNVERIFIED'),
            type: 'status'
          },
          {
            key: 'suspended',
            label: 'Status',
            accessor: (u) => (u.isSuspended ? 'SUSPENDED' : 'ACTIVE'),
            type: 'status'
          },
          { key: 'joined', label: 'Joined', accessor: (u) => u.createdAt, type: 'date' },
          { key: 'orders', label: 'Orders placed', accessor: (u) => u._count.orders, type: 'number' }
        ]
      },
      {
        title: 'Vendor profile',
        fields: [
          {
            key: 'business',
            label: 'Business',
            accessor: (u) => u.vendorProfile?.businessName ?? null
          },
          {
            key: 'vendorStatus',
            label: 'Vendor status',
            accessor: (u) => u.vendorProfile?.status ?? null,
            type: 'status'
          }
        ]
      }
    ]
  },

  permissions: {
    read: 'users.read',
    create: 'users.create',
    update: 'users.update',
    delete: 'users.delete',
    suspend: 'users.suspend'
  },

  data,

  emptyState: {
    title: 'No users yet',
    description: 'Accounts appear here as people sign up through the consumer app.'
  }
};
