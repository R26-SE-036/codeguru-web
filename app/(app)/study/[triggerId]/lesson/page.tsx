import type { Metadata } from 'next';
import { LessonView } from './lesson-view';

export const metadata: Metadata = { title: 'Lesson' };

export default async function LessonPage({
  params,
}: {
  params: Promise<{ triggerId: string }>;
}) {
  const { triggerId } = await params;
  return <LessonView triggerId={decodeURIComponent(triggerId)} />;
}
