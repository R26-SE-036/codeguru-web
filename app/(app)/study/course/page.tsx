import type { Metadata } from 'next';

import { serverFetch } from '@/lib/server-api';

import type { Catalogue } from './course-types';
import { CourseHome } from './course-home';

export const metadata: Metadata = { title: 'Java foundations' };

export default async function CoursePage() {
  const catalogue = await serverFetch<Catalogue>('study', '/course');
  return <CourseHome catalogue={catalogue} />;
}
