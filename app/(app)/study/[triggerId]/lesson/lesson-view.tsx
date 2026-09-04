'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ApiError, api } from '@/lib/api';
import { formatConcept } from '@/lib/vocabulary';

// Mermaid renders its own SVG in the browser and touches `document` on import,
// so it cannot run during SSR. Loaded only on the client, and only when a
// lesson actually has a diagram.
const MermaidDiagram = dynamic(() => import('./mermaid-diagram'), { ssr: false });

/**
 * Ported from Study-Guider MicroLesson.jsx plus the lesson-building half of
 * App.jsx.
 *
 * The lesson is GENERATED, not fetched: POST /api/struggle/detect runs the
 * cognitive-state model and the RAG pipeline. That is why this is a client
 * component with a real loading state - it is an LLM call, not a lookup.
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
  exampleCode?: string;
  videoUrl?: string;
  referenceLink?: string;
  mermaidDiagram?: string;
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
          // The real count behind the trigger, from Code Coach.
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
            ? 'Study Guider is unavailable right now. Please try again shortly.'
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
        <p className="text-muted">Building a lesson for this concept…</p>
        <p className="mt-1 text-sm text-muted">
          This runs a model and a retrieval step, so it takes a moment.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <p className="rounded-cg bg-danger-soft px-4 py-3 text-danger">{error}</p>
        <Link href="/study" className="inline-flex text-accent hover:underline">
          Back to your lessons
        </Link>
      </div>
    );
  }

  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="text-sm text-muted">
          {formatConcept(trigger?.concept_tag)}
          {cognitiveState ? ` · ${cognitiveState}` : ''}
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-ink">{title}</h1>
      </header>

      {lesson?.issue && (
        <section className="rounded-cg border-l-4 border-warn bg-warn/10 px-4 py-3">
          <h2 className="font-medium text-ink">What goes wrong</h2>
          <p className="mt-1 text-body">{lesson.issue}</p>
        </section>
      )}

      {lesson?.explanation && (
        <section>
          <h2 className="mb-2 font-medium text-ink">Why</h2>
          <p className="whitespace-pre-line text-body">{lesson.explanation}</p>
        </section>
      )}

      {lesson?.exampleCode && (
        <section>
          <h2 className="mb-2 font-medium text-ink">Example</h2>
          {/*
            Labelled as an example, always. Code Coach stores only a hash of the
            code around a diagnostic and never the source, so this snippet is an
            illustration of the mistake - not the student's own code. Implying
            otherwise would be a claim the platform cannot support.
          */}
          <p className="mb-2 text-sm text-muted">
            {exampleIsGeneric
              ? 'A general illustration of this mistake, not your code.'
              : 'An illustration of this mistake. Your own code is never stored.'}
          </p>
          <pre className="overflow-x-auto rounded-cg bg-inset p-4 font-mono text-sm text-ink">
            {lesson.exampleCode}
          </pre>
        </section>
      )}

      {lesson?.mermaidDiagram && (
        <section>
          <h2 className="mb-2 font-medium text-ink">How it flows</h2>
          <MermaidDiagram chart={lesson.mermaidDiagram} />
        </section>
      )}

      {lesson?.hint && (
        <section className="rounded-cg border border-line bg-card px-4 py-3">
          <h2 className="font-medium text-ink">Hint</h2>
          <p className="mt-1 text-body">{lesson.hint}</p>
        </section>
      )}

      {(lesson?.referenceLink || lesson?.videoUrl) && (
        <section className="flex flex-wrap gap-4 text-sm">
          {lesson.referenceLink && (
            <a
              href={lesson.referenceLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              Read more
            </a>
          )}
          {lesson.videoUrl && (
            <a
              href={lesson.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              Watch a walkthrough
            </a>
          )}
        </section>
      )}

      <footer className="flex flex-wrap gap-3 border-t border-line pt-6">
        <Link
          href={`/study/${encodeURIComponent(triggerId)}/quiz`}
          className="rounded-cg bg-accent px-5 py-2.5 font-medium text-white transition hover:bg-accent-strong"
        >
          Take the quiz
        </Link>
        <Link
          href="/study"
          className="rounded-cg border border-line px-5 py-2.5 text-body transition hover:bg-card-alt"
        >
          Back to your lessons
        </Link>
      </footer>
    </article>
  );
}
