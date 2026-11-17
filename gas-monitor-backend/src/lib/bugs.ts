import type { BugAttachment, BugSeverity, BugStatus } from '@prisma/client';
import { presignView, storageConfigured } from './storage';
import { sendTelegram } from './opsBriefing';

/** The parts of the app a report can be about. */
export const BUG_AREAS = ['CONSUMER', 'VENDOR', 'RIDER', 'COMPANY', 'MANAGER', 'GENERAL'] as const;

/** Statuses that still need work from the team (or an answer from the tester). */
export const ACTIVE_BUG_STATUSES: BugStatus[] = ['NEW', 'NEEDS_INFO', 'CONFIRMED', 'IN_PROGRESS'];
/** Statuses where nothing more is expected. */
export const CLOSED_BUG_STATUSES: BugStatus[] = ['VERIFIED', 'WONT_FIX', 'DUPLICATE'];

export const MAX_ATTACHMENTS = 6;

/**
 * Attachments as the clients see them: a short-lived link instead of the
 * object key. A report from before storage was configured has no link.
 */
export async function withEvidenceUrls(attachments: BugAttachment[]) {
  return Promise.all(
    attachments.map(async (a) => ({
      id: a.id,
      fileName: a.fileName,
      contentType: a.contentType,
      size: a.size,
      url: storageConfigured() ? await presignView(a.key) : null
    }))
  );
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Ping the team's Telegram chat about a serious new report. Best effort: a
 * failed notification must never fail the tester's submission.
 */
export function announceNewBug(bug: { number: number; title: string; severity: BugSeverity; area: string }, testerName: string) {
  if (bug.severity !== 'CRITICAL' && bug.severity !== 'HIGH') return;
  const panel = (process.env.ADMIN_PANEL_URL ?? 'https://4fgmpanel.4fgmonitor.com').replace(/\/$/, '');
  const icon = bug.severity === 'CRITICAL' ? '🔴' : '🟠';
  // Wrapped so even a synchronous failure cannot reach the tester's request.
  void Promise.resolve()
    .then(() =>
      sendTelegram(
        `${icon} <b>${bug.severity} bug #${bug.number}</b> (${bug.area.toLowerCase()})\n${escapeHtml(bug.title)}\nReported by ${escapeHtml(testerName)}\n${panel}/dashboard/bugs/${bug.number}`
      )
    )
    .catch(() => undefined);
}
