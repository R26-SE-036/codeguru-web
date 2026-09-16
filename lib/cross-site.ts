/**
 * A state-changing request that a browser sent from some other site's page.
 *
 * ================= WHY SameSite=Lax IS NOT ENOUGH HERE =================
 * The session cookie is SameSite=Lax, which keeps it off cross-site POSTs -
 * but "site" is the registrable domain, decided by the Public Suffix List. The
 * first deployment's address is <ip>.sslip.io, and sslip.io is not on that
 * list, so every other *.sslip.io host on the internet is the SAME site as
 * this one. A page on any of them could POST to /api/auth/logout or through
 * the proxy with the student's cookie attached, and SameSite would allow it.
 *
 * The browser says where a request came from, and a cross-origin one cannot
 * lie about it: Sec-Fetch-Site on current browsers, Origin on all of them.
 * Either naming another origin is refused. A request with neither did not
 * come from a browser page - curl, the system tests - and there is no cookie
 * of the student's for it to borrow.
 *
 * Reads are not checked: a cross-origin page cannot read the response of a GET
 * without CORS, which nothing here grants.
 * =======================================================================
 */

import type { NextRequest } from 'next/server';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function isCrossSiteWrite(request: NextRequest): boolean {
  if (!UNSAFE_METHODS.has(request.method.toUpperCase())) return false;

  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite === 'cross-site' || fetchSite === 'same-site') return true;

  const origin = request.headers.get('origin');
  if (origin === null) return false;
  // Sent by sandboxed frames and some redirects; never by this app's pages.
  if (origin === 'null') return true;

  // The Host the browser used. Caddy passes it through unchanged, whereas
  // nextUrl behind the proxy describes the container (see lib/loopback.ts).
  const host = request.headers.get('host') ?? request.nextUrl.host;
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}
