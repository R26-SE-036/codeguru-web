import type { Metadata } from 'next';
import { Suspense } from 'react';

import { BillingView } from './billing-view';

export const metadata: Metadata = { title: 'Plan & billing' };

/** /billing - the student's plan, usage, payments and receipts, and the way out of Pro. */
export default function BillingPage() {
  // Suspense because the view reads ?downgrade= from the URL.
  return (
    <Suspense fallback={<div className="cg-skeleton mx-auto h-96 max-w-5xl" />}>
      <BillingView />
    </Suspense>
  );
}
