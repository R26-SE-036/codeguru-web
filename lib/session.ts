/**
 * The platform session, sealed into an httpOnly cookie.
 *
 * ======================== WHAT THIS REPLACES ========================
 * Four frontends each kept the student's access token in `localStorage`,
 * under a shared `codeguru.*` namespace, and passed it around between origins
 * in URL fragments. Any XSS on any of the four read every token.
 *
 * Here the browser never sees a token. The cookie holds a JWE - encrypted,
 * not merely signed - so its contents are opaque to the client as well as
 * tamper-evident. Only this server can open it.
 * ====================================================================
 *
 * Stateless on purpose. A server-side session store would mean somewhere to
 * run and a shared cache between Fargate tasks; sealing everything into the
 * cookie means any task can serve any request. The cost is size: cookies are
 * capped at 4KB and this payload carries two tokens, so `assertFits` checks
 * rather than letting the browser silently drop it.
 */

import { EncryptJWT, jwtDecrypt } from 'jose';

export const SESSION_COOKIE = 'codeguru_session';

/** Refresh this far ahead of expiry. See the note in middleware.ts. */
export const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export interface PlatformUser {
  user_id: string;
  full_name?: string;
  email?: string;
}

export interface Session {
  /** Code Coach access token. Valid one hour. */
  accessToken: string;
  /** Rotating - the old one dies the moment this is used. */
  refreshToken: string;
  /** Epoch ms. Derived from `expires_in` at issue time. */
  accessExpiresAt: number;
  /**
   * PairPath issues its own JWT from a Code Coach token, because its Socket.IO
   * handshake verifies its own signature and every foreign key points at a
   * local users.id. Obtained once at login and carried here so the proxy can
   * attach the right token per service.
   */
  pairPathToken?: string;
  /**
   * PairPath's OWN user id for this student, from the token exchange.
   *
   * Not the same value as user.user_id. Every foreign key in PairPath's schema
   * points at its local users.id, and everything it sends back - session
   * members, chat authors - is keyed on that. Comparing a Code Coach id
   * against it never matches, which silently renders your own chat messages as
   * your partner's.
   */
  pairPathUserId?: string;
  user: PlatformUser;
}

let cachedKey: Uint8Array | null = null;

/**
 * Buffer.from(x, 'base64') never throws - it skips characters it does not
 * recognise - so a round trip is the only way to tell real base64 from a
 * passphrase that happens to contain base64-legal letters.
 */
function tryDecodeBase64(value: string): Buffer | null {
  const decoded = Buffer.from(value, 'base64');
  return decoded.toString('base64').replace(/=+$/, '') === value.replace(/=+$/, '')
    ? decoded
    : null;
}

function encryptionKey(): Uint8Array {
  if (cachedKey) return cachedKey;

  const secret = process.env.SESSION_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      'SESSION_ENCRYPTION_KEY is not set. It seals the session cookie; without ' +
        'it the app cannot authenticate anyone. Generate one with: ' +
        'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    );
  }

  // A256GCM needs exactly 32 bytes. Accept base64 (what the command above
  // prints) or raw UTF-8, but reject anything of the wrong length rather than
  // padding or truncating it - a short key is a weak key, and the failure
  // would be invisible.
  const asBase64 = tryDecodeBase64(secret);
  const asUtf8 = Buffer.from(secret, 'utf-8');

  const bytes = asBase64?.length === 32 ? asBase64 : asUtf8.length === 32 ? asUtf8 : null;

  if (!bytes) {
    // Report BOTH interpretations. Reporting only the one it fell back to sends
    // you looking at the wrong number: a 44-character base64 string that
    // decodes to 33 bytes gets described as "got 44", which reads like the
    // string is too long rather than that it encodes one byte too many.
    throw new Error(
      'SESSION_ENCRYPTION_KEY must be exactly 32 bytes for A256GCM. ' +
        `As base64 it decodes to ${asBase64 ? `${asBase64.length} bytes` : 'invalid base64'}; ` +
        `as UTF-8 it is ${asUtf8.length} bytes. Generate a valid one with: ` +
        'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    );
  }

  cachedKey = bytes;
  return bytes;
}

/** Seal a session into a cookie value. */
export async function sealSession(session: Session): Promise<string> {
  const jwe = await new EncryptJWT({ ...session } as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt()
    // The cookie outlives the access token deliberately: the refresh token is
    // what keeps the session alive, and it is the thing being protected here.
    .setExpirationTime('7d')
    .encrypt(encryptionKey());

  assertFits(jwe);
  return jwe;
}

/** Open a cookie value, or null if it is absent, expired or not ours. */
export async function unsealSession(value: string | undefined): Promise<Session | null> {
  if (!value) return null;

  try {
    const { payload } = await jwtDecrypt(value, encryptionKey());
    const session = payload as unknown as Session;
    return session?.accessToken ? session : null;
  } catch {
    // Tampered, expired, or sealed with a previous key. All three mean the
    // same thing to the caller: there is no session.
    return null;
  }
}

/**
 * Browsers silently drop a Set-Cookie over roughly 4KB, which presents as
 * "login appears to work, then every page says signed out" - one of the harder
 * things to diagnose from the outside. Fail loudly here instead.
 */
function assertFits(value: string): void {
  const bytes = Buffer.byteLength(value, 'utf-8');
  if (bytes > 3800) {
    throw new Error(
      `Session cookie is ${bytes} bytes, close to the ~4KB browser limit. ` +
        `Something has been added to the session payload that does not belong ` +
        `in it - move it server-side rather than raising this bound.`,
    );
  }
}

/** True when the access token is expired or close enough to warrant refreshing. */
export function needsRefresh(session: Session): boolean {
  return Date.now() >= session.accessExpiresAt - REFRESH_MARGIN_MS;
}

/** The cookie attributes, in one place so no route can set them differently. */
export function cookieOptions() {
  return {
    httpOnly: true,
    // Off on localhost, because a Secure cookie is not stored over plain http
    // and local development would appear to be broken.
    secure: process.env.NODE_ENV === 'production',
    // Lax, not Strict: the VS Code extension's browser sign-in returns here by
    // top-level navigation, and Strict would withhold the cookie on that first
    // request, bouncing the student straight back to the login page.
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  };
}
