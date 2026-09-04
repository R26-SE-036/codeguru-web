import { QuizView } from './quiz-view';

export default async function QuizPage({
  params,
}: {
  params: Promise<{ triggerId: string }>;
}) {
  const { triggerId } = await params;
  return <QuizView triggerId={decodeURIComponent(triggerId)} />;
}
