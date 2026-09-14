'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Loader2 } from 'lucide-react';

import { ConnectEditor, useEditorSignInState } from '@/components/connect-editor';
import { Field, FormError } from '@/components/field';
import { buttonClass } from '@/components/ui';
import { completeExtensionHandoff } from '@/lib/extension-handoff';

function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [handoffDone, setHandoffDone] = useState(false);

  // VS Code's Create Account opens this page. A browser already signed in
  // gets the same offer as on the login page: connect this account.
  const redirectUri = params.get('redirect_uri');
  const editor = useEditorSignInState(redirectUri);

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
        // The upstream's own text. For a 422 that is a per-field validation
        // message ("password: String should have at least 8 characters"),
        // which is far more useful than a generic failure - and is only
        // readable because readError unpacks FastAPI's list-of-objects shape
        // rather than stringifying it into "[object Object]".
        setError(body?.detail ?? 'Could not create your account.');
        return;
      }

      // Same loopback handoff as sign-in: the extension offers Create
      // Account too, and it waits on the same port for the same code.
      const handoff = await completeExtensionHandoff(redirectUri);
      if (handoff) {
        setHandoffDone(true);
        window.location.href = handoff;
        return;
      }

      router.replace('/');
      router.refresh();
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      if (!handoffDone) setBusy(false);
    }
  }

  if (editor.state.status === 'checking') {
    return <div className="h-[420px]" />;
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
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">
          Create your account
        </h1>
        <p className="mt-2 text-body">
          One account for your insights, lessons, practice and pairing.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <Field
          label="Full name"
          autoComplete="name"
          required
          autoFocus
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          placeholder="Ada Lovelace"
        />

        <Field
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
        />

        <Field
          label="Password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="••••••••"
          hint="At least 8 characters."
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
              Creating your account…
            </>
          ) : (
            <>
              Create account
              <ArrowRight size={17} strokeWidth={2.4} aria-hidden />
            </>
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{' '}
        <Link
          href="/login"
          className="cg-focusable rounded font-semibold text-accent hover:underline"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}

export default function RegisterPage() {
  return (
    // useSearchParams needs a Suspense boundary, or the whole route opts out
    // of static rendering at build time.
    <Suspense fallback={<div className="h-[420px]" />}>
      <RegisterForm />
    </Suspense>
  );
}
