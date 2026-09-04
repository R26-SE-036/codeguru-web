'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ApiError, api } from '@/lib/api';

/**
 * Ported from Study-Guider ValidationQuiz.jsx.
 *
 * The quiz is what closes the remediation loop. Two calls follow it, tracked
 * separately on purpose so one failing does not hide the other:
 *
 *  1. POST /api/progress/update  - Study Guider's own record, into the Neo4j
 *     progress graph.
 *  2. POST /api/remediation/triggers/{id}/quiz-completed  - Code Coach, which
 *     is what actually resolves the trigger.
 *
 * `passed` is deliberately not sent. The integration guide is explicit: send
 * the score and let Code Coach apply the platform pass mark, or this service
 * quietly disagrees with the rest of the platform about what passing means.
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
      <div className="mx-auto max-w-2xl space-y-4">
        <p className="rounded-cg bg-danger-soft px-4 py-3 text-danger">{error}</p>
        <Link href="/study" className="inline-flex text-accent hover:underline">
          Back to your lessons
        </Link>
      </div>
    );
  }

  if (!questions) {
    return <p className="mx-auto max-w-2xl text-muted">Preparing your quiz…</p>;
  }

  if (finished) {
    const total = questions.length;
    const percent = total > 0 ? Math.round((score / total) * 100) : 0;

    return (
      <div className="mx-auto max-w-2xl space-y-6 text-center">
        <div>
          <p className="text-5xl font-semibold text-ink">
            {score}
            <span className="text-muted">/{total}</span>
          </p>
          <p className="mt-1 text-body">{percent}%</p>
        </div>

        {/*
          These two are reported separately because they mean different things.
          The Neo4j write is Study Guider's own record; the Code Coach call is
          what actually resolves the trigger. A student whose score reached the
          pass mark but whose report failed is still going to see this concept
          on their list, and being told that is better than wondering why.
        */}
        <div className="space-y-2 text-left">
          <StatusLine
            status={graphStatus}
            sending="Saving your progress…"
            ok="Progress saved."
            failed="Your progress could not be saved to the study graph."
          />
          <StatusLine
            status={coachStatus}
            sending="Reporting your score to the coach…"
            ok={
              triggerResolved
                ? 'Reported. This concept is done and drops off your list.'
                : 'Reported, but below the pass mark — this concept stays on your list.'
            }
            failed="Could not reach the coach. Your score was not recorded there, so this concept stays flagged."
          />
        </div>

        <div className="flex justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              router.push('/study');
              router.refresh();
            }}
            className="rounded-cg bg-accent px-5 py-2.5 font-medium text-white transition hover:bg-accent-strong"
          >
            Back to your lessons
          </button>
          <Link
            href="/study/progress"
            className="rounded-cg border border-line px-5 py-2.5 text-body transition hover:bg-card-alt"
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
      <header className="flex items-baseline justify-between">
        <h1 className="text-lg font-medium text-ink">
          Question {index + 1} of {questions.length}
        </h1>
        <span className="text-sm text-muted">Score {score}</span>
      </header>

      <p className="text-ink">{question.question}</p>

      <div className="space-y-2">
        {question.options.map((option) => {
          const chosen = selected === option;
          const correctOne = checked && matches(option, question.correct_answer);

          return (
            <button
              key={option}
              type="button"
              disabled={checked}
              onClick={() => setSelected(option)}
              className={`w-full rounded-cg border px-4 py-3 text-left transition disabled:cursor-default ${
                correctOne
                  ? 'border-ok bg-ok/10 text-ink'
                  : chosen && checked
                    ? 'border-danger bg-danger-soft text-ink'
                    : chosen
                      ? 'border-accent bg-accent-soft/40 text-ink'
                      : 'border-line bg-card text-body hover:bg-card-alt'
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>

      {checked && (
        <div
          className={`rounded-cg px-4 py-3 ${isCorrect ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn'}`}
        >
          <p className="font-medium">{isCorrect ? 'Correct.' : 'Not quite.'}</p>
          {question.explanation && (
            <p className="mt-1 text-body">{question.explanation}</p>
          )}
        </div>
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
            className="rounded-cg bg-accent px-5 py-2.5 font-medium text-white transition hover:bg-accent-strong disabled:opacity-50"
          >
            Check
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
            className="rounded-cg bg-accent px-5 py-2.5 font-medium text-white transition hover:bg-accent-strong"
          >
            {index + 1 >= questions.length ? 'Finish' : 'Next question'}
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
      ? 'border-danger bg-danger-soft text-danger'
      : status === 'ok'
        ? 'border-ok bg-ok/10 text-ok'
        : 'border-line bg-card-alt text-body';

  return <p className={`rounded-cg border-l-4 px-4 py-2 text-sm ${tone}`}>{text}</p>;
}
