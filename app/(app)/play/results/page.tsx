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

/** One finished round of a run. */
interface RunEntry {
  score: number;
  gameType: string;
  difficulty: string;
  seconds: number;
  hintLevel: number;
  attemptCount: number;
}

interface StoredResult {
  result: { score: number; learnerFeedback?: string; explanation?: string };
  conceptTag: string;
  gameType: string;
  difficulty: string;
  attemptCount: number;
  hintLevel: number;
  seconds: number;

  /**
   * Every round of the run, oldest first. Optional: a result written by an
   * older build, or read from a tab that started a run before this shipped,
   * has none - and the single-round view below is still correct for it.
   */
  run?: RunEntry[];
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

  // A run of one is a round, and reads better as one.
  const run = (stored.run ?? []).length > 1 ? stored.run! : null;

  // For a run the headline is the AVERAGE, not the last round. The last round
  // of five is not what the student just did, and leading with it would report
  // a strong set as a failure whenever the final question happened to go badly.
  const score = run
    ? Math.round(run.reduce((total, entry) => total + entry.score, 0) / run.length)
    : stored.result.score;
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
            {/* For a run the format and level varied by design - the engine
                re-chose both between questions - so naming one of them would
                be wrong. The concept is the thing the whole set was about. */}
            {!run && <Badge tone="accent">{formatGameType(stored.gameType)}</Badge>}
            <Badge tone="neutral">{formatConcept(stored.conceptTag)}</Badge>
            {!run && <Badge tone="neutral">{stored.difficulty}</Badge>}
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
            {run
              ? `${passed ? 'Solid set.' : 'Worth another go at this concept.'} Average over ${run.length} questions.`
              : passed
                ? 'Solid work.'
                : 'Worth another go at this concept.'}
          </p>

          <div className="mx-auto mt-6 max-w-xs">
            <Meter
              value={score}
              tone={passed ? 'bg-ok' : 'bg-warn'}
              label={run ? 'Average score' : 'Round score'}
            />
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

      {run ? (
        <>
          {/*
            The run, round by round.

            The AVERAGE is the headline rather than the last round's score,
            because a set of five is what the student just did and one round of
            it is not the story. The per-round list is kept underneath because
            the shape matters as much as the mean: five steady rounds and a run
            that started badly and recovered average the same and mean opposite
            things.
          */}
          <Card className="p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="font-bold text-ink">This set</h2>
              <p className="text-sm text-muted">
                {run.filter((entry) => entry.score >= 70).length} of {run.length} passed
              </p>
            </div>

            <ul className="mt-4 space-y-2">
              {run.map((entry, index) => (
                <li key={index} className="flex items-center gap-3">
                  <span className="w-5 shrink-0 text-right text-sm text-faint-nontext tabular-nums">
                    {index + 1}
                  </span>
                  <span className="w-28 shrink-0 truncate text-sm text-body">
                    {formatGameType(entry.gameType)}
                  </span>
                  <span className="w-24 shrink-0 truncate text-sm text-muted">
                    {entry.difficulty}
                  </span>
                  <span className="min-w-0 flex-1">
                    <Meter
                      value={entry.score}
                      tone={entry.score >= 70 ? 'bg-ok' : 'bg-warn'}
                      label={`Round ${index + 1} score`}
                    />
                  </span>
                  <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums text-ink">
                    {entry.score}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <dl className="grid grid-cols-3 gap-3">
            <Stat
              icon={RotateCcw}
              label="Attempts"
              value={run.reduce((total, entry) => total + entry.attemptCount, 0)}
            />
            <Stat
              icon={Lightbulb}
              label="Hints used"
              value={run.reduce((total, entry) => total + entry.hintLevel, 0)}
            />
            <Stat
              icon={Clock3}
              label="Time"
              value={`${run.reduce((total, entry) => total + entry.seconds, 0)}s`}
            />
          </dl>
        </>
      ) : (
        <dl className="grid grid-cols-3 gap-3">
          <Stat icon={RotateCcw} label="Attempts" value={stored.attemptCount} />
          <Stat icon={Lightbulb} label="Hints used" value={`${stored.hintLevel}/3`} />
          <Stat icon={Clock3} label="Time" value={`${stored.seconds}s`} />
        </dl>
      )}

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
