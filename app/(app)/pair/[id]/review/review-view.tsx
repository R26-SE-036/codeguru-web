'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ApiError, api } from '@/lib/api';

/**
 * Ported from Pair_Path review/[id]/page.tsx.
 *
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
      <div className="mx-auto max-w-2xl space-y-4">
        <p className="rounded-cg bg-danger-soft px-4 py-3 text-danger">{error}</p>
        <Link href="/pair" className="inline-flex text-accent hover:underline">
          Back to pairing
        </Link>
      </div>
    );
  }

  if (!questions) return <p className="text-muted">Loading the review…</p>;

  if (submitted) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 text-center">
        <p className="text-ink">You have already submitted this review.</p>
        <Link
          href={`/pair/${sessionId}/results`}
          className="inline-flex rounded-cg bg-accent px-5 py-2.5 font-medium text-white"
        >
          See the results
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink">Peer review</h1>
        <p className="mt-1 text-body">
          Answer these on your own — your partner answers separately, and the
          comparison is the point.
        </p>
      </header>

      {questions.length === 0 ? (
        <p className="rounded-cg border border-line bg-card px-4 py-3 text-body">
          This question has no review prompts.
        </p>
      ) : (
        <ol className="space-y-5">
          {questions.map((question, index) => (
            <li key={index}>
              <label
                htmlFor={`answer-${index}`}
                className="mb-2 block font-medium text-ink"
              >
                {index + 1}. {question}
              </label>
              <textarea
                id={`answer-${index}`}
                rows={3}
                value={answers[index] ?? ''}
                onChange={(event) =>
                  setAnswers((prev) => ({ ...prev, [index]: event.target.value }))
                }
                className="w-full rounded-cg border border-line bg-card px-3 py-2 text-ink"
              />
            </li>
          ))}
        </ol>
      )}

      {error && (
        <p role="alert" className="rounded-cg bg-danger-soft px-4 py-3 text-danger">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={busy || questions.length === 0}
        className="rounded-cg bg-accent px-5 py-2.5 font-medium text-white transition hover:bg-accent-strong disabled:opacity-50"
      >
        {busy ? 'Submitting…' : 'Submit review'}
      </button>
    </div>
  );
}
