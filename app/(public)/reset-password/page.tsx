'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Loader2 } from 'lucide-react';

import { Field, FormError, FormSuccess } from '@/components/field';
import { buttonClass } from '@/components/ui';
import { postRecovery, takeTokenFromFragment } from '@/lib/recovery';

/**
 * Choose a new password, from the link in a reset email.
 *
 * The link carries its token in the fragment (#token=...), read here once and
 * then removed from the address bar. A successful reset signs the account out
 * everywhere, including this browser, so the page ends at "Sign in".
 */
export default function ResetPasswordPage() {
  // undefined: not read yet. null: the link had no token.
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setToken(takeTokenFromFragment()), []);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirmPassword) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setDone(await postRecovery({ action: 'reset', token: token as string, newPassword: password }));
      // The session this browser had, if any, was just revoked. Drop the
      // cookie too, so the next page is the sign-in page rather than a 401.
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (token === undefined) return <div className="h-[320px]" />;

  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">Choose a new password</h1>
        <p className="mt-2 text-body">
          After this you are signed out everywhere, so sign in again with the new password.
        </p>
      </div>

      {done ? (
        <div className="space-y-4">
          <FormSuccess>{done}</FormSuccess>
          <Link href="/login" className={buttonClass({ size: 'lg', className: 'w-full' })}>
            Sign in
            <ArrowRight size={17} strokeWidth={2.4} aria-hidden />
          </Link>
        </div>
      ) : token === null ? (
        <div className="space-y-4">
          <FormError>
            This link is incomplete. Open it straight from the email, or ask for a new one.
          </FormError>
          <Link href="/forgot-password" className={buttonClass({ variant: 'secondary', className: 'w-full' })}>
            Ask for a new link
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <Field
            label="New password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            hint="At least 8 characters."
          />
          <Field
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="••••••••"
            hint={confirmPassword && confirmPassword !== password ? 'Does not match yet.' : 'Type it again.'}
          />

          {error && <FormError>{error}</FormError>}

          <button type="submit" disabled={busy} className={buttonClass({ size: 'lg', className: 'w-full' })}>
            {busy ? (
              <>
                <Loader2 size={17} className="animate-spin" aria-hidden />
                Saving…
              </>
            ) : (
              <>
                Set new password
                <ArrowRight size={17} strokeWidth={2.4} aria-hidden />
              </>
            )}
          </button>

          {error && (
            <p className="text-center text-sm text-muted">
              <Link href="/forgot-password" className="cg-focusable rounded font-semibold text-accent hover:underline">
                Ask for a new link
              </Link>
            </p>
          )}
        </form>
      )}
    </>
  );
}
