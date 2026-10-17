'use client';

import { Check, CheckCircle2, Sparkles } from 'lucide-react';

import { buttonClass } from '@/components/ui';

/**
 * The unit's sections as a stepper: read sections get a tick, the one on
 * screen is highlighted with a pulse, the rest wait in outline. The bar at the
 * top fills as sections are read, and once every section has been read the
 * card offers to mark the unit finished.
 *
 * "Read" means scrolled past, remembered in this browser only - like the
 * finished mark, it is a reading aid and never reaches knowledge tracing.
 */
export function Syllabus({
  sections,
  active,
  read,
  finished,
  onFinish,
}: {
  sections: { id: string; title: string }[];
  /** Index of the section on screen. */
  active: number;
  /** How many sections have been read through. */
  read: number;
  finished: boolean;
  onFinish: () => void;
}) {
  const total = sections.length;
  const percent = Math.round((Math.min(read, total) / total) * 100);
  const allRead = read >= total;

  return (
    <nav aria-label="In this unit" className="rounded-cg-xl border border-line bg-card p-5 shadow-cg-sm">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">Your progress</p>
        <p className="text-sm font-semibold tabular-nums text-ink">
          {Math.min(read, total)} of {total}
        </p>
      </div>
      <div
        className="mt-2.5 h-2 overflow-hidden rounded-full bg-inset"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={Math.min(read, total)}
        aria-label="Sections read"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-700 ease-out ${
            allRead ? 'bg-ok' : 'bg-gradient-to-r from-hue-study to-hue-insight'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>

      <ol className="mt-5">
        {sections.map((section, i) => {
          const done = i < read && i !== active;
          const current = i === active;
          const last = i === total - 1;
          return (
            <li key={section.id} className="relative flex gap-3 pb-1">
              {/* The connector to the next step fills in once this one is read. */}
              {!last && (
                <span aria-hidden className="absolute left-[13px] top-8 h-[calc(100%-1.5rem)] w-0.5 overflow-hidden rounded-full bg-line">
                  <span
                    className="block w-full bg-ok transition-[height] duration-500 ease-out"
                    style={{ height: i < read ? '100%' : '0%' }}
                  />
                </span>
              )}

              <span className="relative z-10 mt-1 grid h-7 w-7 shrink-0 place-items-center">
                {current && (
                  <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-hue-study/30" />
                )}
                <span
                  className={`relative grid h-7 w-7 place-items-center rounded-full text-xs font-bold transition-all duration-300 ${
                    current
                      ? 'scale-110 bg-hue-study text-white shadow-cg-sm'
                      : done
                        ? 'bg-ok text-white'
                        : 'border-2 border-line-strong bg-card text-muted'
                  }`}
                >
                  {done ? <Check size={14} strokeWidth={3} aria-hidden className="animate-cg-pop" /> : i + 1}
                </span>
              </span>

              <a
                href={`#${section.id}`}
                aria-current={current ? 'step' : undefined}
                className={`cg-focusable mb-1 flex-1 rounded-cg px-3 py-1.5 text-[0.95rem] leading-snug transition-all duration-300 ${
                  current
                    ? 'translate-x-1 bg-hue-study/10 font-semibold text-ink'
                    : done
                      ? 'text-body hover:bg-card-alt'
                      : 'text-muted hover:bg-card-alt hover:text-ink'
                }`}
              >
                {section.title}
                {done && <span className="sr-only"> (read)</span>}
              </a>
            </li>
          );
        })}
      </ol>

      {allRead && (
        <div className="mt-4 animate-cg-fade border-t border-line pt-4">
          {finished ? (
            <p className="flex items-center gap-2 text-sm font-semibold text-ok">
              <CheckCircle2 size={17} strokeWidth={2.4} aria-hidden />
              Unit finished
            </p>
          ) : (
            <>
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Sparkles size={16} strokeWidth={2.4} aria-hidden className="text-hue-study" />
                Every section read
              </p>
              <button type="button" onClick={onFinish} className={buttonClass({ size: 'sm', className: 'mt-3 w-full' })}>
                Mark as finished
              </button>
            </>
          )}
        </div>
      )}
    </nav>
  );
}

/** A thin bar across the top of the window that fills as the unit is read. */
export function ReadingBar({ percent }: { percent: number }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-40 h-1 bg-transparent">
      <div
        className="h-full bg-gradient-to-r from-hue-study via-hue-insight to-ok transition-[width] duration-150 ease-out"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
