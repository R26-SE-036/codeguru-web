/**
 * The single proxy. Every backend call a browser makes goes through here.
 *
 *     /api/bff/coach/students/me/diagnostics  ->  code-coach   /api/v1/students/me/diagnostics
 *     /api/bff/study/remediation/triggers     ->  study-guider /api/remediation/triggers
 *     /api/bff/pair/sessions/my               ->  pairpath     /sessions/my
 *     /api/bff/play/profile/<id>              ->  gamification /api/v1/gamification/profile/<id>
 *
 * The token is attached here, server-side. The browser sends no Authorization
 * header, knows no backend URL, and cannot reach any of these services
 * directly - which is what makes CORS irrelevant rather than merely configured.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  SESSION_COOKIE,
  cookieOptions,
  sealSession,
  unsealSession,
} from '@/lib/session';
import { exchangeForPairPath } from '@/lib/code-coach';
import {
  UnsafeUpstreamPathError,
  credentialKind,
  isServiceKey,
  tokenFor,
  upstreamUrl,
} from '@/lib/upstream';

/**
 * How long one upstream call may take before the student is told so.
 *
 * There was no limit. A backend that accepted the connection and then never
 * answered - PairPath waiting on a database connection that had died while
 * idle - left the browser's request open indefinitely, and the /pair page sat
 * on "Loading..." with no error and nothing to retry. Now the request fails
 * with a 504 the page can report.
 *
 * Forty-five seconds is above anything a backend legitimately takes through
 * this proxy; code runs, the slowest thing PairPath does, go over the socket.
 */
const UPSTREAM_TIMEOUT_MS = 45_000;

