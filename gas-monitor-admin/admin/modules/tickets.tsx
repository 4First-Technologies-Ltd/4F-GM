import type { ResourceConfig } from '@/admin/resource/types';
import { createDataSource } from '@/admin/data/source';
import { formatDateTime, formatRelative, humaniseEnum } from '@/admin/primitives/format';
import { StatusBadge } from '@/admin/primitives/status-badge';
import type { TicketRow } from './types';

/**
 * Support inbox — customer, vendor and rider enquiries. The list lives here;
 * the conversation itself is its own page (`/dashboard/support/[id]`) because a
 * thread needs room a drawer cannot give it.
 */

const data = createDataSource<TicketRow>({
  path: '/support',
  singleKey: 'ticket',
  supports: { get: true, update: true }
});

const isActive = (t: TicketRow) => t.status === 'OPEN' || t.status === 'PENDING';

/** True when nobody has answered yet and the first-response deadline has passed. */
export const isSlaBreached = (t: TicketRow, now = Date.now()) =>
  isActive(t) && !t.firstResponseAt && new Date(t.slaDueAt).getTime() < now;

export const ticketsModule: ResourceConfig<TicketRow> = {
  resource: 'tickets',
  label: 'Tickets',
  labelSingular: 'Ticket',

  primaryKey: 'id',
  displayField: 'subject',

  columns: [
    {
      key: 'subject',
      header: 'Ticket',
      accessor: (t) => t.subject,
      priority: 1,
      render: (t) => (
        <>
          <span className="adm-muted">#{t.number}</span> {t.subject}
          <span className="adm-td-sub">
            {t.requesterName} · {humaniseEnum(t.category)}
          </span>
        </>
      )
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (t) => t.status,
      priority: 1,
      render: (t) => (
        <>
          <StatusBadge value={t.status} />
          {isSlaBreached(t) && (
            <span className="adm-td-sub" style={{ color: 'var(--error)' }}>
              First reply overdue
            </span>
          )}
        </>
      )
    },
    { key: 'priority', header: 'Priority', accessor: (t) => t.priority, type: 'status', sortable: true, priority: 2 },
    {
      key: 'assignee',
      header: 'Assigned to',
      accessor: (t) => t.assigneeName ?? 'Unassigned',
      priority: 3,
      render: (t) => (t.assigneeName ? t.assigneeName : <span className="adm-muted">Unassigned</span>)
    },
    {
      key: 'lastMessageAt',
      header: 'Last activity',
      accessor: (t) => t.lastMessageAt,
      type: 'relative-date',
      sortable: true,
      priority: 2,
      render: (t) => <span title={formatDateTime(t.lastMessageAt)}>{formatRelative(t.lastMessageAt)}</span>
    }
  ],

  filters: [
    {
      key: 'status',
      label: 'Status',
      type: 'segmented',
      options: [
        { value: 'active', label: 'Active' },
        { value: 'OPEN', label: 'Open' },
        { value: 'PENDING', label: 'Waiting on customer' },
        { value: 'RESOLVED', label: 'Resolved' },
        { value: 'CLOSED', label: 'Closed' }
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
      key: 'priority',
      label: 'Priority',
      type: 'select',
      secondary: true,
      options: ['URGENT', 'HIGH', 'NORMAL', 'LOW'].map((v) => ({ value: v, label: humaniseEnum(v) }))
    },
    {
      key: 'category',
      label: 'Category',
      type: 'select',
      secondary: true,
      options: ['ORDER', 'PAYMENT', 'DELIVERY', 'ACCOUNT', 'VENDOR', 'DEVICE', 'OTHER'].map((v) => ({
        value: v,
        label: humaniseEnum(v)
      }))
    },
    {
      key: 'sla',
      label: 'SLA',
      type: 'select',
      secondary: true,
      options: [{ value: 'breached', label: 'First reply overdue' }]
    }
  ],

  search: { placeholder: 'Search subject, requester or #number…' },
  defaultSort: { field: 'lastMessageAt', direction: 'desc' },
  rowHref: (t) => `/dashboard/support/${t.id}`,

  permissions: { read: 'support.read', update: 'support.reply' },
  data,
  emptyState: {
    title: 'The inbox is clear',
    description: 'Messages from the website contact form and tickets you log by hand appear here.'
  }
};
