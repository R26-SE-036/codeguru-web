import Link from 'next/link';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Clock3,
  Download,
  Gamepad2,
  Lightbulb,
  Radar,
  Repeat2,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import { formatConcept, formatDuration, formatErrorType } from '@/lib/vocabulary';
import { relativeTime } from '@/lib/time';
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  SectionTitle,
  Stat,
  Unavailable,
  buttonClass,
} from '@/components/ui';
import { CountUp, Reveal } from '@/components/motion';
import { FillBar, LegendItem, Ring, SplitBar } from '@/components/charts';
import { EditorDemo } from '@/components/editor-demo';

/**
 * What has been noticed in your code, and what it means.
 *
 * The analysis itself happens in the editor extension, so this is a read-only
 * view of the learner model. It goes from the numbers (what was found, what
 * got fixed) to the mistakes behind them, to what the timing of those mistakes
 * says, to where each concept stands - each section answering the question
 * the one before it raises.
 *
 * Rendering only; page.tsx fetches. Each input is null when its call failed,
 * which is a different thing from empty and is rendered differently.
 */

export interface InsightsData {
  overview: Overview | null;
  summary: Summary | null;
  mastery: Mastery | null;
  struggling: { struggles?: Struggle[] } | null;
}

interface Overview {
  counts?: {
    total_diagnostics?: number;
    active_diagnostics?: number;
    resolved_diagnostics?: number;
  };
}

interface Summary {
  total_diagnostics?: number;
  total_hint_events?: number;
  concepts_with_hint_usage?: number;
  top_error_types?: Array<{
    error_type: string;
    count: number;
    active_count?: number;
    last_seen_at?: string;
  }>;
}

interface Struggle {
  concept_tag: string;
  error_type?: string;
  repeat_count: number;
  active_count?: number;
  resolved_count?: number;
  unique_learning_sessions?: number;
  last_seen_at?: string;
  median_seconds_between_occurrences?: number | null;
  hint_dependency_level?: string;
  struggle_score?: number;
  struggle_level?: string;
}

interface Mastery {
  concepts?: Array<{
    concept_tag: string;
    mastery_score?: number;
    mastery_level?: string;
    struggle_score?: number;
    last_quiz_score_percent?: number | null;
    last_game_score_percent?: number | null;
    last_updated_at?: string;
  }>;
}

const LEVELS = {
  strong: { tone: 'ok', label: 'Strong', bar: 'bg-ok' },
  developing: { tone: 'warn', label: 'Developing', bar: 'bg-warn' },
  at_risk: { tone: 'danger', label: 'Needs work', bar: 'bg-danger' },
} as const;

function levelOf(level?: string) {
  return LEVELS[(level as keyof typeof LEVELS) ?? 'developing'] ?? LEVELS.developing;
}

const STRUGGLE = {
  high: { tone: 'danger', label: 'Struggling', bar: 'bg-danger' },
  medium: { tone: 'warn', label: 'Some trouble', bar: 'bg-warn' },
  low: { tone: 'neutral', label: 'Occasional', bar: 'bg-hue-insight' },
} as const;

function struggleOf(level?: string) {
  return STRUGGLE[(level as keyof typeof STRUGGLE) ?? 'low'] ?? STRUGGLE.low;
}

/** Scores arrive 0-1 from the store; a 0.62 should read as 62%, not 1%. */
function percent(raw: number | undefined | null): number {
  const value = raw ?? 0;
  return value <= 1 ? value * 100 : value;
}

