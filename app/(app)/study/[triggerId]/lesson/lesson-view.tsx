'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  ArrowLeft,
  BookOpen,
  Brain,
  ExternalLink,
  GitBranch,
  Lightbulb,
  Check,
  ListChecks,
  PlayCircle,
  TriangleAlert,
  X,
} from 'lucide-react';

import { ApiError, api } from '@/lib/api';
import { formatConcept } from '@/lib/vocabulary';
import { Badge, Card, buttonClass } from '@/components/ui';

// Mermaid renders its own SVG in the browser and touches `document` on import,
// so it cannot run during SSR. Loaded only on the client, and only when a
// lesson actually has a diagram.
const MermaidDiagram = dynamic(() => import('./mermaid-diagram'), { ssr: false });

/**
 * One half of the before/after example.
 *
 * Colour is not the only signal. The heading says "Don't do this" / "Do this
 * instead" in words, each panel carries an icon, and the two are separated by a
 * rule - so the distinction survives a colour-blind reader, a greyscale print,
 * and the single-column layout on a phone where the panels stack rather than
 * sit side by side.
 *
 * The tint is deliberately faint. A saturated red block behind monospace text
 * is harder to read than the code it is meant to be highlighting, which was the
 * original complaint about this section.
 */
function CodePanel({
  tone,
  label,
  caption,
  code,
}: {
  tone: 'bad' | 'good';
  label: string;
  caption: string;
  code: string;
}) {
  const bad = tone === 'bad';
  const Icon = bad ? X : Check;

  return (
    <section className={bad ? 'bg-danger/[0.06]' : 'bg-ok/[0.06]'}>
      <header
        className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold ${
          bad ? 'text-danger' : 'text-ok'
        }`}
      >
        <span
          aria-hidden
          className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${
            bad ? 'bg-danger/15' : 'bg-ok/15'
          }`}
        >
          <Icon size={12} strokeWidth={3} />
        </span>
        {label}
        <span className="ml-auto font-sans text-xs font-normal text-muted">{caption}</span>
      </header>

      <pre
        className={`overflow-x-auto border-t px-5 pb-5 pt-4 font-mono text-[13px] leading-relaxed text-ink ${
          bad ? 'border-danger/15' : 'border-ok/15'
        }`}
      >
        {code}
      </pre>
    </section>
  );
}

/**
 * The lesson is GENERATED, not fetched: POST /api/struggle/detect runs the
 * cognitive-state model and the retrieval step. That is why this is a client
 * component with a real loading state - it is a language-model call, not a
 * lookup.
 *
 * The trigger is re-fetched by id rather than handed over in route state, which
 * is what makes this URL addressable: a refresh, a bookmark or a back-button
 * press all still work. The original could not do that - everything lived in
 * one component's useState.
 */

interface Trigger {
  trigger_id: string;
  learning_session_id?: string;
  concept_tag: string;
  error_type?: string;
  repeat_count?: number;
  lesson?: { lesson_id?: string; title?: string };
}

interface LessonContent {
  issue?: string;
  explanation?: string;
  hint?: string;
  /** The broken code on its own. Preferred over `exampleCode`. */
  incorrectCode?: string;
  /** The same code, fixed. */
  correctCode?: string;
  /**
   * The pre-2026-09 shape: one blob with the broken version commented out.
   * Still read so a lesson cached before the split renders, and so a blob the
   * backend could not divide is shown rather than dropped.
   */
  exampleCode?: string;
  videoUrl?: string;
  referenceLink?: string;
  mermaidDiagram?: string;
  /**
   * What the lesson was written with. `syllabus_notes` is found, none_found,
   * unavailable or unknown (cached before this was recorded); `student_record`
   * is read, unavailable, no_concept or unknown.
   */
  grounding?: { syllabus_notes?: string; student_record?: string };
}

/**
 * A sentence when the lesson was written without the course notes or without
 * the student's record, and null when it was not.
 *
 * Without this a lesson written while the study graph was unreachable looked
 * exactly like a grounded, personalised one. The lesson text itself cannot be
 * trusted to say so, and "unknown" (an older cached lesson) says nothing
 * either way, so it gets no notice.
 */
function groundingNotice(grounding: LessonContent['grounding']): string | null {
  const notes = grounding?.syllabus_notes;
  const recordUnreadable = grounding?.student_record === 'unavailable';

  if (notes === 'unavailable' && recordUnreadable) {
    return "Study Guider couldn't reach your course notes or your progress record, so this lesson is written from general Java knowledge and doesn't know what you've already practised.";
  }
  if (notes === 'unavailable') {
    return "Study Guider couldn't reach your course notes, so this lesson is written from general Java knowledge rather than from the course material.";
  }
  if (notes === 'none_found' && recordUnreadable) {
    return "There are no course notes on this exact mistake and your progress record couldn't be read, so this lesson is written from general Java knowledge and doesn't know what you've already practised.";
  }
  if (notes === 'none_found') {
    return 'There are no course notes on this exact mistake, so this lesson is written from general Java knowledge.';
  }
  if (recordUnreadable) {
    return "Study Guider couldn't read your progress record, so this lesson doesn't know what you've already practised.";
  }
  return null;
}

