import type { ResourceConfig } from '@/admin/resource/types';
import { createDataSource } from '@/admin/data/source';
import { sendJson } from '@/lib/post';
import { formatDateTime, formatNumber, formatRelative } from '@/admin/primitives/format';
import type { CampaignRow, SuppressionRow } from './types';

/**
 * Marketing email. Campaigns open in a page-owned modal (the editor needs form
 * state the engine does not model), so this config only describes the list.
 */

const campaignData = createDataSource<CampaignRow>({ path: '/marketing/campaigns' });

export const campaignsModule: ResourceConfig<CampaignRow> = {
  resource: 'campaigns',
  label: 'Campaigns',
  labelSingular: 'Campaign',

  primaryKey: 'id',
  displayField: 'name',

  columns: [
    {
      key: 'name',
      header: 'Campaign',
      accessor: (c) => c.name,
      priority: 1,
      sortable: true,
      render: (c) => (
        <>
          {c.name}
          <span className="adm-td-sub">{c.subject}</span>
        </>
      )
    },
    { key: 'status', header: 'Status', accessor: (c) => c.status, type: 'status', priority: 1 },
    {
      key: 'audience',
      header: 'Audience',
      accessor: (c) => c.segment?.name ?? '—',
      priority: 2,
      render: (c) =>
        c.segment ? (
          <>
            {c.segment.name}
            {c.status !== 'DRAFT' && <span className="adm-td-sub">{formatNumber(c.audienceSize)} recipients</span>}
          </>
        ) : (
          <span className="adm-muted">Not chosen</span>
        )
    },
    {
      key: 'delivery',
      header: 'Delivered',
      accessor: (c) => c.sentCount,
      priority: 2,
      render: (c) =>
        c.status === 'DRAFT' ? (
          <span className="adm-muted">—</span>
        ) : (
          <>
            {formatNumber(c.sentCount)} / {formatNumber(c.audienceSize)}
            {c.failedCount > 0 && (
              <span className="adm-td-sub" style={{ color: 'var(--error)' }}>
                {formatNumber(c.failedCount)} failed
              </span>
            )}
          </>
        )
    },
    {
      key: 'createdAt',
      header: 'Created',
      accessor: (c) => c.createdAt,
      type: 'relative-date',
      sortable: true,
      priority: 3,
      render: (c) => <span title={formatDateTime(c.createdAt)}>{formatRelative(c.createdAt)}</span>
    }
  ],

  filters: [
    {
      key: 'status',
      label: 'Status',
      type: 'segmented',
      options: [
        { value: 'DRAFT', label: 'Draft' },
        { value: 'SENDING', label: 'Sending' },
        { value: 'SENT', label: 'Sent' },
        { value: 'CANCELLED', label: 'Cancelled' }
      ]
    }
  ],

  search: { placeholder: 'Search campaigns…' },
  defaultSort: { field: 'createdAt', direction: 'desc' },
  permissions: { read: 'marketing.read', update: 'marketing.manage' },
  data: campaignData,
  emptyState: {
    title: 'No campaigns yet',
    description: 'Draft an email, pick who should get it, and send. Recipients can always unsubscribe.'
  }
};

/* ------------------------------------------------------------ suppression --- */

const suppressionData = createDataSource<SuppressionRow>({ path: '/marketing/suppressions' });

export const suppressionsModule: ResourceConfig<SuppressionRow> = {
  resource: 'suppressions',
  label: 'Suppressed addresses',
  labelSingular: 'Address',

  primaryKey: 'email',
  displayField: 'email',

  columns: [
    { key: 'email', header: 'Email', accessor: (s) => s.email, sortable: true, priority: 1 },
    { key: 'reason', header: 'Reason', accessor: (s) => s.reason, priority: 2 },
    {
      key: 'createdAt',
      header: 'Added',
      accessor: (s) => s.createdAt,
      type: 'relative-date',
      sortable: true,
      priority: 2,
      render: (s) => <span title={formatDateTime(s.createdAt)}>{formatRelative(s.createdAt)}</span>
    }
  ],

  search: { placeholder: 'Search email…' },
  defaultSort: { field: 'createdAt', direction: 'desc' },

  rowActions: [
    {
      key: 'remove',
      label: 'Re-subscribe',
      variant: 'danger',
      permission: 'marketing.unsuppress',
      disabledHint: 'Requires the Super admin role',
      confirm: {
        title: 'Remove from the suppression list?',
        body: 'This address opted out (or was blocked) and will receive marketing email again. Only do this if they have asked to be re-subscribed.',
        confirmLabel: 'Re-subscribe'
      },
      run: async (s, h) => {
        await sendJson('DELETE', `/marketing/suppressions/${encodeURIComponent(s.email)}`);
        h.toast(`${s.email} removed`);
        h.refresh();
      }
    }
  ],

  permissions: { read: 'marketing.read', delete: 'marketing.unsuppress' },
  data: suppressionData,
  emptyState: {
    title: 'Nobody is suppressed',
    description: 'Addresses appear here when someone unsubscribes or you add them manually.'
  }
};
