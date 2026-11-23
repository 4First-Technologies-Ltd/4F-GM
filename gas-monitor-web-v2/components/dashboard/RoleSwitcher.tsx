'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeftRight, Bike, Check, ShoppingBag, Store, Truck, UserCog, X } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import type { RoleInfo, UserRole } from '@/lib/api';
import { homeRouteFor } from '@/lib/home-route';

const META: Record<UserRole, { icon: typeof Store; title: string; sub: string; join: string }> = {
  CONSUMER: { icon: ShoppingBag, title: 'Customer', sub: 'Shop, order and track deliveries', join: '' },
  VENDOR: { icon: Store, title: 'Vendor', sub: 'Manage your listings and orders', join: 'Register your business' },
  RIDER: { icon: Bike, title: 'Rider', sub: 'Accept deliveries and earn', join: 'Become a delivery partner' },
  LOGISTICS_COMPANY: { icon: Truck, title: 'Logistics company', sub: 'Run your fleet of riders', join: 'Register your fleet' },
  BRANCH_MANAGER: { icon: UserCog, title: 'Branch manager', sub: 'Orders and stock for your branch', join: '' }
};

function statusText(r: RoleInfo, current: boolean): string {
  if (current) return 'Current';
  switch (r.status) {
    case 'NOT_REGISTERED':
      return 'Not registered';
    case 'PENDING':
      return 'Pending approval';
    case 'REJECTED':
      return 'Not approved';
    default:
      return '';
  }
}

/**
 * "Switch experience": one account, several roles. Hidden for an account that
 * only has the one role it can use, so a plain customer with no way to become
 * anything else still sees it (to register), and nobody is shown a dead control.
 */
export function RoleSwitcher({ onDone }: { onDone?: () => void }) {
  const { user, switchRole } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<UserRole | null>(null);
  const [error, setError] = useState('');

  const roles = user?.roles;
  if (!user || !roles || roles.length < 2) return null;

  async function choose(r: RoleInfo) {
    setError('');
    if (r.role === user!.role) return setOpen(false);
    if (r.status === 'NOT_REGISTERED') {
      setOpen(false);
      onDone?.();
      router.push(`/become?role=${r.role}`);
      return;
    }
    if (!r.canSwitch) {
      setError('This role was not approved. Contact support for help.');
      return;
    }
    setBusy(r.role);
    try {
      const updated = await switchRole(r.role);
      setOpen(false);
      onDone?.();
      router.replace(homeRouteFor(updated));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not switch. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-200"
      >
        <ArrowLeftRight className="h-5 w-5" />
        <span className="text-sm">Switch role</span>
        <span className="ml-auto text-xs text-primary">{META[user.role].title}</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Switch role">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />
          <div className="relative w-full max-w-sm rounded-t-2xl sm:rounded-2xl bg-card p-5 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-foreground">Switch role</h2>
                <p className="text-xs text-muted-foreground">{user.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg hover:bg-muted"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <ul className="mt-4 space-y-2">
              {roles.map((r) => {
                const m = META[r.role];
                if (!m) return null;
                const current = r.role === user.role;
                const Icon = m.icon;
                // Registering is offered for roles a person can sign themselves up for.
                const joinable = r.status === 'NOT_REGISTERED' && !m.join ? false : true;
                if (!joinable) return null;
                return (
                  <li key={r.role}>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => choose(r)}
                      className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors disabled:opacity-60 ${
                        current ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'
                      }`}
                    >
                      <Icon className="h-5 w-5 text-primary shrink-0" />
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-semibold text-foreground">{m.title}</span>
                        <span className="block text-xs text-muted-foreground">
                          {r.status === 'NOT_REGISTERED' ? m.join : m.sub}
                        </span>
                      </span>
                      {current ? (
                        <Check className="h-4 w-4 text-primary" aria-label="Current" />
                      ) : (
                        <span className="text-xs font-medium text-muted-foreground">
                          {busy === r.role ? '…' : statusText(r, false)}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>

            {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
          </div>
        </div>
      )}
    </>
  );
}
