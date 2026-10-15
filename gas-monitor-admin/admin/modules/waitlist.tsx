import type { ResourceConfig } from '@/admin/resource/types';
import { createDataSource } from '@/admin/data/source';
import { formatDateTime, formatRelative } from '@/admin/primitives/format';
import type { WaitlistRow } from './types';

/**
 * Waitlist — sign-ups from the marketing landing page. Read-only: rows are
 * written by the public form and removed by the unsubscribe link, never here.
 */

const data = createDataSource<WaitlistRow>({ path: '/waitlist' });

export const waitlistModule: ResourceConfig<WaitlistRow> = {
  resource: 'waitlist',
  label: 'Waitlist',
  labelSingular: 'Sign-up',
  readOnly: true,

  primaryKey: 'id',
  displayField: 'email',

  columns: [
    {
      key: 'name',
      header: 'Person',
      accessor: (w) => w.name ?? w.email,
      sortable: true,
      priority: 1,
      render: (w) => (
        <>
          {w.name || <span className="adm-muted">No name</span>}
          <span className="adm-td-sub">{w.email}</span>
        </>
      )
    },
    {
      key: 'city',
      header: 'City',
      accessor: (w) => w.city,
      sortable: true,
      priority: 1,
      render: (w) => w.city || <span className="adm-muted">—</span>
    },
    {
      key: 'created_at',
      header: 'Joined',
      accessor: (w) => w.created_at,
      type: 'relative-date',
      sortable: true,
      priority: 1,
      render: (w) => <span title={formatDateTime(w.created_at)}>{formatRelative(w.created_at)}</span>
    }
  ],

  filters: [],

  search: { placeholder: 'Search name, email or city…' },
  defaultSort: { field: 'created_at', direction: 'desc' },
  defaultPageSize: 50,

  detail: {
    title: (w) => w.name || w.email,
    subtitle: (w) => `Joined ${formatDateTime(w.created_at)}`,
    sections: [
      {
        title: 'Sign-up',
        fields: [
          { key: 'name', label: 'Name', accessor: (w) => w.name },
          { key: 'email', label: 'Email', accessor: (w) => w.email },
          { key: 'city', label: 'City', accessor: (w) => w.city },
          { key: 'created_at', label: 'Joined', accessor: (w) => w.created_at, type: 'date' }
        ]
      }
    ]
  },

  permissions: { read: 'waitlist.read' },

  data,

  emptyState: {
    title: 'No sign-ups yet',
    description: 'People who join the waitlist on the landing page appear here.'
  }
};
