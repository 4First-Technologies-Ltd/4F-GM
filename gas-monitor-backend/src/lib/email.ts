import { Resend } from 'resend';

export const EMAIL_FROM = process.env.EMAIL_FROM ?? '4FG Smart Gas Monitor <onboarding@resend.dev>';

let client: Resend | null = null;
export function getClient(): Resend | null {
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
    from: EMAIL_FROM,
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

/**
 * Email a branch-manager invite with its one-time link. Returns whether it was
 * handed to Resend, so the vendor can be told when the invite was saved but the
 * email did not go out. Outside production the link is logged when email is not
 * configured (like OTPs); in production it never is.
 */
export async function sendManagerInviteEmail(input: {
  to: string;
  businessName: string;
  branchName: string;
  link: string;
  expiresAt: Date;
}): Promise<boolean> {
  const resend = getClient();
  if (!resend) {
    const detail = process.env.NODE_ENV !== 'production' ? `: ${input.link}` : '';
    console.warn(`[email] RESEND_API_KEY not set — manager invite for ${input.to} not sent${detail}`);
    return false;
  }

  const { error } = await resend.emails.send({
    from: EMAIL_FROM,
    to: input.to,
    subject: `${input.businessName} invited you to manage ${input.branchName}`,
    html: `
      <div style="font-family: -apple-system, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px;">
        <p style="font-size: 13px; font-weight: 700; letter-spacing: 0.5px; color: #2d7450; text-transform: uppercase; margin: 0 0 24px;">4FG Smart Gas Monitor</p>
        <h1 style="font-size: 20px; margin: 0 0 12px;">You've been invited to manage a branch</h1>
        <p style="font-size: 15px; color: #444; line-height: 1.5; margin: 0 0 24px;">
          <strong>${escapeHtml(input.businessName)}</strong> invited you to run orders and stock for
          <strong>${escapeHtml(input.branchName)}</strong> on 4FG Smart Gas Monitor.
        </p>
        <p style="margin: 0 0 24px;">
          <a href="${escapeHtml(input.link)}" style="display: inline-block; background: #2d7450; color: #fff; text-decoration: none; font-weight: 700; padding: 12px 22px; border-radius: 8px;">Set up your account</a>
        </p>
        <p style="font-size: 13px; color: #888; line-height: 1.5;">This link works once and expires on ${input.expiresAt.toUTCString()}. If you weren't expecting this, you can safely ignore this email.</p>
      </div>
    `
  });

  if (error) {
    console.error(`[email] Resend failed to send a manager invite to ${input.to}:`, error);
    return false;
  }
  return true;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Email an admin's reply to the person who raised a ticket. Returns whether it
 * was actually handed to Resend, so the inbox can tell the agent when a reply
 * was saved but not delivered.
 */
export async function sendTicketReplyEmail(input: {
  to: string;
  name: string;
  ticketNumber: number;
  subject: string;
  body: string;
}): Promise<boolean> {
  const resend = getClient();
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not set — ticket #${input.ticketNumber} reply to ${input.to} not sent`);
    return false;
  }

  const { error } = await resend.emails.send({
    from: EMAIL_FROM,
    to: input.to,
    replyTo: process.env.SUPPORT_EMAIL ?? undefined,
    subject: `Re: ${input.subject} [#${input.ticketNumber}]`,
    html: `
      <div style="font-family: -apple-system, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px;">
        <p style="font-size: 13px; font-weight: 700; letter-spacing: 0.5px; color: #2d7450; text-transform: uppercase; margin: 0 0 24px;">4FG Smart Gas Monitor Support</p>
        <p style="font-size: 15px; color: #1a2e1a; margin: 0 0 16px;">Hi ${escapeHtml(input.name)},</p>
        <p style="font-size: 15px; color: #333; line-height: 1.6; white-space: pre-wrap; margin: 0 0 24px;">${escapeHtml(input.body)}</p>
        <p style="font-size: 12px; color: #888; line-height: 1.5;">Ticket #${input.ticketNumber} — ${escapeHtml(input.subject)}. Reply to this email to continue the conversation.</p>
      </div>
    `
  });

  if (error) {
    console.error(`[email] Resend failed to send ticket #${input.ticketNumber} reply:`, error);
    return false;
  }
  return true;
}

const webBase = () => (process.env.WEB_APP_URL ?? 'https://4fgmonitor.com').replace(/\/+$/, '');
export const testerPortalUrl = () => `${webBase()}/testers`;

/** The sign-in code for the beta-tester bug tracker. */
export async function sendTesterCodeEmail(to: string, code: string): Promise<void> {
  const resend = getClient();
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not set — tester sign-in code for ${to}: ${code}`);
    return;
  }
  const { error } = await resend.emails.send({
    from: EMAIL_FROM,
    to,
    subject: 'Your sign-in code — 4FG beta testing',
    html: `
      <div style="font-family: -apple-system, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
        <p style="font-size: 13px; font-weight: 700; letter-spacing: 0.5px; color: #2d7450; text-transform: uppercase; margin: 0 0 24px;">4FG beta testing</p>
        <h1 style="font-size: 20px; margin: 0 0 12px;">Sign in to the bug tracker</h1>
        <p style="font-size: 15px; color: #444; line-height: 1.5; margin: 0 0 24px;">Use this code to sign in and report bugs.</p>
        <div style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #12271d; background: #e9f6ec; border-radius: 8px; padding: 16px 20px; text-align: center; margin: 0 0 24px;">${code}</div>
        <p style="font-size: 13px; color: #888; line-height: 1.5;">This code expires in 10 minutes. If you didn't request it, ignore this email.</p>
      </div>
    `
  });
  if (error) console.error(`[email] Resend failed to send a tester code to ${to}:`, error);
}

/** Tell someone they have been added as a beta tester. Returns whether it was handed to Resend. */
export async function sendTesterInviteEmail(input: { to: string; name: string }): Promise<boolean> {
  const link = testerPortalUrl();
  const resend = getClient();
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not set — tester invite for ${input.to} not sent`);
    return false;
  }
  const { error } = await resend.emails.send({
    from: EMAIL_FROM,
    to: input.to,
    subject: "You're invited to test the 4FG app",
    html: `
      <div style="font-family: -apple-system, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px;">
        <p style="font-size: 13px; font-weight: 700; letter-spacing: 0.5px; color: #2d7450; text-transform: uppercase; margin: 0 0 24px;">4FG beta testing</p>
        <h1 style="font-size: 20px; margin: 0 0 12px;">Hi ${escapeHtml(input.name)}, welcome to the test team</h1>
        <p style="font-size: 15px; color: #444; line-height: 1.5; margin: 0 0 24px;">
          Use the bug tracker to report anything that goes wrong while testing the 4FG app. Sign in with this email
          address: we send you a one-time code each time, so there is no password to remember.
        </p>
        <p style="margin: 0 0 24px;">
          <a href="${escapeHtml(link)}" style="display: inline-block; background: #2d7450; color: #fff; text-decoration: none; font-weight: 700; padding: 12px 22px; border-radius: 8px;">Open the bug tracker</a>
        </p>
        <p style="font-size: 13px; color: #888; line-height: 1.5;">If you weren't expecting this, you can safely ignore this email.</p>
      </div>
    `
  });
  if (error) {
    console.error(`[email] Resend failed to send a tester invite to ${input.to}:`, error);
    return false;
  }
  return true;
}

