'use client';

import { createContext, useContext, ReactNode } from 'react';

export type AdminRole = 'SUPER_ADMIN' | 'OPERATIONS' | 'SUPPORT';

export interface AdminSession {
  name: string;
  role: AdminRole;
  /** Named admins can set their own password; the shared env login cannot. */
  canChangePassword: boolean;
  /** Set by whoever created/reset the account; blocks everything but /dashboard/account. */
  mustChangePassword: boolean;
}

const AdminSessionContext = createContext<AdminSession | null>(null);

export function AdminSessionProvider({ session, children }: { session: AdminSession; children: ReactNode }) {
  return <AdminSessionContext.Provider value={session}>{children}</AdminSessionContext.Provider>;
}

export function useAdminSession(): AdminSession {
  const ctx = useContext(AdminSessionContext);
  if (!ctx) throw new Error('useAdminSession must be used within AdminSessionProvider');
  return ctx;
}
