import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PlugZap } from 'lucide-react';

import { getSession } from '@/lib/server-api';
import { Card } from '@/components/ui';
import { PairView } from './pair-view';

export const metadata: Metadata = { title: 'Pair' };

/**
 * A shell, so the view can be a client component that knows who is looking.
 *
 * Split the same way the workspace and results pages are, and for the same
 * reason: the session list has to say who each session was with, and "who"
 * means comparing every member against the reader. Without an id the list can
 * see both names and cannot tell which one is the partner.
 *
 * `pairPathUserId` rather than the platform id: PairPath issues its own users
 * row on first sign-in and every member, event and review points at that id,
 * so comparing against the Code Coach id would match nobody and every session
 * would claim to be with somebody else.
 */
export default async function PairPage() {
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
            Pairing could not be reached when you signed in. Sign out and back in once
            it is available again - everything else still works.
          </p>
        </Card>
      </div>
    );
  }

  return <PairView userId={session.pairPathUserId} />;
}
