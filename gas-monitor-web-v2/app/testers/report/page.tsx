'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BUG_AREAS,
  EVIDENCE_TYPES,
  MAX_ATTACHMENTS,
  MAX_EVIDENCE_BYTES,
  getSavedDevice,
  saveDevice,
  testersApi,
  uploadEvidence,
  type BugFrequency,
  type BugSeverity,
  type UploadedEvidence
} from '@/lib/testers';
import { TesterShell, helpCls, inputCls, labelCls, primaryBtn, secondaryBtn } from '@/components/testers/shell';

const SEVERITIES: { value: BugSeverity; label: string; help: string }[] = [
  { value: 'CRITICAL', label: 'Critical', help: 'Crash, cannot sign in, wrong money, payment problem, data loss' },
  { value: 'HIGH', label: 'High', help: 'A main feature does not work and there is no workaround' },
  { value: 'MEDIUM', label: 'Medium', help: 'Works badly or confusingly, or has a workaround' },
  { value: 'LOW', label: 'Low', help: 'Cosmetic, typo, small polish' }
];

const FREQUENCIES: { value: BugFrequency; label: string }[] = [
  { value: 'ALWAYS', label: 'Every time' },
  { value: 'SOMETIMES', label: 'Sometimes' },
  { value: 'ONCE', label: 'Only once' }
];

interface Pending {
  id: string;
  name: string;
  state: 'uploading' | 'done' | 'error';
  error?: string;
  evidence?: UploadedEvidence;
}

export default function ReportBugPage() {
  return (
    <TesterShell title="Report a bug" back={{ href: '/testers/reports', label: 'My reports' }}>
      {() => <ReportForm />}
    </TesterShell>
  );
}

