'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CircleCheck,
  CircleX,
  GraduationCap,
  Loader2,
  MessagesSquare,
  Sparkles,
  TriangleAlert,
  User,
  Users,
} from 'lucide-react';

import { ApiError, api } from '@/lib/api';
import { FormError } from '@/components/field';
import { Badge, Card, PageHeader, buttonClass } from '@/components/ui';

import { CodePanel } from './code-panel';

/**
 * The review after a session: a short walkthrough of the student's own code.
 *
 * Written for this session by the same model as the Study lessons - see
 * PairPath's ReviewsService. Each step teaches one idea, with the lines it is
 * about lit up in the code above, then asks one multiple-choice question. The
 * answer is marked straight away with an explanation, and locked. A pair gets
 * a question or two about how they worked together at the end; those have no
 * right answer and are not scored. The model solution is shown once the
 * review is finished.
 *
 * Partners answer on their own screens. They get the same questions, and how
 * often they agree is on the results page.
 */

interface Step {
  teach: string | null;
  lines: [number, number] | null;
  prompt: string;
  options: string[];
}

interface Marked {
  step: number;
  choice: number;
  correct: boolean | null;
  answer: number | null;
  explanation: string | null;
}

interface Review {
  status: string;
  ready: boolean;
  alreadySubmitted: boolean;
  partnerSubmitted: boolean;
  question?: { title?: string };
  mode?: 'solo' | 'pair';
  source?: 'generated' | 'question_bank';
  title?: string;
  summary?: string | null;
  code?: string;
  steps?: Step[];
  reflection?: { prompt: string; options: string[] }[];
  answers?: Marked[];
  solution?: { code: string; note: string | null } | null;
}

interface Submitted {
  score: number;
  outOf: number;
  solution: { code: string; note: string | null };
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const POLL_MS = 2500;
// The server falls back to the exercise's own questions well inside this.
const GIVE_UP_MS = 3 * 60 * 1000;

/**
 * `code` in backticks as code, **this** as bold, *this* as italic, everything
 * else as text - the three the model actually uses.
 *
 * Ligatures are off in code: the mono font would draw `<=` as a single
 * symbol, and a beginner has to type the two characters.
 */
function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g).map((part, index) => {
        if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) {
          return (
            <code
              key={index}
              className="rounded-[5px] bg-inset px-1.5 py-0.5 font-mono text-[0.88em] font-medium text-ink [font-variant-ligatures:none]"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        if (part.length > 4 && part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={index} className="font-semibold text-ink">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.length > 2 && part.startsWith('*') && part.endsWith('*')) {
          return <em key={index}>{part.slice(1, -1)}</em>;
        }
        return <Fragment key={index}>{part}</Fragment>;
      })}
    </>
  );
}

function OptionButton({
  letter,
  text,
  state,
  disabled,
  onChoose,
}: {
  letter: string;
  text: string;
  state: 'open' | 'right' | 'wrong' | 'picked' | 'faded';
  disabled: boolean;
  onChoose: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={state === 'right' || state === 'wrong' || state === 'picked'}
      disabled={disabled}
      onClick={onChoose}
      className={clsx(
        'cg-focusable group flex w-full items-center gap-3.5 rounded-cg border-2 px-4 py-3 text-left transition duration-200',
        state === 'open' && 'border-line bg-card hover:-translate-y-px hover:border-accent/50 hover:bg-accent-soft/50',
        state === 'right' && 'border-ok/60 bg-ok-soft/70',
        state === 'wrong' && 'border-danger/60 bg-danger-soft/70',
        state === 'picked' && 'border-accent/60 bg-accent-soft',
        state === 'faded' && 'border-line bg-card opacity-60',
        disabled && state === 'open' && 'cursor-wait',
      )}
    >
      <span
        aria-hidden
        className={clsx(
          'grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold transition',
          state === 'right' && 'bg-ok text-on-accent',
          state === 'wrong' && 'bg-danger text-on-accent',
          state === 'picked' && 'bg-accent text-on-accent',
          (state === 'open' || state === 'faded') && 'bg-card-alt text-muted ring-1 ring-line group-hover:text-accent',
        )}
      >
        {letter}
      </span>
      <span className="flex-1 font-medium text-ink">
        <Inline text={text} />
      </span>
      {state === 'right' && <CircleCheck size={19} className="shrink-0 text-ok" aria-label="Correct answer" />}
      {state === 'wrong' && <CircleX size={19} className="shrink-0 text-danger" aria-label="Your answer" />}
    </button>
  );
}

