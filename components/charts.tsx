import clsx from 'clsx';

/**
 * Small, hand-drawn charts for the dashboards.
 *
 * Plain markup and SVG rather than recharts: these are a ring and some bars,
 * and drawing them directly is what lets them animate on the same trigger as
 * the card around them. Each one is still at zero until its nearest <Reveal>
 * has been shown (globals.css, `.cg-fill` and `.cg-ring-seg`), and with no
 * Reveal around it, it simply renders drawn.
 *
 * Colours arrive as Tailwind classes, never hex values, so both themes work
 * without a second set of values.
 */

/* ── Ring ────────────────────────────────────────────────────────────────── */

export interface RingSegment {
  value: number;
  /** A text-colour class; the arc is drawn in currentColor. */
  tone: string;
  label: string;
}

/**
 * A donut of up to a handful of segments, with whatever is passed as
 * `children` in the middle.
 *
 * pathLength="100" lets every arc be written in percent, so a segment's dash
 * is its share and its offset is the sum of the shares before it - no
 * circumference arithmetic to get wrong.
 */
export function Ring({
  segments,
  size = 168,
  thickness = 14,
  label,
  children,
}: {
  segments: RingSegment[];
  size?: number;
  thickness?: number;
  label: string;
  children?: React.ReactNode;
}) {
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  const radius = (size - thickness) / 2;
  // A hairline gap between arcs, so two segments of similar colour stay
  // distinguishable. Dropped when there is only one arc to draw.
  const drawn = segments.filter((s) => s.value > 0);
  const gap = drawn.length > 1 ? 1.2 : 0;

  let offset = 0;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        role="img"
        aria-label={label}
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={thickness}
          className="stroke-card-alt"
        />
        {total > 0 &&
          drawn.map((segment, index) => {
            const share = (segment.value / total) * 100;
            const dash = Math.max(0, share - gap);
            const start = offset;
            offset += share;

            return (
              <circle
                key={segment.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth={thickness}
                strokeLinecap="butt"
                pathLength={100}
                className={clsx('cg-ring-seg', segment.tone)}
                style={{
                  ['--cg-seg' as string]: dash,
                  strokeDashoffset: -start,
                  ['--cg-seg-delay' as string]: `${200 + index * 160}ms`,
                }}
              />
            );
          })}
      </svg>

      {children && (
        <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
      )}
    </div>
  );
}

/* ── Bars ────────────────────────────────────────────────────────────────── */

/**
 * A single bar, 0-100. The animated sibling of Meter in ui.tsx: same track,
 * but it grows in when its card is revealed rather than sitting there drawn.
 */
export function FillBar({
  value,
  tone,
  label,
  height = 'h-2',
  delay = 0,
}: {
  value: number;
  tone: string;
  label: string;
  height?: string;
  delay?: number;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));

  return (
    <div
      role="meter"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={clsx('w-full overflow-hidden rounded-full bg-card-alt ring-1 ring-inset ring-line', height)}
    >
      <div
        className={clsx('cg-fill h-full rounded-full', tone)}
        style={{ width: `${pct}%`, ['--cg-fill-delay' as string]: `${150 + delay}ms` }}
      />
    </div>
  );
}

/**
 * One bar split into parts that sit end to end - fixed and still-open
 * issues, for instance. `width` is the whole bar's share of its track, so a
 * list of these can be scaled against its largest row.
 */
export function SplitBar({
  parts,
  width,
  label,
  delay = 0,
}: {
  parts: { value: number; tone: string }[];
  width: number;
  label: string;
  delay?: number;
}) {
  const total = parts.reduce((sum, p) => sum + Math.max(0, p.value), 0) || 1;

  return (
    <div
      role="img"
      aria-label={label}
      className="h-2.5 w-full overflow-hidden rounded-full bg-card-alt ring-1 ring-inset ring-line"
    >
      <div
        className="cg-fill flex h-full gap-px overflow-hidden rounded-full"
        style={{
          width: `${Math.max(0, Math.min(100, width))}%`,
          ['--cg-fill-delay' as string]: `${150 + delay}ms`,
        }}
      >
        {parts
          .filter((p) => p.value > 0)
          .map((part, index) => (
            <span
              key={index}
              className={clsx('h-full', part.tone)}
              style={{ width: `${(part.value / total) * 100}%` }}
            />
          ))}
      </div>
    </div>
  );
}

/** A coloured dot and a label, for the legend under a chart. */
export function LegendItem({
  tone,
  label,
  value,
}: {
  tone: string;
  label: string;
  value?: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-body">
      <span aria-hidden className={clsx('h-2.5 w-2.5 shrink-0 rounded-full', tone)} />
      {label}
      {value !== undefined && <span className="font-semibold tabular-nums text-ink">{value}</span>}
    </span>
  );
}
