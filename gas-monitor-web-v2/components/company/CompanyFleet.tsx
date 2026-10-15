'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { companyApi, type FleetInvite, type FleetRider } from '@/lib/api';
import { Input } from '@/components/motion/input';
import { Button } from '@/components/motion/button/base';

/**
 * A logistics company's fleet: invite riders by email, see who is free or busy,
 * and remove people. Joining a company's fleet approves a rider, so the invite
 * form says so plainly.
 */
export function CompanyFleet() {
  const [riders, setRiders] = useState<FleetRider[] | null>(null);
  const [invites, setInvites] = useState<FleetInvite[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSent, setInviteSent] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  // Two-step remove: the first click arms it, the second confirms.
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await companyApi.getFleet();
      setRiders(data.riders);
      setInvites(data.invites);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your fleet.');
      setRiders((r) => r ?? []);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    setInviteError(null);
    setInviteSent(null);
    if (!/\S+@\S+\.\S+/.test(email)) {
      setInviteError('Enter a valid email address.');
      return;
    }
    setInviting(true);
    try {
      await companyApi.inviteRider(email.trim());
      setInviteSent(email.trim());
      setEmail('');
      await load();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Could not send the invite.');
    } finally {
      setInviting(false);
    }
  }

  async function run(id: string, action: () => Promise<void>) {
    setBusyId(id);
    setError(null);
    try {
      await action();
      setConfirmId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground mb-1">Your fleet</h2>
        <p className="text-sm text-muted-foreground">
          {riders ? `${riders.length} rider${riders.length === 1 ? '' : 's'}` : 'Loading…'}
          {invites.length > 0 && ` · ${invites.length} invited`}
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
          {error}
        </div>
      )}

      {/* Invite */}
      <form onSubmit={handleInvite} noValidate className="rounded-2xl bg-card p-6 shadow-sm space-y-3">
        <h3 className="text-lg font-semibold text-foreground">Invite a rider</h3>
        <p className="text-sm text-muted-foreground">
          They sign up as a <strong className="text-foreground">Rider</strong> with this email. Joining your fleet
          approves them, so only invite riders you have vetted.
        </p>
        <Input
          label="Rider's email"
          id="inviteEmail"
          type="email"
          value={email}
          onChange={setEmail}
          error={false}
          placeholder="rider@example.com"
          classNames={{ root: 'w-full' }}
        />
        {inviteError && (
          <p className="text-sm text-destructive" role="alert">
            {inviteError}
          </p>
        )}
        {inviteSent && (
          <p className="text-sm text-primary" role="status">
            Invite saved for {inviteSent}. Let them know to sign up as a Rider with that email.
          </p>
        )}
        <Button type="submit" disabled={inviting}>
          {inviting ? 'Sending…' : 'Send invite'}
        </Button>
      </form>

      {/* Pending invites */}
      {invites.length > 0 && (
        <section aria-label="Pending invites" className="space-y-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Pending invites</h3>
          {invites.map((i) => (
            <div key={i.id} className="flex items-center justify-between gap-3 rounded-xl bg-card p-4 shadow-sm">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{i.email}</p>
                <p className="text-xs text-amber-700">
                  Waiting for them to sign up · expires {new Date(i.expiresAt).toLocaleDateString()}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busyId === i.id}
                onClick={() => run(i.id, () => companyApi.withdrawInvite(i.id))}
              >
                Withdraw
              </Button>
            </div>
          ))}
        </section>
      )}

      {/* Riders */}
      <section aria-label="Riders" className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Riders</h3>
        {riders && riders.length === 0 && !error && (
          <p className="text-sm text-muted-foreground">No riders have joined yet.</p>
        )}
        {riders?.map((r) => (
          <div key={r.id} className="rounded-xl bg-card p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{r.user.name}</p>
                <p className="truncate text-xs text-muted-foreground">{r.user.email}</p>
                <p className="text-xs text-muted-foreground">
                  {[r.vehicleType, r.plateNumber].filter(Boolean).join(' · ') || 'No vehicle details'}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-md px-2 py-1 text-xs font-medium ${
                  r.activeOrders > 0 ? 'bg-orange-100/50 text-orange-700' : 'bg-muted text-muted-foreground'
                }`}
              >
                {r.activeOrders > 0 ? `${r.activeOrders} active` : 'Free'}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
              <a className="font-medium text-primary hover:text-primary/80" href={`tel:${r.phone}`}>
                Call {r.phone}
              </a>
              {confirmId === r.id ? (
                <span className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {r.activeOrders > 0
                      ? `${r.activeOrders} delivery in progress stays with them. They may need 4FG approval again.`
                      : 'They may need 4FG approval again before new deliveries.'}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busyId === r.id}
                    onClick={() => run(r.id, () => companyApi.removeRider(r.id))}
                  >
                    Confirm remove
                  </Button>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline underline-offset-2"
                    onClick={() => setConfirmId(null)}
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="font-medium text-destructive hover:text-destructive/80"
                  onClick={() => setConfirmId(r.id)}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
