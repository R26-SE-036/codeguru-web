'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import {
  ArrowRight,
  BookOpen,
  Compass,
  GitCompareArrows,
  Loader2,
  Medal,
  Play,
  Route,
  Sparkles,
  Star,
  Wrench,
} from 'lucide-react';

import { ApiError, api } from '@/lib/api';
import { lineDiff } from '@/lib/line-diff';
import { FormError } from '@/components/field';
import { Card, buttonClass } from '@/components/ui';

import { CodePanel } from './code-panel';
import { Inline } from './inline';

/**
 * What a review shows once the questions are done - the part the professor's
 * evaluation asked for: their code against the model solution, and "if you had
 * done this, you would have achieved that".
 *
 *   - their code and the model solution side by side, differing lines marked
 *   - what they did well
 *   - the path from their code to a working one, each step pointing at their
 *     own lines (click one to light those lines up)
 *   - one next step
 *
 * Framed by how the session went: solved is "two ways to the same answer",
 * unsolved is "you were two changes away", and a free-coding session - which
 * has no model solution - gets two improvements and a real exercise to try.
 */

export type ReviewOutcome = 'solved' | 'unsolved' | 'ungraded' | 'free';

export interface Improvement {
  lines: [number, number] | null;
  change: string;
  why: string;
  achieves: string;
}

export interface Feedback {
  outcome: ReviewOutcome;
  strengths: string[];
  improvements: Improvement[];
  nextStep: string | null;
  suggestion: { questionId: string; title: string; reason: string } | null;
}

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five'];
const count = (n: number) => WORDS[n] ?? String(n);

/** The heading and lead for each section, by how the session went. */
function framing(outcome: ReviewOutcome, steps: number) {
  switch (outcome) {
    case 'solved':
      return {
        compareTitle: 'Two ways to the same answer',
        compareLead:
          'Both programs do what the task asks. The marked lines are where they go about it differently - neither is "the wrong one".',
        pathTitle: 'What the other way would give you',
        pathLead: 'Worth knowing for next time, not something you got wrong.',
      };
    case 'unsolved':
      return {
        compareTitle: 'Your code next to the model solution',
        compareLead: 'The marked lines are where the two differ. The path below walks from yours to one that works.',
        pathTitle: 'Your path to the solution',
        pathLead:
          steps === 1
            ? 'You were one change away.'
            : `You were ${count(steps)} changes away - closer than it felt.`,
      };
    case 'ungraded':
      return {
        compareTitle: 'Your code next to the model solution',
        compareLead: 'The marked lines are where the two differ.',
        pathTitle: 'What would finish it',
        pathLead: 'Changes that would make your program do what the task asks.',
      };
    default:
      return {
        compareTitle: '',
        compareLead: '',
        pathTitle: `${steps === 2 ? 'Two things' : 'Things'} to improve`,
        pathLead: 'No task means no model solution - these are about the program you chose to write.',
      };
  }
}

function LinesChip({ lines, active, onClick }: { lines: [number, number]; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        'cg-focusable shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold transition',
        active ? 'bg-accent text-on-accent' : 'bg-accent/10 text-accent hover:bg-accent/20',
      )}
    >
      {lines[0] === lines[1] ? `Line ${lines[0]}` : `Lines ${lines[0]}–${lines[1]}`}
    </button>
  );
}

