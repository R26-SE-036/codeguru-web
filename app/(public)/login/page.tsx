'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

/**
 * The platform's one login page.
 *
 * What it replaces: a Vite portal at :4200 that signed the student in and then
 * handed the tokens to whichever service they were heading for by putting them
 * in a URL fragment, guarded by an allow-list of permitted return origins -
 * without which it would have been an open redirect handing out access tokens.
 * Plus three localhost-only /dev-login pages, each behind a two-condition gate
 * so a flag left on could not ship a second login form.
 *
 * None of that is needed once there is one origin. The credentials post to
 * this app's own route, which talks to Code Coach server-side and sets an
 * httpOnly cookie. Nothing is handed anywhere.
 */
function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
        // Code Coach's wording, surfaced as-is: it is written to be read by a
        // student ("Invalid credentials.", "Too many attempts."), so replacing
        // it with something generic is strictly worse.
        setError(body?.detail ?? 'Could not sign you in.');
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
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="identifier" className="mb-1.5 block text-sm font-medium text-ink">
          Email
        </label>
        <input
          id="identifier"
          type="email"
          autoComplete="username"
          required
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          className="w-full rounded-cg border border-line bg-card px-3 py-2 text-ink placeholder:text-muted"
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-ink">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-cg border border-line bg-card px-3 py-2 text-ink"
        />
      </div>

      {error && (
        <p role="alert" className="rounded-cg bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-cg bg-accent px-4 py-2.5 font-medium text-white transition hover:bg-accent-strong disabled:opacity-60"
      >
        {busy ? 'Signing in…' : 'Sign in'}
      </button>

      <p className="text-center text-sm text-muted">
        No account?{' '}
        <Link href="/register" className="text-accent hover:underline">
          Create one
        </Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-ink">Code Guru</h1>
          <p className="mt-1 text-sm text-muted">
            One account for the coach, your lessons, practice and pairing.
          </p>
        </div>

        <div className="rounded-cg border border-line bg-card p-6">
          {/* useSearchParams needs a Suspense boundary, or the whole route
              opts out of static rendering at build time. */}
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
