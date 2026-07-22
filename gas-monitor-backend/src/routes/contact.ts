import { Router } from 'express';
import { z } from 'zod';
import { Resend } from 'resend';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();

const contactSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  topic: z.enum(['support', 'sales', 'partnership', 'other']),
  message: z.string().min(10).max(4000)
});

let client: Resend | null = null;
function getClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const result = contactSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: 'Please fill in all fields — a valid email and a message of at least 10 characters.'
      });
    }

    const { name, email, topic, message } = result.data;
    const supportEmail = process.env.SUPPORT_EMAIL ?? process.env.EMAIL_FROM;
    const resend = getClient();

    if (resend && supportEmail) {
      const { error } = await resend.emails.send({
        from: process.env.EMAIL_FROM ?? '4FG Smart Gas Monitor <onboarding@resend.dev>',
        to: supportEmail,
        replyTo: email,
        subject: `[Contact:${topic}] ${name}`,
        html: `
          <div style="font-family: -apple-system, Arial, sans-serif;">
            <p><strong>From:</strong> ${name} &lt;${email}&gt;</p>
            <p><strong>Topic:</strong> ${topic}</p>
            <p style="white-space: pre-wrap;">${message}</p>
          </div>
        `
      });
      if (error) {
        console.error('[contact] Resend failed to deliver message:', error);
      }
    } else {
      console.warn('[contact] RESEND_API_KEY or SUPPORT_EMAIL not set — logging message instead', {
        name,
        email,
        topic,
        message,
        at: new Date().toISOString()
      });
    }

    return res.json({ ok: true });
  })
);

export default router;
