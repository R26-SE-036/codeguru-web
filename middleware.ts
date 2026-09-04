/**
 * The auth gate, and the one place tokens are refreshed.
 *
 * ================ WHY REFRESH LIVES HERE AND NOT IN THE PROXY ================
 * Code Coach ROTATES refresh tokens: the moment one is used, it is dead and a
 * new one is issued. That makes refreshing safe exactly once at a time.
 *
 * A dashboard page fans out to several services at once. If each proxied
 * request noticed an expiring token and refreshed on its own, the first would
 * succeed and rotate the token, and every other in-flight refresh would present
 * a token that no longer exists - Code Coach would reject them, the session
 * would be cleared, and the student would be signed out mid-page. It would look
 * intermittent, and it would be worse under good network conditions, because
 * that is when requests overlap most.
 *
 * Middleware runs once per request, before any route handler and therefore
 * before any fan-out. Refreshing here means one refresh per navigation, never
 * concurrent with itself.
 * =============================================================================
 */

import { NextRequest, NextResponse } from 'next/server';
import { refresh } from './lib/code-coach';
import {
  SESSION_COOKIE,
  cookieOptions,
  needsRefresh,
  sealSession,
  unsealSession,
} from './lib/session';

/** Reachable without a session. */
const PUBLIC_PATHS = ['/login', '/register'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const session = await unsealSession(request.cookies.get(SESSION_COOKIE)?.value);

  // ── No session ──
  if (!session) {
    if (isPublic(pathname)) return NextResponse.next();

    // An API call gets a status code, not a redirect to an HTML page. A fetch
    // that receives 307 to /login follows it and resolves with a page of
    // markup, which the caller then tries to parse as JSON - a confusing
    // failure a long way from its cause.
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ detail: 'Not signed in.' }, { status: 401 });
    }

    const login = new URL('/login', request.url);
    // Come back to where they were trying to go. Path and query only - never
    // an absolute URL from the request, which would be an open redirect of
    // exactly the kind the portal's allow-list existed to prevent.
    if (pathname !== '/') login.searchParams.set('next', `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  // Signed in and heading for the login page: send them where they were going.
  if (isPublic(pathname)) {
    const next = request.nextUrl.searchParams.get('next');
    const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
    return NextResponse.redirect(new URL(target, request.url));
  }

  if (!needsRefresh(session)) return NextResponse.next();

  // ── Refresh, once ──
  try {
    const refreshed = await refresh(session.refreshToken);

    // Carry the PairPath identity across. It has its own lifetime and is not
    // reissued by a Code Coach refresh; dropping it here would silently sign
    // the student out of the pairing features only.
    refreshed.pairPathToken = session.pairPathToken;
    refreshed.pairPathUserId = session.pairPathUserId;

    const response = NextResponse.next();
    response.cookies.set(SESSION_COOKIE, await sealSession(refreshed), cookieOptions());
    return response;
  } catch {
    // The refresh token is genuinely spent or revoked. Clear the cookie and
    // send them to sign in - but only for page requests; an API caller gets a
    // 401 so it can decide for itself.
    const response = pathname.startsWith('/api/')
      ? NextResponse.json({ detail: 'Your session has expired.' }, { status: 401 })
      : NextResponse.redirect(new URL('/login', request.url));

    response.cookies.delete(SESSION_COOKIE);
    return response;
  }
}

export const config = {
  matcher: [
    /*
     * Everything except Next's own assets and the auth endpoints.
     *
     * /api/auth/* is excluded deliberately: those routes establish a session,
     * so gating them on having one would make signing in impossible.
     */
    '/((?!_next/static|_next/image|favicon.ico|api/auth/).*)',
  ],
};
