import type { ResourceConfig } from '@/admin/resource/types';
import { createDataSource } from '@/admin/data/source';
import { formatDateTime, formatNumber, formatRelative } from '@/admin/primitives/format';
import { redactContext } from '@/admin/primitives/redact';
import type { ErrorLogRow } from './types';

/*
 * TODO(admin-os): backend not implemented. Endpoints this module expects:
 *
 *   GET   /api/admin/error-logs?page&limit&q&sort&dir&category&severity&resolved
 *         -> { data: ErrorLogRow[], pagination: { total, page, limit, pages } }
 *   PATCH /api/admin/error-logs/:id        body { resolved: boolean }
 *         -> { errorLog: ErrorLogRow }
 *
 *   authz errors.read -> requireAdmin; errors.resolve -> requireOperations
 *
 * DATA SOURCE — gas-monitor-backend currently persists nothing. Errors go to
 * Sentry via captureException, and src/routes/internalSentryWebhook.ts forwards
 * issue alerts to Telegram without storing them. The cheapest honest path to
 * real data is to extend that existing webhook to also INSERT an ErrorLog row.
 * Do not query the Sentry API from the browser — it needs a privileged token.
 *
 * REDACTION — request context routinely carries authorization headers, cookies
 * and request bodies. redactContext() masks credential-shaped values here as a
 * last line of defence, but the SERVER must redact at capture time. The
 * dashboard is the wrong place to be the only guard.
 */

const data = createDataSource<ErrorLogRow>({
  path: '/error-logs',
  singleKey: 'errorLog',
  supports: { update: true }
});

export const errorLogsData = data;

