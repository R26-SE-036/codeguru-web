import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Clock3, Gamepad2, Sparkles, TriangleAlert, Users } from 'lucide-react';

import { getSession, serverFetch } from '@/lib/server-api';
import { SECTIONS } from '@/lib/nav';
import { componentTone, formatComponent } from '@/lib/vocabulary';
import { Card, EmptyState, SectionTitle, Stat, Unavailable } from '@/components/ui';
import { GettingStarted } from '@/components/getting-started';

export const metadata: Metadata = { title: 'Overview' };

interface Overview {
  counts?: {
    active_diagnostics?: number;
    active_remediation_triggers?: number;
    total_game_sessions?: number;
    total_pair_sessions?: number;
  };
  mastery?: {
    total_concepts?: number;
    strong_count?: number;
    at_risk_count?: number;
  };
  recent_timeline?: Array<{
    event_id: string;
    component: string;
    title: string;
    summary?: string;
    occurred_at: string;
  }>;
}

export default async function HomePage() {
  const session = await getSession();
  const overview = await serverFetch<Overview>('coach', '/dashboard/me/overview', session);

  const firstName = session?.user.full_name?.trim().split(/\s+/)[0] ?? 'there';
  const counts = overview?.counts;
  const waiting = counts?.active_remediation_triggers ?? 0;

  /*
   * A brand-new account, as distinct from a quiet one.
   *
   * Only true when the summary ARRIVED and everything in it is empty -
   * `overview === null` means we could not find out, which is a different
   * claim and must not be mistaken for "you have not started". Every counter
   * is checked rather than one: a student who has only played a game has
   * started, and telling them to install the extension would be wrong.
   */
  const isNewAccount =
    overview !== null &&
    (counts?.active_diagnostics ?? 0) === 0 &&
    waiting === 0 &&
    (counts?.total_game_sessions ?? 0) === 0 &&
    (counts?.total_pair_sessions ?? 0) === 0 &&
    (overview.recent_timeline?.length ?? 0) === 0;

  if (isNewAccount) {
    return (
      <div className="space-y-8">
        <Hero name={firstName} waiting={0} unreachable={false} newAccount />
        <GettingStarted />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <Hero name={firstName} waiting={waiting} unreachable={overview === null} />

      {overview === null ? (
        <Unavailable what="Your summary" />
      ) : (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Open issues"
            value={counts?.active_diagnostics ?? 0}
            hint="Still unfixed in your code"
            href="/insights"
            icon={TriangleAlert}
            tone="text-hue-insight"
            toneBg="bg-hue-insight/10"
          />
          <Stat
            label="Lessons waiting"
            value={waiting}
            hint="Built around your gaps"
            href="/study"
            icon={Sparkles}
            tone="text-hue-study"
            toneBg="bg-hue-study/10"
          />
          <Stat
            label="Games played"
            value={counts?.total_game_sessions ?? 0}
            hint="Short practice rounds"
            href="/play"
            icon={Gamepad2}
            tone="text-hue-play"
            toneBg="bg-hue-play/10"
          />
          <Stat
            label="Pair sessions"
            value={counts?.total_pair_sessions ?? 0}
            hint="Solved with a partner"
            href="/pair"
            icon={Users}
            tone="text-hue-pair"
            toneBg="bg-hue-pair/10"
          />
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="lg:col-span-3">
          <SectionTitle hint="Most recent first">Recent activity</SectionTitle>

          {overview?.recent_timeline && overview.recent_timeline.length > 0 ? (
            <Card className="divide-y divide-line overflow-hidden">
              {overview.recent_timeline.slice(0, 8).map((event) => (
                <article key={event.event_id} className="flex gap-3 px-5 py-4">
                  <span
                    className={`mt-0.5 h-fit shrink-0 rounded-cg-sm px-2 py-1 text-[11px] font-semibold ring-1 ring-inset ${componentTone(
                      event.component,
                    )}`}
                  >
                    {formatComponent(event.component)}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink">{event.title}</p>
                    {event.summary && (
                      <p className="mt-0.5 text-sm text-body">{event.summary}</p>
                    )}
                  </div>

                  <time
                    dateTime={event.occurred_at}
                    className="shrink-0 text-xs tabular-nums text-muted"
                  >
                    {relativeTime(event.occurred_at)}
                  </time>
                </article>
              ))}
            </Card>
          ) : (
            <EmptyState icon={Clock3} title="Nothing here yet">
              Your activity appears as you write code, work through lessons and
              practise. Start anywhere on the right.
            </EmptyState>
          )}
        </section>

        {/* ── Shortcuts ─────────────────────────────────────────────────────
            Reads lib/nav.ts, so a section renamed in the sidebar is renamed
            here too rather than in one of the two places. */}
        <section className="lg:col-span-2">
          <SectionTitle>Jump in</SectionTitle>

          <div className="grid gap-3">
            {SECTIONS.filter((section) => section.href !== '/').map((section) => {
              const Icon = section.icon;

              return (
                <Link
                  key={section.href}
                  href={section.href}
                  className="cg-card cg-card-hover cg-focusable group flex items-center gap-4 p-4"
                >
                  <span
                    className={`grid h-11 w-11 shrink-0 place-items-center rounded-cg ${section.bg} ${section.text}`}
                  >
                    <Icon size={20} strokeWidth={2.1} aria-hidden />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-ink">{section.label}</span>
                    <span className="block truncate text-sm text-muted">
                      {section.blurb}
                    </span>
                  </span>

                  <ArrowRight
                    size={17}
                    aria-hidden
                    className="shrink-0 text-faint-nontext transition-transform duration-200 ease-cg group-hover:translate-x-0.5 group-hover:text-ink"
                  />
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ── Hero ─────────────────────────────────────────────────────────────────── */

function Hero({
  name,
  waiting,
  unreachable,
  newAccount = false,
}: {
  name: string;
  waiting: number;
  unreachable: boolean;
  newAccount?: boolean;
}) {
  return (
    <section className="relative overflow-hidden rounded-cg-xl border border-line bg-card p-6 shadow-cg-sm sm:p-9">
      {/* Two blurred hue blooms. Sized in rem rather than % so they do not
          collapse to nothing on a narrow screen. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 -top-28 h-72 w-72 rounded-full bg-hue-study/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -right-16 h-72 w-72 rounded-full bg-hue-insight/20 blur-3xl"
      />

      <div className="relative">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent">
          {newAccount ? 'Welcome' : greeting()}
        </p>

        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
          {newAccount ? 'Welcome, ' : 'Hello, '}
          <span className="cg-gradient-text">{name}</span>
        </h1>

        <p className="mt-3 max-w-xl text-body">
          {newAccount
            ? // Deliberately not "you are all caught up". Nothing has happened
              // yet, and saying so is the difference between a student setting
              // the platform up and one concluding it does not work.
              'Nothing has happened on your account yet. Here is how to get the platform watching your code.'
            : unreachable
              ? 'We could not reach your summary just now, so the numbers below are missing rather than zero.'
              : waiting > 0
                ? `You have ${waiting} ${waiting === 1 ? 'lesson' : 'lessons'} waiting, built from the mistakes you have been repeating.`
                : 'Nothing is waiting for you right now. Write some Java and anything worth working on will show up here.'}
        </p>

        {waiting > 0 && (
          <Link
            href="/study"
            className="mt-6 inline-flex items-center gap-2 rounded-cg-sm bg-cg-accent px-5 py-2.5 text-sm font-semibold text-on-accent shadow-cg-accent transition duration-150 ease-cg hover:brightness-110"
          >
            Start your next lesson
            <ArrowRight size={16} strokeWidth={2.4} aria-hidden />
          </Link>
        )}
      </div>
    </section>
  );
}

/**
 * Rendered on the server, so this is the SERVER's clock and time zone.
 *
 * Acceptable for a greeting, which is decorative. It would not be acceptable
 * for a timestamp, which is why relativeTime below deals in elapsed time -
 * a duration is the same number in every time zone, so it cannot disagree
 * with the client the way a formatted wall-clock date would.
 */
function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';

  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return 'just now';

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;

  return `${Math.round(days / 7)}w ago`;
}
