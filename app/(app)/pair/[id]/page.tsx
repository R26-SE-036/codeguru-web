import { redirect } from 'next/navigation';
import { getSession } from '@/lib/server-api';
import { Workspace } from './workspace';

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
   * keyed on that. Passing the Code Coach id here compiles, connects, and then
   * renders every one of the student's own messages as their partner's,
   * because the comparison never matches.
   *
   * The gateway takes identity from the verified handshake and ignores the
   * userId in any message body, so this is presentation only - but it is
   * presentation that is wrong 100% of the time.
   */
  if (!session.pairPathUserId) {
    return (
      <p className="rounded-cg border border-line bg-card-alt px-4 py-3 text-body">
        Pairing is unavailable - PairPath could not be reached when you signed in.
        Sign out and back in once it is running.
      </p>
    );
  }

  return <Workspace sessionId={id} userId={session.pairPathUserId} />;
}
