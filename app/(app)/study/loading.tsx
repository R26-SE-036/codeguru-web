import { CardGridSkeleton, HeaderSkeleton, LoadingShell } from '@/components/skeletons';

export default function StudyLoading() {
  return (
    <LoadingShell label="Loading your lessons…">
      <HeaderSkeleton />
      <CardGridSkeleton />
    </LoadingShell>
  );
}
