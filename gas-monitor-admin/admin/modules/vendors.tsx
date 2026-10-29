import type { ResourceConfig } from '@/admin/resource/types';
import { createDataSource } from '@/admin/data/source';
import { formatDateTime, formatNumber, formatRelative } from '@/admin/primitives/format';
import { adminFetch } from '@/lib/api';
import { deleteJson, postJson } from '@/admin/data/source';
import type { VendorPlan, VendorRow } from './types';

/**
 * Partner plans, mirroring gas-monitor-backend/src/lib/plans.ts. The commission
 * is what the platform takes from a completed marketplace order.
 */
const PLANS: Record<VendorPlan, { name: string; commissionPercent: number }> = {
  BASIC: { name: 'Basic', commissionPercent: 5 },
  GROWTH: { name: 'Growth', commissionPercent: 7 },
  PRO: { name: 'Pro / Premium', commissionPercent: 10 }
};

const PLAN_KEYS: VendorPlan[] = ['BASIC', 'GROWTH', 'PRO'];

function planLabel(plan: VendorPlan): string {
  return `${PLANS[plan].name} (${PLANS[plan].commissionPercent}%)`;
}

/**
 * Plan changes go to a dedicated endpoint, not the generic PATCH — it bypasses
 * the vendor-facing 14-day cooldown and writes its own audit entry.
 */
async function setPlan(id: string, plan: VendorPlan): Promise<void> {
  const res = await adminFetch(`/vendors/${id}/plan`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan })
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
}

/**
 * Vendors — the supply side, with the approval queue.
 *
 * Suspend, restore and delete are SUPER_ADMIN only (matching the backend guards).
 * Suspension is on the owner's user account (with a reason); deletion anonymises
 * the account in place and is refused while money or deliveries are outstanding.
 */

/** A deleted vendor keeps its row (orders and earnings reference it) but its owner's email is wiped. */
const isDeleted = (v: VendorRow) => v.user.email.endsWith('@deleted.invalid');

const data = createDataSource<VendorRow>({
  path: '/vendors',
  singleKey: 'vendor',
  supports: { get: true, update: true }
});

