import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, PlugZap } from 'lucide-react';

import { getSession } from '@/lib/server-api';
import { Card, buttonClass } from '@/components/ui';
import { ResultsView } from './results-view';

export const metadata: Metadata = { title: 'Session results' };

/**
 * A shell, so the view can be a client component.
 *
 * The results page has to know when the partner submits, and the gateway has
 * been emitting `review_submitted` all along with nothing listening. Watching
 * for it needs a socket, and a socket needs a client component - which is why
 * this page is now split the same way the review page is.
 *
 * `pairPathUserId` rather than the platform id: everything the API returns
 * about a session is keyed on PairPath's own users.id, so comparing against
 * the platform id would show both reviews as somebody else's.
 */
export default async function PairResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect('/login');

  if (!session.pairPathUserId) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card className="px-6 py-12 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-cg-lg bg-warn/10 text-warn">
            <PlugZap size={22} strokeWidth={2} aria-hidden />
          </span>
          <h1 className="mt-4 text-lg font-bold text-ink">Pairing is not connected</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-body">
            Pairing could not be reached when you signed in, so these results cannot
            open. Sign out and back in once it is available again.
          </p>
          <Link
            href="/pair"
            className={buttonClass({ variant: 'secondary', className: 'mt-6' })}
          >
            <ArrowLeft size={16} strokeWidth={2.2} aria-hidden />
            Back to pairing
          </Link>
        </Card>
      </div>
    );
  }

  return <ResultsView sessionId={id} userId={session.pairPathUserId} />;
}
