/**
 * Permission constants and role grants, derived from the project's REAL roles
 * (`AdminRole` in the Prisma schema: SUPER_ADMIN > OPERATIONS > SUPPORT).
 *
 *   Frontend permission checks improve UX.
 *   Backend permission checks enforce security.
 *
 * Every permission below has a matching server-side guard in
 * gas-monitor-backend (`requireAdmin` / `requireOperations` / `requireSuperAdmin`).
 * See ADMIN_DASHBOARD_REPORT.md for the mapping.
 */

export type AdminRole = 'SUPER_ADMIN' | 'OPERATIONS' | 'SUPPORT';

export const ROLE_RANK: Record<AdminRole, number> = {
  SUPPORT: 0,
  OPERATIONS: 1,
  SUPER_ADMIN: 2
};

export const ROLE_LABEL: Record<AdminRole, string> = {
  SUPPORT: 'Support',
  OPERATIONS: 'Operations',
  SUPER_ADMIN: 'Super admin'
};

/**
 * Wildcards are allowed in GRANTS only. A CHECK must always name a concrete
 * permission.
 *
 * SUPPORT is deliberately read-only: mutating platform data is an OPERATIONS
 * decision, and the backend now enforces that with `requireOperations`.
 */
/**
 * Reads that the `*.read` wildcard must NOT cover. They are reachable only by a
 * role that names them explicitly (SUPER_ADMIN's `*` always does), so a new
 * role or a wildcard can never silently expose them.
 *
 *   audit.read    - who did what; super admin only
 *   security.read - IP blocklist; super admin only
 *   admins.read   - the admin list; granted to OPERATIONS by name below
 *   logs.read     - server logs (stack traces, paths); super admin only
 */
export const EXPLICIT_ONLY_READS: readonly string[] = ['audit.read', 'security.read', 'admins.read', 'logs.read'];

export const ROLE_GRANTS: Record<AdminRole, string[]> = {
  // Answering customers is what SUPPORT is for, so support.reply is the one
  // write it holds. It mirrors the (deliberately) requireAdmin-level ticket routes.
  SUPPORT: ['*.read', 'support.reply', 'crm.note'],
  OPERATIONS: [
    '*.read',
    'vendors.approve',
    'riders.approve',
    'orders.assignRider',
    'listings.update',
    'users.create',
    'users.update',
    'users.suspend',
    'users.delete',
    'errors.resolve',
    'settings.update',
    'support.reply',
    'support.manage',
    // Pipeline leads and tasks; notes/tags (crm.note) are open to SUPPORT too.
    'crm.manage',
    // Creating and SENDING campaigns. marketing.unsuppress (re-subscribing an
    // opted-out address) is deliberately not granted: SUPER_ADMIN only.
    'marketing.manage',
    'briefing.generate',
    'crm.note',
    'payouts.manage',
    // payouts.markPaid is not granted here: settling outside Paystack stays SUPER_ADMIN.
    // Read-only view of the admin list; managing admins stays SUPER_ADMIN.
    'admins.read'
    // security.block / security.unblock deliberately excluded: a bad block can
    // take the whole platform offline, so it stays with SUPER_ADMIN.
  ],
  SUPER_ADMIN: ['*']
};
