'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { FormError } from '@/components/field';
import { buttonClass } from '@/components/ui';
import { completeExtensionHandoff } from '@/lib/extension-handoff';
import { isAllowedLoopbackRedirect } from '@/lib/loopback';

interface SignedInUser {
  full_name?: string;
  email?: string;
}

type EditorSignInState =
  | { status: 'checking' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; user: SignedInUser };

/**
 * Whether this browser is already signed in, asked only when the VS Code
 * extension opened the page.
 *
 * ================ WHY THE SIGN-IN PAGES NEED TO KNOW ================
 * The extension signs in by opening /login (or /register) with a loopback
 * redirect_uri. A student's browser is usually already signed in to Code Guru,
 * and middleware sent a signed-in browser straight on from the login page -
 * dropping the return address. The student landed on the home page, and VS
 * Code waited on its loopback port until it gave up. Browser sign-in only ever
 * worked from a browser that happened to be signed out.
 *
 * Middleware now lets that one case through, and the page asks here.
 * ===================================================================
 */
export function useEditorSignInState(redirectUri: string | null) {
  const fromEditor = isAllowedLoopbackRedirect(redirectUri);
  const [state, setState] = useState<EditorSignInState>({
    status: fromEditor ? 'checking' : 'signed-out',
  });

  useEffect(() => {
    if (!fromEditor) return;
    let live = true;

    fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' })
      .then(async (response) =>
        response.ok ? (((await response.json()) as { user?: SignedInUser }).user ?? null) : null,
      )
      // Could not ask: show the form. Signing in again always works.
      .catch(() => null)
      .then((user) => {
        if (live) setState(user ? { status: 'signed-in', user } : { status: 'signed-out' });
      });

    return () => {
      live = false;
    };
  }, [fromEditor]);

  /** Sign this browser out, so the form can sign in as someone else. */
  async function useAnotherAccount() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => undefined);
    setState({ status: 'signed-out' });
  }

  return { state, useAnotherAccount };
}

/**
 * Connect the editor as the student this browser is signed in as.
 *
 * A button rather than an automatic hand-off: the code is a credential, and a
 * page should not mint one because some other page opened this URL. The
 * student sees whose account VS Code is about to get, and chooses.
 */
export function ConnectEditor({
  user,
  redirectUri,
  onUseAnotherAccount,
}: {
  user: SignedInUser;
  redirectUri: string;
  onUseAnotherAccount: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setBusy(true);
    setError(null);

    const target = await completeExtensionHandoff(redirectUri);
    if (target) {
      // Stays busy: the browser is leaving for the editor's loopback page.
      window.location.href = target;
      return;
    }

    setBusy(false);
    setError('VS Code could not be connected. Start Sign In from VS Code again.');
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-ink">Connect VS Code</h2>
        <p className="mt-1.5 text-body">
          You are signed in as{' '}
          <span className="font-semibold text-ink">{user.full_name || user.email}</span>
          {user.full_name && user.email ? ` (${user.email})` : null}. Connect the Code Coach
          extension to this account?
        </p>
      </div>

      {error && <FormError>{error}</FormError>}

      <button
        type="button"
        onClick={connect}
        disabled={busy}
        className={buttonClass({ size: 'lg', className: 'w-full' })}
      >
        {busy ? (
          <>
            <Loader2 size={17} className="animate-spin" aria-hidden />
            Connecting…
          </>
        ) : (
          'Connect VS Code'
        )}
      </button>

      <button
        type="button"
        onClick={onUseAnotherAccount}
        disabled={busy}
        className={buttonClass({ variant: 'secondary', size: 'lg', className: 'w-full' })}
      >
        Use a different account
      </button>
    </div>
  );
}
