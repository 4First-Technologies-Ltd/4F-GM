import type { ResourceConfig } from '@/admin/resource/types';
import { createDataSource } from '@/admin/data/source';
import { formatDateTime, formatRelative } from '@/admin/primitives/format';
import type { AdminUserRow } from './types';

/**
 * Admin users — who can get into this panel.
 *
 * Promoted out of a tab inside Settings into its own SUPER_ADMIN-only module.
 *
 * The `roles-permissions` module is deliberately NOT generated: AdminRole is a
 * hardcoded Prisma enum, not a table, so a permission-matrix UI would have
 * nothing to write to. The role model is surfaced read-only in Settings instead.
 */

const data = createDataSource<AdminUserRow>({
  path: '/admin-users',
  singleKey: 'adminUser',
  supports: { create: true, update: true, remove: true }
});

export const adminUsersData = data;

export const adminUsersModule: ResourceConfig<AdminUserRow> = {
  resource: 'admins',
  label: 'Admin users',
  labelSingular: 'Admin',

  primaryKey: 'id',
  displayField: 'name',

  columns: [
    {
      key: 'name',
      header: 'Admin',
      accessor: (a) => a.name,
      sortable: true,
      priority: 1,
      render: (a) => (
        <>
          {a.name}
          <span className="adm-td-sub">{a.email}</span>
        </>
      )
    },
    { key: 'role', header: 'Role', accessor: (a) => a.role, type: 'status', sortable: true, priority: 1 },
    {
      key: 'isActive',
      header: 'Status',
      accessor: (a) => (a.isActive ? 'ACTIVE' : 'INACTIVE'),
      type: 'status',
      priority: 1
    },
    {
      key: 'createdAt',
      header: 'Added',
      accessor: (a) => a.createdAt,
      type: 'relative-date',
      sortable: true,
      priority: 2,
      render: (a) => <span title={formatDateTime(a.createdAt)}>{formatRelative(a.createdAt)}</span>
    }
  ],

  filters: [
    {
      key: 'role',
      label: 'Role',
      type: 'segmented',
      options: [
        { value: 'SUPER_ADMIN', label: 'Super admin' },
        { value: 'OPERATIONS', label: 'Operations' },
        { value: 'SUPPORT', label: 'Support' }
      ]
    },
    {
      key: 'active',
      label: 'Status',
      type: 'select',
      secondary: true,
      options: [
        { value: 'true', label: 'Active' },
        { value: 'false', label: 'Deactivated' }
      ]
    }
  ],

  search: { placeholder: 'Search name or email…' },
  defaultSort: { field: 'createdAt', direction: 'desc' },

  rowActions: [
    {
      key: 'deactivate',
      label: 'Deactivate',
      variant: 'danger',
      permission: 'admins.update',
      visible: (a) => a.isActive,
      confirm: {
        title: 'Deactivate this admin?',
        body: 'They will no longer be able to sign in to the console. This is recorded in the audit log and can be reversed.',
        confirmLabel: 'Deactivate'
      },
      run: async (admin, h) => {
        await data.update!(admin.id, { isActive: false });
        h.toast(`${admin.name} deactivated`);
        h.refresh();
      }
    },
    {
      key: 'activate',
      label: 'Reactivate',
      variant: 'primary',
      permission: 'admins.update',
      visible: (a) => !a.isActive,
      run: async (admin, h) => {
        await data.update!(admin.id, { isActive: true });
        h.toast(`${admin.name} reactivated`);
        h.refresh();
      }
    },
    {
      key: 'delete',
      label: 'Delete',
      variant: 'danger',
      permission: 'admins.delete',
      confirm: {
        title: 'Delete this admin permanently?',
        body: 'This cannot be undone. The server refuses to delete your own account or the last active super admin.',
        confirmLabel: 'Delete admin',
        typeToConfirm: (a) => a.email
      },
      run: async (admin, h) => {
        await data.remove!(admin.id);
        h.toast(`${admin.name} deleted`);
        h.refresh();
      }
    }
  ],

  detail: {
    title: (a) => a.name,
    subtitle: (a) => a.email,
    sections: [
      {
        title: 'Admin',
        fields: [
          { key: 'name', label: 'Name', accessor: (a) => a.name },
          { key: 'email', label: 'Email', accessor: (a) => a.email },
          { key: 'role', label: 'Role', accessor: (a) => a.role, type: 'status' },
          {
            key: 'status',
            label: 'Status',
            accessor: (a) => (a.isActive ? 'ACTIVE' : 'INACTIVE'),
            type: 'status'
          },
          { key: 'added', label: 'Added', accessor: (a) => a.createdAt, type: 'date' }
        ]
      }
    ]
  },

  permissions: {
    read: 'admins.read',
    create: 'admins.create',
    update: 'admins.update',
    delete: 'admins.delete'
  },

  data,

  emptyState: {
    title: 'No admin accounts',
    description:
      'Only the environment root account can sign in. Add an admin to give someone their own credentials.'
  }
};
