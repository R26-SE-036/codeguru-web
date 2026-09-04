import type { Metadata } from 'next';
import { ProgressView } from './progress-view';

export const metadata: Metadata = { title: 'Your progress' };

export default function ProgressPage() {
  return <ProgressView />;
}
