import type { Metadata } from 'next';

import { getSession, serverFetch } from '@/lib/server-api';
import { OverviewView, type Overview } from './overview-view';

export const metadata: Metadata = { title: 'Overview' };

export default async function HomePage() {
  const session = await getSession();
  const overview = await serverFetch<Overview>(
    'coach',
    // Four concepts and eight events are what the page shows. Insights asks
    // for the same thing, so whichever loads second hits Code Coach's cache.
    '/dashboard/me/overview?concept_limit=4&timeline_limit=8',
    session,
  );

  const firstName = session?.user.full_name?.trim().split(/\s+/)[0] ?? 'there';

  return <OverviewView firstName={firstName} overview={overview} />;
}