export function LessonView({ triggerId }: { triggerId: string }) {
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [lesson, setLesson] = useState<LessonContent | null>(null);
  const [title, setTitle] = useState('Working through this concept');
  const [exampleIsGeneric, setExampleIsGeneric] = useState(false);
  const [cognitiveState, setCognitiveState] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;

    (async () => {
      try {
        const data = await api.get<{ triggers?: Trigger[] }>('study', '/remediation/triggers');
        const found = data.triggers?.find((t) => t.trigger_id === triggerId) ?? null;

        if (!live) return;

        if (!found) {
          setError('That lesson is no longer on your list — you may have already finished it.');
          setLoading(false);
          return;
        }

        setTrigger(found);

        const built = await api.post<{
          lesson_title?: string;
          lesson_content?: LessonContent;
          cognitive_state?: string;
          example_is_generic?: boolean;
        }>('study', '/struggle/detect', {
          trigger_id: found.trigger_id,
          learning_session_id: found.learning_session_id,
          error_type: found.error_type,
          concept_tag: found.concept_tag,
          // The real count behind the trigger.
          error_count: found.repeat_count ?? 3,
        });

        if (!live) return;

        if (!built.lesson_content) {
          setError('Code Guru did not consider this a struggle worth a lesson.');
          setLoading(false);
          return;
        }

        setLesson(built.lesson_content);
        setTitle(built.lesson_title ?? found.lesson?.title ?? 'Working through this concept');
        setExampleIsGeneric(Boolean(built.example_is_generic));
        setCognitiveState(built.cognitive_state ?? null);
        setLoading(false);

        // Moves the trigger off `pending` so the student is not nagged about
        // the same concept while working through it. Deliberately not blocking:
        // a lesson that built fine is still shown if the bookkeeping fails.
        api
          .post('study', `/remediation/triggers/${found.trigger_id}/lesson-opened`, {
            lesson_id: found.lesson?.lesson_id ?? 'lesson_general_01',
          })
          .catch((err) => console.warn('Could not report lesson-opened:', err));
      } catch (err) {
        if (!live) return;
        setError(
          err instanceof ApiError && err.isUnavailable
            ? 'Lessons are unavailable right now. Please try again shortly.'
            : err instanceof ApiError
              ? err.message
              : 'Could not build the lesson.',
        );
        setLoading(false);
      }
    })();

    return () => {
      live = false;
    };
  }, [triggerId]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card className="flex flex-col items-center px-6 py-16 text-center">
          <span className="relative grid h-14 w-14 place-items-center rounded-cg-lg bg-hue-study/10 text-hue-study">
            <span
              aria-hidden
              className="absolute inset-0 animate-ping rounded-cg-lg bg-hue-study/20"
            />
            <Brain size={26} strokeWidth={2} aria-hidden />
          </span>

          <h1 className="mt-5 text-lg font-bold text-ink">
            Writing a lesson for this mistake
          </h1>
          <p className="mt-2 max-w-sm text-sm text-body">
            It is generated for your specific error rather than pulled off a shelf,
            so it takes a few seconds.
          </p>

          {/* Bars sized like the paragraphs they stand in for, so the page does
              not visibly resize when the real content lands. */}
          <div className="mt-8 w-full max-w-md space-y-2.5" aria-hidden>
            <div className="cg-skeleton h-3 w-full" />
            <div className="cg-skeleton h-3 w-11/12" />
            <div className="cg-skeleton h-3 w-4/5" />
          </div>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card className="px-6 py-12 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-cg-lg bg-danger/10 text-danger">
            <TriangleAlert size={22} strokeWidth={2} aria-hidden />
          </span>
          <h1 className="mt-4 text-lg font-bold text-ink">No lesson to show</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-body">{error}</p>
          <Link
            href="/study"
            className={buttonClass({ variant: 'secondary', className: 'mt-6' })}
          >
            <ArrowLeft size={16} strokeWidth={2.2} aria-hidden />
            Back to your lessons
          </Link>
        </Card>
      </div>
    );
  }

  // Both halves, or neither. One without the other is not a comparison, and
  // showing a lone "Don't do this" block with no fix beside it would be worse
  // than the single blob it replaced.
  const hasSplitExample = Boolean(lesson?.incorrectCode && lesson?.correctCode);

  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/study"
        className="cg-focusable inline-flex items-center gap-1.5 rounded text-sm font-semibold text-muted transition hover:text-ink"
      >
        <ArrowLeft size={15} strokeWidth={2.4} aria-hidden />
        Your lessons
      </Link>

      <header className="rounded-cg-xl border border-line bg-card p-6 shadow-cg-sm sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="accent">
            <BookOpen size={13} strokeWidth={2.4} aria-hidden />
            {formatConcept(trigger?.concept_tag)}
          </Badge>

          {/* The predicted state is shown because it changed how the lesson was
              written - a student reading a very simple explanation deserves to
              know why it is pitched that way. */}
          {cognitiveState && (
            <Badge tone="neutral">
              <Brain size={13} strokeWidth={2.4} aria-hidden />
              {cognitiveState}
            </Badge>
          )}

          {trigger?.repeat_count ? (
            <Badge tone="warn">seen {trigger.repeat_count}×</Badge>
          ) : null}
        </div>

        <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
          {title}
        </h1>
      </header>

      {groundingNotice(lesson?.grounding) && (
        <p
          role="status"
          className="rounded-cg border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-body"
        >
          {groundingNotice(lesson?.grounding)}
        </p>
      )}

      {lesson?.issue && (
        <Card className="flex gap-4 border-l-4 border-l-warn p-5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-cg bg-warn/10 text-warn">
            <TriangleAlert size={18} strokeWidth={2.2} aria-hidden />
          </span>
          <div>
            <h2 className="font-bold text-ink">What goes wrong</h2>
            <p className="mt-1 text-body">{lesson.issue}</p>
          </div>
        </Card>
      )}

      {lesson?.explanation && (
        <Card className="p-6 sm:p-7">
          <h2 className="flex items-center gap-2 font-bold text-ink">
            <Lightbulb size={17} strokeWidth={2.2} aria-hidden className="text-hue-study" />
            Why it happens
          </h2>
          <p className="mt-3 whitespace-pre-line leading-relaxed text-body">
            {lesson.explanation}
          </p>
        </Card>
      )}

