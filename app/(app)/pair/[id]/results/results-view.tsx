'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CircleCheck, Hourglass, Users } from 'lucide-react';

import { ApiError, api } from '@/lib/api';
import { usePairSocket } from '@/lib/use-pair-socket';
import { Card, Meter, Unavailable, buttonClass } from '@/components/ui';

/**
 * What the two reviews said, and how far they agreed.
 *
 * ==================== WHAT THIS PAGE USED TO READ ====================
 * `score`, `feedback`, `bothSubmitted` and `submissions`. The endpoint returns
 * none of them - it returns `averageScore`, `recommendations`, `reviews`,
 * `outOf` and `agreement`. So:
 *
 *   - `score` was always undefined, and the page rendered "Both reviews are
 *     in, but no score came back for this session" every single time.
 *   - `bothSubmitted === false` was never true (undefined is not false), so
 *     the "waiting on your partner" state could not appear - a student who
 *     submitted first saw the no-score message instead.
 *   - `feedback` never rendered, so the recommendations reached nobody.
 *   - `passed = score >= 70` compared a count of matching prompts against a
 *     percentage, and `<Meter value={score}>` rendered a score of 4 as a 4%
 *     bar. Both would still have been wrong after the field name was fixed.
 *
 * And it was a server component with copy promising the page "fills in as soon
 * as they submit". Nothing refreshed it. The gateway has emitted
 * `review_submitted` all along and nothing has ever listened - the
 * `watch_session` message exists for exactly this page and was never sent.
 * ====================================================================
 */

interface ReviewRow {
  userId: string;
  firstName?: string;
  lastName?: string;
  score: number;
}

interface Result {
  reviews: ReviewRow[];
  averageScore: number;
  outOf: number;
  agreement: { matched: number; outOf: number } | null;
  recommendations: string[];
}

export function ResultsView({ sessionId, userId }: { sessionId: string; userId: string }) {
  const [result, setResult] = useState<Result | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'none' | 'unavailable'>('loading');

  const load = useCallback(async () => {
    try {
      setResult(await api.get<Result>('pair', `/reviews/${sessionId}/result`));
      setState('ready');
    } catch (error) {
      // A 400 here means nobody has submitted yet, which is a normal state on
      // this page rather than a failure - the endpoint has nothing to average.
      if (error instanceof ApiError && error.isUnavailable) setState('unavailable');
      else setState('none');
    }
  }, [sessionId]);

  useEffect(() => {
    load();
  }, [load]);

  // Watching, not joining. join_room writes a JOIN event, and a student opening
  // results after the session ended is not session activity - those rows would
  // land in the behavioural record the model learns from.
  usePairSocket(sessionId, {
    onConnect: (socket) => socket.emit('watch_session', { sessionId }),
    handlers: { review_submitted: () => load() } as unknown as Record<
      string,
      (payload: never) => void
    >,
  });

  if (state === 'loading') {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="cg-skeleton h-40 w-full" />
        <div className="cg-skeleton h-24 w-full" />
      </div>
    );
  }

  if (state === 'unavailable') return <Unavailable what="These results" />;

  const mine = result?.reviews.find((r) => r.userId === userId);
  const partner = result?.reviews.find((r) => r.userId !== userId);
  const waiting = state === 'none' || !partner;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/pair"
        className="cg-focusable inline-flex items-center gap-1.5 rounded text-sm font-semibold text-muted transition hover:text-ink"
      >
        <ArrowLeft size={15} strokeWidth={2.4} aria-hidden />
        Pairing
      </Link>

      {waiting ? (
        <Card className="px-6 py-12 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-cg-lg bg-hue-pair/10 text-hue-pair">
            <Hourglass size={22} strokeWidth={2} aria-hidden />
          </span>
          <h1 className="mt-4 text-lg font-bold text-ink">
            {mine ? 'Waiting on your partner' : 'No reviews yet'}
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-body">
            {mine
              ? 'The comparison needs both reviews, so this fills in as soon as they submit theirs.'
              : 'Answer the review prompts and the comparison appears once your partner has too.'}
          </p>
          {!mine && (
            <Link
              href={`/pair/${sessionId}/review`}
              className={buttonClass({ className: 'mt-6' })}
            >
              Answer the review
            </Link>
          )}
        </Card>
      ) : (
        <Comparison result={result!} userId={userId} />
      )}

      <div className="flex flex-wrap gap-3">
        <Link href="/pair" className={buttonClass({ variant: 'secondary' })}>
          Back to pairing
        </Link>
        <Link
          href={`/pair/${sessionId}/history`}
          className={buttonClass({ variant: 'secondary' })}
        >
          See the session record
        </Link>
      </div>
    </div>
  );
}

