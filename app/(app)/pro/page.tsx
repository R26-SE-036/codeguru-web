import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ProView } from './pro-view';

export const metadata: Metadata = { title: 'Code Guru Pro' };

/** /pro - the plans, the upgrade, and managing Pro once you have it. */
export default function ProPage() {
  // Suspense because the view reads ?cancelled= from the URL.
  return (
    <Suspense fallback={<div className="cg-skeleton mx-auto h-96 max-w-5xl" />}>
      <ProView />
    </Suspense>
  );
}
