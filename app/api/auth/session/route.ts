import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, unsealSession } from '@/lib/session';

/**
 * Who is signed in.
 *
 * Returns the user only - never a token, and deliberately not the expiry. A
 * client that could see when the access token expires would be tempted to
 * manage refresh itself, which is exactly what middleware exists to centralise:
 * refresh tokens rotate, so more than one refresher destroys the session.
 */
export async function GET(request: NextRequest) {
  const session = await unsealSession(request.cookies.get(SESSION_COOKIE)?.value);

  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  return NextResponse.json({
    user: session.user,
    // Whether the pairing features work this session. The UI needs to know so
    // it can explain, rather than offering a route that answers 503.
    pairPathConnected: Boolean(session.pairPathToken && session.pairPathUserId),
  });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
