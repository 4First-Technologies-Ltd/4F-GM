'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, MapPin, Power, Store } from 'lucide-react';
import { ApiRequestError, riderApi, type RiderJobsResponse } from '@/lib/api';
import { formatNaira } from '@/lib/format';
import { Button } from '@/components/motion/button/base';

const POLL_MS = 20_000;

/** Best effort: the pool works without a location, it just can't show distances. */
function currentPosition(): Promise<{ lat: number; lng: number } | undefined> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(undefined);
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(undefined),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 120_000 }
    )
  );
}

const waited = (iso: string) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  return mins < 1 ? 'just now' : mins < 60 ? `${mins} min ago` : `${Math.floor(mins / 60)} h ago`;
};

/**
 * The rider's online switch and the job pool: accepted orders no rider has
 * taken yet. Taking one makes it the rider's active job (one at a time).
 */
export function JobPool({ hasActiveJob, onTaken }: { hasActiveJob: boolean; onTaken: () => void | Promise<void> }) {
  const [data, setData] = useState<RiderJobsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState(false);
  const [taking, setTaking] = useState<string | null>(null);
  const lastLocation = useRef(0);

  const load = useCallback(async () => {
    try {
      setData(await riderApi.getJobs());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load jobs.');
    }
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      // Keep distances honest while online: refresh the location every few minutes.
      if (data?.online && Date.now() - lastLocation.current > 3 * 60_000) {
        lastLocation.current = Date.now();
        const pos = await currentPosition();
        if (pos) await riderApi.updateLocation(pos).catch(() => {});
      }
      load();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [load, data?.online]);

  async function toggle() {
    if (!data) return;
    setToggling(true);
    setError(null);
    try {
      const going = !data.online;
      const pos = going ? await currentPosition() : undefined;
      if (pos) lastLocation.current = Date.now();
      await riderApi.setOnline(going, pos);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change your status.');
    } finally {
      setToggling(false);
    }
  }

  async function take(id: string) {
    setTaking(id);
    setError(null);
    try {
      await riderApi.acceptJob(id);
      await Promise.all([load(), onTaken()]);
    } catch (err) {
      setError(
        err instanceof ApiRequestError && err.code === 'JOB_TAKEN'
          ? 'Another rider took that job first.'
          : err instanceof Error
            ? err.message
            : 'Could not take this job.'
      );
      await load();
    } finally {
      setTaking(null);
    }
  }

  if (!data) {
    return error ? (
      <p className="text-sm text-destructive" role="alert">
        {error}
      </p>
    ) : null;
  }

  if (!data.approved) {
    return (
      <p className="rounded-lg bg-amber-100/50 px-4 py-3 text-sm text-amber-700">
        Once your rider account is approved you can go online and take jobs.
      </p>
    );
  }

  return (
    <section className="space-y-4" aria-labelledby="job-pool-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
        <div>
          <p className="flex items-center gap-2 font-semibold text-foreground">
            <span className={`h-2.5 w-2.5 rounded-full ${data.online ? 'bg-green-500' : 'bg-muted-foreground/40'}`} aria-hidden="true" />
            {data.online ? "You're online" : "You're offline"}
          </p>
          <p className="text-xs text-muted-foreground">
            {data.online ? 'You see new jobs and get alerts for jobs near you.' : 'Go online to see jobs and get alerts.'}
          </p>
        </div>
        <Button type="button" variant={data.online ? 'outline' : 'primary'} size="sm" disabled={toggling} onClick={toggle}>
          <span className="flex items-center gap-2">
            <Power className="h-4 w-4" aria-hidden="true" />
            {toggling ? 'Updating…' : data.online ? 'Go offline' : 'Go online'}
          </span>
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>{error}</div>
        </div>
      )}

      {data.online && (
        <>
          <h3 id="job-pool-heading" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Available jobs {data.jobs.length > 0 && `(${data.jobs.length})`}
          </h3>
          {hasActiveJob && (
            <p className="text-sm text-muted-foreground">Finish your current delivery to take another job.</p>
          )}
          {data.jobs.length === 0 && (
            <p className="rounded-2xl border border-border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
              No jobs right now. New ones appear here automatically.
            </p>
          )}
          <div className="space-y-3">
            {data.jobs.map((job) => (
              <div key={job.id} className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 font-medium text-foreground">
                      <Store className="h-4 w-4 flex-shrink-0 text-primary" aria-hidden="true" />
                      {job.vendorName}
                      {job.branchName && job.branchName !== 'Main branch' && (
                        <span className="text-muted-foreground"> · {job.branchName}</span>
                      )}
                    </p>
                    <p className="pl-[1.375rem] text-xs text-muted-foreground">{job.pickupAddress || 'Pickup address not set'}</p>
                  </div>
                  <p className="whitespace-nowrap text-right font-mono text-lg font-semibold text-primary">
                    {job.riderPay > 0 ? formatNaira(job.riderPay) : '—'}
                  </p>
                </div>
                <p className="mt-2 flex items-start gap-1.5 text-sm text-foreground">
                  <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
                  {job.deliveryAddress}
                </p>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                  <p className="text-xs text-muted-foreground">
                    {job.quantity} × {job.cylinderSize}
                    {job.distanceKm != null && ` · ${job.distanceKm} km to pickup`} · {waited(job.waitingSince)}
                  </p>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={hasActiveJob || taking !== null}
                    onClick={() => take(job.id)}
                  >
                    {taking === job.id ? 'Taking…' : 'Take job'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
