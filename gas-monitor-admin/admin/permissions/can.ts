import { EXPLICIT_ONLY_READS, ROLE_GRANTS, type AdminRole } from './permissions';

export function can(role: AdminRole | undefined | null, permission: string | undefined): boolean {
  // An action with no declared permission is unrestricted by design.
  if (!permission) return true;
  if (!role) return false;

  const grants = ROLE_GRANTS[role] ?? [];
  if (grants.includes('*') || grants.includes(permission)) return true;

  // Wildcards never reach these; only an exact grant (or '*') does.
  if (EXPLICIT_ONLY_READS.includes(permission)) return false;

  const [resource, action] = permission.split('.');
  return grants.includes(`${resource}.*`) || grants.includes(`*.${action}`);
}