export function ReviewFeedback({
  code,
  solution,
  feedback,
}: {
  code: string;
  solution: { code: string; note: string | null } | null;
  feedback: Feedback | null;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const yourCodeRef = useRef<HTMLDivElement>(null);

  const outcome: ReviewOutcome = feedback?.outcome ?? (solution ? 'ungraded' : 'free');
  const improvements = feedback?.improvements ?? [];
  const text = framing(outcome, improvements.length);
  const hasSolution = Boolean(solution && solution.code.trim());

  const diff = useMemo(
    () => (hasSolution ? lineDiff(code, solution!.code) : null),
    [code, solution, hasSolution],
  );

  const highlight = selected !== null ? improvements[selected]?.lines ?? null : null;

  function pick(index: number) {
    const next = selected === index ? null : index;
    setSelected(next);
    if (next !== null) {
      requestAnimationFrame(() => yourCodeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Their code against the model solution ─────────────────────── */}
      {hasSolution && diff ? (
        <section className="space-y-3 animate-cg-rise">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
              <GitCompareArrows size={18} strokeWidth={2.2} className="text-accent" aria-hidden />
              {text.compareTitle}
            </h2>
            <p className="mt-1 text-body">{text.compareLead}</p>
            {solution!.note && (
              <p className="mt-2 flex gap-2 text-sm text-muted">
                <BookOpen size={15} strokeWidth={2.2} className="mt-0.5 shrink-0 text-ok" aria-hidden />
                <span>
                  <Inline text={solution!.note} />
                </span>
              </p>
            )}
          </div>
          <div ref={yourCodeRef} className="grid scroll-mt-24 gap-3 lg:grid-cols-2">
            <CodePanel
              code={code}
              label="Your code"
              highlight={highlight}
              changed={diff.ours.map((m) => m === 'changed')}
              legend={
                diff.changedCount === 0
                  ? 'Same lines'
                  : `${diff.changedCount} ${diff.changedCount === 1 ? 'line differs' : 'lines differ'}`
              }
              className="min-w-0"
            />
            <CodePanel
              code={solution!.code}
              label="Model solution"
              tone="ok"
              changed={diff.theirs.map((m) => m === 'changed')}
              changedTone="ok"
              className="min-w-0"
            />
          </div>
        </section>
      ) : (
        outcome === 'free' &&
        code.trim() && (
          <div ref={yourCodeRef} className="scroll-mt-24">
            <CodePanel code={code} label="Your final code" highlight={highlight} />
          </div>
        )
      )}

      {/* ── What went well ────────────────────────────────────────────── */}
      {feedback && feedback.strengths.length > 0 && (
        <Card className="overflow-hidden animate-cg-rise">
          <div className="flex items-center gap-2 border-b border-line bg-ok-soft/50 px-6 py-3">
            <Medal size={16} strokeWidth={2.2} className="text-ok" aria-hidden />
            <h2 className="text-sm font-bold uppercase tracking-wider text-ok">What you did well</h2>
          </div>
          <ul className="space-y-3 p-6">
            {feedback.strengths.map((strength) => (
              <li key={strength} className="flex gap-3">
                <Star size={17} strokeWidth={2.2} className="mt-0.5 shrink-0 fill-ok/20 text-ok" aria-hidden />
                <span className="leading-relaxed text-body">
                  <Inline text={strength} />
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ── The path ──────────────────────────────────────────────────── */}
      {improvements.length > 0 && (
        <section className="space-y-3 animate-cg-rise">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
              {outcome === 'free' ? (
                <Wrench size={18} strokeWidth={2.2} className="text-hue-pair" aria-hidden />
              ) : (
                <Route size={18} strokeWidth={2.2} className="text-hue-pair" aria-hidden />
              )}
              {text.pathTitle}
            </h2>
            <p className="mt-1 text-body">{text.pathLead}</p>
          </div>

          <ol className="relative space-y-3">
            {improvements.map((item, index) => (
              <li key={index} className="relative flex gap-4">
                {/* The thread between steps: this is a path, walked in order. */}
                {index < improvements.length - 1 && (
                  <span aria-hidden className="absolute left-[15px] top-9 bottom-[-12px] w-0.5 bg-line" />
                )}
                <span
                  aria-hidden
                  className={clsx(
                    'relative z-[1] grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold ring-4 ring-page transition',
                    selected === index ? 'bg-accent text-on-accent' : 'bg-hue-pair/15 text-hue-pair',
                  )}
                >
                  {index + 1}
                </span>
                <Card
                  className={clsx(
                    'min-w-0 flex-1 p-5 transition',
                    selected === index && 'ring-2 ring-accent/40',
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 font-semibold leading-snug text-ink">
                      <Inline text={item.change} />
                    </p>
                    {item.lines && (
                      <LinesChip lines={item.lines} active={selected === index} onClick={() => pick(index)} />
                    )}
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-body">
                    <Inline text={item.why} />
                  </p>
                  <p className="mt-3 flex gap-2 rounded-cg bg-ok-soft/60 px-3.5 py-2.5 text-sm leading-relaxed text-ink">
                    <ArrowRight size={16} strokeWidth={2.4} className="mt-0.5 shrink-0 text-ok" aria-hidden />
                    <span>
                      <Inline text={item.achieves} />
                    </span>
                  </p>
                </Card>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* ── Next ──────────────────────────────────────────────────────── */}
      {feedback?.nextStep && (
        <Card className="flex gap-3.5 p-5 animate-cg-rise">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-cg-sm bg-hue-study/10 text-hue-study">
            <Compass size={17} strokeWidth={2.2} aria-hidden />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-hue-study">Your next step</p>
            <p className="mt-1 leading-relaxed text-body">
              <Inline text={feedback.nextStep} />
            </p>
          </div>
        </Card>
      )}

      {feedback?.suggestion && <SuggestionCard suggestion={feedback.suggestion} />}
    </div>
  );
}

/** A real bank exercise to try next, after a free session - one click to start it. */
function SuggestionCard({ suggestion }: { suggestion: NonNullable<Feedback['suggestion']> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const session = await api.post<{ id: string }>('pair', '/sessions', { questionId: suggestion.questionId });
      router.push(`/pair/${session.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start that exercise.');
      setBusy(false);
    }
  }

  return (
    <Card className="relative overflow-hidden p-6 animate-cg-rise">
      <span aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-accent/10 blur-2xl" />
      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-accent">
            <Sparkles size={13} aria-hidden />
            Try this next
          </p>
          <p className="mt-1.5 text-lg font-bold text-ink">{suggestion.title}</p>
          <p className="mt-1 text-sm text-body">
            <Inline text={suggestion.reason} />
          </p>
        </div>
        <button type="button" onClick={start} disabled={busy} className={buttonClass()}>
          {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Play size={15} aria-hidden />}
          Start this exercise
        </button>
      </div>
      {error && (
        <div className="relative mt-3">
          <FormError>{error}</FormError>
        </div>
      )}
    </Card>
  );
}

/** One line under "Review complete", by how the session went. */
export function encouragement(outcome: ReviewOutcome | undefined, steps: number): string | null {
  switch (outcome) {
    case 'solved':
      return 'You solved it. Below, your code and the model solution side by side - two ways to the same answer.';
    case 'unsolved':
      return steps > 0
        ? `Not solved this time - but you were ${count(steps)} change${steps === 1 ? '' : 's'} away. The path is below.`
        : 'Not solved this time. Compare your code with the model solution below.';
    case 'ungraded':
      return 'Below, your code next to the model solution, and what would finish it.';
    case 'free':
      return 'You built something of your own. Here is what worked, and what would make it better.';
    default:
      return null;
  }
}
