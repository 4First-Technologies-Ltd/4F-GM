import type { ResourceConfig } from '@/admin/resource/types';
import { createDataSource } from '@/admin/data/source';
import { sendJson } from '@/lib/post';
import { formatDateTime, formatNaira, formatRelative } from '@/admin/primitives/format';
import type { EarningRow, PayoutRow } from './types';

/**
 * Payouts — transfers of vendor earnings, sent through Paystack. Initiating a
 * payout happens from the Balances tab (it needs a vendor, not a row); this
 * module covers the history and the recovery actions on a stuck payout.
 */

const payoutData = createDataSource<PayoutRow>({
  path: '/payouts',
  singleKey: 'payout',
  supports: { get: true }
});

/** FAILED, or PENDING after a timeout: the cases an operator has to resolve. */
const needsRecovery = (p: PayoutRow) => p.status === 'FAILED' || p.status === 'PENDING';

export const payoutsModule: ResourceConfig<PayoutRow> = {
  resource: 'payouts',
  label: 'Payouts',
  labelSingular: 'Payout',

  primaryKey: 'id',
  displayField: 'reference',

  columns: [
    {
      key: 'vendor',
      header: 'Vendor',
      accessor: (p) => p.vendor.businessName,
      priority: 1,
      render: (p) => (
        <>
          {p.vendor.businessName}
          <span className="adm-td-sub">
            {p.bankName} ••{p.accountNumber.slice(-4)}
          </span>
        </>
      )
    },
    { key: 'amount', header: 'Amount', accessor: (p) => p.amount, type: 'currency', sortable: true, priority: 1 },
    { key: 'status', header: 'Status', accessor: (p) => p.status, type: 'status', sortable: true, priority: 1 },
    { key: 'orders', header: 'Orders', accessor: (p) => p._count?.earnings ?? 0, type: 'number', priority: 3 },
    { key: 'initiatedBy', header: 'Sent by', accessor: (p) => p.initiatedByName, priority: 3 },
    {
      key: 'createdAt',
      header: 'Created',
      accessor: (p) => p.createdAt,
      type: 'relative-date',
      sortable: true,
      priority: 2,
      render: (p) => <span title={formatDateTime(p.createdAt)}>{formatRelative(p.createdAt)}</span>
    }
  ],

  filters: [
    {
      key: 'status',
      label: 'Status',
      type: 'segmented',
      options: [
        { value: 'PROCESSING', label: 'Processing' },
        { value: 'FAILED', label: 'Failed' },
        { value: 'PENDING', label: 'Pending' },
        { value: 'PAID', label: 'Paid' },
        { value: 'CANCELLED', label: 'Cancelled' }
      ]
    }
  ],

  search: { placeholder: 'Search vendor, account name or reference…' },
  defaultSort: { field: 'createdAt', direction: 'desc' },

  rowActions: [
    {
      key: 'retry',
      label: 'Retry',
      variant: 'primary',
      permission: 'payouts.manage',
      disabledHint: 'Requires the Operations role',
      visible: needsRecovery,
      run: async (p, h) => {
        const { payout } = await sendJson<{ payout: PayoutRow }>('POST', `/payouts/${p.id}/retry`);
        if (payout.status === 'FAILED') {
          h.toast(`Still failing: ${payout.failureReason ?? 'see payout'}`, 'error');
        } else {
          h.toast(`Payout ${payout.status.toLowerCase()}`);
        }
        h.refresh();
      }
    },
    {
      key: 'cancel',
      label: 'Cancel',
      variant: 'danger',
      permission: 'payouts.manage',
      disabledHint: 'Requires the Operations role',
      visible: needsRecovery,
      confirm: {
        title: 'Cancel this payout?',
        body: 'The earnings in it return to the vendor’s available balance so a new payout can be made. If Paystack already holds this transfer it is synced instead of cancelled.',
        confirmLabel: 'Cancel payout'
      },
      run: async (p, h) => {
        await sendJson('POST', `/payouts/${p.id}/cancel`);
        h.toast('Payout cancelled — earnings released');
        h.refresh();
      }
    },
    {
      key: 'mark-paid',
      label: 'Mark paid',
      permission: 'payouts.markPaid',
      disabledHint: 'Requires the Super admin role',
      visible: needsRecovery,
      confirm: {
        title: 'Mark as paid outside Paystack?',
        body: 'Only do this if the vendor has already been paid by another route. It settles the earnings and cannot be undone. Recorded in the audit log.',
        confirmLabel: 'Mark as paid'
      },
      run: async (p, h) => {
        await sendJson('POST', `/payouts/${p.id}/mark-paid`, { note: 'Paid manually (marked from admin panel)' });
        h.toast('Marked as paid');
        h.refresh();
      }
    }
  ],

  detail: {
    title: (p) => `${formatNaira(p.amount)} to ${p.vendor.businessName}`,
    subtitle: (p) => p.reference,
    statusField: 'status',
    sections: [
      {
        title: 'Transfer',
        fields: [
          { key: 'amount', label: 'Amount', accessor: (p) => p.amount, type: 'currency' },
          { key: 'sentBy', label: 'Initiated by', accessor: (p) => p.initiatedByName },
          { key: 'created', label: 'Created', accessor: (p) => p.createdAt, type: 'date' },
          { key: 'paidAt', label: 'Paid', accessor: (p) => p.paidAt, type: 'date' },
          { key: 'code', label: 'Paystack transfer', accessor: (p) => p.paystackTransferCode },
          { key: 'ref', label: 'Reference', accessor: (p) => p.reference, full: true },
          { key: 'failure', label: 'Failure reason', accessor: (p) => p.failureReason, full: true }
        ]
      },
      {
        title: 'Destination (snapshot at payout time)',
        fields: [
          { key: 'bank', label: 'Bank', accessor: (p) => p.bankName },
          { key: 'acct', label: 'Account number', accessor: (p) => p.accountNumber },
          { key: 'name', label: 'Account name', accessor: (p) => p.accountName }
        ]
      }
    ],
    extra: (p) => (
      <section className="adm-detail-section">
        <h3 className="adm-micro-label">Orders in this payout</h3>
        <p className="adm-muted">
          {p._count?.earnings ?? 0} delivered order{p._count?.earnings === 1 ? '' : 's'}. Filter the Earnings tab by
          vendor to see each one.
        </p>
      </section>
    )
  },

  permissions: { read: 'payouts.read', update: 'payouts.manage', markPaid: 'payouts.markPaid' },
  data: payoutData,
  emptyState: {
    title: 'No payouts yet',
    description: 'Payouts appear once a vendor with delivered orders is paid from the Balances tab.'
  }
};

