/**
 * Validating the `redirect_uri` the VS Code extension asks us to come back to.
 *
 * ── Why this is the most security-sensitive function in the app ─────────────
 * The extension opens /login?redirect_uri=http://127.0.0.1:53682/callback and
 * expects us to send the browser back there with a one-time sign-in code. That
 * is a redirect to an attacker-supplied URL carrying a credential, which is the
 * exact shape of an open redirect - and the reason the old portal needed an
 * allow-list of permitted return origins.
 *
 * The allow-list here is much tighter than the portal's, because the only
 * legitimate destination is a server running on the student's own machine:
 *
 *   - http only. https on loopback would mean a certificate the extension does
 *     not have.
 *   - 127.0.0.1 or [::1] only. NOT "localhost": that resolves through DNS, and
 *     a DNS entry is something an attacker can influence, whereas the literal
 *     loopback address is not.
 *   - path exactly /callback, no query and no fragment of its own. Anything
 *     else is a URL doing something other than what this flow needs.
 *   - a real port, and never a privileged one.
 *
 * A code sent anywhere else would let a page the student was tricked into
 * visiting start a session as them. Two minutes and single use limit the
 * damage; not sending it at all is better.
 */

/** Ports below this are privileged and never a VS Code loopback listener. */
const MIN_PORT = 1024;

export function isAllowedLoopbackRedirect(value: string | null | undefined): boolean {
  if (!value) return false;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== 'http:') return false;

  // Literal loopback addresses only. `localhost` is deliberately excluded: it
  // goes through name resolution, and that is one more thing to trust.
  if (url.hostname !== '127.0.0.1' && url.hostname !== '[::1]' && url.hostname !== '::1') {
    return false;
  }

  if (url.pathname !== '/callback') return false;
  if (url.search || url.hash) return false;
  if (url.username || url.password) return false;

  const port = Number(url.port);
  if (!Number.isInteger(port) || port < MIN_PORT || port > 65535) return false;

  return true;
}

/**
 * The URL to send the browser to, with the code attached.
 *
 * Re-validates rather than trusting the caller to have done it. This function
 * is what actually emits the redirect, so it is the last place the check can
 * still matter.
 */
export function buildLoopbackRedirect(redirectUri: string, code: string): string | null {
  if (!isAllowedLoopbackRedirect(redirectUri)) return null;

  const url = new URL(redirectUri);
  url.searchParams.set('code', code);
  return url.toString();
}