/** One segment per question, coloured by how it went. */
function Progress({
  count,
  reflection,
  current,
  marks,
  onJump,
}: {
  count: number;
  reflection: boolean;
  current: number;
  marks: Record<number, Marked>;
  onJump: (index: number) => void;
}) {
  const total = count + (reflection ? 1 : 0);
  return (
    <nav aria-label="Review progress" className="flex items-center gap-1.5">
      {Array.from({ length: total }, (_, index) => {
        const mark = marks[index];
        const isReflection = index === count;
        const reachable = index <= current || Boolean(mark);
        return (
          <button
            key={index}
            type="button"
            onClick={() => reachable && onJump(index)}
            disabled={!reachable}
            aria-current={index === current ? 'step' : undefined}
            aria-label={isReflection ? 'Working together' : `Question ${index + 1}`}
            className={clsx(
              'cg-focusable h-2 flex-1 rounded-full transition-all duration-300',
              index === current && 'ring-2 ring-accent/30 ring-offset-2 ring-offset-page',
              isReflection
                ? index <= current
                  ? 'bg-hue-pair'
                  : 'bg-line'
                : mark
                  ? mark.correct
                    ? 'bg-ok'
                    : 'bg-danger'
                  : index === current
                    ? 'bg-accent'
                    : 'bg-line',
            )}
          />
        );
      })}
    </nav>
  );
}

