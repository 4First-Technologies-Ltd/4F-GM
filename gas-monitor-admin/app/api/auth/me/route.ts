import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/server/auth';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const session = getAdminSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  return NextResponse.json({ ok: true, name: session.name, role: session.role });
}
