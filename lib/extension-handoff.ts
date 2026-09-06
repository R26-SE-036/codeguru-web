'use client';

import { buildLoopbackRedirect, isAllowedLoopbackRedirect } from '@/lib/loopback';

/**
 * Finish the VS Code extension's sign-in, if that is what this was.
 *
 * Returns the loopback URL to send the browser to, or null when the page was
 * not opened by the extension and the normal redirect should happen instead.
 *
 * Shared by the login and register pages: the extension offers both "Sign In"
 * and "Create Account", and both open this app the same way. Having one copy
 * means the register path cannot quietly stop working while login keeps going.
 *
 * Never throws. A student who has just successfully signed in must not be shown
 * an error because the editor handshake failed - they are signed in, and the
 * page falling back to the normal redirect leaves them somewhere useful.
 */
export async function completeExtensionHandoff(
  redirectUri: string | null,
): Promise<string | null> {
  if (!isAllowedLoopbackRedirect(redirectUri)) return null;

  try {
    const response = await fetch('/api/auth/handoff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ redirectUri }),
      credentials: 'same-origin',
    });

    if (!response.ok) return null;

    const { code } = (await response.json()) as { code?: string };
    if (!code) return null;

    // Rebuilt through the validator rather than by string concatenation, so
    // the destination is checked once more at the point it is actually used.
    return buildLoopbackRedirect(redirectUri as string, code);
  } catch {
    return null;
  }
}
