import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, CircleCheck, Hourglass, Users } from 'lucide-react';

import { getSession, serverFetch } from '@/lib/server-api';
import { Card, Meter, Unavailable, buttonClass } from '@/components/ui';

export const metadata: Metadata = { title: 'Session results' };

/**
 * The score only exists once BOTH partners have submitted, so "not ready yet"
 * is a normal state here rather than an error - and it is rendered as one,
 * because a spinner or an error card would both suggest something is wrong.
 */

interface ReviewResult {
  score?: number;
  feedback?: string;
  bothSubmitted?: boolean;
  submissions?: Array<{ userId: string; answers: string[]; score?: number }>;
}

export default async function PairResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  const result = await serverFetch<ReviewResult>('pair', `/reviews/${id}/result`, session);

  const score = typeof result?.score === 'number' ? result.score : null;
  const passed = score !== null && score >= 70;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/pair"
        className="cg-focusable inline-flex items-center gap-1.5 rounded text-sm font-semibold text-muted transition hover:text-ink"
      >
        <ArrowLeft size={15} strokeWidth={2.4} aria-hidden />
        Pairing
      </Link>

      {result === null ? (
        <Unavailable what="These results" />
      ) : result.bothSubmitted === false ? (
        <Card className="px-6 py-12 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-cg-lg bg-hue-pair/10 text-hue-pair">
            <Hourglass size={22} strokeWidth={2} aria-hidden />
          </span>
          <h1 className="mt-4 text-lg font-bold text-ink">Waiting on your partner</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-body">
            The comparison needs both reviews, so this fills in as soon as they submit
            theirs.
          </p>
        </Card>
      ) : (
        <>
          <Card className="relative overflow-hidden px-6 py-10 text-center">
            <div
              aria-hidden
              className={`pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full blur-3xl ${
                passed ? 'bg-ok/20' : 'bg-hue-pair/20'
              }`}
            />

            <div className="relative">
              <span
                className={`mx-auto grid h-14 w-14 place-items-center rounded-cg-lg ${
                  passed ? 'bg-ok/10 text-ok' : 'bg-hue-pair/10 text-hue-pair'
                }`}
              >
                {passed ? (
                  <CircleCheck size={26} strokeWidth={2} aria-hidden />
                ) : (
                  <Users size={26} strokeWidth={2} aria-hidden />
                )}
              </span>

              <h1 className="mt-5 text-sm font-semibold uppercase tracking-widest text-muted">
                Session result
              </h1>

              {score !== null ? (
                <>
                  <p className="mt-2 text-6xl font-extrabold tabular-nums tracking-tight text-ink">
                    {score}
                  </p>
                  <div className="mx-auto mt-6 max-w-xs">
                    <Meter
                      value={score}
                      tone={passed ? 'bg-ok' : 'bg-hue-pair'}
                      label="Review score"
                    />
                  </div>
                </>
              ) : (
                <p className="mt-3 text-body">
                  Both reviews are in, but no score came back for this session.
                </p>
              )}
            </div>
          </Card>

          {result.feedback && (
            <Card className="p-6">
              <h2 className="font-bold text-ink">Feedback</h2>
              <p className="mt-2 whitespace-pre-line text-body">{result.feedback}</p>
            </Card>
          )}
        </>
      )}

      <div className="flex flex-wrap gap-3">
        <Link href="/pair" className={buttonClass({ size: 'lg' })}>
          Back to pairing
        </Link>
      </div>
    </div>
  );
}
