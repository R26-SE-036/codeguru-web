'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  CircleCheck,
  Loader2,
  MessagesSquare,
  TriangleAlert,
} from 'lucide-react';

import { ApiError, api } from '@/lib/api';
import { FormError } from '@/components/field';
import { Card, EmptyState, PageHeader, buttonClass } from '@/components/ui';

/**
 * After a session ends, each partner answers the question's review prompts
 * independently. Both submissions are what the peer-review score is built from.
 */

interface ReviewPayload {
  questions?: string[];
  alreadySubmitted?: boolean;
}

export function ReviewView({ sessionId }: { sessionId: string }) {
  const router = useRouter();

  const [questions, setQuestions] = useState<string[] | null>(null);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .get<ReviewPayload>('pair', `/reviews/${sessionId}`)
      .then((data) => {
        if (!live) return;
        setQuestions(data.questions ?? []);
        setSubmitted(Boolean(data.alreadySubmitted));
      })
      .catch((err) => {
        if (!live) return;
        setError(
          err instanceof ApiError && err.isUnavailable
            ? 'Pairing is unavailable right now.'
            : 'Could not load the review.',
        );
      });
    return () => {
      live = false;
    };
  }, [sessionId]);

  async function submit() {
    if (!questions) return;
    setBusy(true);
    setError(null);
    try {
      // Ordered by question index, not by object key order. The API pairs each
      // answer with its prompt positionally, so an unordered array silently
      // attaches answers to the wrong questions.
      const ordered = questions.map((_, index) => answers[index] ?? '');
      await api.post('pair', `/reviews/${sessionId}/submit`, { answers: ordered });
      router.push(`/pair/${sessionId}/results`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit your review.');
      setBusy(false);
    }
  }

  if (error && !questions) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card className="px-6 py-12 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-cg-lg bg-danger/10 text-danger">
            <TriangleAlert size={22} strokeWidth={2} aria-hidden />
          </span>
          <h1 className="mt-4 text-lg font-bold text-ink">Review unavailable</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-body">{error}</p>
          <Link
            href="/pair"
            className={buttonClass({ variant: 'secondary', className: 'mt-6' })}
          >
            <ArrowLeft size={16} strokeWidth={2.2} aria-hidden />
            Back to pairing
          </Link>
        </Card>
      </div>
    );
  }

  if (!questions) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="cg-skeleton h-24 w-full" />
        <div className="cg-skeleton h-32 w-full" />
        <div className="cg-skeleton h-32 w-full" />
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card className="px-6 py-12 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-cg-lg bg-ok/10 text-ok">
            <CircleCheck size={22} strokeWidth={2} aria-hidden />
          </span>
          <h1 className="mt-4 text-lg font-bold text-ink">Review submitted</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-body">
            Your answers are in. The comparison appears once your partner has
            submitted theirs too.
          </p>
          <Link
            href={`/pair/${sessionId}/results`}
            className={buttonClass({ className: 'mt-6' })}
          >
            See the results
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        eyebrow="Pair"
        title="Peer review"
        lead="Answer these on your own — your partner answers separately, and the comparison is the point."
        icon={MessagesSquare}
        tone="text-hue-pair"
        toneBg="bg-hue-pair/10"
      />

      {questions.length === 0 ? (
        <EmptyState icon={MessagesSquare} title="No review prompts">
          This question does not have any review prompts attached to it.
        </EmptyState>
      ) : (
        <ol className="space-y-4">
          {questions.map((question, index) => (
            <Card as="li" key={index} className="p-5">
              <label
                htmlFor={`answer-${index}`}
                className="flex gap-3 font-semibold text-ink"
              >
                <span
                  aria-hidden
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-hue-pair/10 text-xs font-bold text-hue-pair"
                >
                  {index + 1}
                </span>
                {question}
              </label>

              <textarea
                id={`answer-${index}`}
                rows={3}
                value={answers[index] ?? ''}
                onChange={(event) =>
                  setAnswers((prev) => ({ ...prev, [index]: event.target.value }))
                }
                placeholder="Your answer…"
                className="cg-focusable mt-3 w-full resize-y rounded-cg border border-line bg-card-alt px-3.5 py-2.5 text-ink placeholder:text-faint-nontext hover:border-line-strong focus-visible:border-accent"
              />
            </Card>
          ))}
        </ol>
      )}

      {error && <FormError>{error}</FormError>}

      <button
        type="button"
        onClick={submit}
        disabled={busy || questions.length === 0}
        className={buttonClass({ size: 'lg' })}
      >
        {busy ? (
          <>
            <Loader2 size={17} className="animate-spin" aria-hidden />
            Submitting…
          </>
        ) : (
          'Submit review'
        )}
      </button>
    </div>
  );
}
