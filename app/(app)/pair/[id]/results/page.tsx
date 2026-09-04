import Link from 'next/link';
import { getSession, serverFetch } from '@/lib/server-api';

/**
 * Ported from Pair_Path results/[id]/page.tsx.
 *
 * The score only exists once BOTH partners have submitted, so "not ready yet"
 * is a normal state here rather than an error.
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

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink">Session results</h1>
      </header>

      {result === null ? (
        <p className="rounded-cg border border-line bg-card-alt px-4 py-3 text-body">
          These results are unavailable right now. Nothing has been lost.
        </p>
      ) : result.bothSubmitted === false ? (
        <p className="rounded-cg border border-line bg-card px-4 py-3 text-body">
          Waiting for your partner to submit their review. The comparison needs both.
        </p>
      ) : (
        <>
          {typeof result.score === 'number' && (
            <p className="text-5xl font-semibold text-ink">{result.score}</p>
          )}
          {result.feedback && <p className="text-body">{result.feedback}</p>}
        </>
      )}

      <Link href="/pair" className="inline-flex text-accent hover:underline">
        Back to pairing
      </Link>
    </div>
  );
}
