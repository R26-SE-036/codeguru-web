import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/server-api';
import { GamePlayer } from './game-player';

export const metadata: Metadata = { title: 'Practice' };

/**
 * /play/<gameType>/<conceptTag>/<difficulty>
 *
 * Pass `auto` as the difficulty to let the engine's model choose. The route
 * shape is the original's, so a link that worked in the standalone app still
 * works here.
 */
export default async function GamePage({
  params,
}: {
  params: Promise<{ gameType: string; conceptTag: string; difficulty: string }>;
}) {
  const { gameType, conceptTag, difficulty } = await params;
  const session = await getSession();

  // Middleware has already handled this; the redirect is here so the component
  // below can take a plain string rather than a nullable one.
  if (!session) redirect('/login');

  return (
    <GamePlayer
      userId={session.user.user_id}
      gameType={decodeURIComponent(gameType)}
      conceptTag={decodeURIComponent(conceptTag)}
      difficulty={decodeURIComponent(difficulty)}
    />
  );
}
