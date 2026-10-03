import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getSession } from '@/lib/server-api';
import { GamePlayer } from '../[gameType]/[conceptTag]/[difficulty]/game-player';

export const metadata: Metadata = { title: 'Daily challenge' };

/**
 * /play/daily - today's challenge.
 *
 * The same player as every other round, in daily mode: the question comes
 * from the engine's /daily rather than from the adaptive chooser, and the
 * submission asks to be the counted attempt. The route parameters the player
 * normally takes are placeholders here; the question carries its own format,
 * concept and level.
 */
export default async function DailyChallengePage() {
  const session = await getSession();
  if (!session) redirect('/login');

  return (
    <GamePlayer
      userId={session.user.user_id}
      gameType="daily"
      conceptTag=""
      difficulty="daily"
      mode="daily"
    />
  );
}
