import { CardGridSkeleton, LoadingShell } from '@/components/skeletons';

export default function StudyLoading() {
  return (
    <LoadingShell label="Loading your lessons…">
      <div className="cg-skeleton h-64 rounded-cg-xl" />
      <CardGridSkeleton count={2} />
    </LoadingShell>
  );
}
