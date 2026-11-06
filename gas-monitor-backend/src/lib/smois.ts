import type { AdminRole, SmosRole } from '@prisma/client';

/**
 * SMOIS (social media operations) permissions.
 *
 * Mirrored by gas-monitor-admin/admin/permissions/smois.ts for the UI; the
 * backend is the enforcement point. SMOIS access never comes from the platform
 * admin ranks alone: a SOCIAL admin outranks nothing, so it reaches only the
 * routes guarded by `requireSmois`.
 */
export type SmosEffectiveRole = 'ADMIN' | SmosRole;

const READ = ['smois.read'];

const GRANTS: Record<SmosEffectiveRole, readonly string[]> = {
  ADMIN: ['*'],
  MANAGEMENT: [
    ...READ,
    'smois.assign',
    'smois.content.create',
    'smois.content.review',
    'smois.content.publish',
    'smois.tasks.manage',
    'smois.tasks.work',
    'smois.metrics.record',
    'smois.metrics.correct',
    'smois.analytics.read',
    'smois.kpi.manage',
    'smois.performance.read',
    'smois.performance.own',
    'smois.reports.write',
    'smois.reports.review',
    'smois.activity.read',
    'smois.activity.own',
    'smois.export',
    'smois.inbox.work',
    'smois.campaigns.manage',
    'smois.listening.write',
    'smois.competitors.manage',
    'smois.assets.write'
  ],
  MANAGER: [
    ...READ,
    'smois.content.create',
    'smois.content.publish',
    'smois.tasks.work',
    'smois.metrics.record',
    'smois.analytics.read',
    'smois.performance.own',
    'smois.reports.write',
    'smois.activity.own',
    'smois.inbox.work',
    'smois.listening.write',
    'smois.assets.write'
  ],
  REVIEWER: [...READ, 'smois.content.review'],
  VIEWER: [...READ, 'smois.analytics.read', 'smois.export']
};

/** Who an admin is inside SMOIS, or null when they have no access at all. */
export function effectiveSmosRole(role: AdminRole, smosRole: SmosRole | null | undefined): SmosEffectiveRole | null {
  if (role === 'SUPER_ADMIN') return 'ADMIN';
  if (smosRole) return smosRole;
  if (role === 'OPERATIONS') return 'MANAGEMENT';
  return null;
}

export function smosCan(effective: SmosEffectiveRole | null, permission: string): boolean {
  if (!effective) return false;
  const grants = GRANTS[effective];
  return grants.includes('*') || grants.includes(permission);
}

/** Management-level readers see every account and every colleague's work. */
export const seesEverything = (effective: SmosEffectiveRole | null) =>
  effective === 'ADMIN' || effective === 'MANAGEMENT';
