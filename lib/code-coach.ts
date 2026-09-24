/**
 * The Code Coach auth API, server-side only.
 *
 * Field names here are wire format, not style. The contract
 * (code-coach/integration/API_CONTRACT.md) specifies:
 *
 *     login    { identifier, password, client_name }
 *     register { full_name, email, password, client_name }
 *
 * Renaming any of them to camelCase makes the request fail validation. The
 * previous shared client carried the same warning for the same reason.
 */

import { baseUrl } from './upstream';
import type { PlatformUser, Session } from './session';

/** Recorded on the auth session so a student can see where a login came from. */
export const CLIENT_NAME = 'codeguru-web';

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

interface TokenBundle {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

interface AuthResponse {
  user: PlatformUser;
  tokens: TokenBundle;
}

/**
 * Code Coach reports failures as {"detail": "..."} and that text is written to
 * be shown to a student ("Invalid credentials.", "An account with that email
 * already exists."). Surface it rather than inventing worse wording.
 */
async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    const detail = body?.detail;

    if (typeof detail === 'string' && detail) return detail;

    // FastAPI's 422 does not put a string here. It returns a LIST of
    // {loc, msg, type} objects, one per failed field, and `String()` on that
    // renders "[object Object]" - which is what a student saw after typing a
    // password shorter than the minimum. Pull the messages out instead.
    if (Array.isArray(detail)) {
      const messages = detail
        .map((item) => {
          const field = Array.isArray(item?.loc) ? item.loc[item.loc.length - 1] : null;
          const message = typeof item?.msg === 'string' ? item.msg : null;
          if (!message) return null;
          // "body" as a field name is FastAPI's, not the student's problem.
          return field && field !== 'body' ? `${field}: ${message}` : message;
        })
        .filter(Boolean);

      if (messages.length) return messages.join('. ');
    }

    if (detail && typeof detail === 'object') {
      const message = (detail as { msg?: string; message?: string }).msg
        ?? (detail as { message?: string }).message;
      if (message) return message;
    }
  } catch {
    // Non-JSON: a proxy error page, an empty 502.
  }

  if (response.status === 429) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  return `Request failed (${response.status}).`;
}

/**
 * The student's address, passed on for Code Coach's per-client rate limit.
 *
 * ================ WHY EVERY CREDENTIAL CALL CARRIES IT ================
 * Code Coach allows ten attempts a minute per client on register, login and
 * refresh, and identifies the client by X-Forwarded-For - or, without one, by
 * the socket peer. These calls are made by this server, so without the header
 * the peer is the web container, and every student on the platform shared ONE
 * bucket. The eleventh token refresh anywhere in a minute got 429; middleware
 * reads a failed refresh as a spent session and signs that student out. A
 * class of thirty arriving together would have been signed out in turns.
 *
 * `clientAddress` is the X-Forwarded-For this server received. Caddy sets it
 * from the real peer, replacing anything a client sent, and the web container
 * is reachable only through Caddy - so it names the student, not whoever typed
 * a header. Absent (running `npm run dev` with no proxy), nothing is sent and
 * Code Coach falls back to the peer, which is then the student's own machine.
 * =======================================================================
 */
function forwardedFor(clientAddress?: string | null): Record<string, string> {
  return clientAddress ? { 'X-Forwarded-For': clientAddress } : {};
}

async function postJson<T>(path: string, body: unknown, clientAddress?: string | null): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${baseUrl('coach')}/api/v1${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...forwardedFor(clientAddress) },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    // DNS failure, connection refused. The service being down must not read to
    // the student as "wrong password".
    throw new AuthError('Cannot reach Code Coach. Is the backend running?', 0);
  }

  if (!response.ok) throw new AuthError(await readError(response), response.status);
  return response.json() as Promise<T>;
}

function toSession(auth: AuthResponse): Session {
  return {
    accessToken: auth.tokens.access_token,
    refreshToken: auth.tokens.refresh_token,
    accessExpiresAt: Date.now() + Number(auth.tokens.expires_in) * 1000,
    user: auth.user,
  };
}

