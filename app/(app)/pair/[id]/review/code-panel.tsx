'use client';

import { useEffect, useMemo, useRef } from 'react';
import clsx from 'clsx';
import { FileCode2 } from 'lucide-react';

import { highlightJava, type TokenKind } from '@/lib/java-highlight';

/**
 * A student's code, read-only, with the lines a review step is about lit up.
 *
 * The other lines dim rather than disappear, so the highlighted ones are read
 * in context - which is the point of teaching from the student's own code.
 */
const TOKEN_CLASS: Record<TokenKind, string> = {
  keyword: 'text-hue-study font-semibold',
  literal: 'text-danger',
  type: 'text-accent',
  method: 'text-ink font-medium',
  string: 'text-ok',
  number: 'text-warn',
  comment: 'text-muted italic',
  annotation: 'text-warn',
  plain: '',
};

export function CodePanel({
  code,
  highlight = null,
  label,
  tone = 'accent',
}: {
  code: string;
  highlight?: [number, number] | null;
  label: string;
  tone?: 'accent' | 'ok';
}) {
  const lines = useMemo(() => highlightJava(code), [code]);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const first = highlight?.[0] ?? null;

  // Scroll the panel, not the page, so the step below stays where it is.
  useEffect(() => {
    const box = scrollerRef.current;
    const row = first ? rowRefs.current[first - 1] : null;
    if (!box || !row) return;
    box.scrollTo({ top: Math.max(0, row.offsetTop - box.clientHeight / 3), behavior: 'smooth' });
  }, [first]);

  const lit = (n: number) => highlight !== null && n >= highlight[0] && n <= highlight[1];

  return (
    <section className="overflow-hidden rounded-cg-lg border border-line bg-inset shadow-cg-sm">
      <header className="flex items-center justify-between gap-3 border-b border-line bg-card px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="flex gap-1.5" aria-hidden>
            <span className="h-2.5 w-2.5 rounded-full bg-danger/50" />
            <span className="h-2.5 w-2.5 rounded-full bg-warn/50" />
            <span className="h-2.5 w-2.5 rounded-full bg-ok/50" />
          </span>
          <span
            className={clsx(
              'flex items-center gap-1.5 text-sm font-semibold',
              tone === 'ok' ? 'text-ok' : 'text-ink',
            )}
          >
            <FileCode2 size={15} strokeWidth={2.2} aria-hidden />
            {label}
          </span>
        </div>
        {highlight && (
          <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent">
            {highlight[0] === highlight[1] ? `Line ${highlight[0]}` : `Lines ${highlight[0]}–${highlight[1]}`}
          </span>
        )}
      </header>

      <div ref={scrollerRef} className="relative max-h-[24rem] overflow-auto py-3">
        {code.trim() === '' ? (
          <p className="px-5 py-6 text-sm text-muted">The editor was empty when the session ended.</p>
        ) : (
          <pre className="min-w-max font-mono [font-variant-ligatures:none] text-[13.5px] leading-6 text-[rgb(var(--cg-rgb-code-ink))]">
            {lines.map((tokens, index) => {
              const n = index + 1;
              const on = lit(n);
              return (
                <div
                  key={index}
                  ref={(el) => {
                    rowRefs.current[index] = el;
                  }}
                  className={clsx(
                    'flex pr-6 transition-[background-color,opacity] duration-300',
                    on && 'bg-accent/[0.12]',
                    highlight && !on && 'opacity-45',
                  )}
                >
                  <span
                    aria-hidden
                    className={clsx(
                      'w-12 shrink-0 select-none border-l-[3px] pr-4 text-right tabular-nums',
                      on ? 'border-accent font-semibold text-accent' : 'border-transparent text-muted/70',
                    )}
                  >
                    {n}
                  </span>
                  <code className="whitespace-pre">
                    {tokens.length === 0
                      ? ' '
                      : tokens.map((token, k) => (
                          <span key={k} className={TOKEN_CLASS[token.kind]}>
                            {token.text}
                          </span>
                        ))}
                  </code>
                </div>
              );
            })}
          </pre>
        )}
      </div>
    </section>
  );
}
