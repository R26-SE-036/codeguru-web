import type { Metadata } from 'next';
import Link from 'next/link';
import { Award, Flame, Gamepad2, History, Play, Sparkles, Target, Trophy } from 'lucide-react';

import { getSession, serverFetch } from '@/lib/server-api';
import { formatConcept, formatGameType } from '@/lib/vocabulary';
import { relativeTime } from '@/lib/time';
import {
  Badge,
  Card,
  EmptyState,
  Meter,
  PageHeader,
  SectionTitle,
  Unavailable,
  buttonClass,
} from '@/components/ui';

export const metadata: Metadata = { title: 'Practice' };

/**
 * Practice home.
 *
 * Two things changed when this was ported from the standalone dashboard, both
 * deliberate.
 *
 * It fetches on the server. The original made three parallel calls from the
 * browser - two through a dev proxy, one to its own backend - each with its own
 * axios client, only one of which had refresh-and-retry.
 *
 * And "Start practice" asks for `auto` rather than a recommended difficulty.
 * See the note on that link below.
 */

interface Recommendation {
  recommendation_id: string;
  concept_tag: string;
  error_type?: string;
  game_type: string;
  game_id?: string;
  title: string;
  difficulty_level?: string;
  support_level?: string;
  rationale?: string;
  based_on_mastery_level?: string;
  based_on_struggle_level?: string;
  focus_points?: string[];
}

interface Struggle {
  concept_tag: string;
  struggle_level?: string;
  struggle_score?: number;
  repeat_count?: number;
  active_count?: number;
  hint_dependency_level?: string;
}

interface Profile {
  totalScore?: number;
  currentStreak?: number;
  badges?: string[];
}

/**
 * One finished round, as Study Guider recorded it.
 *
 * ===================== WHY THIS COMES FROM STUDY GUIDER =====================
 * FR-12 has the engine transmit a summary of every finished round to the
 * Progress Tracker. That write worked and NOTHING READ IT BACK - the summaries
 * went into Neo4j and no screen in the platform showed them, so the only way to
 * know the integration was alive was to query the graph by hand.
 *
 * Read from Study Guider rather than from the engine's own GameSession rows on
 * purpose. Reading the engine's copy would show the same numbers while proving
 * nothing about the integration; reading the Progress Tracker's copy is what
 * makes a missing summary visible as a missing row.
 *
 * It is shown HERE, on Practice, and not on the Study Guider progress
 * dashboard. Game rounds are stored on their own `PLAYED` path specifically so
 * they never become knowledge-tracing observations, and putting them on the
 * mastery dashboard would undo that separation in the reader's head even though
 * the data stayed apart.
 */
interface GameSummary {
  game_session_id: string;
  concept: string;
  game_type?: string;
  difficulty_level?: string;
  score?: number;
  hint_usage?: number;
  attempt_count?: number;
  time_taken_seconds?: number;
  played_at?: string;
}

