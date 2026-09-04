import {
  HeaderSkeleton,
  ListSkeleton,
  LoadingShell,
  StatRowSkeleton,
} from '@/components/skeletons';

/**
 * The fallback for every route in the app group that does not define its own.
 *
 * It renders inside the shell, so the sidebar and the theme toggle stay put
 * and only the content column changes - which is what makes a navigation feel
 * like a navigation rather than a reload.
 */
export default function AppLoading() {
  return (
    <LoadingShell label="Loading…">
      <HeaderSkeleton />
      <StatRowSkeleton />
      <ListSkeleton />
    </LoadingShell>
  );
}
