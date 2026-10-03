import clsx from 'clsx';

import { Reveal } from '@/components/motion';

/**
 * An illustration of the editor extension at work: one off-by-one, underlined,
 * with the first of its three hints open.
 *
 * Not a live view, and hidden from assistive technology for that reason - the
 * text beside it always says what it shows. It is the same example the
 * project's portfolio site opens with, so the two read as one product.
 *
 * It plays once, in the order the real thing does: the code is there, the
 * squiggle appears after a pause (globals.css, `.cg-squiggle`), and then the
 * hint card arrives. Must sit inside a <Reveal> for the squiggle to wait.
 */

function K({ children }: { children: React.ReactNode }) {
  return <span className="text-hue-study">{children}</span>;
}

function N({ children }: { children: React.ReactNode }) {
  return <span className="text-hue-play">{children}</span>;
}

const LINES: React.ReactNode[] = [
  <>
    <K>int</K>[] marks = {'{'}
    <N>72</N>, <N>85</N>, <N>64</N>, <N>90</N>
    {'}'};
  </>,
  <>
    <K>int</K> total = <N>0</N>;
  </>,
  <>
    <K>for</K> (<K>int</K> i = <N>0</N>; <span className="cg-squiggle">i &lt;= marks.length</span>; i++){' '}
    {'{'}
  </>,
  <>{'    '}total += marks[i];</>,
  <>{'}'}</>,
];

/** The line, counted from 0, the squiggle is on - it gets the gutter marker. */
const FLAGGED = 2;

export function EditorDemo({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={clsx(
        'overflow-hidden rounded-cg-lg border border-line bg-inset text-left shadow-cg-lg',
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-danger/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-warn/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-ok/70" />
        <span className="ml-2 font-mono text-xs text-muted">Scores.java</span>
        <span className="ml-auto rounded-full bg-hue-insight/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-hue-insight">
          Code Coach
        </span>
      </div>

      <pre className="overflow-x-auto px-4 py-4 font-mono text-[13px] leading-6 text-body">
        {LINES.map((line, index) => (
          <div key={index} className="flex gap-3">
            <span className="w-4 shrink-0 select-none text-right text-muted">{index + 3}</span>
            <span
              className={clsx(
                'mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full',
                index === FLAGGED ? 'bg-danger' : 'bg-transparent',
              )}
            />
            <span>{line}</span>
          </div>
        ))}
      </pre>

      <Reveal delay={950} className="mx-4 mb-4">
        <div className="rounded-cg border border-line bg-card p-3.5 shadow-cg-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-sm font-semibold text-ink">
              <span className="h-2 w-2 rounded-full bg-danger" />
              Off-by-one loop boundary
            </span>
            <span className="text-xs text-muted">Hint 1 of 3</span>
          </div>
          <p className="mt-1.5 text-sm text-body">
            Array indexes start at 0. If an array has 4 items, what is the last valid index?
          </p>
          <div className="mt-3 flex gap-1.5">
            {['Concept', 'Guidance', 'Targeted'].map((level, index) => (
              <span
                key={level}
                className={clsx(
                  'rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                  index === 0
                    ? 'bg-accent/15 text-accent'
                    : 'bg-card-alt text-muted ring-1 ring-inset ring-line',
                )}
              >
                {level}
              </span>
            ))}
          </div>
        </div>
      </Reveal>
    </div>
  );
}
