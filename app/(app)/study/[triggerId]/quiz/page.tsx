import type { Metadata } from 'next';
import { QuizView } from './quiz-view';

export const metadata: Metadata = { title: 'Quiz' };

export default async function QuizPage({
  params,
}: {
  params: Promise<{ triggerId: string }>;
}) {
  const { triggerId } = await params;
  return <QuizView triggerId={decodeURIComponent(triggerId)} />;
}
