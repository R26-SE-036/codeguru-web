import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  BookOpenCheck,
  Brain,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Crown,
  LineChart,
  Lightbulb,
  Lock,
  Map as MapIcon,
  Repeat2,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

import { formatConcept, formatErrorType } from '@/lib/vocabulary';
import { Badge, Card, EmptyState, SectionTitle, Unavailable, buttonClass } from '@/components/ui';
import { CountUp, Reveal } from '@/components/motion';
import { LegendItem, Ring } from '@/components/charts';
import { ProBadge } from '@/components/pro';

/**
 * Study home: the concepts you keep getting wrong, and a lesson for each.
 *
 * Ported from a single-page app that switched between triggers, lesson, quiz
 * and dashboard on one `phase` state variable. That meant no addressable URLs:
 * a student could not link to a lesson, a refresh dropped them back to the
 * list, and the back button did nothing useful. Those are four real routes now.
 *
 * Each card shows what Code Coach already sends with the recommendation - the
 * lesson's summary, reading time and objectives, and the quiz's length and
 * pass mark - so a student knows what they are signing up for before they
 * open it. The hero adds where they stand on the whole course, from the same
 * learning map the progress page draws.
 *
 * Rendering only; page.tsx fetches.
 */

export interface Trigger {
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
  unique_learning_sessions?: number;
  intervention_status?: string;
  lesson?: {
    lesson_id?: string;
    title?: string;
    summary?: string;
    estimated_duration_minutes?: number;
    learning_objectives?: string[];
  };
  quiz?: { question_count?: number; passing_score_percent?: number };
}

export interface Curriculum {
  total: number;
  counts: { mastered: number; in_progress: number; ready: number; locked: number };
  suggested_next: string | null;
  review_due?: unknown[];
}

const STRUGGLE = {
  high: { tone: 'danger', label: 'High struggle' },
  medium: { tone: 'warn', label: 'Some struggle' },
  low: { tone: 'accent', label: 'Light struggle' },
} as const;

/**
 * `data` is null when Study Guider could not be reached; `curriculum` is null
 * when the learning map could not be loaded, which only costs the hero its
 * ring. `concept` is the raw ?concept= from the URL.
 */
export function StudyView({
  data,
  curriculum,
  concept,
  freeLessons = null,
}: {
  data: { triggers?: Trigger[] } | null;
  curriculum: Curriculum | null;
  concept?: string;
  /** On the Free plan: this month's lessons used and allowed. Null on Pro. */
  freeLessons?: { used: number; limit: number } | null;
}) {
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
  const focus = concept?.trim().toLowerCase();
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

  const next = ordered[0] ?? null;
  const minutes = ordered.reduce((sum, t) => sum + (t.lesson?.estimated_duration_minutes ?? 0), 0);

  return (
    <div className="space-y-10">
      <Hero
        waiting={data === null ? null : ordered.length}
        minutes={minutes}
        next={next}
        curriculum={curriculum}
        freeLessons={freeLessons}
      />

      {/*
        Arrived from the editor for a concept with no lesson waiting. Saying so
        is the whole point: without it the student clicks "Study this concept",
        lands on a list that does not mention it, and reasonably concludes the
        button is broken. It is not - the concept simply has not been repeated
        often enough to earn a lesson yet.
      */}
      {focus && data !== null && !focusMatched && (
        <Reveal>
          <Card className="flex gap-3 border-l-4 border-l-hue-study p-4">
            <Sparkles size={18} strokeWidth={2.2} aria-hidden className="mt-0.5 shrink-0 text-hue-study" />
            <p className="text-sm text-body">
              <span className="font-semibold text-ink">No lesson for {formatConcept(focus)} yet.</span>{' '}
              A concept earns one after the same mistake shows up more than once — keep going and it
              will appear here. Anything already waiting is below.
            </p>
          </Card>
        </Reveal>
      )}

      {/*
        Null means the service did not answer. An empty array means it did and
        there is genuinely nothing to work on - which is good news. Rendering
        the same thing for both would tell a student they are all caught up at
        the exact moment the service is down.
      */}
      <section>
        <Reveal>
          <SectionTitle hint={ordered.length ? 'Most relevant first' : undefined}>
            Your lessons
          </SectionTitle>
        </Reveal>

        {data === null ? (
          <Unavailable what="Your lessons" />
        ) : ordered.length === 0 ? (
          <Reveal>
            <EmptyState icon={BookOpenCheck} title="Nothing to work on right now">
              Keep writing Java in your editor. If the same mistake shows up more than once, a
              lesson for it appears here automatically.
            </EmptyState>
          </Reveal>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {ordered.map((trigger, index) => (
              <Reveal as="li" key={trigger.trigger_id} delay={(index % 2) * 80} className="flex">
                <LessonCard
                  trigger={trigger}
                  first={index === 0}
                  focused={Boolean(focus && trigger.concept_tag?.toLowerCase() === focus)}
                />
              </Reveal>
            ))}
          </ul>
        )}
      </section>

      <HowItWorks />
    </div>
  );
}

