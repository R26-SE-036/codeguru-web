'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CircleCheck,
  Clock3,
  Lightbulb,
  RotateCcw,
  Sparkles,
  Target,
  TriangleAlert,
} from 'lucide-react';

import { formatConcept, formatGameType } from '@/lib/vocabulary';
import { Badge, Card, Meter, buttonClass } from '@/components/ui';

/**
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
      <div className="mx-auto max-w-xl">
        <Card className="px-6 py-12 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-cg-lg bg-hue-play/10 text-hue-play">
            <Target size={22} strokeWidth={2} aria-hidden />
          </span>
          <h1 className="mt-4 text-lg font-bold text-ink">No recent result</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-body">
            Finish a practice round and your score will appear here.
          </p>
          <Link
            href="/play"
            className={buttonClass({ variant: 'secondary', className: 'mt-6' })}
          >
            <ArrowLeft size={16} strokeWidth={2.2} aria-hidden />
            Back to practice
          </Link>
        </Card>
      </div>
    );
  }

  const { score } = stored.result;
  const passed = score >= 70;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Card className="relative overflow-hidden px-6 py-10 text-center">
        <div
          aria-hidden
          className={`pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full blur-3xl ${
            passed ? 'bg-ok/20' : 'bg-warn/20'
          }`}
        />

        <div className="relative">
          <div className="flex flex-wrap justify-center gap-2">
            <Badge tone="accent">{formatGameType(stored.gameType)}</Badge>
            <Badge tone="neutral">{formatConcept(stored.conceptTag)}</Badge>
            <Badge tone="neutral">{stored.difficulty}</Badge>
          </div>

          <span
            className={`mx-auto mt-6 grid h-14 w-14 place-items-center rounded-cg-lg ${
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
            {score}
          </p>
          <p className="mt-1 font-medium text-body">
            {passed ? 'Solid work.' : 'Worth another go at this concept.'}
          </p>

          <div className="mx-auto mt-6 max-w-xs">
            <Meter value={score} tone={passed ? 'bg-ok' : 'bg-warn'} label="Round score" />
          </div>
        </div>
      </Card>

      {(stored.result.learnerFeedback || stored.result.explanation) && (
        <Card className="flex gap-4 border-l-4 border-l-accent p-5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-cg bg-accent/10 text-accent">
            <Sparkles size={18} strokeWidth={2.2} aria-hidden />
          </span>
          <p className="text-body">
            {stored.result.learnerFeedback ?? stored.result.explanation}
          </p>
        </Card>
      )}

      <dl className="grid grid-cols-3 gap-3">
        <Stat icon={RotateCcw} label="Attempts" value={stored.attemptCount} />
        <Stat icon={Lightbulb} label="Hints used" value={`${stored.hintLevel}/3`} />
        <Stat icon={Clock3} label="Time" value={`${stored.seconds}s`} />
      </dl>

      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/play" className={buttonClass({ size: 'lg' })}>
          Practice again
        </Link>
        <Link href="/study" className={buttonClass({ variant: 'secondary', size: 'lg' })}>
          Study this concept
        </Link>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock3;
  label: string;
  value: string | number;
}) {
  return (
    <Card className="p-4 text-center">
      <Icon
        size={16}
        strokeWidth={2.2}
        aria-hidden
        className="mx-auto text-faint-nontext"
      />
      <dd className="mt-2 text-xl font-bold tabular-nums text-ink">{value}</dd>
      <dt className="mt-0.5 text-xs text-muted">{label}</dt>
    </Card>
  );
}
