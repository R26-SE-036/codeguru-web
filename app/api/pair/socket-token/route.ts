/**
 * The one place a token reaches the browser, and the reason is structural.
 *
 * Socket.IO opens a WebSocket. Next.js route handlers cannot proxy an upgrade,
 * so the browser connects to PairPath directly and PairPath verifies its own
 * JWT during the handshake - websocket.gateway.ts reads
 * `client.handshake.auth.token`. There is no way to put the BFF in the middle
 * of that without reimplementing the gateway.
 *
 * What bounds the exposure:
 *
 *  - It is PairPath's token, not the platform one, so it is useless against
 *    Code Coach, Study Guider or Gamification.
 *  - The client holds it in a variable for the life of the connection and never
 *    persists it. Nothing writes it to localStorage - that is the habit this
 *    whole architecture exists to break.
 *  - The connection is same-origin, routed by the load balancer at /pair-ws/*.
 */

import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, unsealSession } from '@/lib/session';

export async function GET(request: NextRequest) {
  const session = await unsealSession(request.cookies.get(SESSION_COOKIE)?.value);

  if (!session) {
    return NextResponse.json({ detail: 'Not signed in.' }, { status: 401 });
  }

  if (!session.pairPathToken) {
    // 503, not 401. The platform session is fine; PairPath specifically could
    // not be reached when the exchange was attempted, and signing in again
    // would not change that.
    return NextResponse.json(
      { detail: 'Pairing is unavailable - PairPath could not be reached at sign-in.' },
      { status: 503 },
    );
  }

  return NextResponse.json({ token: session.pairPathToken });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
