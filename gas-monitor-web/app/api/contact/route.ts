import { NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';

const contactSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  topic: z.enum(['support', 'sales', 'partnership', 'other']),
  message: z.string().min(10).max(4000)
});

export async function POST(req: Request) {
  const result = contactSchema.safeParse(await req.json().catch(() => null));
  if (!result.success) {
    return NextResponse.json(
      { error: 'Please fill in all fields — a valid email and a message of at least 10 characters.' },
      { status: 400 }
    );
  }

  const { name, email, topic, message } = result.data;

  // TODO: wire this to an email provider (e.g. Resend/Nodemailer) or persist to the database.
  // For now the message is logged server-side so submissions are visible in the deployment logs.
  console.log('[contact] new message', { name, email, topic, message, at: new Date().toISOString() });

  return NextResponse.json({ ok: true });
}
