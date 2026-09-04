'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function RegisterPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, email, password }),
        credentials: 'same-origin',
      });

      const body = await response.json().catch(() => null);

      if (!response.ok) {
        // Code Coach's own text. For a 422 that is a per-field validation
        // message ("password: String should have at least 8 characters"),
        // which is far more useful than a generic failure - and is only
        // readable because readError unpacks FastAPI's list-of-objects shape
        // rather than stringifying it.
        setError(body?.detail ?? 'Could not create your account.');
        return;
      }

      router.replace('/');
      router.refresh();
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-ink">Create your account</h1>
          <p className="mt-1 text-sm text-muted">
            One account for the coach, your lessons, practice and pairing.
          </p>
        </div>

        <div className="rounded-cg border border-line bg-card p-6">
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label htmlFor="fullName" className="mb-1.5 block text-sm font-medium text-ink">
                Full name
              </label>
              <input
                id="fullName"
                autoComplete="name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-cg border border-line bg-card px-3 py-2 text-ink"
              />
            </div>

            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-ink">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-cg border border-line bg-card px-3 py-2 text-ink"
              />
              <p className="mt-1 text-xs text-muted">At least 8 characters.</p>
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
              {busy ? 'Creating…' : 'Create account'}
            </button>

            <p className="text-center text-sm text-muted">
              Already have one?{' '}
              <Link href="/login" className="text-accent hover:underline">
                Sign in
              </Link>
            </p>
          </form>
        </div>
      </div>
    </main>
  );
}