export default async function PlayPage() {
  const session = await getSession();
  const userId = session?.user.user_id;

  const [recs, struggles, profile, history] = await Promise.all([
    serverFetch<{ recommendations?: Recommendation[] }>(
      'coach',
      '/gamification/me/recommendations?limit=5',
      session,
    ),
    serverFetch<{ struggles?: Struggle[] }>(
      'coach',
      '/students/me/struggling-concepts?limit=10',
      session,
    ),
    userId ? serverFetch<Profile>('play', `/profile/${userId}`, session) : null,
    serverFetch<{ success: boolean; data?: GameSummary[] }>(
      'study',
      '/games/me?limit=8',
      session,
    ),
  ]);

  const recommendation = recs?.recommendations?.[0] ?? null;

  // `history === null` is "Study Guider did not answer" and an empty list is
  // "nothing played yet". Rendering the first as the second would tell a
  // student they have never practised when the truth is that we could not find
  // out - and on this panel that reads as lost work.
  const rounds = history?.success ? (history.data ?? []) : null;
  const struggle =
    struggles?.struggles?.find((s) => s.concept_tag === recommendation?.concept_tag) ?? null;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Practice"
        title="Short games, tuned to you"
        lead="Rounds pitched at the mistakes you have been repeating. They get harder as you improve, and easier when you are stuck."
        icon={Gamepad2}
        tone="text-hue-play"
        toneBg="bg-hue-play/10"
      />

      {/* ── Player card ──────────────────────────────────────────────────── */}
      <Card className="relative overflow-hidden p-6">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-hue-play/20 blur-3xl"
        />

        <div className="relative grid gap-6 sm:grid-cols-[auto_auto_1fr] sm:items-center">
          <Score
            icon={Trophy}
            label="Total XP"
            value={profile?.totalScore ?? 0}
            tone="text-hue-play"
            toneBg="bg-hue-play/10"
          />
          <Score
            icon={Flame}
            label="Day streak"
            value={profile?.currentStreak ?? 0}
            tone="text-hue-rose"
            toneBg="bg-hue-rose/10"
          />

          <div className="sm:border-l sm:border-line sm:pl-6">
            <div className="flex items-center gap-1.5 text-sm font-medium text-muted">
              <Award size={15} strokeWidth={2.2} aria-hidden />
              Badges
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {profile?.badges?.length ? (
                profile.badges.map((badge) => (
                  <Badge key={badge} tone="warn">
                    {badge}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-muted">Play a round to earn your first</span>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* ── Next round ───────────────────────────────────────────────────── */}
      <section>
        <SectionTitle>Up next</SectionTitle>

        {recs === null ? (
          <Unavailable what="Your recommendations" />
        ) : recommendation ? (
          <Card className="overflow-hidden">
            <div className="border-b border-line bg-card-alt px-6 py-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-4">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-cg bg-hue-play/10 text-hue-play">
                    <Target size={20} strokeWidth={2.1} aria-hidden />
                  </span>
                  <div>
                    <h3 className="text-lg font-bold text-ink">{recommendation.title}</h3>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted">
                      <span className="font-medium text-body">
                        {formatConcept(recommendation.concept_tag)}
                      </span>
                      {recommendation.error_type && (
                        <>
                          <span aria-hidden className="h-1 w-1 rounded-full bg-faint-nontext" />
                          <span className="font-mono text-xs">
                            {recommendation.error_type}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                </div>

                {struggle?.struggle_level && (
                  <Badge tone={struggle.struggle_level === 'high' ? 'danger' : 'warn'}>
                    {struggle.struggle_level} struggle
                  </Badge>
                )}
              </div>
            </div>

            <div className="space-y-5 p-6">
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Metric label="Struggle score" value={struggle?.struggle_score ?? '—'} />
                <Metric label="Active errors" value={struggle?.active_count ?? 0} />
                <Metric label="Repeats" value={struggle?.repeat_count ?? 0} />
                <Metric
                  label="Hint reliance"
                  value={struggle?.hint_dependency_level ?? 'low'}
                />
              </dl>

              {recommendation.rationale && (
                <p className="rounded-cg border border-accent/20 bg-accent/10 px-4 py-3 text-sm text-body">
                  {recommendation.rationale}
                </p>
              )}

              {recommendation.focus_points && recommendation.focus_points.length > 0 && (
                <ul className="space-y-2">
                  {recommendation.focus_points.map((point) => (
                    <li key={point} className="flex gap-2.5 text-sm text-body">
                      <Sparkles
                        size={15}
                        aria-hidden
                        className="mt-0.5 shrink-0 text-hue-play"
                      />
                      {point}
                    </li>
                  ))}
                </ul>
              )}

              {/*
                `auto`, not recommendation.difficulty_level.

                The recommendation carries a difficulty in a different
                vocabulary (beginner / intermediate / advanced), which the game
                route aliases straight to Easy / Medium / Hard. Passing it
                through means the request resolves without ever consulting the
                adaptive model - which is a large part of why that model had
                never actually run in the product.

                `auto` hands the choice to the engine whose job it is, using
                this student's own history on this concept. The suggestion is
                still shown above; it is a signal, not the decision.
              */}
              <Link
                href={`/play/${recommendation.game_type}/${recommendation.concept_tag}/auto?rec=${encodeURIComponent(recommendation.recommendation_id)}`}
                className={buttonClass({ size: 'lg' })}
              >
                <Play size={17} strokeWidth={2.4} aria-hidden />
                Start {formatGameType(recommendation.game_type)} practice
              </Link>
            </div>
          </Card>
        ) : (
          <EmptyState icon={Gamepad2} title="No practice lined up yet">
            Write some Java in your editor with the Code Guru extension running.
            Repeat a mistake a few times and a round aimed at it will appear here.
          </EmptyState>
        )}
      </section>

      {/* ── What they have played ────────────────────────────────────────── */}
      <section>
        <SectionTitle>Recent practice</SectionTitle>

        {rounds === null ? (
          <Unavailable what="Your practice history" />
        ) : rounds.length === 0 ? (
          <EmptyState icon={History} title="Nothing played yet">
            Finish a round and it will be recorded here.
          </EmptyState>
        ) : (
          <Card className="overflow-hidden">
            {/*
              The header is the part worth having. A list of past scores is a
              log; "6 of 8 passed" is the only line on this page that answers
              "am I getting better", and it is computed from what the Progress
              Tracker actually received rather than from anything this page
              knows about itself.
            */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-card-alt px-5 py-3.5">
              <p className="font-semibold text-ink">
                Last {rounds.length} round{rounds.length === 1 ? '' : 's'}
              </p>
              <p className="text-sm text-muted">
                {rounds.filter((round) => (round.score ?? 0) >= 70).length} of{' '}
                {rounds.length} passed
              </p>
            </div>

            <ul className="divide-y divide-line">
              {rounds.map((round) => {
                const score = Math.round(round.score ?? 0);
                const passed = score >= 70;

                return (
                  <li
                    key={round.game_session_id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink">
                        {formatConcept(round.concept)}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted">
                        <span>{formatGameType(round.game_type)}</span>
                        {round.difficulty_level && (
                          <>
                            <span aria-hidden className="h-1 w-1 rounded-full bg-faint-nontext" />
                            <span>{round.difficulty_level}</span>
                          </>
                        )}
                        {round.played_at && (
                          <>
                            <span aria-hidden className="h-1 w-1 rounded-full bg-faint-nontext" />
                            <span>{relativeTime(round.played_at)}</span>
                          </>
                        )}
                      </p>
                    </div>

                    <div className="w-28 shrink-0">
                      <Meter
                        value={score}
                        tone={passed ? 'bg-ok' : 'bg-warn'}
                        label={`Score for ${formatConcept(round.concept)}`}
                      />
                    </div>

                    <span
                      className={`w-10 shrink-0 text-right font-semibold tabular-nums ${
                        passed ? 'text-ok' : 'text-warn'
                      }`}
                    >
                      {score}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}

function Score({
  icon: Icon,
  label,
  value,
  tone,
  toneBg,
}: {
  icon: typeof Trophy;
  label: string;
  value: number;
  tone: string;
  toneBg: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-cg ${toneBg} ${tone}`}>
        <Icon size={22} strokeWidth={2.1} aria-hidden />
      </span>
      <div>
        <div className="text-2xl font-bold tabular-nums tracking-tight text-ink">
          {value}
        </div>
        <div className="text-sm text-muted">{label}</div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-cg bg-card-alt px-3.5 py-3">
      <dd className="text-xl font-bold tabular-nums text-ink">{value}</dd>
      <dt className="mt-0.5 text-xs text-muted">{label}</dt>
    </div>
  );
}
