import Link from 'next/link';
import { getSession, serverFetch } from '@/lib/server-api';
import { formatConcept, formatGameType } from '@/lib/vocabulary';

/**
 * Practice home. Ported from adaptive-gamification-engine Dashboard.jsx.
 *
 * Two things changed in the move, both deliberate.
 *
 * It fetches on the server. The original made three parallel calls from the
 * browser - two to Code Coach through a Vite proxy, one to its own backend -
 * each with its own axios client, only one of which had refresh-and-retry.
 *
 * And "Start practice" now asks for `auto` rather than the difficulty Code
 * Coach recommended. See the note on that link below.
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

export default async function PlayPage() {
  const session = await getSession();
  const userId = session?.user.user_id;

  const [recs, struggles, profile] = await Promise.all([
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
  ]);

  const recommendation = recs?.recommendations?.[0] ?? null;
  const struggle =
    struggles?.struggles?.find((s) => s.concept_tag === recommendation?.concept_tag) ?? null;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-ink">Practice</h1>
        <p className="mt-1 text-body">
          Games pitched at the mistakes the coach saw you repeat while coding.
        </p>
      </header>

      <section className="flex flex-wrap items-center gap-6 rounded-cg border border-line bg-card p-5">
        <Metric label="Total XP" value={profile?.totalScore ?? 0} />
        <Metric label="Day streak" value={profile?.currentStreak ?? 0} />
        <div>
          <div className="text-sm text-muted">Badges</div>
          <div className="mt-1 flex flex-wrap gap-2">
            {profile?.badges?.length ? (
              profile.badges.map((badge) => (
                <span
                  key={badge}
                  className="rounded-cg bg-warn/10 px-2.5 py-1 text-sm text-warn"
                >
                  {badge}
                </span>
              ))
            ) : (
              <span className="text-sm italic text-muted">Play a game to earn one</span>
            )}
          </div>
        </div>
      </section>

      {recs === null ? (
        <Notice>
          Recommendations are unavailable right now. This is a connection problem, not
          an empty list — nothing about your progress has changed.
        </Notice>
      ) : recommendation ? (
        <section className="rounded-cg border border-line bg-card p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium text-ink">{recommendation.title}</h2>
              <p className="mt-1 text-sm text-muted">
                {formatConcept(recommendation.concept_tag)}
                {recommendation.error_type ? ` · ${recommendation.error_type}` : ''}
              </p>
            </div>
            {struggle?.struggle_level && (
              <span className="rounded-cg bg-warn/10 px-3 py-1 text-sm text-warn">
                {struggle.struggle_level} struggle
              </span>
            )}
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Metric label="Struggle score" value={struggle?.struggle_score ?? '—'} />
            <Metric label="Active errors" value={struggle?.active_count ?? 0} />
            <Metric label="Repeats" value={struggle?.repeat_count ?? 0} />
            <Metric label="Hint reliance" value={struggle?.hint_dependency_level ?? 'low'} />
          </dl>

          {recommendation.rationale && (
            <p className="mt-5 rounded-cg bg-accent-soft/40 px-4 py-3 text-sm text-body">
              {recommendation.rationale}
            </p>
          )}

          {recommendation.focus_points && recommendation.focus_points.length > 0 && (
            <ul className="mt-4 list-inside list-disc space-y-1 text-sm text-body">
              {recommendation.focus_points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          )}

          {/*
            `auto`, not recommendation.difficulty_level.

            Code Coach recommends a difficulty in its own vocabulary
            (beginner / intermediate / advanced), which the game route aliases
            straight to Easy / Medium / Hard. Passing it through means the
            request resolves without ever consulting the Random Forest - which
            is a large part of why that model had never run in the product.

            `auto` hands the choice to the engine whose job it is, using this
            student's own history on this concept plus their unresolved
            struggle count. What Code Coach suggested is still shown above; it
            is a signal, not the decision.
          */}
          <Link
            href={`/play/${recommendation.game_type}/${recommendation.concept_tag}/auto?rec=${encodeURIComponent(recommendation.recommendation_id)}`}
            className="mt-6 inline-flex rounded-cg bg-accent px-5 py-2.5 font-medium text-white transition hover:bg-accent-strong"
          >
            Start {formatGameType(recommendation.game_type)} practice
          </Link>
        </section>
      ) : (
        <Notice>
          No practice recommendation yet. Write some Java in VS Code with Code Coach
          running, and repeat a mistake a few times — then come back.
        </Notice>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-2xl font-semibold text-ink">{value}</div>
      <div className="text-sm text-muted">{label}</div>
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-cg border border-line bg-card-alt px-4 py-3 text-body">
      {children}
    </div>
  );
}
