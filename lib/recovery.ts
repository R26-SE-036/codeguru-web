'use client';

/**
 * The browser half of account recovery. See app/api/auth/recovery/route.ts.
 */

export type RecoveryRequest =
  | { action: 'forgot'; email: string }
  | { action: 'reset'; token: string; newPassword: string }
  | { action: 'confirm'; token: string };

/** The server's message on success; throws Error with its message otherwise. */
export async function postRecovery(request: RecoveryRequest): Promise<string> {
  let response: Response;
  try {
    response = await fetch('/api/auth/recovery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      credentials: 'same-origin',
    });
  } catch {
    throw new Error('Could not reach the server. Please try again.');
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      response.status === 429
        ? 'Too many attempts. Please wait a minute and try again.'
        : body?.detail ?? 'Something went wrong. Please try again.',
    );
  }
  return body?.message ?? 'Done.';
}

/**
 * The token from a link's fragment (`#token=...`), which is then removed from
 * the address bar so it does not linger in history or get copied along with
 * the URL. The fragment is never sent to a server; that is why the links use it.
 */
export function takeTokenFromFragment(): string | null {
  const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
  if (window.location.hash) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
  return token;
}