export function InsightsView({ overview, summary, mastery, struggling }: InsightsData) {
  const concepts = [...(mastery?.concepts ?? [])].sort(
    // Weakest first: the top of the grid is where attention should go.
    (a, b) => percent(a.mastery_score) - percent(b.mastery_score),
  );
  const strong = concepts.filter((c) => c.mastery_level === 'strong').length;
  const errors = [...(summary?.top_error_types ?? [])].sort((a, b) => b.count - a.count);
  // Only concepts that have actually repeated. One occurrence has no pattern
  // to read, and a card saying so for every one-off slip would bury the rest.
  const patterns = (struggling?.struggles ?? []).filter((s) => s.repeat_count > 1);

  const found = overview?.counts?.total_diagnostics ?? summary?.total_diagnostics ?? 0;
  const fixed = overview?.counts?.resolved_diagnostics ?? 0;
  const open = overview?.counts?.active_diagnostics ?? Math.max(0, found - fixed);
  const fixRate = found > 0 ? Math.round((fixed / found) * 100) : 0;

  const nothingLoaded = summary === null && mastery === null && overview === null;

  return (
    <div className="space-y-10">
      <Reveal>
        <PageHeader
          eyebrow="Insights"
          title="Patterns in your code"
          lead="Everything here comes from what you actually wrote. It updates as you code, and it decides which lessons and practice you get next."
          icon={Radar}
          tone="text-hue-insight"
          toneBg="bg-hue-insight/10"
        />
      </Reveal>

      {nothingLoaded ? (
        <Unavailable what="Your analysis" />
      ) : (
        <>
          {/* ── Headline numbers ─────────────────────────────────────────── */}
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                label: 'Issues spotted',
                value: <CountUp value={found} />,
                hint: 'All time, across your files',
                icon: AlertTriangle,
                tone: 'text-hue-insight',
                toneBg: 'bg-hue-insight/10',
              },
              {
                label: 'Fixed by you',
                value: <CountUp value={fixed} />,
                hint: found > 0 ? `${fixRate}% of everything spotted` : 'Nothing spotted yet',
                icon: CheckCircle2,
                tone: 'text-ok',
                toneBg: 'bg-ok/10',
              },
              {
                label: 'Hints used',
                value: <CountUp value={summary?.total_hint_events ?? 0} />,
                hint: summary?.concepts_with_hint_usage
                  ? `Across ${summary.concepts_with_hint_usage} ${summary.concepts_with_hint_usage === 1 ? 'concept' : 'concepts'}`
                  : 'Nudges you asked for',
                icon: Lightbulb,
                tone: 'text-hue-play',
                toneBg: 'bg-hue-play/10',
              },
              {
                label: 'Looking strong',
                value: (
                  <>
                    <CountUp value={strong} />
                    <span className="text-lg font-semibold text-muted"> / {concepts.length}</span>
                  </>
                ),
                hint: concepts.length ? 'Concepts at a strong level' : 'Nothing tracked yet',
                icon: TrendingUp,
                tone: 'text-hue-study',
                toneBg: 'bg-hue-study/10',
              },
            ].map((stat, index) => (
              <Reveal key={stat.label} delay={index * 70}>
                <Stat {...stat} />
              </Reveal>
            ))}
          </section>

          {/* ── Fix rate + most common mistakes ──────────────────────────── */}
          <div className="grid gap-6 lg:grid-cols-5">
            <section className="lg:col-span-2">
              <Reveal>
                <SectionTitle>Your fix rate</SectionTitle>
                <Card className="flex flex-col items-center gap-5 p-6 text-center">
                  <Ring
                    size={184}
                    thickness={16}
                    label={`${fixed} fixed and ${open} still open, of ${found} issues`}
                    segments={[
                      { value: fixed, tone: 'text-ok', label: 'Fixed' },
                      { value: open, tone: 'text-warn', label: 'Still open' },
                    ]}
                  >
                    <div>
                      <div className="text-4xl font-extrabold tracking-tight text-ink">
                        <CountUp value={fixRate} suffix="%" />
                      </div>
                      <div className="text-xs font-medium text-muted">fixed</div>
                    </div>
                  </Ring>

                  <div className="flex flex-wrap justify-center gap-x-5 gap-y-1.5">
                    <LegendItem tone="bg-ok" label="Fixed" value={fixed} />
                    <LegendItem tone="bg-warn" label="Still open" value={open} />
                  </div>

                  <p className="max-w-xs text-sm text-body">
                    {found === 0
                      ? 'Nothing has been spotted yet. Write some Java with the extension running.'
                      : fixRate >= 75
                        ? 'You fix most of what the editor points out. That habit is what makes mistakes stop coming back.'
                        : fixRate >= 40
                          ? 'You are fixing a good share. The open ones are worth a second look before they turn into habits.'
                          : 'Most issues are still open. Revisiting them, with a hint if you need one, is the fastest way to improve.'}
                  </p>
                </Card>
              </Reveal>
            </section>

            <section className="lg:col-span-3">
              <Reveal>
                <SectionTitle hint={errors.length ? `Top ${errors.length}` : undefined}>
                  Mistakes you make most
                </SectionTitle>
              </Reveal>

              {errors.length === 0 ? (
                <Reveal>
                  <EmptyState icon={Repeat2} title="No mistakes recorded yet">
                    Each kind of mistake the editor finds is counted here, with how many
                    of them you have already fixed.
                  </EmptyState>
                </Reveal>
              ) : (
                <Reveal>
                  <Card className="p-5 sm:p-6">
                    <ol className="space-y-4">
                      {errors.map((error, index) => {
                        const active = error.active_count ?? 0;
                        const done = Math.max(0, error.count - active);
                        // Scaled against the most frequent mistake, so the list
                        // compares itself; an absolute scale would leave every
                        // bar nearly empty for a student with a few issues.
                        const width = (error.count / (errors[0]?.count || 1)) * 100;

                        return (
                          <li key={error.error_type}>
                            <div className="mb-1.5 flex items-baseline justify-between gap-3">
                              <span className="flex min-w-0 items-baseline gap-2.5">
                                <span className="w-4 shrink-0 font-mono text-xs font-bold text-muted">
                                  {index + 1}
                                </span>
                                <span className="truncate text-sm font-medium text-ink">
                                  {formatErrorType(error.error_type)}
                                </span>
                              </span>
                              <span className="shrink-0 text-sm tabular-nums text-muted">
                                <b className="font-semibold text-ink">{error.count}×</b>
                                {active > 0 && <span> · {active} open</span>}
                              </span>
                            </div>
                            <div className="pl-[26px]">
                              <SplitBar
                                width={width}
                                delay={index * 60}
                                label={`${formatErrorType(error.error_type)}: ${done} fixed, ${active} open`}
                                parts={[
                                  { value: done, tone: 'bg-ok' },
                                  { value: active, tone: 'bg-warn' },
                                ]}
                              />
                            </div>
                          </li>
                        );
                      })}
                    </ol>

                    <div className="mt-5 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-line pt-4">
                      <LegendItem tone="bg-ok" label="Fixed" />
                      <LegendItem tone="bg-warn" label="Still open" />
                    </div>
                  </Card>
                </Reveal>
              )}
            </section>
          </div>

          {/* ── What the patterns say ────────────────────────────────────── */}
          <section>
            <Reveal>
              <SectionTitle hint={patterns.length ? 'Read from their timing' : undefined}>
                What your patterns say
              </SectionTitle>
            </Reveal>

            {patterns.length === 0 ? (
              <Reveal>
                <EmptyState icon={Repeat2} title="No repeats yet">
                  A concept lands here once the same kind of mistake shows up more than
                  once. That repetition is the signal — a one-off slip is not.
                </EmptyState>
              </Reveal>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {patterns.map((pattern, index) => (
                  <Reveal key={pattern.concept_tag} delay={(index % 2) * 80}>
                    <PatternCard pattern={pattern} index={index} />
                  </Reveal>
                ))}
              </div>
            )}
          </section>

          {/* ── Concept health ───────────────────────────────────────────── */}
          <section>
            <Reveal>
              <SectionTitle hint={concepts.length ? 'Weakest first · updated as you code' : undefined}>
                Where you stand on each concept
              </SectionTitle>
            </Reveal>

            {concepts.length === 0 ? (
              <Reveal>
                <EmptyState icon={Sparkles} title="Nothing tracked yet">
                  Write some Java in your editor with the extension running. Each concept
                  it sees appears here with a sense of how solid you are on it.
                </EmptyState>
              </Reveal>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {concepts.map((concept, index) => {
                  const level = levelOf(concept.mastery_level);
                  const score = percent(concept.mastery_score);

                  return (
                    <Reveal key={concept.concept_tag} delay={(index % 3) * 70}>
                      <Card className="flex h-full flex-col p-5 transition duration-200 ease-cg hover:-translate-y-0.5 hover:shadow-cg-md">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-semibold capitalize text-ink">
                            {formatConcept(concept.concept_tag)}
                          </span>
                          <Badge tone={level.tone}>{level.label}</Badge>
                        </div>

                        <div className="mt-4 flex items-end justify-between gap-3">
                          <span className="text-3xl font-extrabold tracking-tight text-ink">
                            <CountUp value={Math.round(score)} suffix="%" />
                          </span>
                          {concept.last_updated_at && (
                            <span className="pb-1 text-xs text-muted">
                              {relativeTime(concept.last_updated_at)}
                            </span>
                          )}
                        </div>

                        <div className="mt-2">
                          <FillBar
                            value={score}
                            tone={level.bar}
                            label={`${formatConcept(concept.concept_tag)} mastery`}
                            delay={(index % 3) * 70}
                          />
                        </div>

                        {(concept.last_quiz_score_percent != null ||
                          concept.last_game_score_percent != null) && (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {concept.last_quiz_score_percent != null && (
                              <MiniChip icon={BookOpen} tone="text-hue-study">
                                Last quiz {concept.last_quiz_score_percent}%
                              </MiniChip>
                            )}
                            {concept.last_game_score_percent != null && (
                              <MiniChip icon={Gamepad2} tone="text-hue-play">
                                Last game {concept.last_game_score_percent}%
                              </MiniChip>
                            )}
                          </div>
                        )}
                      </Card>
                    </Reveal>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}

      <EditorCallout />
    </div>
  );
}

/* ── One repeated concept ─────────────────────────────────────────────────── */

/**
 * What the spacing between repeats says.
 *
 * The same repeat count means different things: three mistakes in two minutes
 * is a student stuck right now, three across three weeks is one who keeps
 * forgetting. Code Coach measures the gap (median_seconds_between_occurrences)
 * precisely so the two can be told apart, and nothing showed it until now.
 */
function readPattern(pattern: Struggle): { icon: LucideIcon; text: string } {
  const gap = pattern.median_seconds_between_occurrences;

  if (gap === null || gap === undefined) {
    return { icon: Clock3, text: 'Not enough repeats yet to read a rhythm from.' };
  }
  if (gap < 15 * 60) {
    return {
      icon: Zap,
      text: `Comes back about every ${formatDuration(gap)}. You may be stuck on it right now.`,
    };
  }
  if (gap < 24 * 60 * 60) {
    return {
      icon: Repeat2,
      text: `Returns every ${formatDuration(gap)} or so. It has not quite clicked yet.`,
    };
  }
  return {
    icon: Clock3,
    text: `Fades and returns every ${formatDuration(gap)}. A quick refresher would help it stick.`,
  };
}

function PatternCard({ pattern, index }: { pattern: Struggle; index: number }) {
  const level = struggleOf(pattern.struggle_level);
  const reading = readPattern(pattern);
  const ReadingIcon = reading.icon;
  const active = pattern.active_count ?? 0;
  const resolved = pattern.resolved_count ?? 0;
  const sessions = pattern.unique_learning_sessions ?? 0;

  return (
    <Card className="flex h-full flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold capitalize text-ink">{formatConcept(pattern.concept_tag)}</h3>
          {pattern.error_type && (
            <p className="mt-0.5 truncate text-xs text-muted">{formatErrorType(pattern.error_type)}</p>
          )}
        </div>
        <Badge tone={level.tone}>{level.label}</Badge>
      </div>

      <p className="mt-4 flex gap-2.5 rounded-cg bg-card-alt px-3.5 py-3 text-sm text-body">
        <ReadingIcon size={16} strokeWidth={2.2} aria-hidden className="mt-0.5 shrink-0 text-hue-insight" />
        <span>{reading.text}</span>
      </p>

      <ul className="mt-4 grid gap-x-4 gap-y-2 text-sm text-body sm:grid-cols-2">
        <li className="flex items-center gap-2">
          <Repeat2 size={14} aria-hidden className="shrink-0 text-muted" />
          Seen <b className="font-semibold text-ink">{pattern.repeat_count}×</b>
          {sessions > 1 && <span className="text-muted">in {sessions} sessions</span>}
        </li>
        <li className="flex items-center gap-2">
          <ShieldCheck size={14} aria-hidden className="shrink-0 text-muted" />
          <span>
            <b className="font-semibold text-ink">{resolved}</b> fixed · {active} open
          </span>
        </li>
        <li className="flex items-center gap-2">
          <Lightbulb size={14} aria-hidden className="shrink-0 text-muted" />
          {pattern.hint_dependency_level === 'high'
            ? 'Leans on hints'
            : pattern.hint_dependency_level === 'medium'
              ? 'Uses some hints'
              : 'Few hints needed'}
        </li>
        {pattern.last_seen_at && (
          <li className="flex items-center gap-2">
            <Clock3 size={14} aria-hidden className="shrink-0 text-muted" />
            Last seen {relativeTime(pattern.last_seen_at)}
          </li>
        )}
      </ul>

      {pattern.struggle_score !== undefined && (
        <div className="mt-4 flex items-center gap-3">
          <span className="shrink-0 text-xs font-medium text-muted">Struggle</span>
          <FillBar
            value={percent(pattern.struggle_score)}
            tone={level.bar}
            label={`${formatConcept(pattern.concept_tag)} struggle score`}
            height="h-1.5"
            delay={(index % 2) * 80}
          />
        </div>
      )}

      <div className="mt-5 flex flex-1 items-end">
        <Link
          href={`/study?concept=${encodeURIComponent(pattern.concept_tag)}`}
          className={buttonClass({ variant: 'secondary', size: 'sm' })}
        >
          <BookOpen size={15} aria-hidden />
          Study this concept
        </Link>
      </div>
    </Card>
  );
}

function MiniChip({
  icon: Icon,
  tone,
  children,
}: {
  icon: LucideIcon;
  tone: string;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-card-alt px-2.5 py-1 text-xs font-medium text-body ring-1 ring-inset ring-line">
      <Icon size={13} aria-hidden className={tone} />
      {children}
    </span>
  );
}

/* ── Where this comes from ───────────────────────────────────────────────────
   Named as the editor extension rather than by the service behind it. Which
   backend stores a diagnostic is not something a student has any use for. */

function EditorCallout() {
  return (
    <Reveal>
      <Card className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-hue-insight/15 blur-3xl"
        />

        <div className="relative grid items-center gap-8 p-6 sm:p-8 lg:grid-cols-2">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-ink">This all starts in your editor</h2>
            <p className="mt-2 text-body">
              The Code Guru extension for VS Code underlines logic mistakes as you type
              — off-by-one loops, conditions that assign instead of compare — and
              explains them in three hints that never hand you the answer. What it
              finds shows up here, then drives your lessons and practice.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <a href="/download/vscode-extension" className={buttonClass()}>
                <Download size={16} aria-hidden />
                Get the extension
              </a>
              <Link href="/study" className={buttonClass({ variant: 'secondary' })}>
                See your lessons
              </Link>
            </div>
          </div>

          <EditorDemo />
        </div>
      </Card>
    </Reveal>
  );
}