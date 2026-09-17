'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Loader2 } from 'lucide-react';

import { ConnectEditor, useEditorSignInState } from '@/components/connect-editor';
import { Field, FormError } from '@/components/field';
import { buttonClass } from '@/components/ui';
import { completeExtensionHandoff } from '@/lib/extension-handoff';

/**
 * The platform's one login page.
 *
 * What it replaces: a portal that signed the student in and then handed the
 * tokens to whichever service they were heading for by putting them in a URL
 * fragment, guarded by an allow-list of permitted return origins - without
 * which it would have been an open redirect handing out access tokens. Plus
 * three localhost-only /dev-login pages, each behind a two-condition gate so a
 * flag left on could not ship a second login form.
 *
 * None of that is needed with one origin. The credentials post to this app's
 * own route, which exchanges them server-side and sets an httpOnly cookie.
 * Nothing is handed anywhere.
 */
function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Kept true through the loopback navigation so the button does not flick
  // back to "Sign in" while the browser is leaving the page.
  const [handoffDone, setHandoffDone] = useState(false);

  // Opened by the VS Code extension in a browser that is already signed in:
  // offer to connect the editor rather than asking for a password again.
  const redirectUri = params.get('redirect_uri');
  const editor = useEditorSignInState(redirectUri);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
        credentials: 'same-origin',
      });

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        // The upstream wording, surfaced as-is: it is written to be read by a
        // student ("Invalid credentials.", "Too many attempts."), so replacing
        // it with something generic is strictly worse.
        setError(body?.detail ?? 'Could not sign you in.');
        return;
      }

      // The VS Code extension opens this page with a loopback redirect_uri and
      // waits for a one-time code. Handled before the normal redirect, because
      // for that flow finishing here would leave the editor waiting until it
      // timed out - which is exactly what it did before this existed.
      const handoff = await completeExtensionHandoff(redirectUri);
      if (handoff) {
        setHandoffDone(true);
        window.location.href = handoff;
        return;
      }

      // Only a path from our own query string is ever followed, and only one
      // starting with a single slash - '//evil.com' is a protocol-relative URL
      // that a browser will happily treat as absolute.
      const next = params.get('next');
      const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';

      // refresh() so the server components re-render with the new session
      // rather than serving what they rendered while signed out.
      router.replace(target);
      router.refresh();
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      if (!handoffDone) setBusy(false);
    }
  }

  if (editor.state.status === 'checking') {
    return <div className="h-[268px]" />;
  }

  if (editor.state.status === 'signed-in' && redirectUri) {
    return (
      <ConnectEditor
        user={editor.state.user}
        redirectUri={redirectUri}
        onUseAnotherAccount={editor.useAnotherAccount}
      />
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field
        label="Email"
        type="email"
        autoComplete="username"
        required
        autoFocus
        value={identifier}
        onChange={(event) => setIdentifier(event.target.value)}
        placeholder="you@example.com"
      />

      <Field
        label="Password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="••••••••"
      />

      {error && <FormError>{error}</FormError>}

      <button
        type="submit"
        disabled={busy}
        className={buttonClass({ size: 'lg', className: 'w-full' })}
      >
        {busy ? (
          <>
            <Loader2 size={17} className="animate-spin" aria-hidden />
            Signing in…
          </>
        ) : (
          <>
            Sign in
            <ArrowRight size={17} strokeWidth={2.4} aria-hidden />
          </>
        )}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">Welcome back</h1>
        <p className="mt-2 text-body">
          One account for your insights, lessons, practice and pairing.
        </p>
      </div>

      {/* useSearchParams needs a Suspense boundary, or the whole route opts
          out of static rendering at build time. The fallback matches the
          form's height so the panel does not jump as it resolves. */}
      <Suspense fallback={<div className="h-[268px]" />}>
        <LoginForm />
      </Suspense>

      <p className="mt-6 text-center text-sm text-muted">
        No account yet?{' '}
        <Link
          href="/register"
          className="cg-focusable rounded font-semibold text-accent hover:underline"
        >
          Create one
        </Link>
      </p>
    </>
  );
}
