'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AlertCircle, Check } from 'lucide-react';
import { bankApi, BankOption, PayoutAccount } from '@/lib/api';
import { Input } from '@/components/motion/input';
import { Button } from '@/components/motion/button/base';

/** Profile-page card where a vendor or rider sets the bank account their payouts go to. */
export function PayoutAccountSection() {
  const [account, setAccount] = useState<PayoutAccount | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [banks, setBanks] = useState<BankOption[]>([]);
  const [editing, setEditing] = useState(false);

  const [bankCode, setBankCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    bankApi
      .getAccount()
      .then(setAccount)
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // The bank list is only needed once the form opens.
  useEffect(() => {
    if (!editing || banks.length) return;
    bankApi
      .banks()
      .then(setBanks)
      .catch(() => setError('Could not load the list of banks. Try again shortly.'));
  }, [editing, banks.length]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!bankCode) return setError('Choose your bank.');
    if (!/^\d{10}$/.test(accountNumber)) return setError('Account number must be 10 digits.');
    if (!password) return setError('Enter your password to confirm.');

    setSaving(true);
    try {
      setAccount(await bankApi.saveAccount({ bankCode, accountNumber, password }));
      setEditing(false);
      setBankCode('');
      setAccountNumber('');
      setPassword('');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your payout account.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl bg-card border border-border p-6 md:p-8">
      <h2 className="text-xl font-semibold text-foreground mb-2">Payout account</h2>
      <p className="text-sm text-muted-foreground mb-6">
        The bank account your earnings are paid into. We confirm the account name with your bank.
      </p>

      {loaded && account && !editing && (
        <div className="rounded-lg border border-border p-4 mb-4">
          <p className="text-sm font-medium text-foreground">{account.accountName}</p>
          <p className="text-sm text-muted-foreground">
            {account.bankName} · ••••{account.last4}
          </p>
        </div>
      )}
      {loaded && !account && !editing && (
        <p className="text-sm text-muted-foreground mb-4">No payout account yet. Add one to get paid.</p>
      )}

      {!editing && (
        <div className="flex items-center gap-2">
          <Button type="button" variant="primary" size="sm" onClick={() => setEditing(true)} disabled={!loaded}>
            {account ? 'Change account' : 'Add bank account'}
          </Button>
          {saved && (
            <span className="flex items-center gap-2 text-xs text-green-700 font-medium">
              <Check className="h-4 w-4" />
              Saved
            </span>
          )}
        </div>
      )}

      {editing && (
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label htmlFor="payout-bank" className="block text-sm font-medium text-foreground mb-2">
              Bank
            </label>
            <select
              id="payout-bank"
              value={bankCode}
              onChange={(e) => setBankCode(e.target.value)}
              disabled={saving}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">Select your bank</option>
              {banks.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <Input
            label="Account number"
            id="payout-number"
            type="text"
            value={accountNumber}
            onChange={(v) => setAccountNumber(v.replace(/\D/g, '').slice(0, 10))}
            error={false}
            placeholder="10 digits"
            classNames={{ root: 'w-full' }}
          />
          <Input
            label="Your password"
            id="payout-password"
            type="password"
            value={password}
            onChange={setPassword}
            error={false}
            placeholder="To confirm it is you"
            classNames={{ root: 'w-full' }}
          />

          {error && (
            <div
              className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive flex items-start gap-2"
              role="alert"
            >
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <div>{error}</div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <Button type="submit" variant="primary" size="sm" disabled={saving}>
              {saving ? 'Checking account…' : 'Save account'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={saving}
              onClick={() => {
                setEditing(false);
                setError(null);
                setPassword('');
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
