'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleCheck,
  CircleX,
  Info,
  Loader2,
  ListChecks,
  TriangleAlert,
} from 'lucide-react';

import { ApiError, api } from '@/lib/api';
import { Card, Meter, buttonClass } from '@/components/ui';

/**
 * The quiz is what closes the remediation loop. Two calls follow it, tracked
 * separately on purpose so one failing does not hide the other:
 *
 *  1. POST /api/progress/update  - this service's own record, into the
 *     progress graph.
 *  2. POST /api/remediation/triggers/{id}/quiz-completed  - the platform
 *     store, which is what actually resolves the trigger.
 *
 * `passed` is deliberately not sent. The integration contract is explicit: send
 * the score and let the platform apply the pass mark, or this service quietly
 * disagrees with the rest of the platform about what passing means.
 */

interface QuizQuestion {
  question: string;
  options: string[];
  correct_answer: string;
  explanation?: string;
}

interface Trigger {
  trigger_id: string;
  concept_tag: string;
  error_type?: string;
  quiz?: { quiz_id?: string };
}

type ReportStatus = 'idle' | 'sending' | 'ok' | 'failed';

/**
 * Per-trigger, so starting a second quiz cannot resume the first one's answers.
 * The original used a single global `cg_quizState` key, which meant opening a
 * different concept's quiz restored the previous quiz's questions and score.
 */
const storageKey = (triggerId: string) => `codeguru.quiz.${triggerId}`;