export const errorLogsModule: ResourceConfig<ErrorLogRow> = {
  resource: 'errors',
  label: 'Error logs',
  labelSingular: 'Error',

  primaryKey: 'id',
  displayField: 'message',

  columns: [
    {
      key: 'message',
      header: 'Error',
      accessor: (e) => e.message,
      priority: 1,
      render: (e) => (
        <>
          {e.message}
          {(e.path || e.source) && (
            <span className="adm-td-sub">
              {e.method ? `${e.method} ` : ''}
              {e.path ?? e.source}
            </span>
          )}
        </>
      )
    },
    { key: 'category', header: 'Category', accessor: (e) => e.category, type: 'status', priority: 1 },
    { key: 'severity', header: 'Severity', accessor: (e) => e.severity, type: 'status', priority: 1 },
    {
      key: 'ipAddress',
      header: 'Source IP',
      accessor: (e) => e.ipAddress,
      priority: 2,
      render: (e) =>
        e.ipAddress ? (
          <span style={{ fontFamily: 'var(--font-mono)' }}>{e.ipAddress}</span>
        ) : (
          <span className="adm-muted">—</span>
        )
    },
    {
      key: 'occurrences',
      header: 'Count',
      accessor: (e) => e.occurrences,
      type: 'number',
      sortable: true,
      priority: 1
    },
    {
      key: 'resolved',
      header: 'State',
      accessor: (e) => (e.resolved ? 'RESOLVED' : 'UNRESOLVED'),
      type: 'status',
      priority: 2
    },
    {
      key: 'createdAt',
      header: 'Last seen',
      accessor: (e) => e.createdAt,
      type: 'relative-date',
      sortable: true,
      priority: 1,
      render: (e) => <span title={formatDateTime(e.createdAt)}>{formatRelative(e.createdAt)}</span>
    }
  ],

  filters: [
    {
      key: 'category',
      label: 'Category',
      type: 'segmented',
      options: [
        { value: 'ATTACK', label: 'Attack' },
        { value: 'SYSTEM_RISK', label: 'System risk' },
        { value: 'SERVER_ERROR', label: 'Server' },
        { value: 'USER_ERROR', label: 'User' }
      ]
    },
    {
      key: 'severity',
      label: 'Severity',
      type: 'select',
      secondary: true,
      options: [
        { value: 'CRITICAL', label: 'Critical' },
        { value: 'HIGH', label: 'High' },
        { value: 'MEDIUM', label: 'Medium' },
        { value: 'LOW', label: 'Low' }
      ]
    },
    {
      key: 'resolved',
      label: 'State',
      type: 'select',
      secondary: true,
      options: [
        { value: 'false', label: 'Unresolved' },
        { value: 'true', label: 'Resolved' }
      ]
    }
  ],

  search: { placeholder: 'Search message, path or source IP…' },
  defaultSort: { field: 'createdAt', direction: 'desc' },
  defaultPageSize: 50,

  rowActions: [
    {
      key: 'resolve',
      label: 'Resolve',
      variant: 'primary',
      permission: 'errors.resolve',
      disabledHint: 'Requires the Operations role',
      visible: (e) => !e.resolved,
      run: async (log, h) => {
        await data.update!(log.id, { resolved: true });
        h.toast('Marked resolved');
        h.refresh();
      }
    },
    {
      key: 'reopen',
      label: 'Reopen',
      permission: 'errors.resolve',
      disabledHint: 'Requires the Operations role',
      visible: (e) => e.resolved,
      run: async (log, h) => {
        await data.update!(log.id, { resolved: false });
        h.toast('Reopened');
        h.refresh();
      }
    }
  ],

  detail: {
    title: (e) => e.message,
    subtitle: (e) => `${e.category} · ${e.severity} · ${formatDateTime(e.createdAt)}`,
    statusField: 'severity',
    sections: [
      {
        title: 'Error',
        fields: [
          { key: 'message', label: 'Message', accessor: (e) => e.message, full: true },
          { key: 'category', label: 'Category', accessor: (e) => e.category, type: 'status' },
          { key: 'severity', label: 'Severity', accessor: (e) => e.severity, type: 'status' },
          { key: 'occurrences', label: 'Occurrences', accessor: (e) => formatNumber(e.occurrences) },
          {
            key: 'resolved',
            label: 'State',
            accessor: (e) => (e.resolved ? 'RESOLVED' : 'UNRESOLVED'),
            type: 'status'
          },
          { key: 'lastSeen', label: 'Last seen', accessor: (e) => e.createdAt, type: 'date' },
          {
            key: 'escalatedAt',
            label: 'Escalated',
            accessor: (e) => e.escalatedAt,
            render: (e) =>
              e.escalatedAt ? formatDateTime(e.escalatedAt) : <span className="adm-muted">Not escalated</span>
          }
        ]
      },
      {
        title: 'Request',
        fields: [
          { key: 'source', label: 'Source', accessor: (e) => e.source },
          { key: 'method', label: 'Method', accessor: (e) => e.method },
          { key: 'path', label: 'Path', accessor: (e) => e.path, full: true },
          { key: 'statusCode', label: 'Status', accessor: (e) => e.statusCode, type: 'number' },
          { key: 'ipAddress', label: 'Source IP', accessor: (e) => e.ipAddress },
          { key: 'userId', label: 'User', accessor: (e) => e.userId }
        ]
      }
    ],
    // Stack traces and request context are attacker-influenced text. Rendered as
    // escaped, pre-formatted content inside a disclosure — never as HTML.
    extra: (e) => (
      <>
        {e.stack && (
          <section className="adm-detail-section">
            <h3 className="adm-micro-label">Stack trace</h3>
            <details className="adm-state-details">
              <summary>Show stack trace</summary>
              <pre>{e.stack}</pre>
            </details>
          </section>
        )}
        {e.context && (
          <section className="adm-detail-section">
            <h3 className="adm-micro-label">Request context</h3>
            <p className="adm-field-help">
              Credential-shaped values are masked here. The server should also be redacting at
              capture time.
            </p>
            <div className="adm-audit-meta">
              <pre>{JSON.stringify(redactContext(e.context), null, 2)}</pre>
            </div>
          </section>
        )}
      </>
    )
  },

  permissions: {
    read: 'errors.read',
    update: 'errors.resolve',
    resolve: 'errors.resolve'
  },

  data,

  emptyState: {
    title: 'No errors recorded',
    description: 'Captured errors and suspected attacks appear here once the backend records them.'
  }
};
