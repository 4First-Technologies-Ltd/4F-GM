'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ResourceList } from '@/admin/resource/resource-list';
import { earningsModule, payoutsModule } from '@/admin/modules/payouts';
import { getJson } from '@/admin/data/source';
import { sendJson } from '@/lib/post';
import { StatGrid, StatCard } from '@/admin/primitives/stat-card';
import { ConfirmDialog, Modal } from '@/admin/primitives/dialog';
import { StatusBadge } from '@/admin/primitives/status-badge';
import { EmptyState, ErrorState, ForbiddenState, LoadingBlock, LoadingState } from '@/admin/primitives/states';
import { formatNaira, formatNairaCompact } from '@/admin/primitives/format';
import { Can, usePermission } from '@/admin/permissions/use-permission';
import type { BankOption, PayoutRow, PayoutSummary, VendorBalanceRow } from '@/admin/modules/types';

/**
 * Payouts — what each vendor is owed, what has been sent, and the ledger
 * behind both. Amounts are the vendor's share after the platform commission
 * frozen on each delivered order.
 */

type Tab = 'balances' | 'payouts' | 'earnings';
const TABS: { value: Tab; label: string }[] = [
  { value: 'balances', label: 'Balances' },
  { value: 'payouts', label: 'Payouts' },
  { value: 'earnings', label: 'Earnings' }
];

export default function PayoutsPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <PayoutsView />
    </Suspense>
  );
}

function PayoutsView() {
  const canRead = usePermission('payouts.read');
  const canManage = usePermission('payouts.manage');
  const router = useRouter();
  const params = useSearchParams();
  const tab: Tab = (TABS.find((t) => t.value === params.get('tab'))?.value ?? 'balances') as Tab;

  const [summary, setSummary] = useState<PayoutSummary | null>(null);
  const [summaryError, setSummaryError] = useState<Error | null>(null);
  const [version, setVersion] = useState(0); // bump to reload every panel
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!canRead) return;
    setSummaryError(null);
    getJson<PayoutSummary>('/payouts/summary')
      .then(setSummary)
      .catch((e) => setSummaryError(e instanceof Error ? e : new Error(String(e))));
  }, [canRead, version]);

  function selectTab(next: Tab) {
    // Each tab's list keeps its own page/filter/sort in the URL; clear them so
    // a filter from one tab never leaks into another's.
    router.replace(next === 'balances' ? '/dashboard/payouts' : `/dashboard/payouts?tab=${next}`);
  }

  async function syncEarnings() {
    setSyncing(true);
    setNotice(null);
    try {
      const { created } = await sendJson<{ created: number }>('POST', '/payouts/sync-earnings');
      setNotice({
        text: created ? `Recorded ${created} earning${created === 1 ? '' : 's'} from delivered orders.` : 'Everything is already recorded.',
        tone: 'ok'
      });
      reload();
    } catch (e) {
      setNotice({ text: e instanceof Error ? e.message : String(e), tone: 'error' });
    } finally {
      setSyncing(false);
    }
  }

  if (!canRead) return <ForbiddenState permission="payouts.read" />;

  return (
    <div className="adm-page">
      <header className="adm-page-header">
        <div>
          <h1 className="adm-page-title">Payouts</h1>
          <p className="adm-page-meta">
            Vendor earnings after commission, paid out by Paystack transfer. Every action is audit-logged.
          </p>
        </div>
        <div className="adm-page-actions">
          <Can permission="payouts.manage">
            <button type="button" className="adm-btn" onClick={syncEarnings} disabled={syncing}>
              {syncing ? 'Syncing…' : 'Sync earnings'}
            </button>
          </Can>
        </div>
      </header>

      {notice && (
        <div className={notice.tone === 'error' ? 'adm-inline-error' : 'adm-alert'} role={notice.tone === 'error' ? 'alert' : 'status'}>
          <span>{notice.text}</span>
        </div>
      )}

      {summaryError ? (
        <ErrorState title="Could not load the payout summary" error={summaryError} onRetry={reload} />
      ) : (
        <StatGrid>
          <StatCard
            label="Owed to vendors"
            value={formatNairaCompact(summary?.available)}
            valueTitle={summary ? formatNaira(summary.available) : undefined}
            caption={summary ? `${summary.availableCount} delivered order${summary.availableCount === 1 ? '' : 's'}` : undefined}
            loading={!summary}
          />
          <StatCard
            label="In flight"
            value={formatNairaCompact(summary?.inPayout)}
            valueTitle={summary ? formatNaira(summary.inPayout) : undefined}
            caption="Locked in a payout"
            loading={!summary}
          />
          <StatCard
            label="Paid out"
            value={formatNairaCompact(summary?.paid)}
            valueTitle={summary ? formatNaira(summary.paid) : undefined}
            loading={!summary}
          />
          <StatCard
            label="Needs attention"
            value={String(summary?.payoutsNeedingAttention ?? 0)}
            caption="Pending, processing or failed payouts"
            actionable={(summary?.payoutsNeedingAttention ?? 0) > 0}
            href="/dashboard/payouts?tab=payouts"
            loading={!summary}
          />
        </StatGrid>
      )}

      <div className="adm-segmented" role="tablist" aria-label="Payout views">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            className="adm-segment"
            aria-pressed={tab === t.value}
            aria-selected={tab === t.value}
            onClick={() => selectTab(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'balances' && <BalancesPanel key={version} canManage={canManage} onChanged={reload} />}
      {tab === 'payouts' && <ResourceList key={version} config={payoutsModule} />}
      {tab === 'earnings' && <ResourceList key={version} config={earningsModule} />}
    </div>
  );
}

