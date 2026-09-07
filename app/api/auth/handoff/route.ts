import { NextRequest, NextResponse } from 'next/server';

import { SESSION_COOKIE, unsealSession } from '@/lib/session';
import { isAllowedLoopbackRedirect } from '@/lib/loopback';
import { upstreamUrl } from '@/lib/upstream';

/**
 * Mint a one-time sign-in code for the VS Code extension.
 *
 * ── What this restores ──────────────────────────────────────────────────────
 * The extension signs in by opening this app at
 * /login?redirect_uri=http://127.0.0.1:53682/callback and waiting on a loopback
 * server for a code. The retired Vite portal implemented that; when the portal
 * was replaced by this app the flow was not carried across, so the login page
 * ignored redirect_uri, set its cookie, and redirected to "/" - and the
 * extension waited on 53682 until it timed out. The backend endpoints had been
 * there the whole time; nothing was calling them.
 *
 * ── Why a code and not the token ────────────────────────────────────────────
 * The browser holds an httpOnly, encrypted session cookie and cannot read the
 * access token inside it - that is the entire point of the design. So the page
 * asks this route, which opens the cookie server-side, exchanges it for a
 * short-lived code, and hands back only the code. No token ever reaches the
 * browser, and no token ever appears in a URL.
 *
 * Redeeming that code gives the extension its OWN session under its own client
 * name, rather than a copy of the browser's - so signing out of one does not
 * sign the student out of the other.
 */
export async function POST(request: NextRequest) {
  const session = await unsealSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ detail: 'Not signed in.' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const redirectUri: string | undefined = body?.redirectUri;

  // Checked here as well as at the redirect. This route is what mints the
  // credential, so it should refuse to produce one for a destination that
  // could never legitimately receive it - rather than minting it and relying
  // on a later check to decide not to send it.
  if (!isAllowedLoopbackRedirect(redirectUri)) {
    return NextResponse.json(
      {
        detail:
          'That sign-in callback address is not allowed. The editor extension ' +
          'must use a loopback address such as http://127.0.0.1:53682/callback.',
      },
      { status: 400 },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl('coach', '/auth/handoff', ''), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        'Content-Type': 'application/json',
      },
      // The client name the extension redeems under. It must not be the
      // browser's, or the two clients share a refresh token and fight over
      // rotation.
      body: JSON.stringify({ client_name: 'codeguru-vscode' }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
  } catch (error) {
    console.error('Handoff: could not reach the platform store:', error);
    return NextResponse.json(
      { detail: 'Could not reach the sign-in service. Please try again.' },
      { status: 503 },
    );
  }

  const payload = await upstream.json().catch(() => null);

  if (!upstream.ok) {
    return NextResponse.json(
      { detail: payload?.detail ?? 'Could not create a sign-in code.' },
      { status: upstream.status },
    );
  }

  return NextResponse.json({ code: payload?.code });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
