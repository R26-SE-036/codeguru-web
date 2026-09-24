'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Loader2 } from 'lucide-react';

import { Field, FormError, FormSuccess } from '@/components/field';
import { buttonClass } from '@/components/ui';
import { postRecovery } from '@/lib/recovery';

/**
 * Ask for a password-reset link.
 *
 * The answer is the same whether or not an account uses the address - Code
 * Coach words it that way on purpose, so this page cannot be used to find out
 * who has an account.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setSent(await postRecovery({ action: 'forgot', email }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">Forgot your password?</h1>
        <p className="mt-2 text-body">
          Enter the email you sign in with. We will send a link to choose a new password, to
          that address and to your recovery email if you have confirmed one.
        </p>
      </div>

      {sent ? (
        <div className="space-y-4">
          <FormSuccess>{sent}</FormSuccess>
          <p className="text-sm text-muted">
            Nothing after a few minutes? Check your spam folder, or{' '}
            <button
              type="button"
              onClick={() => setSent(null)}
              className="cg-focusable rounded font-semibold text-accent hover:underline"
            >
              try again
            </button>
            .
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <Field
            label="Email"
            type="email"
            autoComplete="username"
            required
            autoFocus
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />

          {error && <FormError>{error}</FormError>}

          <button type="submit" disabled={busy} className={buttonClass({ size: 'lg', className: 'w-full' })}>
            {busy ? (
              <>
                <Loader2 size={17} className="animate-spin" aria-hidden />
                Sending…
              </>
            ) : (
              <>
                Send reset link
                <ArrowRight size={17} strokeWidth={2.4} aria-hidden />
              </>
            )}
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-muted">
        Remembered it?{' '}
        <Link href="/login" className="cg-focusable rounded font-semibold text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
