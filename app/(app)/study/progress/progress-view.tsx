'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowLeft,
  Brain,
  Clock3,
  Layers,
  Target,
  TrendingUp,
  Trophy,
  TriangleAlert,
} from 'lucide-react';

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
 * The progress dashboard.
 *
 * Rebuilt once Knowledge Tracing, time-on-lesson and the prerequisite graph
 * existed: the previous version predated all three and showed a radar chart
 * plus a list, which was most of the data the service had at the time and
 * almost none of what it has now.
 *
 * Chart colours come through useThemeColors rather than as `var(--cg-*)`,
 * because Recharts writes them into SVG presentation attributes where a var()
 * does not resolve and the chart renders colourless. See lib/theme.ts.
 */

// The platform pass mark, matching Code Coach and the quiz view. Named here so
// the dashboard cannot drift from them the way the writer once did.
const PASS_MARK_PERCENT = 70;

// Module-level constant, not an inline literal: a fresh object each render is a
// new dependency each render, and useThemeColors' effect would never settle.
const CHART_TOKENS = {
  accent: '--cg-accent',
  study: '--cg-rgb-hue-study',
  grid: '--cg-border',
  axis: '--cg-muted',
  ok: '--cg-ok',
  warn: '--cg-warn',
  danger: '--cg-danger',
  card: '--cg-card',
  ink: '--cg-ink',
} as const;

interface Attempt {
  concept: string;
  score: number;
  total: number;
  percentage: number;
  status: string;
  last_updated: string;
  seconds_on_lesson?: number | null;
}

interface Mastery {
  concept: string;
  probability_known: number;
  predicted_correct: number;
  observations: number;
  mastered: boolean;
  average_percentage: number | null;
  attempts: number;
}