/** Hop-by-hop and body-framing headers must not be forwarded. */
const STRIPPED = new Set([
  'host',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'content-length',
  'accept-encoding',
  'cookie',
]);

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ service: string; path: string[] }> },
) {
  const { service, path } = await context.params;

  if (!isServiceKey(service)) {
    return NextResponse.json({ detail: `Unknown service '${service}'.` }, { status: 404 });
  }

  // Before the session is read, so a probe learns nothing about whether it is
  // signed in. See upstreamUrl for the paths this refuses and why.
  let url: string;
  try {
    url = upstreamUrl(service, `/${path.join('/')}`, request.nextUrl.search);
  } catch (error) {
    if (error instanceof UnsafeUpstreamPathError) {
      return NextResponse.json({ detail: 'Invalid path.' }, { status: 400 });
    }
    throw error;
  }

  // Middleware has already rejected requests with no session, but this route
  // must not depend on that: it reads the session anyway rather than trusting
  // that a matcher pattern will always cover it.
  const session = await unsealSession(request.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ detail: 'Not signed in.' }, { status: 401 });
  }

  let token = tokenFor(service, session);

  /*
   * Only reachable for PairPath, whose token is exchanged rather than issued.
   *
   * It used to 503 here and stop. That was right about the cause but wrong
   * about the remedy: the exchange happened once, at login, so a student who
   * signed in while PairPath was down stayed broken for the life of their
   * session even after it came back. Every restart of that service during
   * development produced the same three 503s on /pair, and the only fix was to
   * sign out and back in.
   *
   * The platform token in the session is all the exchange needs, so it is
   * retried here instead. On success the repaired session is re-sealed onto
   * the response, and the next request already has the token.
   */
  let refreshedCookie: string | null = null;

  /**
   * Trade the platform token for a fresh PairPath one, recording it on the
   * session so the next request does not have to.
   *
   * Safe to call at any time, and safe to call concurrently. Unlike a Code
   * Coach refresh - which rotates the refresh token and so must happen in
   * exactly one place, see the note at the top of middleware.ts - /auth/exchange
   * mints a token from the user row and invalidates nothing. Two requests
   * exchanging at once both get a working token and neither breaks the other,
   * which matters because the /pair page fetches topics and sessions in
   * parallel and both will arrive here needing the same repair.
   */
  const exchangePair = async (): Promise<string | null> => {
    const exchanged = await exchangeForPairPath(session.accessToken);
    if (!exchanged) return null;

    session.pairPathToken = exchanged.token;
    session.pairPathUserId = exchanged.userId;
    refreshedCookie = await sealSession(session);
    return exchanged.token;
  };

  if (!token && service === 'pair') {
    token = await exchangePair();
  }

  if (!token) {
    // 503, not 401: the student's platform session is fine, and sending them
    // to sign in again would not fix an upstream that is down.
    return NextResponse.json(
      {
        detail:
          `Not connected to ${service}. The ${credentialKind(service)} token ` +
          `could not be obtained - the service may be unavailable.`,
      },
      { status: 503 },
    );
  }

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!STRIPPED.has(key.toLowerCase())) headers.set(key, value);
  });

  const method = request.method;
  // GET and HEAD must not carry a body.
  const hasBody = method !== 'GET' && method !== 'HEAD';

  /*
   * Buffered, not streamed. A stream can only be sent once, and the retry
   * below has to send the same request a second time - so streaming the body
   * straight through would make the first attempt the only possible attempt.
   * Everything that crosses this proxy is small JSON (a question id, a join
   * code, an editor buffer), so holding it in memory costs nothing and buys a
   * retry that is otherwise impossible.
   */
  const body = hasBody ? await request.arrayBuffer() : undefined;

  const send = (bearer: string) => {
    headers.set('Authorization', `Bearer ${bearer}`);
    return fetch(url, {
      method,
      headers,
      body,
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  };

  let upstream: Response;
  try {
    upstream = await send(token);

    /*
     * ==================== WHY A 401 IS RETRIED HERE ====================
     * A PairPath access token lives one hour. The platform session cookie
     * lives seven days, and middleware.ts refreshes the Code Coach token on
     * every navigation but deliberately carries the PairPath one across
     * untouched - it has a separate lifetime and no refresh token of its own.
     *
     * Nothing renewed it. One hour after signing in, every PairPath request
     * came back 401, the page reported "Could not load pairing", and it stayed
     * that way for the remaining six days and twenty-three hours of the
     * session. Signing out and back in fixed it for another hour. Every other
     * component kept working throughout, because they carry `accessToken`,
     * which IS refreshed - so the platform looked healthy and only pairing
     * looked broken.
     *
     * The exchange above already knew how to mint a new one; it just never ran
     * unless the token was absent. Absent and rejected want the same remedy.
     * Retrying on the response rather than on a decoded `exp` also covers the
     * cases a clock cannot see: a restarted service, a rotated signing secret,
     * a user row that no longer exists.
     *
     * Once only, and never when the token was just minted - `refreshedCookie`
     * is set by exchangePair and is the record that this request has already
     * had its one attempt. A second 401 is a real rejection and is passed
     * through to the caller.
     * ===================================================================
     */
    if (upstream.status === 401 && service === 'pair' && !refreshedCookie) {
      // Discard the rejected response before replacing it, so undici can
      // release the connection instead of holding an unread body.
      await upstream.body?.cancel();

      const fresh = await exchangePair();
      if (fresh) upstream = await send(fresh);
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      console.error(`BFF: ${service} did not answer within ${UPSTREAM_TIMEOUT_MS} ms at ${url}`);
      return NextResponse.json(
        { detail: `${service} took too long to answer. Please try again.` },
        { status: 504 },
      );
    }

    // The distinction this platform draws everywhere: a backend that cannot be
    // reached is 503, never 401. Answering 401 would make an outage look like a
    // rejected session and send the student to re-authenticate pointlessly.
    console.error(`BFF: ${service} unreachable at ${url}:`, error);
    return NextResponse.json(
      { detail: `${service} is unavailable. Please try again.` },
      { status: 503 },
    );
  }

  // Pass the upstream response through, minus headers that describe a
  // connection this response is not travelling over.
  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!STRIPPED.has(key.toLowerCase()) && key.toLowerCase() !== 'set-cookie') {
      responseHeaders.set(key, value);
    }
  });

  const response = new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });

  // The upstream's own Set-Cookie headers are dropped above; this is ours, and
  // it is set last so it cannot be clobbered by that loop. Only present when
  // the exchange above repaired the session.
  if (refreshedCookie) {
    response.cookies.set(SESSION_COOKIE, refreshedCookie, cookieOptions());
  }

  return response;
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;

// Streaming a request body requires the Node runtime; the edge runtime cannot.
export const runtime = 'nodejs';
// Nothing here is cacheable: every response is specific to one student's token.
export const dynamic = 'force-dynamic';