function ReportForm() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    title: '',
    area: '',
    screen: '',
    steps: '',
    expected: '',
    actual: '',
    severity: 'MEDIUM' as BugSeverity,
    frequency: 'ALWAYS' as BugFrequency,
    deviceModel: '',
    androidVersion: '',
    appVersion: '',
    network: '',
    accountEmail: ''
  });
  const [files, setFiles] = useState<Pending[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Device details barely change between reports, so start from the last ones used.
  useEffect(() => {
    const saved = getSavedDevice();
    setForm((f) => ({
      ...f,
      deviceModel: saved.deviceModel ?? '',
      androidVersion: saved.androidVersion ?? '',
      appVersion: saved.appVersion ?? '',
      accountEmail: saved.accountEmail ?? ''
    }));
  }, []);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));
  const uploading = files.some((f) => f.state === 'uploading');

  async function addFiles(list: FileList | null) {
    if (!list) return;
    const room = MAX_ATTACHMENTS - files.length;
    const chosen = Array.from(list).slice(0, Math.max(room, 0));
    if (list.length > room) setError(`You can attach up to ${MAX_ATTACHMENTS} files.`);
    for (const file of chosen) {
      const id = `${file.name}-${file.size}-${Date.now()}-${Math.random()}`;
      setFiles((prev) => [...prev, { id, name: file.name, state: 'uploading' }]);
      try {
        const evidence = await uploadEvidence(file);
        setFiles((prev) => prev.map((p) => (p.id === id ? { ...p, state: 'done', evidence } : p)));
      } catch (err) {
        setFiles((prev) => prev.map((p) => (p.id === id ? { ...p, state: 'error', error: err instanceof Error ? err.message : 'Upload failed' } : p)));
      }
    }
    if (fileInput.current) fileInput.current.value = '';
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.area) return setError('Choose which part of the app this is about.');
    if (uploading) return setError('Wait for your files to finish uploading.');
    setSubmitting(true);
    try {
      const res = await testersApi.create({
        ...form,
        attachments: files.filter((f) => f.state === 'done' && f.evidence).map((f) => f.evidence)
      });
      saveDevice({
        deviceModel: form.deviceModel,
        androidVersion: form.androidVersion,
        appVersion: form.appVersion,
        accountEmail: form.accountEmail
      });
      router.replace(`/testers/reports/${res.bug.number}?filed=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the report.');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-6">
      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <section className="grid gap-4 rounded-2xl bg-card p-5 shadow-sm">
        <div>
          <label className={labelCls} htmlFor="title">
            Title
          </label>
          <input id="title" className={inputCls} required minLength={5} maxLength={140} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Vendor: Assign rider sheet shows no riders" />
          <p className={helpCls}>One line. Say who and where, then what went wrong.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="area">
              Part of the app
            </label>
            <select id="area" className={inputCls} required value={form.area} onChange={(e) => set('area', e.target.value)}>
              <option value="">Choose…</option>
              {BUG_AREAS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="screen">
              Screen (optional)
            </label>
            <input id="screen" className={inputCls} maxLength={120} value={form.screen} onChange={(e) => set('screen', e.target.value)} placeholder="e.g. Incoming Orders" />
          </div>
        </div>

        <div>
          <label className={labelCls} htmlFor="steps">
            Steps to reproduce
          </label>
          <textarea id="steps" className={inputCls} rows={5} required minLength={10} maxLength={4000} value={form.steps} onChange={(e) => set('steps', e.target.value)} placeholder={'1. Sign in as vendor\n2. Open Incoming Orders\n3. Tap Assign rider on a confirmed order'} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="expected">
              What you expected
            </label>
            <textarea id="expected" className={inputCls} rows={3} required maxLength={2000} value={form.expected} onChange={(e) => set('expected', e.target.value)} />
          </div>
          <div>
            <label className={labelCls} htmlFor="actual">
              What actually happened
            </label>
            <textarea id="actual" className={inputCls} rows={3} required maxLength={2000} value={form.actual} onChange={(e) => set('actual', e.target.value)} />
          </div>
        </div>
      </section>

      <section className="grid gap-4 rounded-2xl bg-card p-5 shadow-sm">
        <fieldset>
          <legend className={labelCls}>How serious is it?</legend>
          <div className="grid gap-2">
            {SEVERITIES.map((s) => (
              <label key={s.value} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${form.severity === s.value ? 'border-primary bg-primary/5' : 'border-border'}`}>
                <input type="radio" name="severity" className="mt-1" checked={form.severity === s.value} onChange={() => set('severity', s.value)} />
                <span>
                  <span className="block text-sm font-medium text-foreground">{s.label}</span>
                  <span className="block text-xs text-muted-foreground">{s.help}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className={labelCls}>How often does it happen?</legend>
          <div className="flex flex-wrap gap-2">
            {FREQUENCIES.map((f) => (
              <label key={f.value} className={`cursor-pointer rounded-full border px-4 py-1.5 text-sm ${form.frequency === f.value ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground'}`}>
                <input type="radio" name="frequency" className="sr-only" checked={form.frequency === f.value} onChange={() => set('frequency', f.value)} />
                {f.label}
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="grid gap-4 rounded-2xl bg-card p-5 shadow-sm">
        <div>
          <h2 className="text-base font-semibold text-foreground">Screenshots or a screen recording</h2>
          <p className={helpCls}>
            A short recording is the most useful thing you can send. JPG, PNG, WebP, MP4 or WebM, up to {MAX_EVIDENCE_BYTES / 1024 / 1024} MB each, {MAX_ATTACHMENTS} files at most. Do not capture passwords or other people’s details.
          </p>
        </div>
        <input ref={fileInput} type="file" accept={EVIDENCE_TYPES.join(',')} multiple className="sr-only" id="files" onChange={(e) => void addFiles(e.target.files)} />
        <div>
          <label htmlFor="files" className={`${secondaryBtn} cursor-pointer`} aria-disabled={files.length >= MAX_ATTACHMENTS}>
            Add files
          </label>
        </div>
        {files.length > 0 && (
          <ul className="grid gap-2">
            {files.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                <span className="min-w-0 break-words">
                  {f.name}
                  {f.state === 'error' && <span className="block text-xs text-destructive">{f.error}</span>}
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="text-xs text-muted-foreground">{f.state === 'uploading' ? 'Uploading…' : f.state === 'done' ? 'Ready' : 'Failed'}</span>
                  <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setFiles((prev) => prev.filter((p) => p.id !== f.id))}>
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-4 rounded-2xl bg-card p-5 shadow-sm">
        <div>
          <h2 className="text-base font-semibold text-foreground">Your phone and the test</h2>
          <p className={helpCls}>We remember these for your next report.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="deviceModel">
              Phone model
            </label>
            <input id="deviceModel" className={inputCls} maxLength={80} value={form.deviceModel} onChange={(e) => set('deviceModel', e.target.value)} placeholder="e.g. Samsung A14" />
          </div>
          <div>
            <label className={labelCls} htmlFor="androidVersion">
              Android version
            </label>
            <input id="androidVersion" className={inputCls} maxLength={40} value={form.androidVersion} onChange={(e) => set('androidVersion', e.target.value)} placeholder="e.g. 14" />
          </div>
          <div>
            <label className={labelCls} htmlFor="appVersion">
              App version
            </label>
            <input id="appVersion" className={inputCls} maxLength={40} value={form.appVersion} onChange={(e) => set('appVersion', e.target.value)} placeholder="e.g. 1.0.3" />
          </div>
          <div>
            <label className={labelCls} htmlFor="network">
              Connection
            </label>
            <select id="network" className={inputCls} value={form.network} onChange={(e) => set('network', e.target.value)}>
              <option value="">Not sure</option>
              <option value="Wi-Fi">Wi-Fi</option>
              <option value="Mobile data">Mobile data</option>
              <option value="Offline / weak">Offline or very weak</option>
            </select>
          </div>
        </div>
        <div>
          <label className={labelCls} htmlFor="accountEmail">
            Test account you were using (optional)
          </label>
          <input id="accountEmail" type="email" className={inputCls} maxLength={200} value={form.accountEmail} onChange={(e) => set('accountEmail', e.target.value)} placeholder="yourname+vendor@gmail.com" />
          <p className={helpCls}>Never enter a password.</p>
        </div>
      </section>

      <div className="flex items-center justify-end gap-3">
        <button type="button" className={secondaryBtn} onClick={() => router.back()} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className={primaryBtn} disabled={submitting || uploading}>
          {submitting ? 'Sending…' : uploading ? 'Uploading files…' : 'Send report'}
        </button>
      </div>
    </form>
  );
}