{/* ── The example ──────────────────────────────────────────────────────
          Two blocks, labelled and colour-coded, rather than one grey block with
          the broken version commented out.

          The old rendering styled the mistake as a comment - the part the
          student most needs to look at was the part greyed out, and nothing
          said which half was which. The backend now returns the two separately;
          `exampleCode` is the fallback for a lesson cached before that change
          which could not be split. */}
      {(hasSplitExample || lesson?.exampleCode) && (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
            <h2 className="font-bold text-ink">Example</h2>
            {/*
              Labelled as an example, always. Only a hash of the code around a
              diagnostic is stored, never the source, so this snippet is an
              illustration of the mistake - not the student's own code.
              Implying otherwise would be a claim the platform cannot support.
            */}
            <span className="text-xs text-muted">
              {exampleIsGeneric
                ? 'A general illustration, not your code'
                : 'An illustration. Your own code is never stored'}
            </span>
          </div>

          {hasSplitExample ? (
            <div className="grid gap-px bg-line md:grid-cols-2">
              <CodePanel
                tone="bad"
                label="Don't do this"
                caption="The mistake"
                code={lesson!.incorrectCode!}
              />
              <CodePanel
                tone="good"
                label="Do this instead"
                caption="The fix"
                code={lesson!.correctCode!}
              />
            </div>
          ) : (
            <pre className="overflow-x-auto bg-inset p-5 font-mono text-sm leading-relaxed text-ink">
              {lesson?.exampleCode}
            </pre>
          )}
        </Card>
      )}

      {lesson?.mermaidDiagram && (
        <Card className="p-6">
          <h2 className="flex items-center gap-2 font-bold text-ink">
            <GitBranch size={17} strokeWidth={2.2} aria-hidden className="text-hue-pair" />
            How it flows
          </h2>
          <div className="mt-4 overflow-x-auto">
            <MermaidDiagram chart={lesson.mermaidDiagram} />
          </div>
        </Card>
      )}

      {lesson?.hint && (
        <Card className="flex gap-4 border-l-4 border-l-accent p-5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-cg bg-accent/10 text-accent">
            <Lightbulb size={18} strokeWidth={2.2} aria-hidden />
          </span>
          <div>
            <h2 className="font-bold text-ink">Try this</h2>
            <p className="mt-1 text-body">{lesson.hint}</p>
          </div>
        </Card>
      )}

      {(lesson?.referenceLink || lesson?.videoUrl) && (
        <div className="flex flex-wrap gap-3">
          {lesson.referenceLink && (
            <a
              href={lesson.referenceLink}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass({ variant: 'secondary', size: 'sm' })}
            >
              <ExternalLink size={14} strokeWidth={2.2} aria-hidden />
              Read more
            </a>
          )}
          {lesson.videoUrl && (
            <a
              href={lesson.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass({ variant: 'secondary', size: 'sm' })}
            >
              <PlayCircle size={14} strokeWidth={2.2} aria-hidden />
              Watch a walkthrough
            </a>
          )}
        </div>
      )}

      <footer className="flex flex-wrap gap-3 border-t border-line pt-6">
        <Link
          href={`/study/${encodeURIComponent(triggerId)}/quiz`}
          className={buttonClass({ size: 'lg' })}
        >
          <ListChecks size={17} strokeWidth={2.3} aria-hidden />
          Take the quiz
        </Link>
        <Link href="/study" className={buttonClass({ variant: 'secondary', size: 'lg' })}>
          Back to your lessons
        </Link>
      </footer>
    </article>
  );
}