/** A report changed in a way the tester should act on (needs info, or fixed and ready to retest). */
export async function sendTesterBugUpdateEmail(input: {
  to: string;
  name: string;
  number: number;
  title: string;
  heading: string;
  message: string;
}): Promise<void> {
  const resend = getClient();
  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not set — update on bug #${input.number} to ${input.to} not sent`);
    return;
  }
  const link = `${testerPortalUrl()}/reports/${input.number}`;
  const { error } = await resend.emails.send({
    from: EMAIL_FROM,
    to: input.to,
    subject: `Bug #${input.number}: ${input.heading}`,
    html: `
      <div style="font-family: -apple-system, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px;">
        <p style="font-size: 13px; font-weight: 700; letter-spacing: 0.5px; color: #2d7450; text-transform: uppercase; margin: 0 0 24px;">4FG beta testing</p>
        <p style="font-size: 15px; color: #1a2e1a; margin: 0 0 12px;">Hi ${escapeHtml(input.name)},</p>
        <p style="font-size: 15px; color: #333; line-height: 1.6; margin: 0 0 8px;"><strong>#${input.number} · ${escapeHtml(input.title)}</strong></p>
        <p style="font-size: 15px; color: #333; line-height: 1.6; white-space: pre-wrap; margin: 0 0 24px;">${escapeHtml(input.message)}</p>
        <p style="margin: 0;"><a href="${escapeHtml(link)}" style="display: inline-block; background: #2d7450; color: #fff; text-decoration: none; font-weight: 700; padding: 12px 22px; border-radius: 8px;">Open the report</a></p>
      </div>
    `
  });
  if (error) console.error(`[email] Resend failed to send bug #${input.number} update:`, error);
}
