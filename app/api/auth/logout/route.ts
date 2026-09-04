import { NextRequest, NextResponse } from 'next/server';
import { logout } from '@/lib/code-coach';
import { SESSION_COOKIE, unsealSession } from '@/lib/session';

export async function POST(request: NextRequest) {
  const session = await unsealSession(request.cookies.get(SESSION_COOKIE)?.value);

  // Revoke server-side so the session is genuinely dead rather than merely
  // forgotten here. That is the whole reason sibling services verify tokens by
  // asking Code Coach rather than by checking a signature: signing out has to
  // mean something to every service, not just to this one.
  if (session) await logout(session.accessToken);

  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}

export const runtime = 'nodejs';
