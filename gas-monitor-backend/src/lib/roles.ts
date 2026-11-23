import { Role } from '@prisma/client';
import { prisma } from './prisma';
import { RIDER_STATUS_SELECT, effectiveRiderStatus } from './fleet';

/**
 * Multi-role accounts. One User can be a consumer, a vendor, a rider, a logistics
 * company and a branch manager at once.
 *
 * Roles are *derived from the profile tables*, so approval status lives in one
 * place. `User.role` is the role the account signed up as and never changes;
 * `User.lastActiveRole` is the experience the person last switched into. Every
 * route is gated by the profile it needs (not by a role claim), so switching
 * changes what the apps show and what the next sign-in opens, and never grants
 * access to anything.
 */

export const ALL_ROLES: Role[] = ['CONSUMER', 'VENDOR', 'RIDER', 'LOGISTICS_COMPANY', 'BRANCH_MANAGER'];

/** Roles a person can register for themselves. Branch managers only ever arrive by invite. */
export const SELF_REGISTRABLE: Role[] = ['VENDOR', 'RIDER', 'LOGISTICS_COMPANY'];

export interface RoleStatus {
  role: Role;
  /** NOT_REGISTERED = no profile yet; otherwise the profile's approval status. */
  status: 'NOT_REGISTERED' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'ACTIVE';
  /** True when the person may switch into this role right now. */
  canSwitch: boolean;
}

/**
 * A pending vendor/rider/company still gets its dashboard (approval only controls
 * visibility, see CLAUDE.md), so switching is allowed for anything registered that
 * is not rejected.
 */
const usable = (s: string) => s !== 'NOT_REGISTERED' && s !== 'REJECTED';

/** Every role the account holds or could register for, with its standing. Consumer is always there. */
export async function getRoleStatuses(userId: string): Promise<RoleStatus[]> {
  const [vendor, rider, company, staff] = await Promise.all([
    prisma.vendorProfile.findUnique({ where: { userId }, select: { status: true } }),
    prisma.riderProfile.findUnique({ where: { userId }, select: RIDER_STATUS_SELECT }),
    prisma.logisticsCompany.findUnique({ where: { userId }, select: { status: true } }),
    prisma.branchStaff.count({ where: { userId, status: 'ACTIVE' } })
  ]);

  const vendorStatus = vendor?.status ?? 'NOT_REGISTERED';
  const riderStatus = rider ? effectiveRiderStatus(rider) : 'NOT_REGISTERED';
  const companyStatus = company?.status ?? 'NOT_REGISTERED';

  const out: RoleStatus[] = [
    { role: 'CONSUMER', status: 'ACTIVE', canSwitch: true },
    { role: 'VENDOR', status: vendorStatus, canSwitch: usable(vendorStatus) },
    { role: 'RIDER', status: riderStatus, canSwitch: usable(riderStatus) },
    { role: 'LOGISTICS_COMPANY', status: companyStatus, canSwitch: usable(companyStatus) }
  ];
  // Managers are invited, never self-registered: show the role only to someone who holds it.
  if (staff > 0) out.push({ role: 'BRANCH_MANAGER', status: 'ACTIVE', canSwitch: true });
  return out;
}

/** The role a request should be treated as: what they last switched into, if it still holds. */
export function pickActiveRole(
  user: { role: Role; lastActiveRole: Role | null },
  statuses: RoleStatus[]
): Role {
  const holds = (r: Role) => statuses.find((s) => s.role === r)?.canSwitch ?? false;
  if (user.lastActiveRole && holds(user.lastActiveRole)) return user.lastActiveRole;
  if (holds(user.role)) return user.role;
  return 'CONSUMER';
}

export async function resolveActiveRole(user: {
  id: string;
  role: Role;
  lastActiveRole: Role | null;
}): Promise<Role> {
  try {
    return pickActiveRole(user, await getRoleStatuses(user.id));
  } catch {
    return user.role;
  }
}

/**
 * The role fields every auth response carries. `role` is the *active* role (what
 * the apps route on, and what old builds already read); `primaryRole` is what the
 * account signed up as.
 */
export async function roleFields(user: { id: string; role: Role; lastActiveRole: Role | null }) {
  let statuses: RoleStatus[];
  try {
    statuses = await getRoleStatuses(user.id);
  } catch {
    return { role: user.role, primaryRole: user.role, roles: [] as RoleStatus[] };
  }
  return { role: pickActiveRole(user, statuses), primaryRole: user.role, roles: statuses };
}

export async function canActAs(userId: string, role: Role): Promise<boolean> {
  const statuses = await getRoleStatuses(userId);
  return statuses.find((s) => s.role === role)?.canSwitch ?? false;
}