/* ── Hero ─────────────────────────────────────────────────────────────────── */

function Hero({
  waiting,
  minutes,
  next,
  curriculum,
  freeLessons,
}: {
  /** null when Study Guider could not be reached. */
  waiting: number | null;
  minutes: number;
  next: Trigger | null;
  curriculum: Curriculum | null;
  freeLessons: { used: number; limit: number } | null;
}) {
  const freeLeft = freeLessons ? Math.max(0, freeLessons.limit - freeLessons.used) : null;
  const reviewDue = curriculum?.review_due?.length ?? 0;

  return (
    <Reveal
      as="section"
      className="relative overflow-hidden rounded-cg-xl border border-line bg-card p-6 shadow-cg-sm sm:p-9"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 -top-28 h-72 w-72 rounded-full bg-hue-study/25 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -right-16 h-72 w-72 rounded-full bg-hue-rose/15 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:radial-gradient(rgb(var(--cg-rgb-border-strong))_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_70%_40%,black,transparent_70%)]"
      />

      <div className="relative grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-hue-study">
            <Sparkles size={14} strokeWidth={2.4} aria-hidden />
            Study
          </p>

          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink sm:text-[2.4rem] sm:leading-tight">
            Lessons built for <span className="cg-gradient-text">your gaps</span>
          </h1>

          <p className="mt-3 max-w-xl text-body">
            A concept lands here once you have got it wrong more than once. Each lesson is written
            for the mistake you actually made, not the topic in general.
          </p>

          {waiting !== null && (
            <ul className="mt-5 flex flex-wrap gap-2">
              <HeroChip icon={BookOpen} tone="text-hue-study">
                <b className="font-semibold text-ink">{waiting}</b> {waiting === 1 ? 'lesson' : 'lessons'} waiting
              </HeroChip>
              {minutes > 0 && (
                <HeroChip icon={Clock3} tone="text-hue-insight">
                  about <b className="font-semibold text-ink">{minutes} min</b> of reading
                </HeroChip>
              )}
              {reviewDue > 0 && (
                <HeroChip icon={Repeat2} tone="text-warn">
                  <b className="font-semibold text-ink">{reviewDue}</b> due for review
                </HeroChip>
              )}
              {freeLeft !== null && (
                <HeroChip icon={Crown} tone="text-warn">
                  <b className="font-semibold text-ink">{freeLeft}</b> of {freeLessons!.limit} free lessons left this month
                  {freeLeft === 0 && (
                    <>
                      {' · '}
                      <Link href="/pro?from=study" className="font-semibold text-accent hover:underline">Go Pro</Link>
                    </>
                  )}
                </HeroChip>
              )}
            </ul>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            {next && (
              <Link
                href={`/study/${encodeURIComponent(next.trigger_id)}/lesson`}
                className={buttonClass({ size: 'lg' })}
              >
                {next.intervention_status === 'lesson_opened' ? 'Continue' : 'Start'}:{' '}
                {formatConcept(next.concept_tag)}
                <ArrowRight size={16} strokeWidth={2.4} aria-hidden />
              </Link>
            )}
            <Link href="/study/progress" className={buttonClass({ variant: 'secondary', size: 'lg' })}>
              <LineChart size={16} strokeWidth={2.2} aria-hidden />
              Your progress
            </Link>
          </div>
        </div>

        {curriculum && curriculum.total > 0 && !freeLessons && <MapSummary curriculum={curriculum} />}
        {freeLessons && (
          <Link
            href="/pro?from=study"
            className="cg-focusable flex w-full max-w-[15rem] flex-col items-center gap-2 rounded-cg-lg border border-hue-play/30 bg-card/80 p-5 text-center backdrop-blur transition hover:border-hue-play/60"
          >
            <span className="grid h-12 w-12 place-items-center rounded-full bg-hue-play/15 text-warn">
              <Lock size={20} strokeWidth={2.3} aria-hidden />
            </span>
            <span className="flex items-center gap-1.5 font-bold text-ink">Learning map <ProBadge /></span>
            <span className="text-xs text-muted">Every concept in the course, and what is due for review.</span>
          </Link>
        )}
      </div>
    </Reveal>
  );
}

function HeroChip({ icon: Icon, tone, children }: { icon: LucideIcon; tone: string; children: React.ReactNode }) {
  return (
    <li className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card/70 px-3 py-1.5 text-sm text-body backdrop-blur">
      <Icon size={15} strokeWidth={2.3} className={tone} aria-hidden />
      <span>{children}</span>
    </li>
  );
}

/**
 * The whole course in one ring: mastered, in progress, ready to start and
 * not yet unlocked. The same four states the learning map on the progress
 * page uses, in the same colours.
 */
function MapSummary({ curriculum }: { curriculum: Curriculum }) {
  const { mastered, in_progress: inProgress, ready, locked } = curriculum.counts;

  return (
    <Link
      href="/study/progress"
      className="cg-focusable group flex flex-col items-center gap-4 rounded-cg-lg border border-line bg-card/70 p-5 backdrop-blur transition duration-200 ease-cg hover:-translate-y-0.5 hover:shadow-cg-md sm:flex-row lg:flex-col"
    >
      <Ring
        size={156}
        thickness={13}
        label={`${mastered} of ${curriculum.total} concepts mastered`}
        segments={[
          { value: mastered, tone: 'text-ok', label: 'Mastered' },
          { value: inProgress, tone: 'text-warn', label: 'In progress' },
          { value: ready, tone: 'text-accent', label: 'Ready' },
          { value: locked, tone: 'text-faint-nontext', label: 'Locked' },
        ]}
      >
        <div>
          <div className="text-3xl font-extrabold tracking-tight text-ink">
            <CountUp value={mastered} />
            <span className="text-lg font-semibold text-muted">/{curriculum.total}</span>
          </div>
          <div className="text-xs font-medium text-muted">mastered</div>
        </div>
      </Ring>

      <div className="grid gap-1.5">
        <LegendItem tone="bg-ok" label="Mastered" value={mastered} />
        <LegendItem tone="bg-warn" label="In progress" value={inProgress} />
        <LegendItem tone="bg-accent" label="Ready" value={ready} />
        <LegendItem tone="bg-faint-nontext" label="Locked" value={locked} />
        <span className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-hue-study">
          <MapIcon size={14} aria-hidden />
          Learning map
          <ArrowRight size={14} aria-hidden className="transition-transform duration-200 ease-cg group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}

/* ── One lesson ──────────────────────────────────────────────────────────── */

function LessonCard({ trigger, first, focused }: { trigger: Trigger; first: boolean; focused: boolean }) {
  const struggle =
    STRUGGLE[(trigger.struggle_level?.toLowerCase() as keyof typeof STRUGGLE) ?? 'low'] ?? null;
  const opened = trigger.intervention_status === 'lesson_opened';
  const lesson = trigger.lesson ?? {};
  const quiz = trigger.quiz ?? {};
  const objectives = (lesson.learning_objectives ?? []).slice(0, 2);

  return (
    <article
      className={`cg-card cg-card-hover relative flex w-full flex-col overflow-hidden p-5 ${
        focused ? 'ring-2 ring-hue-study/50' : ''
      }`}
    >
      {/* A thin band in the study hue along the top, brighter on the lesson
          to do first, so the eye lands there. */}
      <span
        aria-hidden
        className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-hue-study to-hue-rose ${
          first ? 'opacity-100' : 'opacity-40'
        }`}
      />

      <div className="flex items-start justify-between gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-cg bg-hue-study/10 text-hue-study">
          <Sparkles size={19} strokeWidth={2.1} aria-hidden />
        </span>

        <div className="flex flex-wrap justify-end gap-1.5">
          {first && <Badge tone="accent">Up next</Badge>}
          {struggle && <Badge tone={struggle.tone}>{struggle.label}</Badge>}
          {opened && <Badge tone="neutral">Opened</Badge>}
        </div>
      </div>

      <h3 className="mt-4 text-base font-bold text-ink">
        {lesson.title ?? formatConcept(trigger.concept_tag)}
      </h3>

      <p className="mt-1 text-sm text-muted">
        <span className="font-medium capitalize text-body">{formatConcept(trigger.concept_tag)}</span>
        {trigger.error_type && <> · {formatErrorType(trigger.error_type)}</>}
      </p>

      {lesson.summary && <p className="mt-3 line-clamp-2 text-sm text-body">{lesson.summary}</p>}

      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
        {lesson.estimated_duration_minutes ? (
          <Meta icon={Clock3}>{lesson.estimated_duration_minutes} min read</Meta>
        ) : null}
        {quiz.question_count ? (
          <Meta icon={ClipboardCheck}>
            {quiz.question_count}-question quiz
            {quiz.passing_score_percent ? ` · pass ${quiz.passing_score_percent}%` : ''}
          </Meta>
        ) : null}
        {trigger.repeat_count ? (
          <Meta icon={Repeat2}>
            Seen {trigger.repeat_count}×
            {trigger.unique_learning_sessions && trigger.unique_learning_sessions > 1
              ? ` in ${trigger.unique_learning_sessions} sessions`
              : ''}
          </Meta>
        ) : null}
      </ul>

      {objectives.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {objectives.map((objective) => (
            <li key={objective} className="flex gap-2 text-sm text-body">
              <CheckCircle2 size={15} aria-hidden className="mt-0.5 shrink-0 text-ok" />
              <span>{objective}</span>
            </li>
          ))}
        </ul>
      )}

      {trigger.rationale && (
        <p className="mt-4 flex gap-2 rounded-cg bg-card-alt px-3 py-2.5 text-sm text-body">
          <Lightbulb size={15} aria-hidden className="mt-0.5 shrink-0 text-hue-play" />
          <span>{trigger.rationale}</span>
        </p>
      )}

      {/* Where this lesson is in its own loop: read, then quiz. */}
      <ol className="mt-5 flex items-center gap-2 text-xs font-medium" aria-label="Lesson progress">
        <Step done={opened} label="Read the lesson" />
        <span aria-hidden className="h-px flex-1 bg-line" />
        <Step done={false} label="Pass the quiz" />
      </ol>

      <div className="mt-4 flex flex-1 items-end">
        <Link
          href={`/study/${encodeURIComponent(trigger.trigger_id)}/lesson`}
          className={buttonClass({ variant: first ? 'primary' : 'secondary', className: 'w-full' })}
        >
          {opened ? 'Continue the lesson' : 'Open the lesson'}
          <ArrowRight size={16} strokeWidth={2.4} aria-hidden />
        </Link>
      </div>
    </article>
  );
}

function Meta({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <li className="inline-flex items-center gap-1.5">
      <Icon size={13} aria-hidden />
      {children}
    </li>
  );
}

function Step({ done, label }: { done: boolean; label: string }) {
  return (
    <li className={`inline-flex items-center gap-1.5 ${done ? 'text-ok' : 'text-muted'}`}>
      {done ? (
        <CheckCircle2 size={14} aria-hidden />
      ) : (
        <span aria-hidden className="h-3.5 w-3.5 rounded-full border-2 border-line-strong" />
      )}
      {label}
      <span className="sr-only">{done ? '(done)' : '(not yet)'}</span>
    </li>
  );
}

/* ── How it works ────────────────────────────────────────────────────────────
   The loop each card above runs through, said once rather than on every card.
   On a quiet day, with nothing waiting, this is also what explains the page. */

const STEPS = [
  {
    icon: BookOpen,
    title: 'Read a short lesson',
    body: 'Built around the code you wrote, with the idea behind your mistake.',
    tone: 'text-hue-study',
    bg: 'bg-hue-study/10',
  },
  {
    icon: ClipboardCheck,
    title: 'Take its quiz',
    body: 'A few questions on that idea. 70% is a pass.',
    tone: 'text-hue-insight',
    bg: 'bg-hue-insight/10',
  },
  {
    icon: Brain,
    title: 'Watch it stick',
    body: 'Knowledge tracing updates what you know, and the lesson leaves this list.',
    tone: 'text-ok',
    bg: 'bg-ok/10',
  },
];

function HowItWorks() {
  return (
    <section>
      <Reveal>
        <SectionTitle>How a lesson works</SectionTitle>
      </Reveal>
      <ol className="grid gap-4 md:grid-cols-3">
        {STEPS.map((step, index) => {
          const Icon = step.icon;

          return (
            <Reveal as="li" key={step.title} delay={index * 80}>
              <Card className="relative h-full p-5">
                <span className="absolute right-5 top-5 font-mono text-xs font-semibold text-muted">
                  0{index + 1}
                </span>
                <span className={`grid h-10 w-10 place-items-center rounded-cg ${step.bg} ${step.tone}`}>
                  <Icon size={19} strokeWidth={2.2} aria-hidden />
                </span>
                <h3 className="mt-4 font-semibold text-ink">{step.title}</h3>
                <p className="mt-1 text-sm text-body">{step.body}</p>
              </Card>
            </Reveal>
          );
        })}
      </ol>
    </section>
  );
}
