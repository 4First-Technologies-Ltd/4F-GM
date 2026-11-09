import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { effectiveSmosRole, seesEverything, smosCan } from '../src/lib/smois';
import { kpiStatus, summariseSnapshots } from '../src/lib/smoisCore';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('effectiveSmosRole', () => {
  it('makes a super admin the SMOIS admin whatever smosRole says', () => {
    expect(effectiveSmosRole('SUPER_ADMIN', 'VIEWER')).toBe('ADMIN');
  });
  it('lets an explicit smosRole win over the platform role', () => {
    expect(effectiveSmosRole('OPERATIONS', 'REVIEWER')).toBe('REVIEWER');
    expect(effectiveSmosRole('SOCIAL', 'MANAGER')).toBe('MANAGER');
  });
  it('defaults OPERATIONS to management and gives SUPPORT nothing', () => {
    expect(effectiveSmosRole('OPERATIONS', null)).toBe('MANAGEMENT');
    expect(effectiveSmosRole('SUPPORT', null)).toBeNull();
    expect(effectiveSmosRole('SOCIAL', null)).toBeNull();
  });
});

describe('smosCan', () => {
  it('denies everything without a role', () => {
    expect(smosCan(null, 'smois.read')).toBe(false);
  });
  it('gives ADMIN everything, including account management', () => {
    expect(smosCan('ADMIN', 'smois.accounts')).toBe(true);
  });
  it('keeps account management away from management and managers', () => {
    expect(smosCan('MANAGEMENT', 'smois.accounts')).toBe(false);
    expect(smosCan('MANAGER', 'smois.accounts')).toBe(false);
  });
  it('lets a reviewer review but not write or publish', () => {
    expect(smosCan('REVIEWER', 'smois.content.review')).toBe(true);
    expect(smosCan('REVIEWER', 'smois.content.create')).toBe(false);
    expect(smosCan('REVIEWER', 'smois.content.publish')).toBe(false);
  });
  it('keeps managers from reviewing, setting targets, or seeing the whole team', () => {
    expect(smosCan('MANAGER', 'smois.content.review')).toBe(false);
    expect(smosCan('MANAGER', 'smois.kpi.manage')).toBe(false);
    expect(smosCan('MANAGER', 'smois.performance.read')).toBe(false);
    expect(smosCan('MANAGER', 'smois.performance.own')).toBe(true);
  });
  it('makes a viewer read-only', () => {
    expect(smosCan('VIEWER', 'smois.read')).toBe(true);
    for (const p of ['smois.content.create', 'smois.tasks.manage', 'smois.metrics.record', 'smois.inbox.work', 'smois.assets.write']) {
      expect(smosCan('VIEWER', p)).toBe(false);
    }
  });
  it('only management-level roles see everyone', () => {
    expect(seesEverything('ADMIN')).toBe(true);
    expect(seesEverything('MANAGEMENT')).toBe(true);
    expect(seesEverything('MANAGER')).toBe(false);
    expect(seesEverything(null)).toBe(false);
  });
});

describe('admin and backend permission tables agree', () => {
  it('lists the same smois.* permissions in both projects', () => {
    const tokens = (file: string) => new Set(readFileSync(file, 'utf8').match(/smois\.[a-z.]+[a-z]/g));
    const backend = tokens(resolve(__dirname, '../src/lib/smois.ts'));
    const admin = tokens(resolve(__dirname, '../../gas-monitor-admin/admin/permissions/smois.ts'));
    expect([...backend].sort()).toEqual([...admin].sort());
  });
});

describe('summariseSnapshots', () => {
  it('reports growth only with two follower readings', () => {
    expect(summariseSnapshots([{ date: d('2026-11-01'), accountId: 'a', followers: 1000 }], 7).net).toBeNull();
    const two = summariseSnapshots(
      [
        { date: d('2026-11-05'), accountId: 'a', followers: 1060 },
        { date: d('2026-11-01'), accountId: 'a', followers: 1000 }
      ],
      7
    );
    expect(two.opening).toBe(1000);
    expect(two.closing).toBe(1060);
    expect(two.net).toBe(60);
    expect(two.growthPct).toBe(6);
  });
  it('keeps unrecorded metrics null rather than zero', () => {
    const s = summariseSnapshots([{ date: d('2026-11-01'), accountId: 'a', followers: 10, reach: 500 }], 7);
    expect(s.reach).toBe(500);
    expect(s.impressions).toBeNull();
    expect(s.engagement).toBeNull();
  });
  it('returns nulls for an empty period', () => {
    const s = summariseSnapshots([], 7);
    expect(s.net).toBeNull();
    expect(s.reach).toBeNull();
  });
});

describe('kpiStatus', () => {
  const k = { periodStart: d('2026-11-01'), periodEnd: d('2026-11-30'), targetValue: 100 } as Parameters<typeof kpiStatus>[0];
  it('is not started before the period', () => {
    expect(kpiStatus(k, 10, d('2026-10-15')).status).toBe('NOT_STARTED');
  });
  it('is no data when nothing is recorded, never a zero', () => {
    expect(kpiStatus(k, null, d('2026-11-10')).status).toBe('NO_DATA');
  });
  it('is achieved at exactly the target and exceeded above it', () => {
    expect(kpiStatus(k, 100, d('2026-11-10')).status).toBe('ACHIEVED');
    expect(kpiStatus(k, 120, d('2026-11-10')).status).toBe('EXCEEDED');
  });
  it('is missed after the period ends short of target', () => {
    expect(kpiStatus(k, 60, d('2026-12-05')).status).toBe('MISSED');
  });
  it('compares progress with time elapsed inside the period', () => {
    expect(kpiStatus(k, 60, d('2026-11-15')).status).toBe('ON_TRACK');
    expect(kpiStatus(k, 5, d('2026-11-25')).status).toBe('AT_RISK');
  });
});
