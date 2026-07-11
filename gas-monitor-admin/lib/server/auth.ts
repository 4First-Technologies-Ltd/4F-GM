import { NextResponse } from 'next/server';
import { ADMIN_SESSION_COOKIE, verifyAdminSession, AdminSessionPayload } from './jwt';

function readToken(req: Request): string | null {
  const cookieHeader = req.headers.get('cookie') ?? '';
  return (
    cookieHeader
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${ADMIN_SESSION_COOKIE}=`))
      ?.split('=')[1] ?? null
  );
}

export function getAdminSession(req: Request): AdminSessionPayload | null {
  const token = readToken(req);
  if (!token) return null;
  try {
    return verifyAdminSession(token);
  } catch {
    return null;
  }
}

export function requireAdmin(req: Request): NextResponse | null {
  const session = getAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  return null;
}

export function requireSuperAdmin(req: Request): NextResponse | null {
  const session = getAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (session.role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'Super admin access required' }, { status: 403 });
  }
  return null;
}
