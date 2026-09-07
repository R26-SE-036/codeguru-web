/**
 * The shapes each route falls back to while its server component resolves.
 *
 * Next holds a navigation until the server component finishes, so without a
 * loading.tsx a slow backend leaves the student on the PREVIOUS page with
 * nothing happening - which reads as the click not having registered. These
 * render instantly and get replaced.
 *
 * Each one mirrors the layout it stands in for. A generic spinner would be
 * less work, but the page would then visibly reflow on arrival, which is the
 * jank the skeleton exists to avoid.
 */

export function HeaderSkeleton() {
  return (
    <div className="flex items-start gap-4">
      <div className="cg-skeleton h-11 w-11 shrink-0 rounded-cg" />
      <div className="flex-1 space-y-2.5">
        <div className="cg-skeleton h-3 w-24" />
        <div className="cg-skeleton h-7 w-64 max-w-full" />
        <div className="cg-skeleton h-4 w-full max-w-xl" />
      </div>
    </div>
  );
}

export function StatRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="cg-skeleton h-[7.5rem]" />
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="cg-card divide-y divide-line overflow-hidden">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3 px-5 py-4">
          <div className="cg-skeleton h-5 w-16 shrink-0" />
          <div className="cg-skeleton h-4 flex-1" />
          <div className="cg-skeleton h-4 w-12 shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function CardGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="cg-skeleton h-56" />
      ))}
    </div>
  );
}

/**
 * `aria-busy` plus a visually hidden live region, on every skeleton screen.
 *
 * A screen reader announces nothing at all for a page of grey rectangles, so
 * without this the app is silent for exactly as long as it is loading. The
 * text is off-screen rather than `display:none`, which would remove it from
 * the accessibility tree along with everything else.
 */
export function LoadingShell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div aria-busy="true" className="space-y-8">
      <p role="status" className="sr-only">
        {label}
      </p>
      {children}
    </div>
  );
}
