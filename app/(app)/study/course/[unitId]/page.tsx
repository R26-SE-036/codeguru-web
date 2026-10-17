import type { Metadata } from 'next';
import Link from 'next/link';
import { BookOpen } from 'lucide-react';

import { serverFetch } from '@/lib/server-api';
import { formatErrorType } from '@/lib/vocabulary';
import { Card, buttonClass } from '@/components/ui';

import type { UnitPage } from '../course-types';
import { UnitView } from './unit-view';

export const metadata: Metadata = { title: 'Course' };

export default async function CourseUnitPage({ params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = await params;
  const id = decodeURIComponent(unitId).toUpperCase();
  const page = await serverFetch<UnitPage>('study', `/course/units/${encodeURIComponent(id)}`);

  if (!page) {
    // Not written yet, or Study Guider did not answer. serverFetch cannot tell
    // the two apart, so the message covers both honestly.
    return (
      <div className="mx-auto max-w-2xl">
        <Card className="px-6 py-12 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-cg-lg bg-hue-study/10 text-hue-study">
            <BookOpen size={22} strokeWidth={2} aria-hidden />
          </span>
          <h1 className="mt-4 text-lg font-bold text-ink">{formatErrorType(id)}</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-body">
            This unit is not in the course yet, or the course could not be loaded just now. The units that
            are ready are on the course page.
          </p>
          <Link href="/study/course" className={buttonClass({ variant: 'secondary', className: 'mt-6' })}>
            Open the course
          </Link>
        </Card>
      </div>
    );
  }

  return <UnitView page={page} />;
}
