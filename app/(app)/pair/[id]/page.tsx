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
   * PairPath keys its own rows on a LOCAL users.id, not the Code Coach user id -
   * every foreign key in its schema points there, which is why it exchanges the
   * platform token for one of its own rather than adopting it.
   *
   * The gateway takes identity from the verified handshake and ignores the
   * userId in any message body, so what is passed here is used only to render
   * "this message is mine". Getting it wrong would mis-style a chat bubble, not
   * misattribute a session event.
   */
  return <Workspace sessionId={id} userId={session.user.user_id} />;
}
