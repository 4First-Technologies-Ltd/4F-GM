'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { AlertCircle, MapPin } from 'lucide-react';
import { vendorApi, type Branch, type BranchInput, type StaffMember } from '@/lib/api';
import { Input } from '@/components/motion/input';
import { Button } from '@/components/motion/button/base';
import { StateCityFields } from './StateCityFields';

const EMPTY: BranchInput = { name: '', address: '', phone: '', state: '', city: '' };

/** Managers for one branch: invite by email, remove access. Loaded when expanded. */
function BranchManagers({ branchId }: { branchId: string }) {
  const [open, setOpen] = useState(false);
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setStaff(await vendorApi.getBranchStaff(branchId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load managers.');
      setStaff((s) => s ?? []);
    }
  }, [branchId]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && staff === null) load();
  }

  async function invite(e: FormEvent) {
    e.preventDefault();
    if (!/\S+@\S+\.\S+/.test(email)) {
      setError('Enter a valid email address.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await vendorApi.inviteStaff(branchId, email.trim());
      setEmail('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the invite.');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setBusy(true);
    try {
      await vendorApi.revokeStaff(branchId, id);
      setConfirmId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove the manager.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      <button type="button" onClick={toggle} className="text-sm font-medium text-primary hover:text-primary/80">
        {open ? 'Hide managers' : 'Managers'}
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-muted-foreground">
            Managers can run this branch&apos;s orders and stock. They cannot see earnings, documents or other branches.
            They sign up as a <strong className="text-foreground">Branch manager</strong> with the email you invite.
          </p>
          {staff === null && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
          {staff?.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-3 rounded-lg bg-muted/30 px-3 py-2">
              <div className="min-w-0 text-sm">
                <p className="truncate font-medium text-foreground">{m.user?.name ?? m.email}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {m.status === 'ACTIVE' ? m.email : `Invited ${m.email}, waiting for them to sign up`}
                </p>
              </div>
              {confirmId === m.id ? (
                <span className="flex items-center gap-2">
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => revoke(m.id)}>
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
                  className="text-xs font-medium text-destructive hover:text-destructive/80"
                  onClick={() => setConfirmId(m.id)}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          <form onSubmit={invite} noValidate className="space-y-2">
            <Input
              label="Manager's email"
              id={`manager-email-${branchId}`}
              type="email"
              value={email}
              onChange={setEmail}
              error={false}
              placeholder="manager@example.com"
              classNames={{ root: 'w-full' }}
            />
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? 'Sending…' : 'Send invite'}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}

/**
 * A vendor's branches: add, edit, make main, close and reopen, plus the managers
 * of each. The cap comes from the vendor's plan; a branch an admin suspended
 * cannot be reopened or promoted by the vendor.
 */
export function BranchManager() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [max, setMax] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // `null` = form closed, 'new' = adding, otherwise the id being edited.
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<BranchInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmCloseId, setConfirmCloseId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await vendorApi.getBranches();
      setBranches(data.branches);
      setMax(data.maxBranches);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load branches.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const activeCount = branches.filter((b) => b.isActive).length;
  const atLimit = activeCount >= max;

  function openNew() {
    setForm(EMPTY);
    setFormError(null);
    setEditing('new');
  }

  function openEdit(b: Branch) {
    setForm({ name: b.name, address: b.address, phone: b.phone, state: b.state ?? '', city: b.city ?? '' });
    setFormError(null);
    setEditing(b.id);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!form.name.trim() || !form.address.trim() || !form.phone.trim()) {
      setFormError('Branch name, address and phone are required.');
      return;
    }
    const payload: BranchInput = {
      name: form.name.trim(),
      address: form.address.trim(),
      phone: form.phone.trim(),
      ...(form.state ? { state: form.state } : {}),
      ...(form.city?.trim() ? { city: form.city.trim() } : {})
    };
    setSaving(true);
    try {
      if (editing === 'new') await vendorApi.createBranch(payload);
      else if (editing) await vendorApi.updateBranch(editing, payload);
      setEditing(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save the branch.');
    } finally {
      setSaving(false);
    }
  }

  async function run(id: string, action: 'make-main' | 'deactivate' | 'reactivate') {
    setBusyId(id);
    setError(null);
    try {
      await vendorApi.branchAction(id, action);
      setConfirmCloseId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the branch.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-1">Branches</h2>
          <p className="text-sm text-muted-foreground">
            {activeCount} of {max} open on your plan. Each branch has its own address, listings and orders.
          </p>
        </div>
        {editing === null && (
          <Button type="button" onClick={openNew} disabled={atLimit}>
            Add branch
          </Button>
        )}
      </div>

      {atLimit && editing === null && (
        <p className="rounded-lg bg-amber-100/50 px-4 py-3 text-sm text-amber-700">
          You have reached the branch limit for your plan. Close a branch to add another.
        </p>
      )}

      {error && (
        <div
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          role="alert"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>{error}</div>
        </div>
      )}

      {editing !== null && (
        <form onSubmit={save} noValidate className="space-y-4 rounded-2xl border border-border bg-card p-6">
          <h3 className="text-lg font-semibold text-foreground">{editing === 'new' ? 'New branch' : 'Edit branch'}</h3>
          <Input
            label="Branch name"
            id="b-name"
            type="text"
            value={form.name}
            onChange={(v) => setForm((f) => ({ ...f, name: v }))}
            error={false}
            placeholder="Lekki Phase 1"
            classNames={{ root: 'w-full' }}
          />
          <Input
            label="Address"
            id="b-address"
            type="text"
            value={form.address}
            onChange={(v) => setForm((f) => ({ ...f, address: v }))}
            error={false}
            placeholder="Street and area"
            classNames={{ root: 'w-full' }}
          />
          <StateCityFields
            state={form.state ?? ''}
            city={form.city ?? ''}
            onStateChange={(v) => setForm((f) => ({ ...f, state: v }))}
            onCityChange={(v) => setForm((f) => ({ ...f, city: v }))}
            disabled={saving}
          />
          <Input
            label="Branch phone"
            id="b-phone"
            type="tel"
            value={form.phone}
            onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
            error={false}
            placeholder="0801 234 5678"
            classNames={{ root: 'w-full' }}
          />
          {formError && (
            <p className="text-sm text-destructive" role="alert">
              {formError}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
            <Button type="button" variant="ghost" disabled={saving} onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {loading && <p className="text-sm text-muted-foreground">Loading branches…</p>}

      {branches.map((b) => {
        const suspended = !!b.suspendedAt;
        return (
          <div
            key={b.id}
            className={`rounded-2xl border border-border bg-card p-5 ${!b.isActive || suspended ? 'opacity-70' : ''}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" aria-hidden="true" />
              <h3 className="text-base font-semibold text-foreground">{b.name}</h3>
              {b.isMain && (
                <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Main</span>
              )}
              {suspended ? (
                <span className="rounded-md bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                  Suspended
                </span>
              ) : (
                !b.isActive && (
                  <span className="rounded-md bg-amber-100/50 px-2 py-0.5 text-xs font-medium text-amber-700">
                    Closed
                  </span>
                )
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{b.address}</p>
            {(b.city || b.state) && (
              <p className="text-sm text-muted-foreground">{[b.city, b.state].filter(Boolean).join(', ')}</p>
            )}
            <p className="text-sm text-muted-foreground">{b.phone}</p>
            {suspended && (
              <p className="mt-2 text-sm text-destructive">
                Suspended by 4FG{b.suspendedReason ? `: ${b.suspendedReason}` : ''}. Contact support to have it
                restored.
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
              <button type="button" className="font-medium text-primary hover:text-primary/80" onClick={() => openEdit(b)}>
                Edit
              </button>
              {b.isActive && !suspended && !b.isMain && (
                <button
                  type="button"
                  disabled={busyId === b.id}
                  className="font-medium text-primary hover:text-primary/80"
                  onClick={() => run(b.id, 'make-main')}
                >
                  Make main
                </button>
              )}
              {b.isActive && !b.isMain &&
                (confirmCloseId === b.id ? (
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Its listings stop showing to customers.</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busyId === b.id}
                      onClick={() => run(b.id, 'deactivate')}
                    >
                      Confirm close
                    </Button>
                    <button
                      type="button"
                      className="text-xs text-muted-foreground underline underline-offset-2"
                      onClick={() => setConfirmCloseId(null)}
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="font-medium text-destructive hover:text-destructive/80"
                    onClick={() => setConfirmCloseId(b.id)}
                  >
                    Close
                  </button>
                ))}
              {!b.isActive && !suspended && (
                <button
                  type="button"
                  disabled={busyId === b.id}
                  className="font-medium text-primary hover:text-primary/80"
                  onClick={() => run(b.id, 'reactivate')}
                >
                  Reopen
                </button>
              )}
            </div>

            {b.isActive && <BranchManagers branchId={b.id} />}
          </div>
        );
      })}
    </div>
  );
}
