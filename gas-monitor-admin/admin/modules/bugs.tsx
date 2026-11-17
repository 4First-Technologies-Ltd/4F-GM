import type { ResourceConfig } from '@/admin/resource/types';
import { createDataSource } from '@/admin/data/source';
import { formatDateTime, formatRelative, humaniseEnum } from '@/admin/primitives/format';
import { StatusBadge } from '@/admin/primitives/status-badge';
import type { BugRow } from './bug-types';

/** Bug reports filed by invited beta testers. The report itself is its own page (`/dashboard/bugs/[number]`). */

const data = createDataSource<BugRow>({
  path: '/bugs'
});

const AREAS = ['CONSUMER', 'VENDOR', 'RIDER', 'COMPANY', 'MANAGER', 'GENERAL'];

export const bugsModule: ResourceConfig<BugRow> = {
  resource: 'bugs',
  label: 'Bug reports',
  labelSingular: 'Bug report',

  primaryKey: 'id',
  displayField: 'title',

  columns: [
    {
      key: 'title',
      header: 'Report',
      accessor: (b) => b.title,
      priority: 1,
      render: (b) => (
        <>
          <span className="adm-muted">#{b.number}</span> {b.title}
          <span className="adm-td-sub">
            {b.testerName} · {humaniseEnum(b.area)}
            {b.screen ? ` · ${b.screen}` : ''}
            {b.attachmentCount > 0 ? ` · ${b.attachmentCount} file${b.attachmentCount === 1 ? '' : 's'}` : ''}
          </span>
        </>
      )
    },
    {
      key: 'severity',
      header: 'Severity',
      accessor: (b) => b.severity,
      type: 'status',
      sortable: true,
      priority: 1
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (b) => b.status,
      priority: 1,
      render: (b) => (
        <>
          <StatusBadge value={b.status} />
          {b.status === 'FIXED' && b.fixedInBuild && <span className="adm-td-sub">in {b.fixedInBuild}</span>}
        </>
      )
    },
    {
      key: 'assignee',
      header: 'Assigned to',
      accessor: (b) => b.assigneeName ?? 'Unassigned',
      priority: 3,
      render: (b) => (b.assigneeName ? b.assigneeName : <span className="adm-muted">Unassigned</span>)
    },
    {
      key: 'updatedAt',
      header: 'Updated',
      accessor: (b) => b.updatedAt,
      type: 'relative-date',
      sortable: true,
      priority: 2,
      render: (b) => <span title={formatDateTime(b.updatedAt)}>{formatRelative(b.updatedAt)}</span>
    }
  ],

  filters: [
    {
      key: 'status',
      label: 'Status',
      type: 'segmented',
      options: [
        { value: 'active', label: 'To do' },
        { value: 'NEW', label: 'New' },
        { value: 'NEEDS_INFO', label: 'Needs info' },
        { value: 'FIXED', label: 'Awaiting retest' },
        { value: 'VERIFIED', label: 'Verified' }
      ]
    },
    {
      key: 'severity',
      label: 'Severity',
      type: 'select',
      secondary: true,
      options: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((v) => ({ value: v, label: humaniseEnum(v) }))
    },
    {
      key: 'area',
      label: 'Area',
      type: 'select',
      secondary: true,
      options: AREAS.map((v) => ({ value: v, label: humaniseEnum(v) }))
    },
    {
      key: 'assignee',
      label: 'Assignee',
      type: 'select',
      secondary: true,
      options: [
        { value: 'me', label: 'Assigned to me' },
        { value: 'unassigned', label: 'Unassigned' }
      ]
    }
  ],

  search: { placeholder: 'Search title, screen, tester or #number…' },
  defaultSort: { field: 'updatedAt', direction: 'desc' },
  rowHref: (b) => `/dashboard/bugs/${b.number}`,

  permissions: { read: 'bugs.read' },
  data,
  emptyState: {
    title: 'No bug reports yet',
    description: 'Reports filed by your beta testers appear here.'
  }
};