/* --------------------------------------------------------------- earnings --- */

const earningData = createDataSource<EarningRow>({ path: '/payouts/earnings' });

export const earningsModule: ResourceConfig<EarningRow> = {
  resource: 'earnings',
  label: 'Earnings',
  labelSingular: 'Earning',

  primaryKey: 'id',
  displayField: 'orderId',

  columns: [
    {
      key: 'vendor',
      header: 'Vendor',
      accessor: (e) => e.vendor.businessName,
      priority: 1,
      render: (e) => (
        <>
          {e.vendor.businessName}
          <span className="adm-td-sub">Order {e.orderId.slice(0, 8)}</span>
        </>
      )
    },
    {
      key: 'gross',
      header: 'Order total',
      accessor: (e) => e.grossAmount,
      type: 'currency',
      sortable: true,
      sortField: 'grossAmount',
      priority: 2
    },
    {
      key: 'commission',
      header: 'Commission',
      accessor: (e) => e.commissionAmount,
      priority: 2,
      render: (e) => (
        <>
          {formatNaira(e.commissionAmount)}
          <span className="adm-td-sub">{e.commissionPercent}%</span>
        </>
      )
    },
    {
      key: 'net',
      header: 'Vendor earns',
      accessor: (e) => e.netAmount,
      type: 'currency',
      sortable: true,
      sortField: 'netAmount',
      priority: 1
    },
    { key: 'status', header: 'Status', accessor: (e) => e.status, type: 'status', priority: 1 },
    {
      key: 'createdAt',
      header: 'Delivered',
      accessor: (e) => e.createdAt,
      type: 'relative-date',
      sortable: true,
      priority: 3,
      render: (e) => <span title={formatDateTime(e.createdAt)}>{formatRelative(e.createdAt)}</span>
    }
  ],

  filters: [
    {
      key: 'status',
      label: 'Status',
      type: 'segmented',
      options: [
        { value: 'AVAILABLE', label: 'Available' },
        { value: 'IN_PAYOUT', label: 'In payout' },
        { value: 'PAID', label: 'Paid' }
      ]
    }
  ],

  search: { placeholder: 'Search vendor or order id…' },
  defaultSort: { field: 'createdAt', direction: 'desc' },
  permissions: { read: 'payouts.read' },
  data: earningData,
  readOnly: true,
  emptyState: {
    title: 'No earnings recorded',
    description: 'An earning is created when a marketplace order is delivered. Use “Sync earnings” to backfill older orders.'
  }
};
