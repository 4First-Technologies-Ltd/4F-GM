'use client';

import { createContext, useContext, ReactNode } from 'react';

export type AdminRole = 'SUPER_ADMIN' | 'OPERATIONS' | 'SUPPORT' | 'SOCIAL';
export type SmosRole = 'MANAGEMENT' | 'MANAGER' | 'REVIEWER' | 'VIEWER';

export interface AdminSession {
  /** The admin_users id, or "root" for the env login. */
  adminId: string;
  name: string;
  role: AdminRole;
  /** Social media operations role; null = none (SUPER_ADMIN and OPERATIONS default to management). */
  smosRole: SmosRole | null;
  /** Named admins can set their own password; the shared env login cannot. */
  canChangePassword: boolean;
  /** Set by whoever created/reset the account; blocks everything but /dashboard/account. */
  mustChangePassword: boolean;
  mfaEnabled: boolean;
  /** Policy requires a second factor and none is set up; blocks everything but /dashboard/account. */
  mfaEnrollRequired: boolean;
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
