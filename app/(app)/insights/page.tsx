import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, Lightbulb, Radar, Repeat2, Sparkles, TrendingUp } from 'lucide-react';

import { getSession, serverFetch } from '@/lib/server-api';
import { formatConcept } from '@/lib/vocabulary';
import {
  Badge,
  Card,
  EmptyState,
  Meter,
  PageHeader,
  SectionTitle,
  Stat,
  Unavailable,
  buttonClass,
} from '@/components/ui';

export const metadata: Metadata = { title: 'Insights' };

/**
 * What has been noticed in your code.
 *
 * The analysis itself happens in the editor extension, so this is a read-only
 * view of the learner model rather than a place you do anything.
 */

interface Summary {
  total_diagnostics?: number;
  total_hint_events?: number;
  top_error_types?: Array<{ error_type: string; count: number; active_count?: number }>;
  top_concepts?: Array<{ concept_tag: string; repeat_count: number }>;
}

interface Mastery {
  concepts?: Array<{
    concept_tag: string;
    mastery_score?: number;
    mastery_level?: string;
    struggle_score?: number;
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

export default async function InsightsPage() {
  const session = await getSession();

  const [summary, mastery] = await Promise.all([
    serverFetch<Summary>('coach', '/students/me/diagnostics/summary', session),
    serverFetch<Mastery>('coach', '/students/me/concept-mastery?limit=20', session),
  ]);

  const concepts = mastery?.concepts ?? [];
  const repeats = summary?.top_concepts ?? [];
  const strong = concepts.filter((c) => c.mastery_level === 'strong').length;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Insights"
        title="Patterns in your code"
        lead="Everything here comes from what you actually wrote. It updates as you code, and it decides which lessons and practice you get next."
        icon={Radar}
        tone="text-hue-insight"
        toneBg="bg-hue-insight/10"
      />

      {summary === null && mastery === null ? (
        <Unavailable what="Your analysis" />
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Issues found"
              value={summary?.total_diagnostics ?? 0}
              hint="All time, across your files"
              icon={AlertTriangle}
              tone="text-hue-insight"
              toneBg="bg-hue-insight/10"
            />
            <Stat
              label="Hints used"
              value={summary?.total_hint_events ?? 0}
              hint="Nudges you asked for"
              icon={Lightbulb}
              tone="text-hue-play"
              toneBg="bg-hue-play/10"
            />
            <Stat
              label="Concepts tracked"
              value={concepts.length}
              hint="Ideas seen in your work"
              icon={Sparkles}
              tone="text-hue-study"
              toneBg="bg-hue-study/10"
            />
            <Stat
              label="Looking strong"
              value={strong}
              hint={concepts.length ? `of ${concepts.length} tracked` : 'Nothing tracked yet'}
              icon={TrendingUp}
              tone="text-ok"
              toneBg="bg-ok/10"
            />
          </section>

          <div className="grid gap-6 lg:grid-cols-5">
            {/* ── Repeats ─────────────────────────────────────────────────── */}
            <section className="lg:col-span-2">
              <SectionTitle hint={repeats.length ? `${repeats.length} concepts` : undefined}>
                Mistakes you repeat
              </SectionTitle>

              {repeats.length === 0 ? (
                <EmptyState icon={Repeat2} title="No repeats yet">
                  A concept lands here once the same kind of mistake shows up more
                  than once. That repetition is the signal — a one-off slip is not.
                </EmptyState>
              ) : (
                <Card className="divide-y divide-line overflow-hidden">
                  {repeats.map((concept, index) => {
                    // Relative to the worst one, so the bar compares the list to
                    // itself. An absolute scale would render every row nearly
                    // empty for a student with a handful of repeats.
                    const worst = repeats[0]?.repeat_count || 1;
                    const share = (concept.repeat_count / worst) * 100;

                    return (
                      <div key={concept.concept_tag} className="px-5 py-4">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="flex items-center gap-2.5 font-medium text-ink">
                            <span className="w-4 text-xs font-bold tabular-nums text-faint-nontext">
                              {index + 1}
                            </span>
                            {formatConcept(concept.concept_tag)}
                          </span>
                          <span className="shrink-0 text-sm tabular-nums text-muted">
                            {concept.repeat_count}×
                          </span>
                        </div>
                        <div className="mt-2.5 pl-[26px]">
                          <Meter
                            value={share}
                            tone="bg-hue-insight"
                            label={`${concept.repeat_count} repeats`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </Card>
              )}
            </section>

            {/* ── Mastery ─────────────────────────────────────────────────── */}
            <section className="lg:col-span-3">
              <SectionTitle hint={concepts.length ? 'Updated as you code' : undefined}>
                Where you stand
              </SectionTitle>

              {concepts.length === 0 ? (
                <EmptyState icon={Sparkles} title="Nothing tracked yet">
                  Write some Java in your editor with the extension running. Each
                  concept it sees appears here with a sense of how solid you are on it.
                </EmptyState>
              ) : (
                <Card className="grid gap-px overflow-hidden bg-line sm:grid-cols-2">
                  {concepts.map((concept) => {
                    const level = levelOf(concept.mastery_level);
                    // Scores arrive 0-1 from the store; Meter clamps, but scaling
                    // here is what makes a 0.62 render as 62% rather than 1%.
                    const raw = concept.mastery_score ?? 0;
                    const score = raw <= 1 ? raw * 100 : raw;

                    return (
                      <div key={concept.concept_tag} className="bg-card p-4">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-semibold text-ink">
                            {formatConcept(concept.concept_tag)}
                          </span>
                          <Badge tone={level.tone}>{level.label}</Badge>
                        </div>
                        <div className="mt-3">
                          <Meter
                            value={score}
                            tone={level.bar}
                            label={`${formatConcept(concept.concept_tag)} mastery`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </Card>
              )}
            </section>
          </div>
        </>
      )}

      {/* ── Where this comes from ───────────────────────────────────────────
          Named as the editor extension rather than by the service behind it.
          Which backend stores a diagnostic is not something a student has any
          use for. */}
      <Card className="relative overflow-hidden p-6 sm:p-7">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-hue-insight/10 blur-2xl"
        />
        <div className="relative flex flex-wrap items-center justify-between gap-5">
          <div className="max-w-xl">
            <h2 className="text-lg font-bold text-ink">This all starts in your editor</h2>
            <p className="mt-2 text-sm text-body">
              Install the Code Guru extension in VS Code and sign in with this same
              account. It underlines logic mistakes as you type — off-by-one loops,
              conditions that assign instead of compare — and what it finds shows up
              here, then drives your lessons and practice.
            </p>
          </div>
          <Link href="/study" className={buttonClass({ variant: 'secondary' })}>
            See your lessons
          </Link>
        </div>
      </Card>
    </div>
  );
}
