import type { ResourceConfig } from '@/admin/resource/types';
import { createDataSource } from '@/admin/data/source';
import { formatDateTime, formatRelative, humaniseEnum } from '@/admin/primitives/format';
import { StatusBadge } from '@/admin/primitives/status-badge';
import type { ListingRow } from './types';

/**
 * Listings (GasListing) — the catalog.
 *
 * Reduced mode: the API exposes only a stock toggle. There is no create, edit,
 * or delete endpoint for listings — vendors manage their own catalog in the
 * vendor app — so those actions are not offered.
 */

const data = createDataSource<ListingRow>({
  path: '/listings',
  singleKey: 'listing',
  supports: { get: true, update: true }
});

function listingName(l: ListingRow): string {
  return l.customName?.trim() || humaniseEnum(l.gasType);
}

export const listingsModule: ResourceConfig<ListingRow> = {
  resource: 'listings',
  label: 'Listings',
  labelSingular: 'Listing',

  primaryKey: 'id',
  displayField: 'customName',

  columns: [
    {
      key: 'name',
      header: 'Listing',
      accessor: (l) => listingName(l),
      priority: 1,
      render: (l) => (
        <>
          {listingName(l)}
          <span className="adm-td-sub">{l.vendor.businessName}</span>
        </>
      )
    },
    { key: 'gasType', header: 'Type', accessor: (l) => l.gasType, type: 'status', sortable: true, priority: 2 },
    {
      key: 'inStock',
      header: 'Stock',
      accessor: (l) => (l.inStock ? 'IN_STOCK' : 'OUT_OF_STOCK'),
      type: 'status',
      priority: 1
    },
    {
      key: 'pricePerKg',
      header: 'Price / kg',
      accessor: (l) => l.pricePerKg,
      type: 'currency',
      sortable: true,
      priority: 1
    },
    {
      key: 'sizes',
      header: 'Sizes',
      accessor: (l) => (l.cylinderSizes.length ? l.cylinderSizes.join(', ') : l.otherSizes),
      priority: 3
    },
    { key: 'orders', header: 'Orders', accessor: (l) => l._count.orders, type: 'number', priority: 2 },
    {
      key: 'createdAt',
      header: 'Added',
      accessor: (l) => l.createdAt,
      type: 'relative-date',
      sortable: true,
      priority: 3,
      render: (l) => <span title={formatDateTime(l.createdAt)}>{formatRelative(l.createdAt)}</span>
    }
  ],

  filters: [
    {
      key: 'inStock',
      label: 'Stock',
      type: 'segmented',
      options: [
        { value: 'true', label: 'In stock' },
        { value: 'false', label: 'Out of stock' }
      ]
    },
    {
      key: 'gasType',
      label: 'Gas type',
      type: 'select',
      secondary: true,
      options: [
        { value: 'COOKING', label: 'Cooking' },
        { value: 'MEDICAL', label: 'Medical' },
        { value: 'INDUSTRIAL', label: 'Industrial' },
        { value: 'BULK', label: 'Bulk' },
        { value: 'OTHER', label: 'Other' }
      ]
    }
  ],

  search: { placeholder: 'Search listing or vendor…' },
  defaultSort: { field: 'createdAt', direction: 'desc' },

  rowActions: [
    {
      key: 'toggle-stock',
      label: 'Mark out of stock',
      permission: 'listings.update',
      disabledHint: 'Requires the Operations role',
      visible: (l) => l.inStock,
      run: async (listing, h) => {
        await data.update!(listing.id, { inStock: false });
        h.toast(`${listingName(listing)} marked out of stock`);
        h.refresh();
      }
    },
    {
      key: 'restock',
      label: 'Mark in stock',
      variant: 'primary',
      permission: 'listings.update',
      disabledHint: 'Requires the Operations role',
      visible: (l) => !l.inStock,
      run: async (listing, h) => {
        await data.update!(listing.id, { inStock: true });
        h.toast(`${listingName(listing)} marked in stock`);
        h.refresh();
      }
    }
  ],

  detail: {
    title: (l) => listingName(l),
    subtitle: (l) => l.vendor.businessName,
    sections: [
      {
        title: 'Listing',
        fields: [
          { key: 'name', label: 'Name', accessor: (l) => listingName(l) },
          { key: 'gasType', label: 'Gas type', accessor: (l) => l.gasType, type: 'status' },
          { key: 'price', label: 'Price per kg', accessor: (l) => l.pricePerKg, type: 'currency' },
          {
            key: 'stock',
            label: 'Stock',
            accessor: (l) => (l.inStock ? 'IN_STOCK' : 'OUT_OF_STOCK'),
            type: 'status'
          },
          {
            key: 'sizes',
            label: 'Cylinder sizes',
            accessor: (l) => (l.cylinderSizes.length ? l.cylinderSizes.join(', ') : null),
            full: true
          },
          { key: 'otherSizes', label: 'Other sizes', accessor: (l) => l.otherSizes, full: true },
          { key: 'added', label: 'Added', accessor: (l) => l.createdAt, type: 'date' }
        ]
      },
      {
        title: 'Vendor',
        fields: [
          { key: 'vendorName', label: 'Business', accessor: (l) => l.vendor.businessName },
          {
            key: 'vendorStatus',
            label: 'Vendor status',
            accessor: (l) => l.vendor.status,
            render: (l) => <StatusBadge value={l.vendor.status} />
          },
          { key: 'orderCount', label: 'Orders', accessor: (l) => l._count.orders, type: 'number' }
        ]
      }
    ]
  },

  permissions: { read: 'listings.read', update: 'listings.update' },

  data,

  emptyState: {
    title: 'No listings yet',
    description: 'Listings appear here once approved vendors publish their catalog.'
  }
};
