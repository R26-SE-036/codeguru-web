import { HeaderSkeleton, LoadingShell, StatRowSkeleton } from '@/components/skeletons';

export default function InsightsLoading() {
  return (
    <LoadingShell label="Loading your insights…">
      <HeaderSkeleton />
      <StatRowSkeleton />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="cg-skeleton h-80 lg:col-span-2" />
        <div className="cg-skeleton h-80 lg:col-span-3" />
      </div>
    </LoadingShell>
  );
}
