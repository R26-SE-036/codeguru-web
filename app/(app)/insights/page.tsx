import type { Metadata } from 'next';

import { getSession, serverFetch } from '@/lib/server-api';
import { InsightsView, type InsightsData } from './insights-view';

export const metadata: Metadata = { title: 'Insights' };

export default async function InsightsPage() {
  const session = await getSession();

  const [overview, summary, mastery, struggling] = await Promise.all([
    // Same query as the Overview page, so it is usually already in Code
    // Coach's one-minute cache - this costs nothing extra on the way across.
    serverFetch<InsightsData['overview']>(
      'coach',
      '/dashboard/me/overview?concept_limit=4&timeline_limit=8',
      session,
    ),
    serverFetch<InsightsData['summary']>('coach', '/students/me/diagnostics/summary?limit=8', session),
    serverFetch<InsightsData['mastery']>('coach', '/students/me/concept-mastery?limit=20', session),
    serverFetch<InsightsData['struggling']>(
      'coach',
      '/students/me/struggling-concepts?limit=6',
      session,
    ),
  ]);

  return <InsightsView overview={overview} summary={summary} mastery={mastery} struggling={struggling} />;
}
