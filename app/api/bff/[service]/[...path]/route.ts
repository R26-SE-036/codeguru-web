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
import { credentialKind, isServiceKey, tokenFor, upstreamUrl } from '@/lib/upstream';

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

  if (!token && service === 'pair') {
    const exchanged = await exchangeForPairPath(session.accessToken);

    if (exchanged) {
      session.pairPathToken = exchanged.token;
      session.pairPathUserId = exchanged.userId;
      token = exchanged.token;
      refreshedCookie = await sealSession(session);
    }
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
  headers.set('Authorization', `Bearer ${token}`);

  const url = upstreamUrl(service, `/${path.join('/')}`, request.nextUrl.search);

  // GET and HEAD must not carry a body; `duplex` is required by undici for any
  // request that does.
  const method = request.method;
  const hasBody = method !== 'GET' && method !== 'HEAD';

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      method,
      headers,
      body: hasBody ? request.body : undefined,
      // @ts-expect-error - `duplex` is required at runtime for a streamed body
      // but is missing from the DOM RequestInit type.
      duplex: hasBody ? 'half' : undefined,
      redirect: 'manual',
      cache: 'no-store',
    });
  } catch (error) {
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
