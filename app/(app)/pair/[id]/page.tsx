import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, PlugZap } from 'lucide-react';

import { getSession } from '@/lib/server-api';
import { Card, buttonClass } from '@/components/ui';
import { Workspace } from './workspace';

export const metadata: Metadata = { title: 'Pair session' };

export default async function PairSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect('/login');

  /*
   * PairPath's OWN user id, captured during the token exchange - not
   * session.user.user_id.
   *
   * Every foreign key in PairPath's schema points at its local users.id, and
   * everything it sends back over the socket (room members, chat authors) is
   * keyed on that. Passing the platform-wide id here compiles, connects, and
   * then renders every one of the student's own messages as their partner's,
   * because the comparison never matches.
   *
   * The gateway takes identity from the verified handshake and ignores the
   * userId in any message body, so this is presentation only - but it is
   * presentation that is wrong 100% of the time.
   */
  if (!session.pairPathUserId) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card className="px-6 py-12 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-cg-lg bg-warn/10 text-warn">
            <PlugZap size={22} strokeWidth={2} aria-hidden />
          </span>
          <h1 className="mt-4 text-lg font-bold text-ink">Pairing is not connected</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-body">
            Pairing could not be reached when you signed in, so this session cannot
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

  return <Workspace sessionId={id} userId={session.pairPathUserId} />;
}
