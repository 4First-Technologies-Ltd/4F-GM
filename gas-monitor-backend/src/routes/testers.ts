import { Router } from 'express';
import { z } from 'zod';
import { BugFrequency, BugSeverity } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { asyncHandler } from '../lib/asyncHandler';
import { generateOtp, hashOtp, otpExpiresAt, OTP_MAX_ATTEMPTS } from '../lib/otp';
import { sendTesterCodeEmail } from '../lib/email';
import { safeEqual, otpSendLimiter, otpVerifyLimiter, testerUploadLimiter, testerWriteLimiter } from '../lib/security';
import { requireTester, signTesterToken } from '../lib/testerAuth';
import {
  ALLOWED_EVIDENCE_TYPES,
  MAX_EVIDENCE_BYTES,
  evidencePrefix,
  newEvidenceKey,
  objectExists,
  presignUpload,
  storageConfigured
} from '../lib/storage';
import { BUG_AREAS, MAX_ATTACHMENTS, announceNewBug, withEvidenceUrls } from '../lib/bugs';

/**
 * The beta-tester side of the bug tracker. Testers are invited by an admin and
 * sign in with an emailed code; they can file reports, add to their own, and
 * read only their own. Admin triage lives in routes/admin/bugs.ts.
 */
const router = Router();

// ── Sign-in (public) ────────────────────────────────────────────────────────

const emailSchema = z.object({ email: z.string().trim().toLowerCase().email().max(200) });

/** Always answers the same way so the form cannot be used to find out who is on the team. */
router.post(
  '/login/request',
  otpSendLimiter,
  asyncHandler(async (req, res) => {
    const parsed = emailSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Enter a valid email address' });

    const tester = await prisma.tester.findUnique({ where: { email: parsed.data.email } });
    let devCode: string | undefined;
    if (tester?.isActive) {
      const code = generateOtp();
      await prisma.tester.update({
        where: { id: tester.id },
        data: { otpCodeHash: hashOtp(code), otpExpiresAt: otpExpiresAt(), otpAttempts: 0 }
      });
      await sendTesterCodeEmail(tester.email, code);
      if (process.env.NODE_ENV !== 'production') devCode = code;
    }
    return res.json({ ok: true, message: 'If that address is on the test team, a code is on its way.', ...(devCode ? { otp: devCode } : {}) });
  })
);

