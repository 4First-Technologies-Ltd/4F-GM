import { EXPLICIT_ONLY_READS, ROLE_GRANTS, type AdminRole } from './permissions';
import { canSmois } from './smois';
import type { SmosRole } from '@/lib/admin-session-context';

export function can(
  role: AdminRole | undefined | null,
  permission: string | undefined,
  smosRole?: SmosRole | null
): boolean {
  // An action with no declared permission is unrestricted by design.
  if (!permission) return true;
  if (!role) return false;

  // Social media operations are decided by the SMOIS role, never by the
  // platform rank: SUPPORT's `*.read` must not open them.
  if (permission.startsWith('smois.')) return canSmois(role, smosRole, permission);

  const grants = ROLE_GRANTS[role] ?? [];
  if (grants.includes('*') || grants.includes(permission)) return true;

  // Wildcards never reach these; only an exact grant (or '*') does.
  if (EXPLICIT_ONLY_READS.includes(permission)) return false;

  const [resource, action] = permission.split('.');
  return grants.includes(`${resource}.*`) || grants.includes(`*.${action}`);
}