function Comparison({ result, userId }: { result: Result; userId: string }) {
  const { outOf, agreement, recommendations } = result;

  // A proportion, because the number of prompts differs per exercise. The old
  // page compared a raw count against 70.
  const share = outOf > 0 ? result.averageScore / outOf : 0;
  const strong = share >= 0.7;

  return (
    <>
      <Card className="relative overflow-hidden px-6 py-10 text-center">
        <div
          aria-hidden
          className={`pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full blur-3xl ${
            strong ? 'bg-ok/20' : 'bg-hue-pair/20'
          }`}
        />

        <div className="relative">
          <span
            className={`mx-auto grid h-14 w-14 place-items-center rounded-cg-lg ${
              strong ? 'bg-ok/10 text-ok' : 'bg-hue-pair/10 text-hue-pair'
            }`}
          >
            {strong ? (
              <CircleCheck size={26} strokeWidth={2} aria-hidden />
            ) : (
              <Users size={26} strokeWidth={2} aria-hidden />
            )}
          </span>

          <h1 className="mt-5 text-sm font-semibold uppercase tracking-widest text-muted">
            Between you
          </h1>
          <p className="mt-2 text-6xl font-extrabold tabular-nums tracking-tight text-ink">
            {result.averageScore.toFixed(1)}
            <span className="text-2xl font-bold text-muted"> / {outOf}</span>
          </p>

          <div className="mx-auto mt-6 max-w-xs">
            <Meter
              value={share * 100}
              tone={strong ? 'bg-ok' : 'bg-hue-pair'}
              label="Average agreement with the exercise"
            />
          </div>
        </div>
      </Card>

      <Card className="divide-y divide-line overflow-hidden">
        {result.reviews.map((review) => (
          <div
            key={review.userId}
            className="flex items-center justify-between gap-3 px-5 py-4"
          >
            <span className="font-semibold text-ink">
              {review.userId === userId
                ? 'You'
                : [review.firstName, review.lastName].filter(Boolean).join(' ') ||
                  'Your partner'}
            </span>
            <span className="font-mono tabular-nums text-body">
              {review.score} / {outOf}
            </span>
          </div>
        ))}
      </Card>

      {agreement && (
        <Card className="p-6">
          <h2 className="font-bold text-ink">How often you two said the same thing</h2>
          <p className="mt-1 text-sm text-muted">
            {agreement.matched} of {agreement.outOf} prompts
          </p>
          <div className="mt-4">
            <Meter
              value={(agreement.matched / agreement.outOf) * 100}
              tone="bg-hue-insight"
              label="Agreement between partners"
            />
          </div>
          <p className="mt-4 text-sm text-body">
            {/* The point of answering separately, and it was not shown at all.
                Disagreement is the useful signal here, not a failure. */}
            {agreement.matched === agreement.outOf
              ? 'You read the session the same way throughout.'
              : 'The prompts you answered differently are the ones worth talking about.'}
          </p>
        </Card>
      )}

      {recommendations?.length > 0 && (
        <Card className="p-6">
          <h2 className="font-bold text-ink">What to do next</h2>
          <ul className="mt-3 space-y-2">
            {recommendations.map((line, index) => (
              <li key={index} className="flex gap-2.5 text-body">
                <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                {line}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
