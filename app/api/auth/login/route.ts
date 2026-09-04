/**
 * Sign in, and seal the result into the session cookie.
 *
 * The credentials reach this server and go straight to Code Coach; they are
 * never stored, and no token is returned to the browser. What the client gets
 * back is the user object and a Set-Cookie it cannot read.
 */

import { NextRequest, NextResponse } from 'next/server';
import { AuthError, exchangeForPairPath, login } from '@/lib/code-coach';
import { SESSION_COOKIE, cookieOptions, sealSession } from '@/lib/session';

export async function POST(request: NextRequest) {
  let identifier: string;
  let password: string;

  try {
    const body = await request.json();
    identifier = String(body?.identifier ?? '').trim();
    password = String(body?.password ?? '');
  } catch {
    return NextResponse.json({ detail: 'Malformed request.' }, { status: 400 });
  }

  if (!identifier || !password) {
    return NextResponse.json({ detail: 'Enter your email and password.' }, { status: 400 });
  }

  try {
    const session = await login(identifier, password);

    // Fails soft. A student who cannot reach PairPath should still get into
    // Study Guider and the games; the pairing routes report the missing token
    // themselves rather than blocking sign-in for everything else.
    session.pairPathToken = (await exchangeForPairPath(session.accessToken)) ?? undefined;

    const response = NextResponse.json({ user: session.user });
    response.cookies.set(SESSION_COOKIE, await sealSession(session), cookieOptions());
    return response;
  } catch (error) {
    if (error instanceof AuthError) {
      // Code Coach's own wording, which is written to be shown to a student.
      // status 0 means the request never landed - an outage, not a rejection,
      // so it must not read as "wrong password".
      return NextResponse.json(
        { detail: error.message },
        { status: error.status === 0 ? 503 : error.status },
      );
    }
    console.error('Login failed:', error);
    return NextResponse.json({ detail: 'Could not sign you in.' }, { status: 500 });
  }
}

export const runtime = 'nodejs';
