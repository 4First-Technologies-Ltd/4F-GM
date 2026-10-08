'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { usePermission } from './use-permission';

/**
 * Route-level guard. Hiding the sidebar item is not enough: someone can type the
 * URL. Without the permission the page renders nothing and sends them to the
 * dashboard rather than showing an error for a feature they should not know
 * exists. The backend still enforces the same rule; this is the UX half.
 */
export function RequirePermission({ permission, children }: { permission: string; children: ReactNode }) {
  const router = useRouter();
  const allowed = usePermission(permission);

  useEffect(() => {
    if (!allowed) router.replace('/dashboard');
  }, [allowed, router]);

  return allowed ? <>{children}</> : null;
}
