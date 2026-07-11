import { NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { signAdminSession, ADMIN_SESSION_COOKIE } from '@/lib/server/jwt';
import { prisma } from '@/lib/server/prisma';

export const runtime = 'nodejs';

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

export async function POST(req: Request) {
  const result = loginSchema.safeParse(await req.json());
  if (!result.success) {
    return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
  }

  const { username, password } = result.data;
  const validUsername = process.env.ADMIN_USERNAME;
  const validPassword = process.env.ADMIN_PASSWORD;

  let token: string;

  if (validUsername && validPassword && username === validUsername && password === validPassword) {
    token = signAdminSession({
      adminId: 'root',
      username: validUsername,
      name: 'Super Admin',
      role: 'SUPER_ADMIN'
    });
  } else {
    const admin = await prisma.adminUser.findUnique({ where: { email: username.toLowerCase() } });
    const passwordOk = admin ? await bcrypt.compare(password, admin.passwordHash) : false;

    if (!admin || !admin.isActive || !passwordOk) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    token = signAdminSession({
      adminId: admin.id,
      username: admin.email,
      name: admin.name,
      role: admin.role
    });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 12
  });
  return res;
}
