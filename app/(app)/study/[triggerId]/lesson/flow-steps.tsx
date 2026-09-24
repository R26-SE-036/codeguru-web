'use client';

import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowRight, CircleHelp, Flag, Play, TriangleAlert, Wrench, type LucideIcon } from 'lucide-react';

import { columnsFor, snakeLayout, type FlowRole, type FlowStep, type SnakeLink } from '@/lib/flowchart';

/**
 * A straight-line lesson diagram, drawn as a flow diagram.
 *
 * Steps run across the card in rows that snake - left to right, then back -
 * so a seven-step chart is three short rows instead of one tall column, and
 * every turn is a single arrow down. On a phone it folds to one column.
 *
 * Each step says what it is in words - "Start", "What goes wrong", "The fix" -
 * as well as in colour and shape, so the story still reads for a colour-blind
 * student and in a greyscale print. The colours are the app's own tokens, so
 * dark mode needs nothing here.
 */
const ROLE: Record<
  FlowRole,
  { kicker: string; icon: LucideIcon; shape: string; badge: string; text: string; from: string; to: string; head: string }
> = {
  start: {
    kicker: 'Start',
    icon: Play,
    // Rounded ends: the flowchart convention for where things begin and end.
    shape: 'rounded-[1.75rem] border-accent/60 bg-accent-soft',
    badge: 'bg-accent',
    text: 'text-accent',
    from: 'from-accent',
    to: 'to-accent',
    head: 'text-accent',
  },
  step: {
    kicker: 'Step',
    icon: ArrowRight,
    shape: 'rounded-cg border-hue-study/45 bg-card',
    badge: 'bg-hue-study',
    text: 'text-muted',
    from: 'from-hue-study',
    to: 'to-hue-study',
    head: 'text-hue-study',
  },
  decision: {
    kicker: 'Check',
    icon: CircleHelp,
    shape: 'rounded-cg border-dashed border-warn/70 bg-warn-soft',
    badge: 'bg-warn',
    text: 'text-warn',
    from: 'from-warn',
    to: 'to-warn',
    head: 'text-warn',
  },
  problem: {
    kicker: 'What goes wrong',
    icon: TriangleAlert,
    shape: 'rounded-cg border-danger/55 bg-danger-soft',
    badge: 'bg-danger',
    text: 'text-danger',
    from: 'from-danger',
    to: 'to-danger',
    head: 'text-danger',
  },
  fix: {
    kicker: 'The fix',
    icon: Wrench,
    shape: 'rounded-cg border-ok/55 bg-ok-soft',
    badge: 'bg-ok',
    text: 'text-ok',
    from: 'from-ok',
    to: 'to-ok',
    head: 'text-ok',
  },
  end: {
    kicker: 'Result',
    icon: Flag,
    shape: 'rounded-[1.75rem] border-accent/60 bg-accent-soft',
    badge: 'bg-accent',
    text: 'text-accent',
    from: 'from-accent',
    to: 'to-accent',
    head: 'text-accent',
  },
};

// Grid tracks: steps in the odd tracks, arrows in the even ones between them.
const ARROW_GAP = '3.25rem';

function Arrow({ link, from, to, label }: { link: SnakeLink; from: FlowRole; to: FlowRole; label?: string }) {
  const down = link.direction === 'down';
  const place: CSSProperties = down
    ? { gridRow: link.row * 2 + 2, gridColumn: link.col * 2 + 1 }
    : { gridRow: link.row * 2 + 1, gridColumn: link.col * 2 + 2 };

  // Shades from this step's colour into the next one's, in the direction of travel.
  const gradient = down ? 'bg-gradient-to-b' : link.direction === 'right' ? 'bg-gradient-to-r' : 'bg-gradient-to-l';
  const line = `rounded-full ${gradient} ${ROLE[from].from} ${ROLE[to].to}`;
  const head = (
    <svg
      width="10"
      height="16"
      viewBox="0 0 10 16"
      className={`shrink-0 ${ROLE[to].head} ${down ? 'rotate-90' : link.direction === 'left' ? 'rotate-180' : ''}`}
    >
      <path d="M1.5 1.5 8.5 8l-7 6.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  return (
    <div
      style={place}
      className={`relative flex items-center justify-center ${down ? 'flex-col' : link.direction === 'left' ? 'flex-row-reverse px-1' : 'px-1'}`}
      aria-hidden
    >
      <span className={down ? `w-[3px] flex-1 ${line}` : `h-[3px] flex-1 ${line}`} />
      <span className={down ? '-mt-1.5' : link.direction === 'left' ? '-mr-1.5' : '-ml-1.5'}>{head}</span>
      {label && (
        <span
          className={`absolute z-10 max-w-[10rem] truncate rounded-full border border-line bg-card px-2 py-0.5 text-[11px] font-semibold text-body shadow-cg-xs ${
            down ? 'left-1/2 top-1/2 ml-3 -translate-y-1/2' : 'bottom-1/2 left-1/2 mb-2 -translate-x-1/2'
          }`}
          title={label}
        >
          {label}
        </span>
      )}
    </div>
  );
}

export default function FlowSteps({ steps }: { steps: FlowStep[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);

  // Measured before paint, so the diagram never flashes in the wrong shape.
  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const cols = columnsFor(width, steps.length);
  const { cells, links, rows } = snakeLayout(steps.length, cols);

  return (
    <div ref={containerRef} className="w-full">
      <div
        role="list"
        aria-label="How it flows, step by step"
        className="mx-auto grid"
        style={{
          gridTemplateColumns: Array.from({ length: cols }, () => 'minmax(0, 1fr)').join(` ${ARROW_GAP} `),
          gridTemplateRows: Array.from({ length: rows }, () => 'auto').join(' 2.75rem '),
          // A one- or two-step row should not stretch across a wide card.
          maxWidth: `calc(${cols} * 15.5rem + ${cols - 1} * ${ARROW_GAP})`,
        }}
      >
        {steps.map((step, index) => {
          const style = ROLE[step.role];
          const Icon = style.icon;
          const cell = cells[index];
          // Numbered to match the badge.
          const kicker = step.role === 'step' ? `Step ${index + 1}` : style.kicker;

          return (
            <div
              key={step.id}
              role="listitem"
              className="relative flex animate-cg-rise pt-3"
              style={{ gridRow: cell.row * 2 + 1, gridColumn: cell.col * 2 + 1, animationDelay: `${index * 70}ms` }}
            >
              <span
                className={`absolute left-1/2 top-0 z-10 grid h-6 min-w-6 -translate-x-1/2 place-items-center rounded-full px-1.5 text-xs font-bold text-on-accent ring-4 ring-card ${style.badge}`}
                aria-hidden
              >
                {index + 1}
              </span>
              <div
                className={`flex w-full flex-col items-center justify-center gap-1 border-2 px-3.5 pb-3.5 pt-5 text-center shadow-cg-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-cg-md ${style.shape}`}
              >
                <p className={`flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wider ${style.text}`}>
                  <Icon size={12} strokeWidth={2.6} aria-hidden />
                  {kicker}
                </p>
                {/* overflow-wrap: a Java exception name is one long word. */}
                <p className="max-w-full text-[15px] font-medium leading-snug text-ink [overflow-wrap:anywhere]">{step.label}</p>
              </div>
            </div>
          );
        })}

        {links.map((link) => (
          <Arrow
            key={link.from}
            link={link}
            from={steps[link.from].role}
            to={steps[link.from + 1].role}
            label={steps[link.from + 1].via}
          />
        ))}
      </div>
    </div>
  );
}
