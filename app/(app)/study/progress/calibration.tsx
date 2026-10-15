'use client';

import { Brain } from 'lucide-react';

import { Card } from '@/components/ui';

/**
 * How well you know what you know - the metacognition measure.
 *
 * Before each quiz answer the student says how sure they are. Study Guider
 * compares that with whether they were right: a Brier score (0 is perfect,
 * lower is better), and how often they were right at each confidence level.
 * A well-calibrated student is right about a third of the time when they say
 * "low", about two thirds at "medium", and nearly always at "high" - those are
 * the dashed targets on the bars.
 */

export interface Calibration {
  answers: number;
  brier: number | null;
  by_confidence: Record<Level, { answers: number; correct: number; accuracy: number | null }>;
  confident_but_wrong: number;
  unsure_but_right: number;
}

type Level = 'low' | 'medium' | 'high';

const LEVELS: Array<{ key: Level; label: string; target: number }> = [
  { key: 'low', label: 'When you said "Guessing"', target: 33 },
  { key: 'medium', label: 'When you said "Fairly sure"', target: 66 },
  { key: 'high', label: 'When you said "Certain"', target: 100 },
];

/** A plain-words reading of the Brier score. */
function verdict(brier: number): { text: string; tone: string } {
  if (brier <= 0.1) return { text: 'Well calibrated', tone: 'text-ok' };
  if (brier <= 0.2) return { text: 'Mostly calibrated', tone: 'text-ok' };
  if (brier <= 0.3) return { text: 'Room to improve', tone: 'text-warn' };
  return { text: 'Often over- or under-confident', tone: 'text-warn' };
}

export function CalibrationCard({ data }: { data: Calibration | null }) {
  if (!data || data.answers === 0 || data.brier === null) {
    return (
      <Card className="flex items-start gap-4 p-5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-cg bg-hue-study/10 text-hue-study">
          <Brain size={18} strokeWidth={2.2} aria-hidden />
        </span>
        <p className="text-sm text-body">
          In each quiz you now say how sure you are before checking an answer. After your next quiz, this shows how
          well your confidence matches your results.
        </p>
      </Card>
    );
  }

  const reading = verdict(data.brier);

  return (
    <Card className="grid gap-6 p-5 sm:p-6 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
      <div className="flex flex-col gap-1">
        <span className="grid h-10 w-10 place-items-center rounded-cg bg-hue-study/10 text-hue-study">
          <Brain size={18} strokeWidth={2.2} aria-hidden />
        </span>
        <p className={`mt-2 text-lg font-bold ${reading.tone}`}>{reading.text}</p>
        <p className="text-4xl font-extrabold tabular-nums tracking-tight text-ink">{data.brier.toFixed(2)}</p>
        <p className="text-xs text-muted">
          Calibration score (Brier) over {data.answers} answer{data.answers === 1 ? '' : 's'}. 0 is perfect; lower is
          better.
        </p>
      </div>

      <div className="space-y-4">
        <ul className="space-y-3">
          {LEVELS.map((level) => {
            const row = data.by_confidence[level.key];
            const accuracy = row.accuracy === null ? null : Math.round(row.accuracy * 100);
            return (
              <li key={level.key}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-body">{level.label}</span>
                  <span className="font-semibold tabular-nums text-ink">
                    {accuracy === null ? 'not used yet' : `right ${accuracy}% · ${row.answers}`}
                  </span>
                </div>
                <div className="relative mt-1.5 h-2.5 overflow-hidden rounded-full bg-inset">
                  {accuracy !== null && (
                    <span
                      className="absolute inset-y-0 left-0 rounded-full bg-hue-study"
                      style={{ width: `${Math.max(2, accuracy)}%` }}
                    />
                  )}
                  <span
                    aria-hidden
                    className="absolute inset-y-0 w-0.5 bg-ink/50"
                    style={{ left: `calc(${level.target}% - 1px)` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-muted">The line on each bar is where a well-calibrated student would be.</p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-cg border border-line bg-card-alt p-3">
            <p className="text-2xl font-bold tabular-nums text-ink">{data.confident_but_wrong}</p>
            <p className="text-sm text-body">Certain, but wrong: misconceptions worth re-reading the lesson for.</p>
          </div>
          <div className="rounded-cg border border-line bg-card-alt p-3">
            <p className="text-2xl font-bold tabular-nums text-ink">{data.unsure_but_right}</p>
            <p className="text-sm text-body">Guessing, but right: worth checking you know why.</p>
          </div>
        </div>
      </div>
    </Card>
  );
}
