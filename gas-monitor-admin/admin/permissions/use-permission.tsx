'use client';

import type { ReactNode } from 'react';
import { useAdminSession } from '@/lib/admin-session-context';
import { can } from './can';

/**
 * Bound to the project's EXISTING session context. No second session source,
 * no auth library added.
 */
export function usePermission(permission: string | undefined): boolean {
  const { role } = useAdminSession();
  return can(role, permission);
}

/**
 * Declarative guard.
 *
 * Pass `fallback` where the absence would confuse the operator — hiding
 * everything makes people think a feature does not exist and file a bug.
 */
export function Can({
  permission,
  children,
  fallback = null
}: {
  permission: string;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return <>{usePermission(permission) ? children : fallback}</>;
}
