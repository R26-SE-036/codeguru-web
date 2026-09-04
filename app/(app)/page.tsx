import Link from 'next/link';
import { getSession, serverFetch } from '@/lib/server-api';

/**
 * The student's home page.
 *
 * This is the portal Hub's job, done properly. The Hub showed a card per
 * service with a live count pulled from Code Coach's dashboard overview, and
 * each card was a handoff link that carried the session to another origin.
 * Here the counts come from the same endpoint and the links are just links.
 */

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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Hello, {firstName}</h1>
        <p className="mt-1 text-body">Here is what the coach has noticed lately.</p>
      </div>

      {/*
        A null overview means Code Coach did not answer. Saying so is the point:
        rendering zeroes would tell the student they have nothing to work on,
        which is a different claim from "we could not find out" - and it is the
        claim that quietly makes a broken integration look like a working one.
      */}
      {overview === null ? (
        <div className="rounded-cg border border-line bg-card-alt px-4 py-3 text-body">
          Your summary is unavailable right now. Nothing has been lost — this page
          will fill in once the coach is reachable again.
        </div>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Open issues"
              value={overview.counts?.active_diagnostics ?? 0}
              href="/coach"
            />
            <Stat
              label="Lessons waiting"
              value={overview.counts?.active_remediation_triggers ?? 0}
              href="/study"
            />
            <Stat
              label="Games played"
              value={overview.counts?.total_game_sessions ?? 0}
              href="/play"
            />
            <Stat
              label="Pair sessions"
              value={overview.counts?.total_pair_sessions ?? 0}
              href="/pair"
            />
          </section>

          {overview.recent_timeline && overview.recent_timeline.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-medium text-ink">Recent activity</h2>
              <ul className="divide-y divide-line rounded-cg border border-line bg-card">
                {overview.recent_timeline.slice(0, 8).map((event) => (
                  <li key={event.event_id} className="flex items-baseline gap-3 px-4 py-3">
                    <span className="rounded bg-card-alt px-2 py-0.5 text-xs text-muted">
                      {event.component}
                    </span>
                    <span className="text-ink">{event.title}</span>
                    {event.summary && (
                      <span className="text-sm text-muted">{event.summary}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link
      href={href}
      className="rounded-cg border border-line bg-card p-4 transition hover:border-line-strong"
    >
      <div className="text-3xl font-semibold text-ink">{value}</div>
      <div className="mt-1 text-sm text-muted">{label}</div>
    </Link>
  );
}
