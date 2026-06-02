// Returns the signed NextAuth JWT for the current session, so the client
// can use it as a Bearer token against the backend API and Socket.IO.

import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import jwt from 'jsonwebtoken';

export const dynamic = 'force-dynamic';

const PUBLIC_BACKEND_URL =
  process.env.PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.BACKEND_URL ||
  'http://localhost:4000';

export async function GET(req: Request) {
  const raw = await getToken({
    req: req as any,
    secret: process.env.NEXTAUTH_SECRET,
  });
  if (!raw || !raw.userId) {
    return NextResponse.json({ error: 'unauthenticated', backendUrl: PUBLIC_BACKEND_URL }, { status: 401 });
  }
  const signed = jwt.sign(
    { sub: raw.userId, handle: raw.handle },
    process.env.NEXTAUTH_SECRET || 'dev-secret',
    { expiresIn: '7d' },
  );
  return NextResponse.json({ token: signed, backendUrl: PUBLIC_BACKEND_URL });
}
