import type { AdminRole, SmosRole } from '@/lib/admin-session-context';

/**
 * Social media operations (SMOIS) permissions. Mirror of
 * gas-monitor-backend/src/lib/smois.ts, which is the enforcement point: this
 * only decides what the UI shows.
 */
type Effective = 'ADMIN' | SmosRole;

const READ = ['smois.read'];

const GRANTS: Record<Effective, readonly string[]> = {
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

export function effectiveSmosRole(role: AdminRole | undefined | null, smosRole: SmosRole | null | undefined): Effective | null {
  if (role === 'SUPER_ADMIN') return 'ADMIN';
  if (smosRole) return smosRole;
  if (role === 'OPERATIONS') return 'MANAGEMENT';
  return null;
}

export function canSmois(role: AdminRole | undefined | null, smosRole: SmosRole | null | undefined, permission: string): boolean {
  const eff = effectiveSmosRole(role, smosRole);
  if (!eff) return false;
  const g = GRANTS[eff];
  return g.includes('*') || g.includes(permission);
}

export const SMOS_ROLE_LABEL: Record<SmosRole, string> = {
  MANAGEMENT: 'Management',
  MANAGER: 'Social media manager',
  REVIEWER: 'Content reviewer',
  VIEWER: 'Read-only'
};
