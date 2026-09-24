'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Loader2 } from 'lucide-react';

import { FormError, FormSuccess } from '@/components/field';
import { buttonClass } from '@/components/ui';
import { postRecovery, takeTokenFromFragment } from '@/lib/recovery';

/**
 * Confirm a recovery email, from the link sent to it.
 *
 * Confirms on arrival: opening the link is the proof. Works signed in or out,
 * since the link is often opened on another device - see OPEN_PATHS in
 * middleware.ts.
 */
export default function ConfirmEmailPage() {
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  // React runs effects twice in development; a token works once.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const token = takeTokenFromFragment();
    if (!token) {
      setResult({ ok: false, message: 'This link is incomplete. Open it straight from the email.' });
      return;
    }
    postRecovery({ action: 'confirm', token })
      .then((message) => setResult({ ok: true, message }))
      .catch((error: Error) => setResult({ ok: false, message: error.message }));
  }, []);

  return (
    <>
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink">Recovery email</h1>
        <p className="mt-2 text-body">
          A confirmed recovery email also receives password-reset links.
        </p>
      </div>

      {!result ? (
        <p className="flex items-center gap-2 text-body">
          <Loader2 size={17} className="animate-spin" aria-hidden />
          Confirming…
        </p>
      ) : (
        <div className="space-y-4">
          {result.ok ? <FormSuccess>{result.message}</FormSuccess> : <FormError>{result.message}</FormError>}
          <Link href="/account" className={buttonClass({ size: 'lg', className: 'w-full' })}>
            Go to your account
            <ArrowRight size={17} strokeWidth={2.4} aria-hidden />
          </Link>
        </div>
      )}
    </>
  );
}
