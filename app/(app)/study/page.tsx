import Link from 'next/link';
import { getSession, serverFetch } from '@/lib/server-api';
import { formatConcept } from '@/lib/vocabulary';

/**
 * Study home: the concepts Code Coach says you keep getting wrong.
 *
 * Ported from Study-Guider App.jsx, which had no router at all - it switched
 * between triggers, lesson, quiz and dashboard on a single `phase` state
 * variable. That meant no addressable URLs: a student could not link to a
 * lesson, a refresh dropped them back to the list, and the browser's back
 * button did nothing useful. Those are now four real routes.
 */

interface Trigger {
  trigger_id: string;
  learning_session_id?: string;
  concept_tag: string;
  error_type?: string;
  reason?: string;
  struggle_level?: string;
  repeat_count?: number;
  intervention_status?: string;
  lesson?: { lesson_id?: string; title?: string };
}

export default async function StudyPage() {
  const session = await getSession();
  const data = await serverFetch<{ triggers?: Trigger[] }>(
    'study',
    '/remediation/triggers',
    session,
  );

  const triggers = data?.triggers ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Study</h1>
          <p className="mt-1 text-body">
            Concepts the coach saw you struggle with more than once.
          </p>
        </div>
        <Link
          href="/study/progress"
          className="rounded-cg border border-line px-4 py-2 text-body transition hover:bg-card-alt"
        >
          Your progress
        </Link>
      </header>

      {/*
        Null means Study Guider did not answer. An empty array means it did and
        there is genuinely nothing to work on - which is good news. Rendering
        the same thing for both would tell a student they are all caught up at
        the exact moment the service is down.
      */}
      {data === null ? (
        <div className="rounded-cg border border-line bg-card-alt px-4 py-3 text-body">
          Your lessons are unavailable right now. This is a connection problem — your
          progress is unaffected.
        </div>
      ) : triggers.length === 0 ? (
        <div className="rounded-cg border border-line bg-card px-4 py-6 text-center">
          <p className="text-ink">Nothing to work on right now.</p>
          <p className="mt-1 text-sm text-muted">
            Keep coding in VS Code. If you repeat the same mistake, a lesson will appear
            here.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {triggers.map((trigger) => (
            <li
              key={trigger.trigger_id}
              className="rounded-cg border border-line bg-card p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-medium text-ink">
                    {trigger.lesson?.title ?? formatConcept(trigger.concept_tag)}
                  </h2>
                  <p className="mt-1 text-sm text-muted">
                    {formatConcept(trigger.concept_tag)}
                    {trigger.error_type ? ` · ${trigger.error_type}` : ''}
                    {trigger.repeat_count ? ` · seen ${trigger.repeat_count} times` : ''}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {trigger.struggle_level && (
                    <span className="rounded-cg bg-warn/10 px-2.5 py-1 text-sm text-warn">
                      {trigger.struggle_level}
                    </span>
                  )}
                  {trigger.intervention_status === 'lesson_opened' && (
                    <span className="rounded-cg bg-accent-soft/50 px-2.5 py-1 text-sm text-accent-strong">
                      lesson opened
                    </span>
                  )}
                </div>
              </div>

              {trigger.reason && (
                <p className="mt-3 text-sm text-body">{trigger.reason}</p>
              )}

              <Link
                href={`/study/${encodeURIComponent(trigger.trigger_id)}/lesson`}
                className="mt-4 inline-flex rounded-cg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-strong"
              >
                Open the lesson
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
