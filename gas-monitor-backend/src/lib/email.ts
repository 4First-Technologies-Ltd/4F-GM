import { Resend } from 'resend';

const FROM = process.env.EMAIL_FROM ?? '4FG Smart Gas Monitor <onboarding@resend.dev>';

let client: Resend | null = null;
function getClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

type OtpEmailPurpose = 'SIGNUP_VERIFICATION' | 'PASSWORD_RESET';

const COPY: Record<OtpEmailPurpose, { subject: string; heading: string; body: string }> = {
  SIGNUP_VERIFICATION: {
    subject: 'Verify your email — 4FG Smart Gas Monitor',
    heading: 'Verify your email address',
    body: 'Use this code to finish creating your 4FG Smart Gas Monitor account.'
  },
  PASSWORD_RESET: {
    subject: 'Reset your password — 4FG Smart Gas Monitor',
    heading: 'Reset your password',
    body: 'Use this code to reset your 4FG Smart Gas Monitor password.'
  }
};

export async function sendOtpEmail(to: string, code: string, purpose: OtpEmailPurpose): Promise<void> {
  const { subject, heading, body } = COPY[purpose];
  const resend = getClient();

  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not set — ${purpose} OTP for ${to}: ${code}`);
    return;
  }

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject,
    html: `
      <div style="font-family: -apple-system, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
        <p style="font-size: 13px; font-weight: 700; letter-spacing: 0.5px; color: #2d7450; text-transform: uppercase; margin: 0 0 24px;">4FG Smart Gas Monitor</p>
        <h1 style="font-size: 20px; margin: 0 0 12px;">${heading}</h1>
        <p style="font-size: 15px; color: #444; line-height: 1.5; margin: 0 0 24px;">${body}</p>
        <div style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #12271d; background: #e9f6ec; border-radius: 8px; padding: 16px 20px; text-align: center; margin: 0 0 24px;">${code}</div>
        <p style="font-size: 13px; color: #888; line-height: 1.5;">This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
      </div>
    `
  });

  if (error) {
    console.error(`[email] Resend failed to send ${purpose} OTP to ${to}:`, error);
  }
}
