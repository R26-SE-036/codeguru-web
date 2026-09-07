/**
 * Backend calls from server components.
 *
 * The browser path (lib/api.ts) goes through /api/bff/*. A server component is
 * already on the server, so going out through its own proxy would be a pointless
 * round trip through the load balancer. This reads the session from the cookie
 * and calls the upstream directly.
 *
 * Same token selection, same rules, one shared table in lib/upstream.ts - so
 * the two paths cannot disagree about which service takes which credential.
 */

import { cookies } from 'next/headers';
import { SESSION_COOKIE, unsealSession, type Session } from './session';
import { tokenFor, upstreamUrl, type ServiceKey } from './upstream';

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  return unsealSession(store.get(SESSION_COOKIE)?.value);
}

/**
 * Fetch from a backend, or return null.
 *
 * Null rather than throwing, because a dashboard that assembles panels from
 * four services must render the three that answered. One service being down
 * should cost the student one panel, not the page - and every one of these
 * backends can be independently unavailable.
 *
 * Callers are expected to render an explicit "couldn't load this" state for a
 * null. Rendering nothing at all, or an empty list, would tell the student
 * they have no diagnostics when the truth is that we could not find out.
 */
/**
 * How long to wait for a backend before giving up on it.
 *
 * There was no timeout at all, which is worse than a slow one. `fetch` has no
 * default deadline, so an upstream that accepts the connection and then never
 * answers - a hung worker, a service mid-restart - left the server component
 * awaiting indefinitely. Next holds the navigation until a server component
 * resolves, so the student sat on the PREVIOUS page with nothing happening and
 * no way to tell whether anything was wrong.
 *
 * 8 seconds is longer than any of these calls legitimately takes and short
 * enough that a hang reads as a hang. Note this is a per-call budget: the
 * dashboard fetches in parallel, so one slow service does not add to another.
 */
const TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 8000);

export async function serverFetch<T>(
  service: ServiceKey,
  path: string,
  session?: Session | null,
): Promise<T | null> {
  const active = session ?? (await getSession());
  if (!active) return null;

  const token = tokenFor(service, active);
  if (!token) return null;

  try {
    const response = await fetch(upstreamUrl(service, path, ''), {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      console.warn(`serverFetch: ${service}${path} answered ${response.status}`);
      return null;
    }

    return (await response.json()) as T;
  } catch (error) {
    // A timeout arrives here as a TimeoutError, which is worth naming: "took
    // longer than 8s" and "refused the connection" look identical in a log
    // that only prints the message, and they have different causes.
    const reason =
      error instanceof Error && error.name === 'TimeoutError'
        ? `did not answer within ${TIMEOUT_MS}ms`
        : 'unreachable';

    console.warn(`serverFetch: ${service}${path} ${reason}:`, error);
    return null;
  }
}
