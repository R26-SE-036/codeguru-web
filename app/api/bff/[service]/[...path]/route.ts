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
import { SESSION_COOKIE, unsealSession } from '@/lib/session';
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

  const token = tokenFor(service, session);
  if (!token) {
    // Only reachable for PairPath, when the token exchange failed at login.
    // 503, not 401: the student's platform session is fine, and telling them
    // to sign in again would not fix it.
    return NextResponse.json(
      {
        detail:
          `Not connected to ${service}. The ${credentialKind(service)} token ` +
          `could not be obtained at sign-in - the service may be unavailable.`,
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

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
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
