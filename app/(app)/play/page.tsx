import type { Metadata } from 'next';

import { getSession, serverFetch } from '@/lib/server-api';
import type { PlayerOverview } from '@/lib/arcade';
import { PlayView, type Catalog, type GameSummary, type Recommendation } from './play-view';

export const metadata: Metadata = { title: 'Practice' };

/**
 * Practice home. Fetches on the server, in parallel; see play-view.tsx for
 * what is shown and why.
 */
export default async function PlayPage() {
  const session = await getSession();
  const firstName = session?.user.full_name?.trim().split(/\s+/)[0] ?? 'Player';

  const [overview, recs, history, catalog, billing] = await Promise.all([
    // The reward loop: level, streak, quests, achievements, daily challenge.
    serverFetch<PlayerOverview>('play', '/me/overview', session),
    serverFetch<{ recommendations?: Recommendation[] }>(
      'coach',
      '/gamification/me/recommendations?limit=5',
      session,
    ),
    /*
     * Finished rounds, read from Study Guider rather than from the engine's
     * own sessions. FR-12 has the engine send every round's summary to the
     * Progress Tracker; reading Study Guider's copy is what makes a missing
     * summary show up as a missing row instead of being covered by the
     * engine's own record.
     */
    serverFetch<{ success: boolean; data?: GameSummary[] }>('study', '/games/me?limit=8', session),
    serverFetch<{ formats?: Catalog }>('play', '/catalog', session),
    // Free or Pro. Unknown counts as Pro, as it does in the proxy (lib/plan.ts).
    serverFetch<{ plan: { tier: 'free' | 'pro' } }>('coach', '/billing/me', session),
  ]);

  return (
    <PlayView
      firstName={firstName}
      overview={overview}
      recommendation={recs?.recommendations?.[0] ?? null}
      recommendationsLoaded={recs !== null}
      rounds={history?.success ? (history.data ?? []) : null}
      catalog={catalog?.formats ?? null}
      free={billing?.plan.tier === 'free'}
    />
  );
}