const verifySchema = emailSchema.extend({ otp: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code') });

router.post(
  '/login/verify',
  otpVerifyLimiter,
  asyncHandler(async (req, res) => {
    const parsed = verifySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const { email, otp } = parsed.data;
    const bad = () => res.status(400).json({ error: 'That code is wrong or has expired. Request a new one.' });

    const tester = await prisma.tester.findUnique({ where: { email } });
    if (!tester || !tester.isActive || !tester.otpCodeHash || !tester.otpExpiresAt) return bad();
    if (tester.otpExpiresAt < new Date() || tester.otpAttempts >= OTP_MAX_ATTEMPTS) return bad();

    if (!safeEqual(hashOtp(otp), tester.otpCodeHash)) {
      await prisma.tester.update({ where: { id: tester.id }, data: { otpAttempts: { increment: 1 } } });
      return bad();
    }

    // Single use: clear the code before handing out a session.
    const updated = await prisma.tester.update({
      where: { id: tester.id },
      data: { otpCodeHash: null, otpExpiresAt: null, otpAttempts: 0, lastLoginAt: new Date() }
    });
    return res.json({
      token: signTesterToken(updated),
      tester: { id: updated.id, name: updated.name, email: updated.email }
    });
  })
);

// ── Everything below needs a signed-in tester ───────────────────────────────

router.use(requireTester);

router.get('/me', (req, res) => res.json({ tester: req.tester }));

router.get(
  '/bugs',
  asyncHandler(async (req, res) => {
    const bugs = await prisma.bugReport.findMany({
      where: { testerId: req.tester!.id },
      orderBy: { updatedAt: 'desc' },
      select: {
        number: true,
        title: true,
        area: true,
        severity: true,
        status: true,
        fixedInBuild: true,
        duplicateOfNumber: true,
        createdAt: true,
        updatedAt: true
      },
      take: 200
    });
    return res.json({ bugs });
  })
);

/** Reports are addressed by their short number (#12), always scoped to the signed-in tester. */
async function findOwn(testerId: string, rawNumber: string) {
  const number = Number(rawNumber);
  if (!Number.isInteger(number)) return null;
  return prisma.bugReport.findFirst({ where: { number, testerId } });
}

router.get(
  '/bugs/:number',
  asyncHandler(async (req, res) => {
    const bug = await findOwn(req.tester!.id, req.params.number);
    if (!bug) return res.status(404).json({ error: 'Report not found' });
    const [attachments, comments] = await Promise.all([
      prisma.bugAttachment.findMany({ where: { bugId: bug.id }, orderBy: { createdAt: 'asc' } }),
      // Internal team notes are never sent to testers.
      prisma.bugComment.findMany({ where: { bugId: bug.id, internal: false }, orderBy: { createdAt: 'asc' } })
    ]);
    const { assigneeId: _assigneeId, assigneeName: _assigneeName, testerId: _testerId, ...safe } = bug;
    return res.json({
      bug: safe,
      attachments: await withEvidenceUrls(attachments),
      comments: comments.map((c) => ({ id: c.id, author: c.author, authorName: c.authorName, body: c.body, createdAt: c.createdAt }))
    });
  })
);

// ── Evidence upload ─────────────────────────────────────────────────────────

const uploadSchema = z.object({
  contentType: z.string().refine((t) => t in ALLOWED_EVIDENCE_TYPES, 'Use a JPG, PNG or WebP image, or an MP4 or WebM video'),
  size: z.number().int().positive().max(MAX_EVIDENCE_BYTES, 'Files can be up to 50 MB'),
  fileName: z.string().trim().min(1).max(160)
});

router.post(
  '/uploads/url',
  testerUploadLimiter,
  asyncHandler(async (req, res) => {
    if (!storageConfigured()) return res.status(503).json({ error: 'Uploads are not available right now. You can still send the report.' });
    const parsed = uploadSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const { contentType, size } = parsed.data;
    const key = newEvidenceKey(req.tester!.id, contentType);
    return res.json({ key, uploadUrl: await presignUpload(key, contentType, size), expiresInSeconds: 300 });
  })
);

// ── File a report ───────────────────────────────────────────────────────────

const text = (min: number, max: number, label: string) =>
  z.string().trim().min(min, `${label} is too short`).max(max, `${label} is too long`);
const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || undefined);

const reportSchema = z.object({
  title: text(5, 140, 'Title'),
  area: z.enum(BUG_AREAS),
  screen: optional(120),
  steps: text(10, 4000, 'Steps to reproduce'),
  expected: text(3, 2000, 'What you expected'),
  actual: text(3, 2000, 'What actually happened'),
  severity: z.nativeEnum(BugSeverity),
  frequency: z.nativeEnum(BugFrequency),
  deviceModel: optional(80),
  androidVersion: optional(40),
  appVersion: optional(40),
  network: optional(40),
  accountEmail: optional(200),
  attachments: z
    .array(
      z.object({
        key: z.string().min(1).max(300),
        fileName: z.string().trim().min(1).max(160),
        contentType: z.string().refine((t) => t in ALLOWED_EVIDENCE_TYPES),
        size: z.number().int().positive().max(MAX_EVIDENCE_BYTES)
      })
    )
    .max(MAX_ATTACHMENTS)
    .default([])
});

router.post(
  '/bugs',
  testerWriteLimiter,
  asyncHandler(async (req, res) => {
    const parsed = reportSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const { attachments, ...fields } = parsed.data;
    const tester = req.tester!;

    // A tester may only attach files they were issued an upload link for, and that really arrived.
    const prefix = evidencePrefix(tester.id);
    for (const a of attachments) {
      if (!a.key.startsWith(prefix) || a.key.includes('..')) return res.status(400).json({ error: 'Invalid attachment.' });
      if (!(await objectExists(a.key))) return res.status(400).json({ error: `"${a.fileName}" did not finish uploading. Please try again.` });
    }

    const bug = await prisma.bugReport.create({
      data: {
        ...fields,
        testerId: tester.id,
        attachments: { create: attachments }
      }
    });
    announceNewBug(bug, tester.name);
    return res.status(201).json({ bug: { number: bug.number, id: bug.id } });
  })
);

// ── Follow-up ───────────────────────────────────────────────────────────────

const commentSchema = z.object({ body: text(1, 4000, 'Comment') });

router.post(
  '/bugs/:number/comments',
  testerWriteLimiter,
  asyncHandler(async (req, res) => {
    const parsed = commentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const bug = await findOwn(req.tester!.id, req.params.number);
    if (!bug) return res.status(404).json({ error: 'Report not found' });

    const comment = await prisma.bugComment.create({
      data: { bugId: bug.id, author: 'TESTER', authorName: req.tester!.name, body: parsed.data.body }
    });
    // Answering a question puts the report back in the team's queue.
    if (bug.status === 'NEEDS_INFO') await prisma.bugReport.update({ where: { id: bug.id }, data: { status: 'NEW' } });
    else await prisma.bugReport.update({ where: { id: bug.id }, data: { updatedAt: new Date() } });
    return res.status(201).json({ comment: { id: comment.id, body: comment.body, createdAt: comment.createdAt } });
  })
);

const retestSchema = z.object({
  fixed: z.boolean(),
  note: z.string().trim().max(2000).optional()
});

/** After a fix ships, the tester who found it confirms it, or sends it back. */
router.post(
  '/bugs/:number/retest',
  testerWriteLimiter,
  asyncHandler(async (req, res) => {
    const parsed = retestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const bug = await findOwn(req.tester!.id, req.params.number);
    if (!bug) return res.status(404).json({ error: 'Report not found' });
    if (bug.status !== 'FIXED') return res.status(409).json({ error: 'Only reports marked as fixed can be retested.' });

    const { fixed, note } = parsed.data;
    const [updated] = await prisma.$transaction([
      // Compare-and-set so two taps cannot both win.
      prisma.bugReport.updateMany({
        where: { id: bug.id, status: 'FIXED' },
        data: fixed ? { status: 'VERIFIED' } : { status: 'NEW', resolvedAt: null }
      }),
      prisma.bugComment.create({
        data: {
          bugId: bug.id,
          author: 'TESTER',
          authorName: req.tester!.name,
          body: `${fixed ? 'Retested: it is fixed.' : 'Retested: it still happens.'}${note ? `\n${note}` : ''}`
        }
      })
    ]);
    if (updated.count === 0) return res.status(409).json({ error: 'This report changed. Refresh and try again.' });
    return res.json({ status: fixed ? 'VERIFIED' : 'NEW' });
  })
);

export default router;
