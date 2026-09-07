import Link from 'next/link';
import { Compass } from 'lucide-react';

/**
 * The 404.
 *
 * At the root rather than inside the app group, because an unknown URL is
 * reachable signed out as well as signed in - and a signed-out visitor cannot
 * be shown a screen that assumes the app shell around it. So this page carries
 * its own centring and its own way back.
 */
export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-5">
      <div className="w-full max-w-md text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-cg-lg bg-accent/10 text-accent">
          <Compass size={26} strokeWidth={2} aria-hidden />
        </span>

        <p className="mt-6 text-sm font-semibold uppercase tracking-widest text-muted">
          404
        </p>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-ink">
          There is nothing at this address
        </h1>
        <p className="mt-2 text-body">
          The link may be out of date, or the page may have moved.
        </p>

        <Link
          href="/"
          className="cg-focusable mt-7 inline-flex h-11 items-center gap-2 rounded-cg-sm bg-cg-accent px-5 font-semibold text-on-accent shadow-cg-accent transition hover:brightness-110"
        >
          Take me home
        </Link>
      </div>
    </main>
  );
}
