import Link from 'next/link';
import type { ResourceConfig } from '@/admin/resource/types';
import { createDataSource } from '@/admin/data/source';
import { sendJson } from '@/lib/post';
import { formatDateTime, formatRelative } from '@/admin/primitives/format';
import type { CrmTaskRow } from './types';

/** Follow-ups for the team: tied to a pipeline lead, an account, or free-standing. */

const data = createDataSource<CrmTaskRow>({
  path: '/crm/tasks',
  singleKey: 'task',
  supports: { update: true }
});

const isOverdue = (t: CrmTaskRow) => t.status === 'OPEN' && !!t.dueAt && new Date(t.dueAt).getTime() < Date.now();

export const tasksModule: ResourceConfig<CrmTaskRow> = {
  resource: 'tasks',
  label: 'Tasks',
  labelSingular: 'Task',

  primaryKey: 'id',
  displayField: 'title',

  columns: [
    {
      key: 'title',
      header: 'Task',
      accessor: (t) => t.title,
      priority: 1,
      render: (t) => (
        <>
          <span style={t.status === 'DONE' ? { textDecoration: 'line-through' } : undefined}>{t.title}</span>
          <span className="adm-td-sub">
            {t.lead ? (
              <Link className="adm-link" href="/dashboard/pipeline">
                Lead: {t.lead.name}
              </Link>
            ) : t.user ? (
              `Account: ${t.user.name}`
            ) : (
              `Added by ${t.createdByName}`
            )}
          </span>
        </>
      )
    },
    { key: 'status', header: 'Status', accessor: (t) => t.status, type: 'status', priority: 1 },
    {
      key: 'dueAt',
      header: 'Due',
      accessor: (t) => t.dueAt,
      sortable: true,
      priority: 1,
      render: (t) =>
        t.dueAt ? (
          <span title={formatDateTime(t.dueAt)} style={isOverdue(t) ? { color: 'var(--error)' } : undefined}>
            {isOverdue(t) ? 'Overdue · ' : ''}
            {formatRelative(t.dueAt)}
          </span>
        ) : (
          <span className="adm-muted">No date</span>
        )
    },
    {
      key: 'assignee',
      header: 'Assigned to',
      accessor: (t) => t.assigneeName ?? 'Unassigned',
      priority: 2,
      render: (t) => t.assigneeName ?? <span className="adm-muted">Unassigned</span>
    }
  ],

  filters: [
    {
      key: 'status',
      label: 'Status',
      type: 'segmented',
      options: [
        { value: 'OPEN', label: 'Open' },
        { value: 'DONE', label: 'Done' }
      ]
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
    },
    {
      key: 'due',
      label: 'Due',
      type: 'select',
      secondary: true,
      options: [{ value: 'overdue', label: 'Overdue' }]
    }
  ],

  search: { placeholder: 'Search tasks…' },
  defaultSort: { field: 'dueAt', direction: 'asc' },

  rowActions: [
    {
      key: 'complete',
      label: 'Done',
      variant: 'primary',
      permission: 'crm.manage',
      disabledHint: 'Requires the Operations role',
      visible: (t) => t.status === 'OPEN',
      run: async (t, h) => {
        await sendJson('PATCH', `/crm/tasks/${t.id}`, { status: 'DONE' });
        h.toast('Task completed');
        h.refresh();
      }
    },
    {
      key: 'reopen',
      label: 'Reopen',
      permission: 'crm.manage',
      disabledHint: 'Requires the Operations role',
      visible: (t) => t.status === 'DONE',
      run: async (t, h) => {
        await sendJson('PATCH', `/crm/tasks/${t.id}`, { status: 'OPEN' });
        h.refresh();
      }
    },
    {
      key: 'take',
      label: 'Take',
      permission: 'crm.manage',
      disabledHint: 'Requires the Operations role',
      visible: (t) => t.status === 'OPEN' && !t.assigneeId,
      run: async (t, h) => {
        await sendJson('PATCH', `/crm/tasks/${t.id}`, { assignee: 'me' });
        h.refresh();
      }
    },
    {
      key: 'delete',
      label: 'Delete',
      variant: 'danger',
      permission: 'crm.manage',
      disabledHint: 'Requires the Operations role',
      confirm: { title: 'Delete this task?', body: 'It is removed permanently.', confirmLabel: 'Delete task' },
      run: async (t, h) => {
        await sendJson('DELETE', `/crm/tasks/${t.id}`);
        h.refresh();
      }
    }
  ],

  permissions: { read: 'crm.read', update: 'crm.manage' },
  data,
  emptyState: {
    title: 'No tasks',
    description: 'Follow-ups you add from a lead or an account show up here.'
  }
};
