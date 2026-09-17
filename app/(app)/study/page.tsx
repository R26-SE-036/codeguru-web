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
  /**
   * Why this lesson. Study Guider sends it as `rationale`. This read `reason`,
   * which that response has never contained, so the explanation under every
   * card was silently never rendered.
   */
  rationale?: string;
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

export default async function StudyPage({
  searchParams,
}: {
  searchParams: Promise<{ concept?: string }>;
}) {
  const session = await getSession();
  const [data, params] = await Promise.all([
    serverFetch<{ triggers?: Trigger[] }>('study', '/remediation/triggers', session),
    searchParams,
  ]);

  const triggers = data?.triggers ?? [];

  /*
   * ?concept= arrives from the editor extension's "Study this concept" button.
   *
   * It carries a concept tag rather than a trigger id, because the extension
   * does not have one: triggers are raised by Code Coach on its own schedule,
   * from repeat counts the editor never sees, so a diagnostic on screen may
   * have no trigger behind it yet.
   *
   * So the tag is used to REORDER, never to filter. Filtering would show an
   * empty page to a student who clicked through for a concept that has not
   * escalated yet, which reads as "your lesson is gone" rather than "there is
   * no lesson for that one".
   */
  const focus = params.concept?.trim().toLowerCase();
  const ordered = focus
    ? [...triggers].sort((a, b) => {
        const aMatch = a.concept_tag?.toLowerCase() === focus ? 0 : 1;
        const bMatch = b.concept_tag?.toLowerCase() === focus ? 0 : 1;
        return aMatch - bMatch;
      })
    : triggers;

  const focusMatched = focus
    ? triggers.some((t) => t.concept_tag?.toLowerCase() === focus)
    : false;

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
        Arrived from the editor for a concept with no lesson waiting. Saying so
        is the whole point: without it the student clicks "Study this concept",
        lands on a list that does not mention it, and reasonably concludes the
        button is broken. It is not - the concept simply has not been repeated
        often enough to earn a lesson yet.
      */}
      {focus && data !== null && !focusMatched && (
        <Card className="flex gap-3 border-l-4 border-l-hue-study p-4">
          <Sparkles
            size={18}
            strokeWidth={2.2}
            aria-hidden
            className="mt-0.5 shrink-0 text-hue-study"
          />
          <p className="text-sm text-body">
            <span className="font-semibold text-ink">
              No lesson for {formatConcept(focus)} yet.
            </span>{' '}
            A concept earns one after the same mistake shows up more than once —
            keep going and it will appear here. Anything already waiting is below.
          </p>
        </Card>
      )}

      {/*
        Null means the service did not answer. An empty array means it did and
        there is genuinely nothing to work on - which is good news. Rendering
        the same thing for both would tell a student they are all caught up at
        the exact moment the service is down.
      */}
      {data === null ? (
        <Unavailable what="Your lessons" />
      ) : ordered.length === 0 ? (
        <EmptyState icon={BookOpenCheck} title="Nothing to work on right now">
          Keep writing Java in your editor. If the same mistake shows up more than
          once, a lesson for it appears here automatically.
        </EmptyState>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {ordered.map((trigger) => {
            const tone =
              STRUGGLE_TONE[
                (trigger.struggle_level?.toLowerCase() as keyof typeof STRUGGLE_TONE) ??
                  'low'
              ] ?? 'accent';

            const isFocused = Boolean(
              focus && trigger.concept_tag?.toLowerCase() === focus,
            );

            return (
              <li
                key={trigger.trigger_id}
                className={`cg-card cg-card-hover flex flex-col p-5 ${
                  isFocused ? 'ring-2 ring-hue-study/50' : ''
                }`}
              >
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

                {trigger.rationale && (
                  <p className="mt-3 rounded-cg bg-card-alt px-3 py-2.5 text-sm text-body">
                    {trigger.rationale}
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
