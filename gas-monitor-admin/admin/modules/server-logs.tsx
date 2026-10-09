import type { ResourceConfig } from '@/admin/resource/types';
import { createDataSource } from '@/admin/data/source';
import { formatDateTime, formatRelative } from '@/admin/primitives/format';
import type { ServerLogRow } from './types';

/**
 * Server logs — warnings and errors captured from the API process (redacted,
 * kept 14 days). Read-only and super-admin only: stack traces and paths expose
 * internals no other role needs.
 */

const data = createDataSource<ServerLogRow>({ path: '/logs' });

export const serverLogsModule: ResourceConfig<ServerLogRow> = {
  resource: 'server-logs',
  label: 'Log entries',
  labelSingular: 'Log entry',

  primaryKey: 'id',
  displayField: 'message',

  columns: [
    {
      key: 'createdAt',
      header: 'Time',
      accessor: (l) => l.createdAt,
      sortable: true,
      priority: 1,
      render: (l) => (
        <>
          <span title={formatDateTime(l.createdAt)}>{formatRelative(l.createdAt)}</span>
          <span className="adm-td-sub">{formatDateTime(l.createdAt)}</span>
        </>
      )
    },
    { key: 'level', header: 'Level', accessor: (l) => l.level, type: 'status', sortable: true, priority: 1 },
    {
      key: 'message',
      header: 'Message',
      accessor: (l) => l.message,
      priority: 1,
      render: (l) => (
        <>
          <span style={{ overflowWrap: 'anywhere' }}>{l.message.length > 160 ? `${l.message.slice(0, 160)}…` : l.message}</span>
          {l.path && (
            <span className="adm-td-sub">
              {l.method} {l.path}
              {l.statusCode ? ` → ${l.statusCode}` : ''}
            </span>
          )}
        </>
      )
    },
    { key: 'source', header: 'Source', accessor: (l) => l.source, priority: 3 }
  ],

  filters: [
    {
      key: 'level',
      label: 'Level',
      type: 'segmented',
      options: [
        { value: 'ERROR', label: 'Errors' },
        { value: 'WARN', label: 'Warnings' }
      ]
    },
    {
      key: 'range',
      label: 'Time',
      type: 'select',
      options: [
        { value: '1h', label: 'Last hour' },
        { value: '24h', label: 'Last 24 hours' },
        { value: '7d', label: 'Last 7 days' }
      ]
    },
    {
      key: 'source',
      label: 'Source',
      type: 'select',
      secondary: true,
      options: [
        { value: 'http', label: 'Failed requests' },
        { value: 'console', label: 'Console output' }
      ]
    }
  ],

  search: { placeholder: 'Search message, path or stack…' },
  defaultSort: { field: 'createdAt', direction: 'desc' },
  defaultPageSize: 50,

  detail: {
    title: (l) => (l.message.length > 80 ? `${l.message.slice(0, 80)}…` : l.message),
    subtitle: (l) => formatDateTime(l.createdAt),
    statusField: 'level',
    sections: [
      {
        title: 'Entry',
        fields: [
          { key: 'time', label: 'Time', accessor: (l) => l.createdAt, type: 'date' },
          { key: 'source', label: 'Source', accessor: (l) => l.source },
          { key: 'request', label: 'Request', accessor: (l) => (l.path ? `${l.method} ${l.path}` : null) },
          { key: 'status', label: 'Status code', accessor: (l) => l.statusCode },
          { key: 'message', label: 'Message', accessor: (l) => l.message, full: true }
        ]
      }
    ],
    extra: (l) =>
      l.stack ? (
        <section className="adm-detail-section">
          <h3 className="adm-micro-label">Stack trace</h3>
          <pre
            style={{
              margin: 0,
              padding: 'var(--space-3)',
              background: 'var(--surface-2)',
              borderRadius: 8,
              fontSize: 12,
              overflowX: 'auto',
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere'
            }}
          >
            {l.stack}
          </pre>
        </section>
      ) : null
  },

  permissions: { read: 'logs.read' },
  data,
  readOnly: true,
  emptyState: {
    title: 'No log entries match',
    description: 'Warnings and errors from the API appear here. Nothing in this window is good news.'
  }
};
