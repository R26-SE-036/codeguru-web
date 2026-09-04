import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BookOpenCheck, LineChart, Repeat2, Sparkles } from 'lucide-react';

import { getSession, serverFetch } from '@/lib/server-api';
import { formatConcept } from '@/lib/vocabulary';
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Unavailable,
  buttonClass,
} from '@/components/ui';

export const metadata: Metadata = { title: 'Study' };

/**
 * Study home: the concepts you keep getting wrong.
 *
 * Ported from a single-page app that switched between triggers, lesson, quiz
 * and dashboard on one `phase` state variable. That meant no addressable URLs:
 * a student could not link to a lesson, a refresh dropped them back to the
 * list, and the back button did nothing useful. Those are four real routes now.
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

const STRUGGLE_TONE = {
  high: 'danger',
  medium: 'warn',
  low: 'accent',
} as const;

export default async function StudyPage() {
  const session = await getSession();
  const data = await serverFetch<{ triggers?: Trigger[] }>(
    'study',
    '/remediation/triggers',
    session,
  );

  const triggers = data?.triggers ?? [];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Study"
        title="Lessons built for your gaps"
        lead="A concept lands here once you have got it wrong more than once. Each lesson is written for the mistake you actually made, not the topic in general."
        icon={Sparkles}
        tone="text-hue-study"
        toneBg="bg-hue-study/10"
        actions={
          <Link
            href="/study/progress"
            className={buttonClass({ variant: 'secondary' })}
          >
            <LineChart size={16} strokeWidth={2.2} aria-hidden />
            Your progress
          </Link>
        }
      />

      {/*
        Null means the service did not answer. An empty array means it did and
        there is genuinely nothing to work on - which is good news. Rendering
        the same thing for both would tell a student they are all caught up at
        the exact moment the service is down.
      */}
      {data === null ? (
        <Unavailable what="Your lessons" />
      ) : triggers.length === 0 ? (
        <EmptyState icon={BookOpenCheck} title="Nothing to work on right now">
          Keep writing Java in your editor. If the same mistake shows up more than
          once, a lesson for it appears here automatically.
        </EmptyState>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {triggers.map((trigger) => {
            const tone =
              STRUGGLE_TONE[
                (trigger.struggle_level?.toLowerCase() as keyof typeof STRUGGLE_TONE) ??
                  'low'
              ] ?? 'accent';

            return (
              <li key={trigger.trigger_id} className="cg-card cg-card-hover flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-cg bg-hue-study/10 text-hue-study">
                    <Sparkles size={19} strokeWidth={2.1} aria-hidden />
                  </span>

                  <div className="flex flex-wrap justify-end gap-1.5">
                    {trigger.struggle_level && (
                      <Badge tone={tone}>{trigger.struggle_level} struggle</Badge>
                    )}
                    {trigger.intervention_status === 'lesson_opened' && (
                      <Badge tone="neutral">Opened</Badge>
                    )}
                  </div>
                </div>

                <h2 className="mt-4 text-base font-bold text-ink">
                  {trigger.lesson?.title ?? formatConcept(trigger.concept_tag)}
                </h2>

                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                  <span className="font-medium text-body">
                    {formatConcept(trigger.concept_tag)}
                  </span>
                  {trigger.error_type && (
                    <>
                      <Dot />
                      <span className="font-mono text-xs">{trigger.error_type}</span>
                    </>
                  )}
                  {trigger.repeat_count ? (
                    <>
                      <Dot />
                      <span className="inline-flex items-center gap-1">
                        <Repeat2 size={13} aria-hidden />
                        {trigger.repeat_count}×
                      </span>
                    </>
                  ) : null}
                </p>

                {trigger.reason && (
                  <p className="mt-3 rounded-cg bg-card-alt px-3 py-2.5 text-sm text-body">
                    {trigger.reason}
                  </p>
                )}

                <Link
                  href={`/study/${encodeURIComponent(trigger.trigger_id)}/lesson`}
                  className={buttonClass({ className: 'mt-5 w-full' })}
                >
                  Open the lesson
                  <ArrowRight size={16} strokeWidth={2.4} aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Dot() {
  return (
    <span aria-hidden className="h-1 w-1 rounded-full bg-faint-nontext" />
  );
}