export function QuizView({ triggerId }: { triggerId: string }) {
  const router = useRouter();

  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [graphStatus, setGraphStatus] = useState<ReportStatus>('idle');
  const [coachStatus, setCoachStatus] = useState<ReportStatus>('idle');
  const [triggerResolved, setTriggerResolved] = useState(false);

  useEffect(() => {
    let live = true;

    (async () => {
      try {
        const data = await api.get<{ triggers?: Trigger[] }>('study', '/remediation/triggers');
        const found = data.triggers?.find((t) => t.trigger_id === triggerId) ?? null;
        if (!live) return;

        if (!found) {
          setError('That quiz is no longer on your list.');
          return;
        }
        setTrigger(found);

        // Resume an unfinished attempt at THIS quiz, if there is one.
        try {
          const saved = sessionStorage.getItem(storageKey(triggerId));
          if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed?.questions) && parsed.questions.length) {
              setQuestions(parsed.questions);
              setIndex(parsed.index ?? 0);
              setScore(parsed.score ?? 0);
              return;
            }
          }
        } catch {
          // Unreadable saved state is the same as none.
        }

        const generated = await api.post<{ quiz_data?: QuizQuestion[] }>(
          'study',
          '/quiz/generate',
          // No student id: the backend takes the student from the bearer token.
          { error_type: found.error_type ?? found.concept_tag },
        );
        if (!live) return;

        if (!generated.quiz_data?.length) {
          setError('No quiz could be generated for this concept.');
          return;
        }
        setQuestions(generated.quiz_data);
      } catch (err) {
        if (!live) return;
        setError(
          err instanceof ApiError && err.isUnavailable
            ? 'Study Guider is unavailable right now. Please try again shortly.'
            : 'Could not load the quiz.',
        );
      }
    })();

    return () => {
      live = false;
    };
  }, [triggerId]);

  // Persist progress so a refresh mid-quiz does not start over.
  useEffect(() => {
    if (!questions || finished) return;
    try {
      sessionStorage.setItem(
        storageKey(triggerId),
        JSON.stringify({ questions, index, score }),
      );
    } catch {
      // Storage unavailable; the quiz still works, it just will not resume.
    }
  }, [questions, index, score, finished, triggerId]);

  /**
   * The original's lenient comparison, kept.
   *
   * Options and the stored answer are generated text and do not always match
   * character for character, so an exact comparison marked correct answers
   * wrong. This is deliberately forgiving; it is a validation quiz, and the
   * cost of a false negative to a struggling student is higher than the cost
   * of a false positive.
   */
  const matches = useCallback((a: string | null, b: string | null) => {
    if (!a || !b) return false;
    const x = String(a).toLowerCase().trim();
    const y = String(b).toLowerCase().trim();
    return x === y || x.includes(y) || y.includes(x);
  }, []);

  async function finish(finalScore: number, total: number) {
    setFinished(true);
    try {
      sessionStorage.removeItem(storageKey(triggerId));
    } catch {
      /* nothing to clean up */
    }

    setGraphStatus('sending');
    api
      .post('study', '/progress/update', {
        // The concept tag, not the error type. The backend normalises either
        // vocabulary now, but sending the canonical one keeps the graph clean
        // at the source rather than relying on the repair.
        concept: trigger?.concept_tag ?? trigger?.error_type,
        score: finalScore,
        total_questions: total,
      })
      .then(() => setGraphStatus('ok'))
      .catch(() => setGraphStatus('failed'));

    if (trigger?.trigger_id) {
      const scorePercent = total > 0 ? Math.round((finalScore / total) * 100) : 0;
      setCoachStatus('sending');

      api
        .post<{ trigger?: { status?: string } }>(
          'study',
          `/remediation/triggers/${trigger.trigger_id}/quiz-completed`,
          {
            quiz_id: trigger.quiz?.quiz_id ?? 'quiz_general_01',
            score_percent: scorePercent,
          },
        )
        .then((response) => {
          setCoachStatus('ok');
          setTriggerResolved(response.trigger?.status === 'completed');
        })
        .catch(() => setCoachStatus('failed'));
    }
  }

  if (error) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card className="px-6 py-12 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-cg-lg bg-danger/10 text-danger">
            <TriangleAlert size={22} strokeWidth={2} aria-hidden />
          </span>
          <h1 className="mt-4 text-lg font-bold text-ink">No quiz to show</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-body">{error}</p>
          <Link
            href="/study"
            className={buttonClass({ variant: 'secondary', className: 'mt-6' })}
          >
            <ArrowLeft size={16} strokeWidth={2.2} aria-hidden />
            Back to your lessons
          </Link>
        </Card>
      </div>
    );
  }

  if (!questions) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card className="flex flex-col items-center px-6 py-16 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-cg-lg bg-hue-study/10 text-hue-study">
            <Loader2 size={26} strokeWidth={2} aria-hidden className="animate-spin" />
          </span>
          <h1 className="mt-5 text-lg font-bold text-ink">Preparing your quiz</h1>
          <p className="mt-2 max-w-sm text-sm text-body">
            The questions are written for the mistake you made, so they take a moment.
          </p>
        </Card>
      </div>
    );
  }

  if (finished) {
    const total = questions.length;
    const percent = total > 0 ? Math.round((score / total) * 100) : 0;

    // 70 is the platform pass mark. Shown here only to set the tone of the
    // result card - the actual decision is made server-side, deliberately, so
    // this service cannot disagree with the rest of the platform.
    const passed = percent >= 70;

    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Card className="relative overflow-hidden px-6 py-10 text-center">
          <div
            aria-hidden
            className={`pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full blur-3xl ${
              passed ? 'bg-ok/20' : 'bg-warn/20'
            }`}
          />

          <div className="relative">
            <span
              className={`mx-auto grid h-14 w-14 place-items-center rounded-cg-lg ${
                passed ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn'
              }`}
            >
              {passed ? (
                <CircleCheck size={26} strokeWidth={2} aria-hidden />
              ) : (
                <TriangleAlert size={26} strokeWidth={2} aria-hidden />
              )}
            </span>

            <p className="mt-5 text-6xl font-extrabold tabular-nums tracking-tight text-ink">
              {percent}
              <span className="text-3xl text-muted">%</span>
            </p>
            <p className="mt-1 font-medium text-body">
              {score} of {total} correct
            </p>

            <div className="mx-auto mt-6 max-w-xs">
              <Meter
                value={percent}
                tone={passed ? 'bg-ok' : 'bg-warn'}
                label="Quiz score"
              />
            </div>
          </div>
        </Card>

        {/*
          These two are reported separately because they mean different things.
          The graph write is this service's own record; the platform call is
          what actually resolves the trigger. A student whose score reached the
          pass mark but whose report failed is still going to see this concept
          on their list, and being told that is better than wondering why.
        */}
        <div className="space-y-2">
          <StatusLine
            status={graphStatus}
            sending="Saving your progress…"
            ok="Progress saved."
            failed="Your progress could not be saved to the study graph."
          />
          <StatusLine
            status={coachStatus}
            sending="Recording your score…"
            ok={
              triggerResolved
                ? 'Recorded. This concept is done and drops off your list.'
                : 'Recorded, but below the pass mark — this concept stays on your list.'
            }
            failed="Your score could not be recorded, so this concept stays flagged."
          />
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              router.push('/study');
              router.refresh();
            }}
            className={buttonClass({ size: 'lg' })}
          >
            Back to your lessons
          </button>
          <Link
            href="/study/progress"
            className={buttonClass({ variant: 'secondary', size: 'lg' })}
          >
            See your progress
          </Link>
        </div>
      </div>
    );
  }

  const question = questions[index];
  const isCorrect = checked && matches(selected, question.correct_answer);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="flex items-center gap-2 font-bold text-ink">
            <ListChecks size={17} strokeWidth={2.2} aria-hidden className="text-hue-study" />
            Question {index + 1}
            <span className="font-medium text-muted">of {questions.length}</span>
          </h1>
          <span className="text-sm font-semibold tabular-nums text-muted">
            {score} correct
          </span>
        </div>

        {/* Progress counts questions ANSWERED, not the one on screen: at the
            first question nothing is done yet, so the bar starts empty. */}
        <div className="mt-3">
          <Meter
            value={(index / questions.length) * 100}
            tone="bg-hue-study"
            label="Quiz progress"
          />
        </div>
      </header>

      <Card className="p-6 sm:p-7">
        <p className="text-lg font-semibold leading-snug text-ink">{question.question}</p>

        <div className="mt-5 space-y-2.5">
          {question.options.map((option) => {
            const chosen = selected === option;
            const correctOne = checked && matches(option, question.correct_answer);
            const wrongPick = checked && chosen && !correctOne;

            return (
              <button
                key={option}
                type="button"
                disabled={checked}
                onClick={() => setSelected(option)}
                aria-pressed={chosen}
                className={`cg-focusable flex w-full items-center gap-3 rounded-cg border px-4 py-3.5 text-left transition duration-150 ease-cg disabled:cursor-default ${
                  correctOne
                    ? 'border-ok bg-ok/10 text-ink'
                    : wrongPick
                      ? 'border-danger bg-danger/10 text-ink'
                      : chosen
                        ? 'border-accent bg-accent/10 text-ink'
                        : 'border-line bg-card text-body hover:border-line-strong hover:bg-card-alt'
                }`}
              >
                <span
                  aria-hidden
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition ${
                    correctOne
                      ? 'border-ok bg-ok text-white'
                      : wrongPick
                        ? 'border-danger bg-danger text-white'
                        : chosen
                          ? 'border-accent bg-accent'
                          : 'border-line-strong'
                  }`}
                >
                  {correctOne && <Check size={13} strokeWidth={3.2} />}
                  {wrongPick && <CircleX size={13} strokeWidth={3} />}
                </span>

                <span className="flex-1">{option}</span>
              </button>
            );
          })}
        </div>
      </Card>

      {checked && (
        <Card
          className={`flex gap-4 border-l-4 p-5 ${
            isCorrect ? 'border-l-ok' : 'border-l-warn'
          }`}
        >
          <span
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-cg ${
              isCorrect ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn'
            }`}
          >
            {isCorrect ? (
              <CircleCheck size={18} strokeWidth={2.2} aria-hidden />
            ) : (
              <Info size={18} strokeWidth={2.2} aria-hidden />
            )}
          </span>
          <div>
            <p className={`font-bold ${isCorrect ? 'text-ok' : 'text-warn'}`}>
              {isCorrect ? 'Correct' : 'Not quite'}
            </p>
            {question.explanation && (
              <p className="mt-1 text-body">{question.explanation}</p>
            )}
          </div>
        </Card>
      )}

      <div className="flex justify-end">
        {!checked ? (
          <button
            type="button"
            disabled={selected === null}
            onClick={() => {
              setChecked(true);
              if (matches(selected, question.correct_answer)) setScore((s) => s + 1);
            }}
            className={buttonClass({ size: 'lg' })}
          >
            Check answer
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              const last = index + 1 >= questions.length;
              if (last) {
                finish(score, questions.length);
              } else {
                setIndex((i) => i + 1);
                setSelected(null);
                setChecked(false);
              }
            }}
            className={buttonClass({ size: 'lg' })}
          >
            {index + 1 >= questions.length ? 'Finish quiz' : 'Next question'}
            <ArrowRight size={17} strokeWidth={2.4} aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}

function StatusLine({
  status,
  sending,
  ok,
  failed,
}: {
  status: ReportStatus;
  sending: string;
  ok: string;
  failed: string;
}) {
  if (status === 'idle') return null;

  const text = status === 'sending' ? sending : status === 'ok' ? ok : failed;
  const tone =
    status === 'failed'
      ? 'border-danger/30 bg-danger/10 text-danger'
      : status === 'ok'
        ? 'border-ok/30 bg-ok/10 text-ok'
        : 'border-line bg-card-alt text-body';

  return (
    <p
      className={`flex items-center gap-2.5 rounded-cg border px-4 py-2.5 text-sm font-medium ${tone}`}
    >
      {status === 'sending' ? (
        <Loader2 size={15} strokeWidth={2.4} aria-hidden className="animate-spin" />
      ) : status === 'ok' ? (
        <CircleCheck size={15} strokeWidth={2.4} aria-hidden />
      ) : (
        <CircleX size={15} strokeWidth={2.4} aria-hidden />
      )}
      {text}
    </p>
  );
}
