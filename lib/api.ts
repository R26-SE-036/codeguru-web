/**
 * The browser's only way to reach a backend.
 *
 * Every call goes to /api/bff/<service>/..., same-origin, with no
 * Authorization header - the proxy attaches the token server-side. There is no
 * axios interceptor here and no refresh logic, because there is no token in the
 * browser to refresh.
 *
 * What this replaces: four separate axios clients, two of which implemented
 * refresh-and-retry differently and one of which had no refresh at all, so a
 * 401 from that service logged the student out while the others quietly
 * recovered.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /**
   * True when the request failed because a service was unreachable, rather
   * than because the caller was refused.
   *
   * This distinction is load-bearing across the platform - a 401 means reject,
   * a 503 means we could not check - and the UI must honour it too. Treating an
   * outage as a rejection is what sends a signed-in student to the login page
   * for no reason, and it was a real bug in two of the four frontends.
   */
  get isUnavailable(): boolean {
    // 504 is the proxy giving up on a backend that did not answer in time.
    return this.status === 503 || this.status === 504 || this.status === 0;
  }
}

export type Service = 'coach' | 'study' | 'pair' | 'play';

/**
 * The reason a request failed, out of three different error shapes.
 *
 * ================= WHY THIS IS NOT ONE FIELD READ =================
 * The four backends are three frameworks, and each words a failure its own
 * way:
 *
 *   FastAPI   { detail: "Not signed in." }                 coach, study
 *   NestJS    { statusCode, message, error: "Bad Request" } pair
 *   Express   { error: "userId is required" }              play
 *
 * This used to read `detail`, then `error`. For NestJS that lands on `error` -
 * which holds the HTTP status phrase, not the reason - so a student who tried
 * to join a session that already had two people in it was told "Bad Request".
 * The API had said "That session already has two people in it." and the words
 * were thrown away one layer from the screen.
 *
 * `message` is therefore read before `error`, and `error` still works for
 * Express, which puts the real reason there. NestJS's ValidationPipe reports
 * `message` as an ARRAY of failed constraints, so that case is joined rather
 * than rendered as "[object Object]".
 * ==================================================================
 *
 * Exported for its own sake: it is a pure function with three framework
 * conventions and two fallbacks folded into it, and it is the piece worth
 * testing first when this app grows a test runner.
 */
export function errorMessage(body: unknown, status: number): string {
  const payload = body as {
    detail?: unknown;
    message?: unknown;
    error?: unknown;
  } | null;

  for (const candidate of [payload?.detail, payload?.message, payload?.error]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate;

    // ValidationPipe: ["joinCode must be a string", "joinCode should not be empty"]
    if (Array.isArray(candidate)) {
      const parts = candidate.filter((part): part is string => typeof part === 'string' && !!part.trim());
      if (parts.length) return parts.join('. ');
    }
  }

  return `Request failed (${status}).`;
}

async function request<T>(
  service: Service,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const url = `/api/bff/${service}${path.startsWith('/') ? path : `/${path}`}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
      // Same-origin, so the session cookie rides along automatically. Stated
      // rather than left to the default because the default changed once and
      // this is the line everything depends on.
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('Could not reach the server.', 0);
  }

  if (response.status === 204) return undefined as T;

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Empty or non-JSON body. Falls through to the status-based message.
  }

  if (!response.ok) {
    throw new ApiError(errorMessage(body, response.status), response.status);
  }

  return body as T;
}

export const api = {
  get: <T>(service: Service, path: string) => request<T>(service, path),

  post: <T>(service: Service, path: string, body?: unknown) =>
    request<T>(service, path, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),

  put: <T>(service: Service, path: string, body?: unknown) =>
    request<T>(service, path, {
      method: 'PUT',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
};

/** Sign out, then hard-navigate so no stale client state survives. */
export async function signOut(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  window.location.href = '/login';
}
