import { ROLE_GRANTS, type AdminRole } from './permissions';

export function can(role: AdminRole | undefined | null, permission: string | undefined): boolean {
  // An action with no declared permission is unrestricted by design.
  if (!permission) return true;
  if (!role) return false;

  const grants = ROLE_GRANTS[role] ?? [];
  if (grants.includes('*') || grants.includes(permission)) return true;

  const [resource, action] = permission.split('.');
  return grants.includes(`${resource}.*`) || grants.includes(`*.${action}`);
}
