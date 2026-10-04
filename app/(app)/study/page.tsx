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
  const [data, map, billing, params] = await Promise.all([
    serverFetch<{ triggers?: Trigger[] }>('study', '/remediation/triggers', session),
    // The learning map, for the hero's ring. Optional: without it the page
    // is still every lesson waiting, just without the course-wide summary.
    serverFetch<{ success: boolean; data?: Curriculum }>('study', '/progress/me/curriculum', session),
    // Free or Pro, and how many of Free's monthly lessons are used.
    serverFetch<{ plan: { tier: 'free' | 'pro' }; free_lessons: { used: number; limit: number } }>(
      'coach',
      '/billing/me',
      session,
    ),
    searchParams,
  ]);

  return (
    <StudyView
      data={data}
      curriculum={map?.success ? (map.data ?? null) : null}
      concept={params.concept}
      freeLessons={billing?.plan.tier === 'free' ? billing.free_lessons : null}
    />
  );
}
