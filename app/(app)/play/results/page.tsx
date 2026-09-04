'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatConcept, formatGameType } from '@/lib/vocabulary';

/**
 * Ported from adaptive-gamification-engine Results.jsx.
 *
 * The original received everything through react-router's `location.state`.
 * Next has no equivalent, so the game player writes the result to
 * sessionStorage and this page reads it once.
 *
 * sessionStorage rather than a query string because the result is not
 * addressable - a shared or bookmarked /play/results is meaningless, and
 * putting a score in the URL invites editing it. sessionStorage rather than
 * localStorage because it should not outlive the tab.
 */

interface StoredResult {
  result: { score: number; learnerFeedback?: string; explanation?: string };
  conceptTag: string;
  gameType: string;
  difficulty: string;
  attemptCount: number;
  hintLevel: number;
  seconds: number;
}

export default function ResultsPage() {
  const [stored, setStored] = useState<StoredResult | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('codeguru.lastGameResult');
      if (raw) setStored(JSON.parse(raw));
    } catch {
      // Private mode, cleared storage, or a shape from an older build. An
      // unreadable result is the same as no result.
    } finally {
      setReady(true);
    }
  }, []);

  // Rendering the empty state before the effect runs would flash "nothing to
  // show" on every successful game.
  if (!ready) return null;

  if (!stored) {
    return (
      <div className="mx-auto max-w-xl space-y-4 text-center">
        <h1 className="text-xl font-semibold text-ink">No recent result</h1>
        <p className="text-body">
          Finish a practice game and your score will appear here.
        </p>
        <Link href="/play" className="inline-flex text-accent hover:underline">
          Back to practice
        </Link>
      </div>
    );
  }

  const passed = stored.result.score >= 70;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header className="text-center">
        <p className="text-sm text-muted">
          {formatGameType(stored.gameType)} · {formatConcept(stored.conceptTag)} ·{' '}
          {stored.difficulty}
        </p>
        <p
          className={`mt-3 text-5xl font-semibold ${passed ? 'text-ok' : 'text-warn'}`}
        >
          {stored.result.score}
        </p>
        <p className="mt-1 text-body">
          {passed ? 'Solid work.' : 'Worth another go at this concept.'}
        </p>
      </header>

      {(stored.result.learnerFeedback || stored.result.explanation) && (
        <p className="rounded-cg border border-line bg-card px-4 py-3 text-body">
          {stored.result.learnerFeedback ?? stored.result.explanation}
        </p>
      )}

      <dl className="grid grid-cols-3 gap-4 rounded-cg border border-line bg-card p-5 text-center">
        <Stat label="Attempts" value={stored.attemptCount} />
        <Stat label="Hints used" value={`${stored.hintLevel}/3`} />
        <Stat label="Time" value={`${stored.seconds}s`} />
      </dl>

      <div className="flex justify-center gap-3">
        <Link
          href="/play"
          className="rounded-cg bg-accent px-5 py-2.5 font-medium text-white transition hover:bg-accent-strong"
        >
          Practice again
        </Link>
        <Link
          href="/study"
          className="rounded-cg border border-line px-5 py-2.5 text-body transition hover:bg-card-alt"
        >
          Study this concept
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dd className="text-xl font-semibold text-ink">{value}</dd>
      <dt className="text-sm text-muted">{label}</dt>
    </div>
  );
}
