import type { Metadata } from 'next';
import { ReviewView } from './review-view';

export const metadata: Metadata = { title: 'Peer review' };

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ReviewView sessionId={id} />;
}