export const vendorsModule: ResourceConfig<VendorRow> = {
  resource: 'vendors',
  label: 'Vendors',
  labelSingular: 'Vendor',

  primaryKey: 'id',
  displayField: 'businessName',
  userIdOf: (v) => v.user.id,

  columns: [
    {
      key: 'businessName',
      header: 'Business',
      accessor: (v) => v.businessName,
      sortable: true,
      priority: 1,
      render: (v) => (
        <>
          {v.businessName}
          {isDeleted(v) ? (
            <span className="adm-badge adm-badge--neutral" style={{ marginLeft: 8 }}>Deleted</span>
          ) : v.user.isSuspended ? (
            <span className="adm-badge adm-badge--error" style={{ marginLeft: 8 }}>Suspended</span>
          ) : null}
          <span className="adm-td-sub">{isDeleted(v) ? 'Account deleted' : v.user.email}</span>
        </>
      )
    },
    { key: 'status', header: 'Status', accessor: (v) => v.status, type: 'status', sortable: true, priority: 1 },
    {
      key: 'plan',
      header: 'Plan',
      accessor: (v) => v.plan,
      priority: 1,
      render: (v) => (
        <>
          {PLANS[v.plan].name}
          <span className="adm-td-sub">{PLANS[v.plan].commissionPercent}% commission</span>
        </>
      )
    },
    { key: 'owner', header: 'Owner', accessor: (v) => v.user.name, priority: 2 },
    { key: 'phone', header: 'Phone', accessor: (v) => v.phone, priority: 3 },
    {
      key: 'listings',
      header: 'Listings',
      accessor: (v) => v._count.listings,
      type: 'number',
      priority: 1
    },
    { key: 'orders', header: 'Orders', accessor: (v) => v._count.orders, type: 'number', priority: 1 },
    { key: 'rcNumber', header: 'RC number', accessor: (v) => v.rcNumber, priority: 2 },
    {
      key: 'createdAt',
      header: 'Registered',
      accessor: (v) => v.createdAt,
      type: 'relative-date',
      sortable: true,
      priority: 2,
      render: (v) => <span title={formatDateTime(v.createdAt)}>{formatRelative(v.createdAt)}</span>
    }
  ],

  filters: [
    {
      key: 'status',
      label: 'Status',
      type: 'segmented',
      options: [
        { value: 'PENDING', label: 'Pending' },
        { value: 'APPROVED', label: 'Approved' },
        { value: 'REJECTED', label: 'Rejected' }
      ]
    },
    {
      key: 'plan',
      label: 'Plan',
      type: 'select',
      secondary: true,
      options: PLAN_KEYS.map((plan) => ({ value: plan, label: planLabel(plan) }))
    }
  ],

  search: { placeholder: 'Search business, owner or email…' },
  defaultSort: { field: 'createdAt', direction: 'desc' },

  rowActions: [
    {
      key: 'approve',
      label: 'Approve',
      variant: 'primary',
      permission: 'vendors.approve',
      disabledHint: 'Requires the Operations role',
      visible: (v) => v.status !== 'APPROVED',
      run: async (vendor, h) => {
        await data.update!(vendor.id, { status: 'APPROVED' });
        h.toast(`${vendor.businessName} approved`);
        h.refresh();
      }
    },
    {
      key: 'reject',
      label: 'Reject',
      variant: 'danger',
      permission: 'vendors.approve',
      disabledHint: 'Requires the Operations role',
      visible: (v) => v.status !== 'REJECTED',
      confirm: {
        title: 'Reject this vendor?',
        body: 'They will not be able to trade on the platform. This is recorded in the audit log and can be reversed by approving them later.',
        confirmLabel: 'Reject vendor'
      },
      run: async (vendor, h) => {
        await data.update!(vendor.id, { status: 'REJECTED' });
        h.toast(`${vendor.businessName} rejected`);
        h.refresh();
      }
    },
    {
      key: 'suspend',
      label: 'Suspend',
      variant: 'danger',
      permission: 'vendors.suspend',
      disabledHint: 'Requires the Super admin role',
      visible: (v) => !v.user.isSuspended && !isDeleted(v),
      confirm: {
        title: 'Suspend this vendor?',
        body: 'They are signed out and cannot sign in, and their listings leave the marketplace. Orders customers have already paid for are left alone. You can reinstate them at any time. This is recorded in the audit log.',
        confirmLabel: 'Suspend vendor',
        reasonLabel: 'Reason (the vendor is shown this when they try to sign in)'
      },
      run: async (vendor, h, reason) => {
        const r = await postJson<{ openOrders: number }>(`/vendors/${vendor.id}/suspend`, { reason });
        h.toast(
          `${vendor.businessName} suspended${r.openOrders ? ` — ${r.openOrders} open order${r.openOrders === 1 ? '' : 's'} left in progress` : ''}`
        );
        h.refresh();
      }
    },
    {
      key: 'restore',
      label: 'Reinstate',
      variant: 'primary',
      permission: 'vendors.suspend',
      disabledHint: 'Requires the Super admin role',
      visible: (v) => v.user.isSuspended && !isDeleted(v),
      confirm: {
        title: 'Reinstate this vendor?',
        body: 'They can sign in again and their listings return to the marketplace (if they are approved).',
        confirmLabel: 'Reinstate vendor'
      },
      run: async (vendor, h) => {
        await postJson(`/vendors/${vendor.id}/restore`);
        h.toast(`${vendor.businessName} reinstated`);
        h.refresh();
      }
    },
    {
      key: 'delete',
      label: 'Delete',
      variant: 'danger',
      permission: 'vendors.delete',
      disabledHint: 'Requires the Super admin role',
      visible: (v) => !isDeleted(v),
      confirm: {
        title: 'Delete this vendor?',
        body: 'This cannot be undone. Their personal details, documents, bank details and photos are erased, listings are taken off sale, branches are closed and the account can never sign in again. Order and earnings records are kept. It is refused while they have paid orders to deliver or earnings not yet paid out.',
        confirmLabel: 'Delete vendor',
        reasonLabel: 'Reason (recorded in the audit log)',
        typeToConfirm: (v) => v.businessName
      },
      run: async (vendor, h, reason) => {
        await deleteJson(`/vendors/${vendor.id}`, { reason, confirmName: vendor.businessName });
        h.toast(`${vendor.businessName} deleted`);
        h.refresh();
      }
    },
    // One action per target plan: the action engine has no input control, and
    // a vendor's plan is a short closed set.
    ...PLAN_KEYS.map((plan) => ({
      key: `plan-${plan.toLowerCase()}`,
      label: `Move to ${planLabel(plan)}`,
      permission: 'vendors.approve',
      disabledHint: 'Requires the Operations role',
      visible: (v: VendorRow) => v.plan !== plan,
      confirm: {
        title: `Move to the ${PLANS[plan].name} plan?`,
        body: `The vendor starts paying ${PLANS[plan].commissionPercent}% commission on orders completed from now on, and is held on this plan for 14 days. This ignores any cooldown they are currently under and is recorded in the audit log.`,
        confirmLabel: `Move to ${PLANS[plan].name}`
      },
      run: async (vendor: VendorRow, h: { toast: (m: string) => void; refresh: () => void }) => {
        await setPlan(vendor.id, plan);
        h.toast(`${vendor.businessName} moved to ${PLANS[plan].name}`);
        h.refresh();
      }
    }))
  ],

  detail: {
    title: (v) => v.businessName,
    subtitle: (v) => `${v.user.name} · ${v.user.email}`,
    statusField: 'status',
    sections: [
      {
        title: 'Business',
        fields: [
          { key: 'businessName', label: 'Name', accessor: (v) => v.businessName },
          { key: 'phone', label: 'Phone', accessor: (v) => v.phone },
          { key: 'rcNumber', label: 'RC number', accessor: (v) => v.rcNumber },
          { key: 'address', label: 'Address', accessor: (v) => v.businessAddress, full: true },
          { key: 'bio', label: 'Bio', accessor: (v) => v.bio, full: true },
          {
            key: 'coords',
            label: 'Coordinates',
            accessor: (v) => (v.lat != null && v.lng != null ? `${v.lat}, ${v.lng}` : null)
          },
          { key: 'registered', label: 'Registered', accessor: (v) => v.createdAt, type: 'date' }
        ]
      },
      {
        title: 'Partner plan',
        fields: [
          { key: 'plan', label: 'Plan', accessor: (v) => planLabel(v.plan) },
          {
            key: 'planChangedAt',
            label: 'Last changed',
            accessor: (v) => v.planChangedAt,
            type: 'date'
          },
          {
            key: 'planLockedUntil',
            label: 'Cooldown ends',
            accessor: (v) =>
              v.planLockedUntil && new Date(v.planLockedUntil) > new Date()
                ? v.planLockedUntil
                : null,
            type: 'date'
          }
        ]
      },
      {
        title: 'Account',
        fields: [
          {
            key: 'accountState',
            label: 'State',
            accessor: (v) => (isDeleted(v) ? 'Deleted' : v.user.isSuspended ? 'Suspended' : 'Active')
          },
          { key: 'suspendedReason', label: 'Suspension reason', accessor: (v) => v.user.suspendedReason, full: true }
        ]
      },
      {
        title: 'Owner',
        fields: [
          { key: 'ownerName', label: 'Name', accessor: (v) => v.user.name },
          { key: 'ownerEmail', label: 'Email', accessor: (v) => v.user.email },
          { key: 'joined', label: 'Account created', accessor: (v) => v.user.createdAt, type: 'date' }
        ]
      },
      {
        title: 'Activity',
        fields: [
          { key: 'listingCount', label: 'Listings', accessor: (v) => formatNumber(v._count.listings) },
          { key: 'orderCount', label: 'Orders', accessor: (v) => formatNumber(v._count.orders) }
        ]
      }
    ],
    extra: (v) => (
      <>
      <section className="adm-detail-section">
        <h3 className="adm-micro-label">Plan history ({v.planChanges?.length ?? 0})</h3>
        {!v.planChanges?.length ? (
          <p className="adm-muted">
            No plan changes — still on the plan chosen at sign-up.
          </p>
        ) : (
          <ul className="adm-doc-list">
            {v.planChanges.map((c) => (
              <li key={c.id} className="adm-doc-item">
                <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                  {PLANS[c.fromPlan].name} → {planLabel(c.toPlan)}
                  <span className="adm-td-sub">
                    {c.actor === 'ADMIN'
                      ? `by ${c.actorName ?? 'an operator'}${c.actorEmail ? ` (${c.actorEmail})` : ''}`
                      : 'by the vendor'}
                    {c.bypassedCooldown ? ' · cooldown overridden' : ''}
                  </span>
                </span>
                <span className="adm-muted" title={formatDateTime(c.createdAt)}>
                  {formatRelative(c.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Vendors now verify with an RC number; this only lists files uploaded before that. */}
      {v.documents.length > 0 && (
        <section className="adm-detail-section">
          <h3 className="adm-micro-label">Earlier uploaded documents ({v.documents.length})</h3>
          <ul className="adm-doc-list">
            {v.documents.map((d) => (
              <li key={d.id} className="adm-doc-item">
                <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{d.fileName}</span>
                <a
                  className="adm-btn adm-btn--sm"
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Open ${d.fileName} in a new tab`}
                >
                  Open
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      </>
    )
  },

  permissions: {
    read: 'vendors.read',
    update: 'vendors.approve',
    approve: 'vendors.approve',
    suspend: 'vendors.suspend',
    delete: 'vendors.delete'
  },

  data,

  emptyState: {
    title: 'No vendors yet',
    description: 'Vendors appear here when they sign up through the consumer app.'
  }
};
