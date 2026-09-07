/**
 * Relative timestamps.
 *
 * Lifted out of app/(app)/page.tsx, which had the only copy, when the practice
 * page needed the same thing. Two implementations of "how long ago" drift - one
 * says "1h ago" and the other "60m ago" for the same instant - and a student
 * reading both on one screen has no way to know they mean the same moment.
 */

/**
 * "just now", "12m ago", "3d ago".
 *
 * Returns an empty string for anything unparseable rather than "Invalid Date",
 * so a bad timestamp costs a caption and not the row it labels. Future
 * timestamps clamp to "just now": clock skew between services is real, and
 * "in 3 seconds" reads as a bug to a student who cannot know it is harmless.
 */
export function relativeTime(iso: string | undefined | null): string {
  if (!iso) return '';

  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';

  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return 'just now';

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;

  return `${Math.round(days / 7)}w ago`;
}
