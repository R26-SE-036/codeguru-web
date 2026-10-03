import type { Metadata } from 'next';

import { getSession, serverFetch } from '@/lib/server-api';
import { StudyView, type Curriculum, type Trigger } from './study-view';

export const metadata: Metadata = { title: 'Study' };

export default async function StudyPage({
  searchParams,
}: {
  searchParams: Promise<{ concept?: string }>;
}) {
  const session = await getSession();
  const [data, map, params] = await Promise.all([
    serverFetch<{ triggers?: Trigger[] }>('study', '/remediation/triggers', session),
    // The learning map, for the hero's ring. Optional: without it the page
    // is still every lesson waiting, just without the course-wide summary.
    serverFetch<{ success: boolean; data?: Curriculum }>('study', '/progress/me/curriculum', session),
    searchParams,
  ]);

  return (
    <StudyView
      data={data}
      curriculum={map?.success ? (map.data ?? null) : null}
      concept={params.concept}
    />
  );
}
