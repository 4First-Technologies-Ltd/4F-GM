import type { z } from 'zod';

const COMMON = new Set([
  'password', 'password1', '12345678', '123456789', '1234567890', 'qwertyui', 'qwerty123',
  'iloveyou', 'abc12345', 'admin123', '11111111', 'password123', 'welcome1', 'letmein1'
]);

export const MIN_PASSWORD_LENGTH = 8;

/** Zod refinement shared by sign-up and password reset. */
export function validatePassword(value: string, ctx: z.RefinementCtx) {
  if (value.length < MIN_PASSWORD_LENGTH) {
    ctx.addIssue({ code: 'custom', message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  } else if (value.length > 72) {
    // bcrypt silently truncates beyond 72 bytes.
    ctx.addIssue({ code: 'custom', message: 'Password must be at most 72 characters' });
  } else if (COMMON.has(value.toLowerCase())) {
    ctx.addIssue({ code: 'custom', message: 'That password is too common. Choose a different one.' });
  }
}
