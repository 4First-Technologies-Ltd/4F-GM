import type { StatusTone } from '@/admin/resource/types';
import { humaniseEnum } from './format';

/**
 * Built ONCE from the project's real Prisma enums: VendorStatus, OrderStatus,
 * Role, AdminRole, plus the boolean-derived states. Status colours must never
 * be defined inside a page or module file.
 *
 * Status is never colour alone — the badge always carries its text label.
 */
const STATUS_MAP: Record<string, { tone: StatusTone; label: string }> = {
  // VendorStatus
  APPROVED: { tone: 'success', label: 'Approved' },
  PENDING: { tone: 'warning', label: 'Pending' },
  REJECTED: { tone: 'error', label: 'Rejected' },

  // OrderStatus
  CONFIRMED: { tone: 'info', label: 'Confirmed' },
  DELIVERED: { tone: 'success', label: 'Delivered' },
  CANCELLED: { tone: 'error', label: 'Cancelled' },

  // Role
  CONSUMER: { tone: 'neutral', label: 'Consumer' },
  VENDOR: { tone: 'info', label: 'Vendor' },

  // AdminRole
  SUPER_ADMIN: { tone: 'error', label: 'Super admin' },
  OPERATIONS: { tone: 'info', label: 'Operations' },
  SUPPORT: { tone: 'neutral', label: 'Support' },

  // GasType
  COOKING: { tone: 'neutral', label: 'Cooking' },
  MEDICAL: { tone: 'info', label: 'Medical' },
  INDUSTRIAL: { tone: 'warning', label: 'Industrial' },
  BULK: { tone: 'neutral', label: 'Bulk' },
  OTHER: { tone: 'neutral', label: 'Other' },

  // Derived booleans
  IN_STOCK: { tone: 'success', label: 'In stock' },
  OUT_OF_STOCK: { tone: 'neutral', label: 'Out of stock' },
  ACTIVE: { tone: 'success', label: 'Active' },
  INACTIVE: { tone: 'neutral', label: 'Inactive' },
  SUSPENDED: { tone: 'error', label: 'Suspended' },
  VERIFIED: { tone: 'success', label: 'Verified' },
  UNVERIFIED: { tone: 'warning', label: 'Unverified' },
  PAID: { tone: 'success', label: 'Paid' },
  UNPAID: { tone: 'warning', label: 'Unpaid' }
};

/**
 * An unmapped value renders neutral rather than a guessed colour — an incorrect
 * status colour is worse than an uncoloured one.
 */
export function StatusBadge({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="adm-muted">—</span>;
  const cfg = STATUS_MAP[value] ?? { tone: 'neutral' as StatusTone, label: humaniseEnum(value) };
  return (
    <span className={`adm-badge adm-badge--${cfg.tone}`} data-status={value}>
      {cfg.label}
    </span>
  );
}

export function BoolBadge({
  value,
  trueKey,
  falseKey
}: {
  value: boolean | null | undefined;
  trueKey: string;
  falseKey: string;
}) {
  return <StatusBadge value={value ? trueKey : falseKey} />;
}