export async function login(
  identifier: string,
  password: string,
  clientAddress?: string | null,
): Promise<Session> {
  const auth = await postJson<AuthResponse>(
    '/auth/login',
    { identifier, password, client_name: CLIENT_NAME },
    clientAddress,
  );
  return toSession(auth);
}

export async function register(
  fullName: string,
  email: string,
  password: string,
  clientAddress?: string | null,
): Promise<Session> {
  const auth = await postJson<AuthResponse>(
    '/auth/register',
    { full_name: fullName, email, password, client_name: CLIENT_NAME },
    clientAddress,
  );
  return toSession(auth);
}

/**
 * Rotate the token pair.
 *
 * Refresh tokens rotate: the one passed in is dead the moment this returns, so
 * the result must be stored. Calling this twice concurrently with the same
 * refresh token destroys the session - which is why refresh happens in
 * middleware, once, ahead of any fan-out. See middleware.ts.
 */
export async function refresh(refreshToken: string, clientAddress?: string | null): Promise<Session> {
  const auth = await postJson<AuthResponse>('/auth/refresh', { refresh_token: refreshToken }, clientAddress);
  return toSession(auth);
}

/**
 * The account-recovery calls: forgot password, reset password, and confirming
 * a recovery email. None has a session to go with it - the student has lost
 * their password, or is following a link from an email - so they are posted
 * like sign-in, with the student's address for Code Coach's rate limit.
 *
 * Paths are an allow-list rather than a parameter from the browser, so the
 * route calling this cannot be turned into a way to reach anything else.
 */
export type RecoveryAction = 'password/forgot' | 'password/reset' | 'recovery-email/confirm';

export async function accountRecovery(
  action: RecoveryAction,
  body: Record<string, unknown>,
  clientAddress?: string | null,
): Promise<{ message: string }> {
  return postJson<{ message: string }>(`/auth/${action}`, body, clientAddress);
}

/** Best effort: a failed logout must still clear the local session. */
export async function logout(accessToken: string): Promise<void> {
  try {
    await fetch(`${baseUrl('coach')}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
  } catch {
    // Deliberately ignored.
  }
}

/**
 * Trade a Code Coach token for a PairPath one.
 *
 * Fails soft: a student who cannot reach PairPath should still be able to use
 * Study Guider and the games, so a failure here leaves `pairPathToken` unset
 * and the PairPath routes report it rather than blocking sign-in.
 *
 * PairPath's own endpoint already distinguishes the cases properly - it
 * answers 503, not 401, when it cannot verify with Code Coach, precisely so a
 * client does not respond to an outage by sending the student to re-authenticate.
 */
export async function exchangeForPairPath(
  accessToken: string,
): Promise<{ token: string; userId: string } | null> {
  try {
    const response = await fetch(`${baseUrl('pair')}/auth/exchange`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      // `codeCoachAccessToken`, exactly. The controller reads a single named
      // property - @Body('codeCoachAccessToken') - so any other key arrives as
      // undefined and the request fails with a 400 rather than an auth error,
      // which is a confusing way to learn you guessed the field name.
      body: JSON.stringify({ codeCoachAccessToken: accessToken }),
      cache: 'no-store',
      // Bounded like the proxy's own calls: an exchange that never answers
      // would otherwise hold the request that needed the token open with it.
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      console.warn(`PairPath token exchange returned ${response.status}.`);
      return null;
    }

    // camelCase, and `user.id` is PairPath's OWN id, not the Code Coach one.
    // Every foreign key in that schema points at this local users.id, which is
    // the whole reason the exchange exists - so this is the id to compare
    // against anything PairPath sends back.
    const body = await response.json();
    const token = body?.accessToken;
    const userId = body?.user?.id;

    if (!token || !userId) {
      console.warn('PairPath token exchange returned an unexpected body shape.');
      return null;
    }

    return { token, userId };
  } catch (error) {
    console.warn('PairPath token exchange failed:', error);
    return null;
  }
}
