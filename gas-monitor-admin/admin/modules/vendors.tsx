import type { ResourceConfig } from '@/admin/resource/types';
import { createDataSource } from '@/admin/data/source';
import { formatDateTime, formatNumber, formatRelative } from '@/admin/primitives/format';
import { adminFetch } from '@/lib/api';
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
 * Reduced mode: there is no rejection-reason field and no suspend flag on
 * VendorProfile, so those actions are not offered. Adding them needs a schema
 * change; see ADMIN_DASHBOARD_REPORT.md.
 */

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
          <span className="adm-td-sub">{v.user.email}</span>
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
    {
      key: 'docs',
      header: 'Docs',
      accessor: (v) => v.documents.length,
      type: 'number',
      priority: 3
    },
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

      <section className="adm-detail-section">
        <h3 className="adm-micro-label">Documents ({v.documents.length})</h3>
        {v.documents.length === 0 ? (
          <p className="adm-muted">No documents uploaded.</p>
        ) : (
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
        )}
      </section>
      </>
    )
  },

  permissions: {
    read: 'vendors.read',
    update: 'vendors.approve',
    approve: 'vendors.approve'
  },

  data,

  emptyState: {
    title: 'No vendors yet',
    description: 'Vendors appear here when they sign up through the consumer app.'
  }
};
