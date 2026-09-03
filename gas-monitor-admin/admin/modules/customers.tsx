import type { ResourceConfig } from '@/admin/resource/types';
import { createDataSource } from '@/admin/data/source';
import { formatDateTime, formatRelative } from '@/admin/primitives/format';
import type { CustomerRow } from './types';

/**
 * Customers — consumers, with spend and order aggregates.
 *
 * Admin Dashboard OS normally SKIPS this module when "customer" is only a role
 * on User. It is kept here because the API exposes computed fields that do not
 * exist on the user record (totalSpend, orderCount, addressCount), which answers
 * a different question — "who are my best buyers?" — from the Users directory's
 * "find this account".
 *
 * Spend is aggregated in the database, per page. The previous implementation
 * summed it in the browser over a capped 200-row fetch, which meant the figure
 * was silently wrong for any larger dataset.
 */

const data = createDataSource<CustomerRow>({ path: '/customers' });

export const customersModule: ResourceConfig<CustomerRow> = {
  resource: 'customers',
  label: 'Customers',
  labelSingular: 'Customer',
  readOnly: true,

  primaryKey: 'id',
  displayField: 'name',

  columns: [
    {
      key: 'name',
      header: 'Customer',
      accessor: (c) => c.name,
      sortable: true,
      priority: 1,
      render: (c) => (
        <>
          {c.name}
          <span className="adm-td-sub">{c.email}</span>
        </>
      )
    },
    {
      key: 'account',
      header: 'Account',
      accessor: (c) => (c.isSuspended ? 'SUSPENDED' : c.emailVerified ? 'VERIFIED' : 'UNVERIFIED'),
      type: 'status',
      priority: 1
    },
    { key: 'orderCount', header: 'Orders', accessor: (c) => c.orderCount, type: 'number', priority: 1 },
    {
      key: 'totalSpend',
      header: 'Total spend',
      accessor: (c) => c.totalSpend,
      type: 'currency',
      priority: 1
    },
    { key: 'addresses', header: 'Addresses', accessor: (c) => c.addressCount, type: 'number', priority: 3 },
    { key: 'phone', header: 'Phone', accessor: (c) => c.phone, priority: 3 },
    {
      key: 'createdAt',
      header: 'Joined',
      accessor: (c) => c.createdAt,
      type: 'relative-date',
      sortable: true,
      priority: 2,
      render: (c) => <span title={formatDateTime(c.createdAt)}>{formatRelative(c.createdAt)}</span>
    }
  ],

  filters: [
    {
      key: 'verified',
      label: 'Email',
      type: 'segmented',
      options: [
        { value: 'true', label: 'Verified' },
        { value: 'false', label: 'Unverified' }
      ]
    }
  ],

  search: { placeholder: 'Search name or email…' },
  defaultSort: { field: 'createdAt', direction: 'desc' },

  detail: {
    title: (c) => c.name,
    subtitle: (c) => c.email,
    sections: [
      {
        title: 'Customer',
        fields: [
          { key: 'name', label: 'Name', accessor: (c) => c.name },
          { key: 'email', label: 'Email', accessor: (c) => c.email },
          { key: 'phone', label: 'Phone', accessor: (c) => c.phone },
          {
            key: 'verified',
            label: 'Email verified',
            accessor: (c) => (c.emailVerified ? 'VERIFIED' : 'UNVERIFIED'),
            type: 'status'
          },
          {
            key: 'status',
            label: 'Status',
            accessor: (c) => (c.isSuspended ? 'SUSPENDED' : 'ACTIVE'),
            type: 'status'
          },
          { key: 'joined', label: 'Joined', accessor: (c) => c.createdAt, type: 'date' }
        ]
      },
      {
        title: 'Activity',
        fields: [
          { key: 'orders', label: 'Orders', accessor: (c) => c.orderCount, type: 'number' },
          { key: 'spend', label: 'Total spend', accessor: (c) => c.totalSpend, type: 'currency' },
          { key: 'addresses', label: 'Saved addresses', accessor: (c) => c.addressCount, type: 'number' }
        ]
      }
    ]
  },

  permissions: { read: 'customers.read' },

  data,

  emptyState: {
    title: 'No customers yet',
    description: 'Consumer accounts appear here as people sign up.'
  }
};