export function ReviewView({ sessionId }: { sessionId: string }) {
  const [review, setReview] = useState<Review | null>(null);
  const [marks, setMarks] = useState<Record<number, Marked>>({});
  const [current, setCurrent] = useState(0);
  const [submitted, setSubmitted] = useState<Submitted | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const startedAt = useRef(Date.now());
  const stepRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<Review>('pair', `/reviews/${sessionId}`);
      setReview(data);
      if (data.ready) {
        const given = Object.fromEntries((data.answers ?? []).map((a) => [a.step, a]));
        setMarks(given);
        // Resume at the first question not yet answered.
        const steps = data.steps?.length ?? 0;
        const next = Array.from({ length: steps }, (_, i) => i).find((i) => !given[i]);
        setCurrent(next ?? steps);
      }
      return data;
    } catch (err) {
      setFatal(
        err instanceof ApiError && err.isUnavailable
          ? 'Pairing is unavailable right now.'
          : 'Could not load the review.',
      );
      return null;
    }
  }, [sessionId]);

  // Poll while the review is being written.
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      const data = await load();
      if (!live || !data) return;
      if (!data.ready && data.status === 'COMPLETED') {
        if (Date.now() - startedAt.current > GIVE_UP_MS) {
          setFatal('The review is taking far longer than it should. Try again in a minute.');
          return;
        }
        timer = setTimeout(tick, POLL_MS);
      }
    };
    tick();

    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [load]);

  const steps = useMemo(() => review?.steps ?? [], [review]);
  const reflection = review?.reflection ?? [];
  const hasReflection = review?.mode === 'pair' && reflection.length > 0;
  const onReflection = current >= steps.length;
  const step = onReflection ? null : steps[current];
  const mark = marks[current];

  function go(index: number) {
    setError(null);
    setCurrent(index);
    // Bring the new step's top into view on a phone, where it may be below
    // the fold of the code panel.
    requestAnimationFrame(() => stepRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
  }

  async function choose(index: number, choice: number) {
    if (busy || marks[index]) return;
    setBusy(true);
    setError(null);
    try {
      const marked = await api.post<Marked>('pair', `/reviews/${sessionId}/answer`, { step: index, choice });
      setMarks((prev) => ({ ...prev, [index]: marked }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That answer did not go through. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      setSubmitted(await api.post<Submitted>('pair', `/reviews/${sessionId}/submit`, {}));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not finish the review.');
    } finally {
      setBusy(false);
    }
  }

  // ── States before there is anything to answer ──────────────────────────

  if (fatal) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card className="px-6 py-12 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-cg-lg bg-danger/10 text-danger">
            <TriangleAlert size={22} strokeWidth={2} aria-hidden />
          </span>
          <h1 className="mt-4 text-lg font-bold text-ink">Review unavailable</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-body">{fatal}</p>
          <Link href="/pair" className={buttonClass({ variant: 'secondary', className: 'mt-6' })}>
            <ArrowLeft size={16} strokeWidth={2.2} aria-hidden />
            Back to pairing
          </Link>
        </Card>
      </div>
    );
  }

  if (!review) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="cg-skeleton h-20 w-full" />
        <div className="cg-skeleton h-56 w-full" />
        <div className="cg-skeleton h-64 w-full" />
      </div>
    );
  }

  if (review.status !== 'COMPLETED') {
    const expired = review.status === 'EXPIRED';
    return (
      <div className="mx-auto max-w-2xl">
        <Card className="px-6 py-12 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-cg-lg bg-warn/10 text-warn">
            <TriangleAlert size={22} strokeWidth={2} aria-hidden />
          </span>
          <h1 className="mt-4 text-lg font-bold text-ink">
            {expired ? 'Nothing to review' : 'This session is still running'}
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-body">
            {expired
              ? 'This session expired without being finished, so there is nothing to review.'
              : 'The review opens once somebody ends the session.'}
          </p>
          <Link
            href={expired ? '/pair' : `/pair/${sessionId}`}
            className={buttonClass({ variant: 'secondary', className: 'mt-6' })}
          >
            <ArrowLeft size={16} strokeWidth={2.2} aria-hidden />
            {expired ? 'Back to pairing' : 'Back to the session'}
          </Link>
        </Card>
      </div>
    );
  }

  if (!review.ready) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card className="relative overflow-hidden px-6 py-14 text-center" aria-live="polite">
          <span className="mx-auto grid h-14 w-14 animate-pulse place-items-center rounded-cg-lg bg-accent/10 text-accent">
            <Sparkles size={24} strokeWidth={2} aria-hidden />
          </span>
          <h1 className="mt-5 text-xl font-bold text-ink">Writing your review…</h1>
          <p className="mx-auto mt-2 max-w-md text-body">
            Code Guru is reading the session: your final code, how your runs went and, if you had a
            partner, how the two of you worked. It takes a few seconds.
          </p>
          <div className="mx-auto mt-8 max-w-sm space-y-2.5" aria-hidden>
            <div className="cg-skeleton h-3 w-full" />
            <div className="cg-skeleton h-3 w-5/6" />
            <div className="cg-skeleton h-3 w-2/3" />
          </div>
        </Card>
      </div>
    );
  }

  // ── The review ───────────────────────────────────────────────────────────

  const pair = review.mode === 'pair';
  const done = Boolean(submitted) || review.alreadySubmitted;
  const solution = submitted?.solution ?? review.solution ?? null;
  const score = submitted?.score ?? Object.values(marks).filter((m) => m.step < steps.length && m.correct).length;
  const outOf = submitted?.outOf ?? steps.length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        eyebrow={pair ? 'Pair session review' : 'Session review'}
        title={review.title ?? 'Looking back at your session'}
        lead={review.summary ?? undefined}
        icon={GraduationCap}
        tone="text-hue-pair"
        toneBg="bg-hue-pair/10"
      />

      <div className="-mt-2 flex flex-wrap gap-2">
        <Badge tone="neutral">
          {pair ? <Users size={13} aria-hidden /> : <User size={13} aria-hidden />}
          {pair ? 'You and your partner' : 'Just you'}
        </Badge>
        {review.question?.title && <Badge tone="neutral">{review.question.title}</Badge>}
        {review.source === 'generated' ? (
          <Badge tone="accent">
            <Sparkles size={13} aria-hidden />
            Written for this session
          </Badge>
        ) : (
          <Badge tone="neutral">The exercise&rsquo;s own questions</Badge>
        )}
      </div>

      <CodePanel
        code={review.code ?? ''}
        highlight={!done && step ? step.lines : null}
        label="Your final code"
      />

      {done ? (
        <>
          <Card className="px-6 py-8 text-center animate-cg-rise" aria-live="polite">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-ok/10 text-ok">
              <CircleCheck size={24} strokeWidth={2} aria-hidden />
            </span>
            <h2 className="mt-4 text-xl font-bold text-ink">Review complete</h2>
            {outOf > 0 && (
              <p className="mt-1 text-body">
                You got <strong className="text-ink">{score}</strong> of {outOf} right.
              </p>
            )}
            {pair && (
              <p className="mx-auto mt-2 max-w-md text-sm text-muted">
                {review.partnerSubmitted
                  ? 'Your partner has finished too - the results page compares your answers.'
                  : 'The comparison with your partner appears once they have finished theirs.'}
              </p>
            )}
          </Card>

          {solution && solution.code.trim() && (
            <section className="space-y-3 animate-cg-rise">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
                  <BookOpen size={18} strokeWidth={2.2} className="text-ok" aria-hidden />
                  The model solution
                </h2>
                {solution.note && (
                  <p className="mt-1 text-body">
                    <Inline text={solution.note} />
                  </p>
                )}
              </div>
              <CodePanel code={solution.code} label="Model solution" tone="ok" />
            </section>
          )}

          <div className="flex flex-wrap gap-3">
            <Link href={`/pair/${sessionId}/results`} className={buttonClass({ size: 'lg' })}>
              See the results
              <ArrowRight size={17} strokeWidth={2.3} aria-hidden />
            </Link>
            <Link href="/pair" className={buttonClass({ variant: 'secondary', size: 'lg' })}>
              Back to pairing
            </Link>
          </div>
        </>
      ) : (
        <div ref={stepRef} className="scroll-mt-24 space-y-4">
          <Progress count={steps.length} reflection={hasReflection} current={current} marks={marks} onJump={go} />

          {step ? (
            <Card key={current} className="overflow-hidden animate-cg-rise">
              <div className="flex items-center justify-between gap-3 border-b border-line bg-card-alt px-6 py-3">
                <span className="text-xs font-bold uppercase tracking-wider text-hue-pair">
                  Step {current + 1} of {steps.length}
                </span>
                {step.lines && <span className="text-xs text-muted">Highlighted in your code above</span>}
              </div>

              <div className="space-y-5 p-6">
                {step.teach && (
                  <div className="flex gap-3.5">
                    <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-cg-sm bg-accent/10 text-accent">
                      <BookOpen size={16} strokeWidth={2.2} aria-hidden />
                    </span>
                    <p className="leading-relaxed text-body">
                      <Inline text={step.teach} />
                    </p>
                  </div>
                )}

                <div>
                  <p id={`q-${current}`} className="text-[17px] font-semibold leading-snug text-ink">
                    <Inline text={step.prompt} />
                  </p>
                  <div role="radiogroup" aria-labelledby={`q-${current}`} className="mt-4 grid gap-2.5">
                    {step.options.map((option, choice) => (
                      <OptionButton
                        key={choice}
                        letter={LETTERS[choice]}
                        text={option}
                        disabled={busy || Boolean(mark)}
                        onChoose={() => choose(current, choice)}
                        state={
                          !mark
                            ? 'open'
                            : choice === mark.answer
                              ? 'right'
                              : choice === mark.choice
                                ? 'wrong'
                                : 'faded'
                        }
                      />
                    ))}
                  </div>
                </div>

                {mark && (
                  <div
                    aria-live="polite"
                    className={clsx(
                      'flex gap-3 rounded-cg border p-4 animate-cg-rise',
                      mark.correct ? 'border-ok/30 bg-ok-soft/60' : 'border-danger/30 bg-danger-soft/60',
                    )}
                  >
                    {mark.correct ? (
                      <CircleCheck size={20} className="mt-0.5 shrink-0 text-ok" aria-hidden />
                    ) : (
                      <CircleX size={20} className="mt-0.5 shrink-0 text-danger" aria-hidden />
                    )}
                    <div>
                      <p className={clsx('font-semibold', mark.correct ? 'text-ok' : 'text-danger')}>
                        {mark.correct ? 'Right!' : `Not quite - the answer is ${LETTERS[mark.answer ?? 0]}.`}
                      </p>
                      {mark.explanation && (
                        <p className="mt-1 leading-relaxed text-body">
                          <Inline text={mark.explanation} />
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <footer className="flex items-center justify-between gap-3 border-t border-line px-6 py-4">
                <button
                  type="button"
                  onClick={() => go(current - 1)}
                  disabled={current === 0}
                  className={buttonClass({ variant: 'ghost', size: 'sm' })}
                >
                  <ArrowLeft size={15} strokeWidth={2.2} aria-hidden />
                  Back
                </button>
                {current < steps.length - 1 || hasReflection ? (
                  <button type="button" onClick={() => go(current + 1)} disabled={!mark} className={buttonClass()}>
                    {current < steps.length - 1 ? 'Next step' : 'Continue'}
                    <ArrowRight size={16} strokeWidth={2.3} aria-hidden />
                  </button>
                ) : (
                  <button type="button" onClick={finish} disabled={!mark || busy} className={buttonClass()}>
                    {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <CircleCheck size={16} aria-hidden />}
                    Finish review
                  </button>
                )}
              </footer>
            </Card>
          ) : hasReflection ? (
            (
              <Card className="overflow-hidden animate-cg-rise">
                <div className="flex items-center gap-2 border-b border-line bg-card-alt px-6 py-3">
                  <MessagesSquare size={15} className="text-hue-pair" aria-hidden />
                  <span className="text-xs font-bold uppercase tracking-wider text-hue-pair">
                    How you worked together
                  </span>
                </div>
                <div className="space-y-6 p-6">
                  <p className="text-sm text-muted">
                    There is no right answer to these, and they are not scored. They are for you and your
                    partner to think about - answer as many as you like.
                  </p>
                  {reflection.map((item, k) => {
                      const index = steps.length + k;
                      const given = marks[index];
                      return (
                        <div key={index}>
                          <p id={`r-${index}`} className="font-semibold text-ink">
                            <Inline text={item.prompt} />
                          </p>
                          <div role="radiogroup" aria-labelledby={`r-${index}`} className="mt-3 grid gap-2.5 sm:grid-cols-2">
                            {item.options.map((option, choice) => (
                              <OptionButton
                                key={choice}
                                letter={LETTERS[choice]}
                                text={option}
                                disabled={busy || Boolean(given)}
                                onChoose={() => choose(index, choice)}
                                state={!given ? 'open' : given.choice === choice ? 'picked' : 'faded'}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                </div>
                <footer className="flex items-center justify-between gap-3 border-t border-line px-6 py-4">
                  <button
                    type="button"
                    onClick={() => go(steps.length - 1)}
                    disabled={steps.length === 0}
                    className={buttonClass({ variant: 'ghost', size: 'sm' })}
                  >
                    <ArrowLeft size={15} strokeWidth={2.2} aria-hidden />
                    Back
                  </button>
                  <button type="button" onClick={finish} disabled={busy} className={buttonClass()}>
                    {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <CircleCheck size={16} aria-hidden />}
                    Finish review
                  </button>
                </footer>
              </Card>
            )
          ) : (
            // Every question answered but not yet finished (a reload), or an
            // exercise with no questions at all.
            <Card className="px-6 py-8 text-center animate-cg-rise">
              <p className="text-body">
                {steps.length === 0 ? 'This exercise has no review questions.' : 'That was the last question.'}
              </p>
              <button type="button" onClick={finish} disabled={busy} className={buttonClass({ className: 'mt-4' })}>
                {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <CircleCheck size={16} aria-hidden />}
                Finish review
              </button>
            </Card>
          )}

          {error && <FormError>{error}</FormError>}
        </div>
      )}
    </div>
  );
}
