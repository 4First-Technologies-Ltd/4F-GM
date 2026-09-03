import type { ResourceConfig } from '@/admin/resource/types';
import { createDataSource } from '@/admin/data/source';
import { formatDateTime, formatNaira, formatRelative, shortId } from '@/admin/primitives/format';
import { StatusBadge } from '@/admin/primitives/status-badge';
import type { OrderRow } from './types';

/**
 * Orders — READ-ONLY.
 *
 * No status-transition endpoint exists: order state is driven by the consumer
 * and vendor flows and by the Paystack webhook. The previous admin displayed no
 * write affordance either; this makes the constraint explicit via `readOnly`
 * rather than leaving it implied.
 *
 * Payment state is surfaced here because there is no Payment entity — Paystack
 * fields live on Order.
 */

const data = createDataSource<OrderRow>({
  path: '/orders',
  singleKey: 'order',
  supports: { get: true }
});

export const ordersModule: ResourceConfig<OrderRow> = {
  resource: 'orders',
  label: 'Orders',
  labelSingular: 'Order',
  readOnly: true,

  primaryKey: 'id',
  displayField: 'id',

  columns: [
    {
      key: 'id',
      header: 'Order',
      accessor: (o) => o.id,
      priority: 1,
      render: (o) => (
        <>
          <span style={{ fontFamily: 'var(--font-mono)' }}>{shortId(o.id)}</span>
          <span className="adm-td-sub">{o.consumer.name}</span>
        </>
      )
    },
    { key: 'status', header: 'Status', accessor: (o) => o.status, type: 'status', sortable: true, priority: 1 },
    {
      key: 'vendor',
      header: 'Vendor',
      accessor: (o) => o.vendor?.businessName ?? o.supplierName,
      priority: 2
    },
    { key: 'cylinderSize', header: 'Size', accessor: (o) => o.cylinderSize, priority: 3 },
    { key: 'quantity', header: 'Qty', accessor: (o) => o.quantity, type: 'number', priority: 3 },
    {
      key: 'totalAmount',
      header: 'Total',
      accessor: (o) => o.totalAmount,
      type: 'currency',
      sortable: true,
      priority: 1
    },
    {
      key: 'payment',
      header: 'Payment',
      accessor: (o) => o.paystackStatus,
      priority: 3,
      render: (o) =>
        o.paystackStatus ? (
          <StatusBadge value={o.paystackStatus.toUpperCase()} />
        ) : (
          <span className="adm-muted">—</span>
        )
    },
    {
      key: 'createdAt',
      header: 'Placed',
      accessor: (o) => o.createdAt,
      type: 'relative-date',
      sortable: true,
      priority: 2,
      render: (o) => <span title={formatDateTime(o.createdAt)}>{formatRelative(o.createdAt)}</span>
    }
  ],

  filters: [
    {
      key: 'status',
      label: 'Status',
      type: 'segmented',
      options: [
        { value: 'PENDING', label: 'Pending' },
        { value: 'CONFIRMED', label: 'Confirmed' },
        { value: 'DELIVERED', label: 'Delivered' },
        { value: 'CANCELLED', label: 'Cancelled' }
      ]
    }
  ],

  search: { placeholder: 'Search by ref, customer, vendor or address…' },
  defaultSort: { field: 'createdAt', direction: 'desc' },

  detail: {
    title: (o) => `Order ${shortId(o.id)}`,
    subtitle: (o) => `${o.consumer.name} · ${formatNaira(o.totalAmount)}`,
    statusField: 'status',
    sections: [
      {
        title: 'Order',
        fields: [
          { key: 'id', label: 'Full ID', accessor: (o) => o.id, full: true },
          { key: 'size', label: 'Cylinder size', accessor: (o) => o.cylinderSize },
          { key: 'qty', label: 'Quantity', accessor: (o) => o.quantity, type: 'number' },
          { key: 'total', label: 'Total', accessor: (o) => o.totalAmount, type: 'currency' },
          { key: 'placed', label: 'Placed', accessor: (o) => o.createdAt, type: 'date' },
          { key: 'address', label: 'Delivery address', accessor: (o) => o.deliveryAddress, full: true }
        ]
      },
      {
        title: 'Parties',
        fields: [
          { key: 'customer', label: 'Customer', accessor: (o) => o.consumer.name },
          { key: 'customerEmail', label: 'Customer email', accessor: (o) => o.consumer.email },
          {
            key: 'vendorName',
            label: 'Vendor',
            accessor: (o) => o.vendor?.businessName ?? o.supplierName
          }
        ]
      },
      {
        title: 'Payment',
        fields: [
          { key: 'paystackRef', label: 'Paystack reference', accessor: (o) => o.paystackRef, full: true },
          {
            key: 'paystackStatus',
            label: 'Paystack status',
            accessor: (o) => (o.paystackStatus ? o.paystackStatus.toUpperCase() : null),
            type: 'status'
          }
        ]
      }
    ]
  },

  permissions: { read: 'orders.read' },

  data,

  emptyState: {
    title: 'No orders yet',
    description: 'Orders appear here as customers place them in the consumer app.'
  }
};