/* --------------------------------------------------------------- balances --- */

function BalancesPanel({ canManage, onChanged }: { canManage: boolean; onChanged: () => void }) {
  const [rows, setRows] = useState<VendorBalanceRow[] | null>(null);
  const [minimum, setMinimum] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const [paying, setPaying] = useState<VendorBalanceRow | null>(null);
  const [editing, setEditing] = useState<VendorBalanceRow | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: 'ok' | 'error' } | null>(null);

  const load = useCallback(() => {
    setError(null);
    getJson<{ data: VendorBalanceRow[]; minimumPayout: number }>('/payouts/balances')
      .then((r) => {
        setRows(r.data);
        setMinimum(r.minimumPayout);
      })
      .catch((e) => setError(e instanceof Error ? e : new Error(String(e))));
  }, []);
  useEffect(load, [load]);

  async function pay(row: VendorBalanceRow) {
    const { payout } = await sendJson<{ payout: PayoutRow }>('POST', '/payouts', { vendorId: row.vendorId });
    setPaying(null);
    if (payout.status === 'FAILED') {
      setMessage({ text: `Payout to ${row.businessName} failed: ${payout.failureReason ?? 'unknown error'}. Retry it from the Payouts tab.`, tone: 'error' });
    } else {
      setMessage({ text: `${formatNaira(payout.amount)} to ${row.businessName} is ${payout.status.toLowerCase()}.`, tone: 'ok' });
    }
    onChanged();
  }

  if (error) return <ErrorState title="Could not load balances" error={error} onRetry={load} />;
  if (!rows) return <LoadingBlock height={200} />;
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Nobody is owed anything"
        description="Vendors appear here once they have delivered marketplace orders that have not been paid out. If you expect balances, use “Sync earnings” to backfill orders delivered before payouts existed."
      />
    );
  }

  return (
    <>
      {message && (
        <div className={message.tone === 'error' ? 'adm-inline-error' : 'adm-alert'} role={message.tone === 'error' ? 'alert' : 'status'}>
          <span>{message.text}</span>
        </div>
      )}
      <div className="adm-table-scroll" tabIndex={0} role="region" aria-label="Vendor balances (scrollable)">
        <table className="adm-table">
          <caption className="adm-sr-only">Vendor balances</caption>
          <thead>
            <tr>
              <th scope="col" className="adm-th adm-th--left">Vendor</th>
              <th scope="col" className="adm-th adm-th--right">Owed</th>
              <th scope="col" className="adm-th adm-th--left">Payout account</th>
              <th scope="col" className="adm-th adm-th--left">Status</th>
              <th scope="col" className="adm-th adm-th--right">
                <span className="adm-sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.vendorId} className="adm-tr">
                <td className="adm-td adm-td--primary">
                  {r.businessName}
                  <span className="adm-td-sub">{r.earningsCount} order{r.earningsCount === 1 ? '' : 's'}</span>
                </td>
                <td className="adm-td adm-td--right adm-num">{formatNaira(r.available)}</td>
                <td className="adm-td">
                  {r.bankAccount ? (
                    <>
                      {r.bankAccount.accountName}
                      <span className="adm-td-sub">
                        {r.bankAccount.bankName} ••{r.bankAccount.accountNumber.slice(-4)}
                      </span>
                    </>
                  ) : (
                    <span className="adm-muted">Not set</span>
                  )}
                </td>
                <td className="adm-td">
                  {r.vendorStatus !== 'APPROVED' ? (
                    <StatusBadge value={r.vendorStatus} />
                  ) : r.available < minimum ? (
                    <span className="adm-muted">Below {formatNaira(minimum)} minimum</span>
                  ) : !r.bankAccount ? (
                    <span className="adm-muted">Needs bank account</span>
                  ) : (
                    <StatusBadge value="AVAILABLE" />
                  )}
                </td>
                <td className="adm-td adm-td--right">
                  <span className="adm-row-actions">
                    <button
                      type="button"
                      className="adm-btn adm-btn--sm"
                      disabled={!canManage}
                      title={!canManage ? 'Requires the Operations role' : undefined}
                      onClick={() => setEditing(r)}
                    >
                      {r.bankAccount ? 'Change account' : 'Add account'}
                    </button>
                    <button
                      type="button"
                      className="adm-btn adm-btn--sm adm-btn--primary"
                      disabled={!canManage || !r.payable}
                      title={!canManage ? 'Requires the Operations role' : !r.payable ? 'Needs an approved vendor, a bank account and the minimum balance' : undefined}
                      onClick={() => setPaying(r)}
                    >
                      Pay out
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {paying && (
        <ConfirmDialog
          title={`Pay ${formatNaira(paying.available)} to ${paying.businessName}?`}
          body={`This sends a Paystack transfer to ${paying.bankAccount?.accountName} at ${paying.bankAccount?.bankName} (••${paying.bankAccount?.accountNumber.slice(-4)}) covering ${paying.earningsCount} delivered order${paying.earningsCount === 1 ? '' : 's'}. It cannot be recalled once Paystack accepts it.`}
          confirmLabel="Send payout"
          onCancel={() => setPaying(null)}
          onConfirm={() => pay(paying)}
        />
      )}

      {editing && (
        <BankAccountModal
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setMessage({ text: `Payout account saved for ${editing.businessName}.`, tone: 'ok' });
            load();
          }}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------ bank account --- */

function BankAccountModal({
  row,
  onClose,
  onSaved
}: {
  row: VendorBalanceRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [banks, setBanks] = useState<BankOption[] | null>(null);
  const [bankCode, setBankCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getJson<{ banks: BankOption[] }>('/payouts/banks')
      .then((r) => setBanks(r.banks))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const valid = bankCode !== '' && /^\d{10}$/.test(accountNumber);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await sendJson('PUT', `/payouts/vendors/${row.vendorId}/bank-account`, { bankCode, accountNumber });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`Payout account — ${row.businessName}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="adm-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="adm-btn adm-btn--primary" disabled={!valid || busy} onClick={save}>
            {busy ? 'Verifying…' : 'Verify and save'}
          </button>
        </>
      }
    >
      <p className="adm-dialog-body">
        The account name is looked up from the bank, not typed, so a payout cannot be pointed at the wrong person by a typo.
      </p>
      {error && (
        <div className="adm-inline-error" role="alert">
          <span>{error}</span>
        </div>
      )}
      <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
        <label className="adm-field">
          <span className="adm-field-label">Bank</span>
          <select className="adm-input" value={bankCode} onChange={(e) => setBankCode(e.target.value)} disabled={!banks}>
            <option value="">{banks ? 'Choose a bank…' : 'Loading banks…'}</option>
            {banks?.map((b) => (
              <option key={b.code} value={b.code}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="adm-field">
          <span className="adm-field-label">Account number</span>
          <input
            className="adm-input"
            inputMode="numeric"
            maxLength={10}
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ''))}
            placeholder="10 digits"
          />
        </label>
      </div>
    </Modal>
  );
}
