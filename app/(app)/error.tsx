'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { RotateCcw, TriangleAlert } from 'lucide-react';

import { Card, buttonClass } from '@/components/ui';

/**
 * What a student sees when a page in the app throws.
 *
 * Without this file, Next's production fallback is a bare white page reading
 * "Application error: a client-side exception has occurred" - no navigation,
 * no way back, and no hint that the rest of the app still works. In a live
 * demo that is the worst available failure mode.
 *
 * It renders INSIDE the app layout, so the sidebar survives: whatever broke,
 * the student can still walk to another section rather than reaching for the
 * back button.
 *
 * `digest` is deliberately the only detail shown. Next replaces a server
 * error's real message with that hash in production precisely so internals do
 * not leak to the browser, and it is the value that ties this screen to the
 * matching line in the server log.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Page error:', error);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl">
      <Card className="px-6 py-12 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-cg-lg bg-danger/10 text-danger">
          <TriangleAlert size={22} strokeWidth={2} aria-hidden />
        </span>

        <h1 className="mt-4 text-lg font-bold text-ink">This page did not load</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-body">
          Something went wrong rendering it. Nothing you have done has been lost, and
          the rest of the app still works.
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={reset} className={buttonClass()}>
            <RotateCcw size={16} strokeWidth={2.3} aria-hidden />
            Try again
          </button>
          <Link href="/" className={buttonClass({ variant: 'secondary' })}>
            Go to your overview
          </Link>
        </div>

        {error.digest && (
          <p className="mt-6 font-mono text-xs text-faint-nontext">
            Reference {error.digest}
          </p>
        )}
      </Card>
    </div>
  );
}
