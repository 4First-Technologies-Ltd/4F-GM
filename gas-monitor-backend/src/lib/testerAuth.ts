import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from './prisma';

/**
 * Beta testers are not users: they have no role, no profile and no access to
 * anything but the bug tracker. Their sessions are signed with a key derived
 * for this purpose, so a tester token can never be mistaken for a user access
 * token (and vice versa), even though both are JWTs.
 */
const SESSION_DAYS = 14;

function secret(): string {
  if (process.env.TESTER_JWT_SECRET) return process.env.TESTER_JWT_SECRET;
  const base = process.env.JWT_ACCESS_SECRET;
  if (!base) throw new Error('JWT_ACCESS_SECRET is not set');
  return crypto.createHmac('sha256', base).update('beta-tester-session').digest('hex');
}

export interface TesterSession {
  id: string;
  email: string;
  name: string;
}

interface TesterTokenPayload {
  sub: string;
  tv: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by requireTester. */
      tester?: TesterSession;
    }
  }
}

export function signTesterToken(tester: { id: string; tokenVersion: number }): string {
  const payload: TesterTokenPayload = { sub: tester.id, tv: tester.tokenVersion };
  return jwt.sign(payload, secret(), { expiresIn: `${SESSION_DAYS}d`, audience: 'tester' });
}

/**
 * The token alone is not enough: the tester is re-read on every request, so
 * deactivating someone signs them out immediately.
 */
export async function requireTester(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Please sign in' });
  try {
    const payload = jwt.verify(header.slice(7), secret(), { audience: 'tester' }) as unknown as TesterTokenPayload;
    const tester = await prisma.tester.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true, isActive: true, tokenVersion: true }
    });
    if (!tester || !tester.isActive || tester.tokenVersion !== payload.tv) {
      return res.status(401).json({ error: 'Please sign in' });
    }
    req.tester = { id: tester.id, email: tester.email, name: tester.name };
    return next();
  } catch {
    return res.status(401).json({ error: 'Please sign in' });
  }
}
