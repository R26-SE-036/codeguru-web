import { getSession, serverFetch } from '@/lib/server-api';
import { formatConcept } from '@/lib/vocabulary';

/**
 * What the coach has found in your code.
 *
 * Code Coach's own surface is a VS Code extension, so this is a read-only view
 * of the learner model rather than a port of an existing UI - the portal's Hub
 * showed only a count. The analysis itself still happens in the editor.
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

export default async function CoachPage() {
  const session = await getSession();

  const [summary, mastery] = await Promise.all([
    serverFetch<Summary>('coach', '/students/me/diagnostics/summary', session),
    serverFetch<Mastery>('coach', '/students/me/concept-mastery?limit=20', session),
  ]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold text-ink">Coach</h1>
        <p className="mt-1 text-body">
          What the coach has noticed while you write Java in VS Code.
        </p>
      </header>

      {summary === null ? (
        <div className="rounded-cg border border-line bg-card-alt px-4 py-3 text-body">
          The coach is unreachable right now. Your diagnostics are unaffected.
        </div>
      ) : (
        <section className="grid gap-4 sm:grid-cols-2">
          <Stat label="Issues found" value={summary.total_diagnostics ?? 0} />
          <Stat label="Hints used" value={summary.total_hint_events ?? 0} />
        </section>
      )}

      {summary?.top_concepts && summary.top_concepts.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-medium text-ink">Concepts you repeat</h2>
          <ul className="divide-y divide-line rounded-cg border border-line bg-card">
            {summary.top_concepts.map((concept) => (
              <li
                key={concept.concept_tag}
                className="flex items-baseline justify-between px-4 py-3"
              >
                <span className="text-ink">{formatConcept(concept.concept_tag)}</span>
                <span className="text-sm text-muted">{concept.repeat_count} times</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {mastery?.concepts && mastery.concepts.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-medium text-ink">Where you stand</h2>
          <ul className="divide-y divide-line rounded-cg border border-line bg-card">
            {mastery.concepts.map((concept) => (
              <li
                key={concept.concept_tag}
                className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3"
              >
                <span className="text-ink">{formatConcept(concept.concept_tag)}</span>
                <span
                  className={`rounded-cg px-2.5 py-0.5 text-sm ${
                    concept.mastery_level === 'strong'
                      ? 'bg-ok/10 text-ok'
                      : concept.mastery_level === 'at_risk'
                        ? 'bg-danger-soft text-danger'
                        : 'bg-warn/10 text-warn'
                  }`}
                >
                  {concept.mastery_level ?? 'developing'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-cg border border-line bg-card-alt px-4 py-4">
        <h2 className="font-medium text-ink">The analysis happens in your editor</h2>
        <p className="mt-1 text-sm text-body">
          Install the Code Coach extension in VS Code and sign in with this same
          account. It underlines mistakes as you type; what it finds shows up here
          and drives your lessons and practice.
        </p>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-cg border border-line bg-card p-4">
      <div className="text-3xl font-semibold text-ink">{value}</div>
      <div className="mt-1 text-sm text-muted">{label}</div>
    </div>
  );
}
