import { LessonView } from './lesson-view';

export default async function LessonPage({
  params,
}: {
  params: Promise<{ triggerId: string }>;
}) {
  const { triggerId } = await params;
  return <LessonView triggerId={decodeURIComponent(triggerId)} />;
}
