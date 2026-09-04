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
import { ArrowLeft, Layers, Target, TrendingUp, Trophy, TriangleAlert } from 'lucide-react';

import { ApiError, api } from '@/lib/api';
import { useThemeColors } from '@/lib/theme';
import { formatConcept } from '@/lib/vocabulary';
import {
  Badge,
  Card,
  EmptyState,
  Meter,
  PageHeader,
  SectionTitle,
  Stat,
  buttonClass,
} from '@/components/ui';

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

  /**
   * Both headline numbers are per CONCEPT, not per attempt, and both read from
   * radarData for that reason: it is already deduplicated to the best attempt.
   * Counting rows instead would let one concept quizzed five times count five
   * times, and "average best" would sag toward whoever retried the most.
   */
  const masteredCount = useMemo(
    () => radarData.filter((entry) => entry.A >= 70).length,
    [radarData],
  );

  const averageBest = useMemo(() => {
    if (!radarData.length) return 0;
    return Math.round(radarData.reduce((sum, entry) => sum + entry.A, 0) / radarData.length);
  }, [radarData]);

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="cg-skeleton h-24 w-full" />
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="cg-skeleton h-28" />
          <div className="cg-skeleton h-28" />
          <div className="cg-skeleton h-28" />
        </div>
        <div className="cg-skeleton h-80 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="px-6 py-12 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-cg-lg bg-danger/10 text-danger">
          <TriangleAlert size={22} strokeWidth={2} aria-hidden />
        </span>
        <h1 className="mt-4 text-lg font-bold text-ink">Progress unavailable</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-body">{error}</p>
        <Link
          href="/study"
          className={buttonClass({ variant: 'secondary', className: 'mt-6' })}
        >
          <ArrowLeft size={16} strokeWidth={2.2} aria-hidden />
          Back to your lessons
        </Link>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Study"
        title="Your progress"
        lead="Every quiz you have taken, by concept. The chart plots your best score for each."
        icon={TrendingUp}
        tone="text-hue-study"
        toneBg="bg-hue-study/10"
        actions={
          <Link href="/study" className={buttonClass({ variant: 'secondary' })}>
            <ArrowLeft size={16} strokeWidth={2.2} aria-hidden />
            Back to lessons
          </Link>
        }
      />

      {radarData.length === 0 ? (
        <EmptyState icon={TrendingUp} title="No quiz attempts yet">
          Work through a lesson and take its quiz, and your mastery will show up here.
        </EmptyState>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-3">
            <Stat
              label="Concepts attempted"
              value={radarData.length}
              icon={Layers}
              tone="text-hue-study"
              toneBg="bg-hue-study/10"
            />
            <Stat
              label="Mastered"
              value={masteredCount}
              hint={`of ${radarData.length} concepts`}
              icon={Trophy}
              tone="text-ok"
              toneBg="bg-ok/10"
            />
            <Stat
              label="Average best"
              value={`${averageBest}%`}
              hint="Across every concept"
              icon={Target}
              tone="text-accent"
              toneBg="bg-accent/10"
            />
          </section>

          {/*
            Three concepts is the minimum for a radar chart to read as a shape
            rather than a line or a triangle collapsed on itself. Below that,
            the table alone is clearer than a misleading polygon.
          */}
          {radarData.length >= 3 && (
            <Card as="section" className="p-5">
              <SectionTitle hint="Best score per concept">Where you are strong</SectionTitle>
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
            </Card>
          )}

          <section>
            <SectionTitle hint={`${attempts?.length ?? 0} recorded`}>
              Every attempt
            </SectionTitle>

            <Card className="divide-y divide-line overflow-hidden">
              {attempts?.map((attempt, position) => {
                const mastered = attempt.status === 'MASTERED';
                const percent = Math.round(attempt.percentage);

                return (
                  <div
                    key={`${attempt.concept}-${attempt.last_updated}-${position}`}
                    className="px-5 py-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="font-medium text-ink">
                        {formatConcept(attempt.concept)}
                      </span>

                      <div className="flex items-center gap-3">
                        <span className="text-sm tabular-nums text-muted">
                          {attempt.score}/{attempt.total} · {percent}%
                        </span>
                        <Badge tone={mastered ? 'ok' : 'warn'}>
                          {mastered ? 'Mastered' : 'Needs review'}
                        </Badge>
                      </div>
                    </div>

                    <div className="mt-2.5">
                      <Meter
                        value={percent}
                        tone={mastered ? 'bg-ok' : 'bg-warn'}
                        label={`${formatConcept(attempt.concept)} score`}
                      />
                    </div>
                  </div>
                );
              })}
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
