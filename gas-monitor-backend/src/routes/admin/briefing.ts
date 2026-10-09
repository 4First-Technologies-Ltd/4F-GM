import { Router } from 'express';
import { requireAdmin, requireOperations } from '../../middleware/requireAdmin';
import { prisma } from '../../lib/prisma';
import { asyncHandler } from '../../lib/asyncHandler';
import { writeAuditLog } from '../../lib/audit';
import { generateBriefing, isDay, lagosYesterday } from '../../lib/opsBriefing';

/** Daily ops briefing. Read: any admin. Regenerate: OPERATIONS. */
const router = Router();

/** Recent briefings, newest first — just enough to render a day picker. */
router.get(
  '/',
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const days = await prisma.opsBriefing.findMany({
      orderBy: { day: 'desc' },
      take: 30,
      select: { day: true, status: true, sentAt: true, sendError: true }
    });
    return res.json({ days, yesterday: lagosYesterday() });
  })
);

router.get(
  '/:day',
  requireAdmin,
  asyncHandler(async (req, res) => {
    if (!isDay(req.params.day)) return res.status(400).json({ error: 'Day must be YYYY-MM-DD' });
    const briefing = await prisma.opsBriefing.findUnique({ where: { day: req.params.day } });
    if (!briefing) return res.status(404).json({ error: 'No briefing for that day' });
    return res.json({ briefing });
  })
);

/**
 * Build (or rebuild) one day's briefing without posting to Telegram. Rebuilding
 * an old day recomputes its numbers from today's data; "live" figures (stuck
 * orders, open tickets) always describe now, not that day.
 */
router.post(
  '/:day/generate',
  requireOperations,
  asyncHandler(async (req, res) => {
    const day = req.params.day;
    if (!isDay(day)) return res.status(400).json({ error: 'Day must be YYYY-MM-DD' });
    if (day > lagosYesterday()) return res.status(400).json({ error: 'A briefing covers a finished day' });

    const briefing = await generateBriefing(day, { deliver: false });
    await writeAuditLog(req, {
      action: 'BRIEFING_GENERATED',
      resource: 'briefing',
      resourceId: day,
      summary: `Generated the ops briefing for ${day}`
    });
    return res.json({ briefing });
  })
);

export default router;
