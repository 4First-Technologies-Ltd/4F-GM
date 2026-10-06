'use client';

import { useCallback, useEffect, useState, FormEvent } from 'react';
import { addressApi, Address, ApiRequestError } from '@/lib/api';
import { Input } from '@/components/motion/input';
import { Button } from '@/components/motion/button/base';
import { AlertCircle, MapPin } from 'lucide-react';

export default function AddressesPage() {
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [fullAddress, setFullAddress] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setAddresses(await addressApi.list());
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load your addresses.');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!label.trim() || fullAddress.trim().length < 5) {
      setFormError('Add a label and a full address (at least 5 characters).');
      return;
    }
    setSubmitting(true);
    try {
      await addressApi.create({
        label: label.trim(),
        fullAddress: fullAddress.trim(),
        isDefault: (addresses?.length ?? 0) === 0
      });
      setLabel('');
      setFullAddress('');
      await load();
    } catch (err) {
      setFormError(err instanceof ApiRequestError ? err.message : 'Could not save this address.');
    } finally {
      setSubmitting(false);
    }
  }

  async function runForRow(id: string, action: () => Promise<unknown>, fallback: string) {
    setBusyId(id);
    setRowError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : fallback);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2 max-w-5xl">
      <div className="rounded-2xl bg-card border border-border p-6 md:p-8 h-fit">
        <h2 className="text-xl font-semibold text-foreground mb-2">Add a delivery address</h2>
        <p className="text-sm text-muted-foreground mb-6">Save addresses so checkout is faster next time.</p>

        <form onSubmit={handleAdd} noValidate className="space-y-4">
          <Input
            label="Label"
            id="label"
            type="text"
            value={label}
            onChange={setLabel}
            placeholder="Home, Office, etc."
            error={false}
            required
            classNames={{ root: 'w-full' }}
          />
          <Input
            label="Full address"
            id="fullAddress"
            type="text"
            value={fullAddress}
            onChange={setFullAddress}
            error={false}
            required
            classNames={{ root: 'w-full' }}
          />

          {formError && (
            <div
              className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive flex items-start gap-2"
              role="alert"
            >
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <div>{formError}</div>
            </div>
          )}

          <Button type="submit" variant="primary" size="sm" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save address'}
          </Button>
        </form>
      </div>

      <div className="rounded-2xl bg-card border border-border p-6 md:p-8">
        <h2 className="text-xl font-semibold text-foreground mb-6">Your addresses</h2>

        {loadError && (
          <div
            className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive flex items-start gap-2 mb-4"
            role="alert"
          >
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <div>{loadError}</div>
          </div>
        )}
        {rowError && (
          <p className="text-sm text-destructive mb-4" role="alert">
            {rowError}
          </p>
        )}

        {!addresses && !loadError && <p className="text-sm text-muted-foreground">Loading…</p>}
        {addresses && addresses.length === 0 && (
          <p className="text-sm text-muted-foreground">No saved addresses yet.</p>
        )}

        {addresses && addresses.length > 0 && (
          <ul className="divide-y divide-border -my-4">
            {addresses.map((a) => (
              <li key={a.id} className="py-4 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <MapPin className="h-4 w-4 mt-1 flex-shrink-0 text-primary" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      {a.label}
                      {a.isDefault && (
                        <span className="ml-2 inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-100/50 text-green-700">
                          Default
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-muted-foreground break-words">{a.fullAddress}</p>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {!a.isDefault && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={busyId === a.id}
                      onClick={() =>
                        runForRow(a.id, () => addressApi.update(a.id, { isDefault: true }), 'Could not update this address.')
                      }
                    >
                      Make default
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busyId === a.id}
                    onClick={() =>
                      runForRow(a.id, () => addressApi.remove(a.id), 'Could not remove this address.')
                    }
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
