'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from 'recharts';
import { ApiError, api } from '@/lib/api';
import { useThemeColors } from '@/lib/theme';
import { formatConcept } from '@/lib/vocabulary';

/**
 * Ported from Study-Guider StudentDashboard.jsx.
 *
 * The chart colours come through useThemeColors rather than as `var(--cg-*)`,
 * because Recharts writes them into SVG presentation attributes where a var()
 * does not resolve and the chart renders colourless. See lib/theme.ts.
 */

// Module-level constant, not an inline literal: a fresh object each render is a
// new dependency each render, and useThemeColors' effect would never settle.
const CHART_TOKENS = {
  accent: '--cg-accent',
  grid: '--cg-border',
  axis: '--cg-muted',
} as const;

interface Attempt {
  concept: string;
  score: number;
  total: number;
  percentage: number;
  status: string;
  last_updated: string;
}

export function ProgressView() {
  const chart = useThemeColors(CHART_TOKENS);

  const [attempts, setAttempts] = useState<Attempt[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;

    (async () => {
      try {
        const response = await api.get<{ success: boolean; data?: Attempt[] }>(
          'study',
          '/progress/me',
        );
        if (!live) return;
        setAttempts(response.data ?? []);
      } catch (err) {
        if (!live) return;
        setError(
          err instanceof ApiError && err.isUnavailable
            ? 'Your progress is unavailable right now — the study graph could not be reached.'
            : 'Could not load your progress.',
        );
      } finally {
        if (live) setLoading(false);
      }
    })();

    return () => {
      live = false;
    };
  }, []);

  /**
   * Best attempt per concept.
   *
   * The graph stores every attempt as its own relationship - it is append-only
   * history, deliberately - so a concept appears once per quiz taken. Plotting
   * all of them would draw the same concept several times at different values.
   * The best score is what "how well do I know this" means.
   */
  const radarData = useMemo(() => {
    if (!attempts?.length) return [];

    const best = new Map<string, number>();
    for (const attempt of attempts) {
      const key = attempt.concept;
      const current = best.get(key) ?? 0;
      if (attempt.percentage > current) best.set(key, attempt.percentage);
    }

    return Array.from(best, ([concept, percentage]) => ({
      subject: formatConcept(concept),
      A: Math.round(percentage),
    }));
  }, [attempts]);

  if (loading) return <p className="text-muted">Loading your progress…</p>;

  if (error) {
    return (
      <div className="space-y-4">
        <p className="rounded-cg bg-danger-soft px-4 py-3 text-danger">{error}</p>
        <Link href="/study" className="inline-flex text-accent hover:underline">
          Back to your lessons
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Your progress</h1>
          <p className="mt-1 text-body">Every quiz you have taken, by concept.</p>
        </div>
        <Link
          href="/study"
          className="rounded-cg border border-line px-4 py-2 text-body transition hover:bg-card-alt"
        >
          Back to lessons
        </Link>
      </header>

      {radarData.length === 0 ? (
        <div className="rounded-cg border border-line bg-card px-4 py-6 text-center">
          <p className="text-ink">No quiz attempts yet.</p>
          <p className="mt-1 text-sm text-muted">
            Work through a lesson and take its quiz, and your mastery will show up here.
          </p>
        </div>
      ) : (
        <>
          {/*
            Three concepts is the minimum for a radar chart to read as a shape
            rather than a line or a triangle collapsed on itself. Below that,
            the table alone is clearer than a misleading polygon.
          */}
          {radarData.length >= 3 && (
            <section className="rounded-cg border border-line bg-card p-4">
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData} outerRadius="72%">
                    <PolarGrid stroke={chart.grid} />
                    <PolarAngleAxis
                      dataKey="subject"
                      tick={{ fill: chart.axis, fontSize: 12 }}
                    />
                    <PolarRadiusAxis
                      domain={[0, 100]}
                      tick={{ fill: chart.axis, fontSize: 10 }}
                    />
                    <Radar
                      name="Best score (%)"
                      dataKey="A"
                      stroke={chart.accent}
                      strokeWidth={2}
                      fill={chart.accent}
                      fillOpacity={0.25}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-3 text-lg font-medium text-ink">Attempts</h2>
            <ul className="divide-y divide-line rounded-cg border border-line bg-card">
              {attempts?.map((attempt, position) => (
                <li
                  key={`${attempt.concept}-${attempt.last_updated}-${position}`}
                  className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3"
                >
                  <span className="text-ink">{formatConcept(attempt.concept)}</span>
                  <span className="text-sm text-muted">
                    {attempt.score}/{attempt.total} · {Math.round(attempt.percentage)}%
                  </span>
                  <span
                    className={`rounded-cg px-2 py-0.5 text-xs ${
                      attempt.status === 'MASTERED'
                        ? 'bg-ok/10 text-ok'
                        : 'bg-warn/10 text-warn'
                    }`}
                  >
                    {attempt.status === 'MASTERED' ? 'mastered' : 'needs review'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