export function ProgressView() {
  const chart = useThemeColors(CHART_TOKENS);

  const [attempts, setAttempts] = useState<Attempt[] | null>(null);
  const [mastery, setMastery] = useState<Mastery[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;

    (async () => {
      try {
        // Both together. Mastery failing on its own must not cost the student
        // their attempt history, so it degrades to an empty list rather than
        // taking the page down - the charts that need it simply do not render.
        const [history, estimates] = await Promise.all([
          api.get<{ success: boolean; data?: Attempt[] }>('study', '/progress/me'),
          api
            .get<{ success: boolean; data?: Mastery[] }>('study', '/progress/me/mastery')
            .catch(() => ({ success: false, data: [] as Mastery[] })),
        ]);

        if (!live) return;
        setAttempts(history.data ?? []);
        setMastery(estimates.data ?? []);
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
   * Best attempt per concept, for the radar.
   *
   * The graph stores every attempt as its own relationship - it is append-only
   * history, deliberately - so a concept appears once per quiz taken. Plotting
   * all of them would draw the same concept several times at different values.
   */
  const radarData = useMemo(() => {
    if (!attempts?.length) return [];

    const best = new Map<string, number>();
    for (const attempt of attempts) {
      const current = best.get(attempt.concept) ?? 0;
      if (attempt.percentage > current) best.set(attempt.concept, attempt.percentage);
    }

    return Array.from(best, ([concept, percentage]) => ({
      subject: formatConcept(concept),
      A: Math.round(percentage),
    }));
  }, [attempts]);

  /**
   * Every attempt oldest-first, for the trajectory line.
   *
   * This is the chart that shows what an average cannot: 40 -> 55 -> 85 and
   * 85 -> 55 -> 40 average identically and look nothing alike here. It is the
   * visual counterpart to what Knowledge Tracing does with the same sequence.
   */
  const trajectory = useMemo(() => {
    if (!attempts?.length) return [];

    return [...attempts]
      .sort(
        (a, b) =>
          new Date(a.last_updated).getTime() - new Date(b.last_updated).getTime(),
      )
      .map((attempt, index) => ({
        n: index + 1,
        percentage: Math.round(attempt.percentage),
        concept: formatConcept(attempt.concept),
        when: new Date(attempt.last_updated).toLocaleDateString(),
      }));
  }, [attempts]);

  /**
   * Time spent reading against the score that followed.
   *
   * Only attempts with a measured time appear. `seconds_on_lesson` is null when
   * the quiz was taken without opening a lesson, or before the timing existed -
   * plotting those at zero would invent a cluster of students who read nothing
   * and claim it as data.
   */
  const timeVsScore = useMemo(() => {
    if (!attempts?.length) return [];

    return attempts
      .filter((a) => typeof a.seconds_on_lesson === 'number' && a.seconds_on_lesson! > 0)
      .map((a) => ({
        minutes: Number((a.seconds_on_lesson! / 60).toFixed(1)),
        percentage: Math.round(a.percentage),
        concept: formatConcept(a.concept),
      }));
  }, [attempts]);

  const masteredCount = useMemo(
    () => mastery.filter((m) => m.mastered).length,
    [mastery],
  );

  const averageBest = useMemo(() => {
    if (!radarData.length) return 0;
    return Math.round(
      radarData.reduce((sum, entry) => sum + entry.A, 0) / radarData.length,
    );
  }, [radarData]);

  const totalStudySeconds = useMemo(
    () =>
      (attempts ?? []).reduce(
        (sum, a) => sum + (typeof a.seconds_on_lesson === 'number' ? a.seconds_on_lesson : 0),
        0,
      ),
    [attempts],
  );

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="cg-skeleton h-24 w-full" />
        <div className="grid gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="cg-skeleton h-28" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="cg-skeleton h-80" />
          <div className="cg-skeleton h-80" />
        </div>
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

  const hasHistory = (attempts?.length ?? 0) > 0;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Study"
        title="Your progress"
        lead="Every quiz you have taken, what the knowledge-tracing model believes you know, and how that has changed."
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

      {!hasHistory ? (
        <EmptyState icon={TrendingUp} title="No quiz attempts yet">
          Work through a lesson and take its quiz, and your mastery will show up here.
        </EmptyState>
      ) : (
        <>
          {/* ── Headline numbers ────────────────────────────────────────── */}
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
              hint={`of ${radarData.length} · knowledge tracing`}
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
            <Stat
              label="Time on lessons"
              value={formatDuration(totalStudySeconds)}
              hint={totalStudySeconds ? 'Reading before quizzes' : 'Not measured yet'}
              icon={Clock3}
              tone="text-hue-insight"
              toneBg="bg-hue-insight/10"
            />
          </section>

          {/* ── What the model believes ─────────────────────────────────── */}
          {mastery.length > 0 && (
            <section>
              <SectionTitle hint="Bayesian Knowledge Tracing">
                What the model believes you know
              </SectionTitle>

              <Card className="divide-y divide-line overflow-hidden">
                {mastery.map((item) => {
                  const known = Math.round(item.probability_known * 100);
                  const predicted = Math.round(item.predicted_correct * 100);
                  const tone = item.mastered
                    ? 'bg-ok'
                    : known >= 50
                      ? 'bg-warn'
                      : 'bg-danger';

                  return (
                    <div key={item.concept} className="px-5 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span className="font-medium text-ink">
                          {formatConcept(item.concept)}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="text-sm tabular-nums text-muted">
                            {item.attempts} attempt{item.attempts === 1 ? '' : 's'} ·{' '}
                            {item.observations} questions
                          </span>
                          <Badge tone={item.mastered ? 'ok' : known >= 50 ? 'warn' : 'danger'}>
                            {known}% known
                          </Badge>
                        </div>
                      </div>

                      <div className="mt-2.5">
                        <Meter
                          value={known}
                          tone={tone}
                          label={`${formatConcept(item.concept)} mastery`}
                        />
                      </div>

                      {/*
                        The prediction, not the belief. They are different
                        numbers and the gap is the point: someone who knows
                        nothing still scores 25% on four-option questions, and
                        someone who knows everything still slips.
                      */}
                      <p className="mt-2 text-xs text-muted">
                        Predicted chance of getting the next question right:{' '}
                        <span className="font-semibold tabular-nums text-body">
                          {predicted}%
                        </span>
                        {item.average_percentage !== null && (
                          <>
                            {' · '}plain average of past quizzes:{' '}
                            <span className="tabular-nums">{item.average_percentage}%</span>
                          </>
                        )}
                      </p>
                    </div>
                  );
                })}
              </Card>
            </section>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            {/* ── Radar ─────────────────────────────────────────────────── */}
            {/*
              Three concepts is the minimum for a radar to read as a shape
              rather than a line or a collapsed triangle. Below that the list
              above is clearer than a misleading polygon.
            */}
            {radarData.length >= 3 && (
              <Card className="p-5">
                <SectionTitle hint="Best score per concept">Coverage</SectionTitle>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData} outerRadius="70%">
                      <PolarGrid stroke={chart.grid} />
                      <PolarAngleAxis
                        dataKey="subject"
                        tick={{ fill: chart.axis, fontSize: 11 }}
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

            {/* ── Trajectory ────────────────────────────────────────────── */}
            {trajectory.length >= 2 && (
              <Card className="p-5">
                <SectionTitle hint="Oldest to newest">Your trajectory</SectionTitle>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trajectory} margin={{ top: 8, right: 8, bottom: 4, left: -18 }}>
                      <CartesianGrid stroke={chart.grid} strokeDasharray="3 3" />
                      <XAxis
                        dataKey="n"
                        tick={{ fill: chart.axis, fontSize: 11 }}
                        stroke={chart.grid}
                        label={{
                          value: 'Attempt',
                          position: 'insideBottom',
                          offset: -2,
                          fill: chart.axis,
                          fontSize: 11,
                        }}
                      />
                      <YAxis
                        domain={[0, 100]}
                        tick={{ fill: chart.axis, fontSize: 11 }}
                        stroke={chart.grid}
                      />
                      <Tooltip
                        contentStyle={{
                          background: chart.card,
                          border: `1px solid ${chart.grid}`,
                          borderRadius: 12,
                          color: chart.ink,
                          fontSize: 12,
                        }}
                        formatter={(value: number) => [`${value}%`, 'Score']}
                        labelFormatter={(label, payload) =>
                          payload?.[0]
                            ? `${payload[0].payload.concept} · ${payload[0].payload.when}`
                            : `Attempt ${label}`
                        }
                      />
                      <Line
                        type="monotone"
                        dataKey="percentage"
                        stroke={chart.accent}
                        strokeWidth={2.5}
                        dot={{ r: 3, fill: chart.accent }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-2 text-xs text-muted">
                  An average cannot tell 40 → 55 → 85 from 85 → 55 → 40. This can.
                </p>
              </Card>
            )}
          </div>

          {/* ── Time vs score ───────────────────────────────────────────── */}
          {timeVsScore.length >= 3 && (
            <Card className="p-5">
              <SectionTitle hint={`${timeVsScore.length} measured attempts`}>
                Time on the lesson against the score that followed
              </SectionTitle>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 8, right: 12, bottom: 16, left: -18 }}>
                    <CartesianGrid stroke={chart.grid} strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      dataKey="minutes"
                      name="Minutes"
                      tick={{ fill: chart.axis, fontSize: 11 }}
                      stroke={chart.grid}
                      label={{
                        value: 'Minutes on the lesson',
                        position: 'insideBottom',
                        offset: -8,
                        fill: chart.axis,
                        fontSize: 11,
                      }}
                    />
                    <YAxis
                      type="number"
                      dataKey="percentage"
                      name="Score"
                      domain={[0, 100]}
                      tick={{ fill: chart.axis, fontSize: 11 }}
                      stroke={chart.grid}
                    />
                    <Tooltip
                      cursor={{ strokeDasharray: '3 3', stroke: chart.grid }}
                      contentStyle={{
                        background: chart.card,
                        border: `1px solid ${chart.grid}`,
                        borderRadius: 12,
                        color: chart.ink,
                        fontSize: 12,
                      }}
                      formatter={(value: number, name: string) =>
                        name === 'Score' ? [`${value}%`, 'Score'] : [`${value} min`, 'Time']
                      }
                    />
                    <Scatter data={timeVsScore} fill={chart.accent}>
                      {timeVsScore.map((point, index) => (
                        <Cell
                          key={index}
                          fill={point.percentage >= 70 ? chart.ok : chart.warn}
                        />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-xs text-muted">
                Only attempts where the lesson was opened first. Green passed, amber did
                not — a few points is a picture, not a finding.
              </p>
            </Card>
          )}

          {/* ── The log ─────────────────────────────────────────────────── */}
          <section>
            <SectionTitle hint={`${attempts?.length ?? 0} recorded`}>
              Every attempt
            </SectionTitle>

            <Card className="divide-y divide-line overflow-hidden">
              {attempts?.map((attempt, position) => {
                const percent = Math.round(attempt.percentage);
                /*
                 * Derived from the score, not read from `status`.
                 *
                 * Study Guider used to record MASTERED at 50% while the rest of
                 * the platform passes at 70, so a 2/4 was stored as a pass here
                 * and left the remediation trigger unresolved there - the
                 * dashboard said "Passed" while the student kept being told to
                 * study it. The writer is fixed, but rows written before that
                 * still carry the old status, and recomputing means the whole
                 * history reads by one rule.
                 */
                const mastered = percent >= PASS_MARK_PERCENT;

                return (
                  <div
                    key={`${attempt.concept}-${attempt.last_updated}-${position}`}
                    className="px-5 py-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="font-medium text-ink">
                        {formatConcept(attempt.concept)}
                      </span>

                      <div className="flex flex-wrap items-center gap-3">
                        {typeof attempt.seconds_on_lesson === 'number' &&
                          attempt.seconds_on_lesson > 0 && (
                            <span className="inline-flex items-center gap-1 text-xs text-muted">
                              <Clock3 size={12} aria-hidden />
                              {formatDuration(attempt.seconds_on_lesson)} reading
                            </span>
                          )}
                        <span className="text-sm tabular-nums text-muted">
                          {attempt.score}/{attempt.total} · {percent}%
                        </span>
                        <Badge tone={mastered ? 'ok' : 'warn'}>
                          {mastered ? 'Passed' : 'Needs review'}
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

          <p className="flex items-start gap-2 text-xs text-muted">
            <Brain size={14} aria-hidden className="mt-0.5 shrink-0" />
            Mastery is Bayesian Knowledge Tracing over every question you have answered,
            not an average of your quiz scores — which is why it can disagree with the
            plain average shown beside it.
          </p>
        </>
      )}
    </div>
  );
}

/** Seconds as something a person reads: "45s", "3m 20s", "1h 05m". */
function formatDuration(seconds: number): string {
  if (!seconds || seconds < 1) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    const remainder = Math.round(seconds % 60);
    return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  return `${hours}h ${String(minutes % 60).padStart(2, '0')}m`;
}
