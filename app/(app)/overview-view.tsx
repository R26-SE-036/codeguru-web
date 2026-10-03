import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  Bug,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Compass,
  Flame,
  Gamepad2,
  Lightbulb,
  MessageCircle,
  Radar,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react';

import { SECTIONS } from '@/lib/nav';
import { componentTone, formatComponent, formatConcept, humaniseSummary } from '@/lib/vocabulary';
import { relativeTime } from '@/lib/time';
import { Badge, Card, EmptyState, SectionTitle, Unavailable, buttonClass } from '@/components/ui';
import { CountUp, Reveal } from '@/components/motion';
import { FillBar, LegendItem, Ring } from '@/components/charts';
import { GettingStarted } from '@/components/getting-started';

/**
 * Overview: the whole platform, as it sees this one student.
 *
 * Laid out as the learning loop the platform is built around - the editor
 * spots a mistake, a lesson teaches it, a game practises it, a partner works
 * through it with you - so the page explains the product while it reports on
 * it. Everything comes from one Code Coach call (fetched in page.tsx), which
 * already counts across all four components and is cached for a minute on its
 * side.
 *
 * Rendering only, kept apart from the fetch the way pair-view.tsx and the
 * study views are, so it can be rendered from any summary - including a
 * fixture, when there is no signed-in student to fetch for.
 */

interface Counts {
  total_diagnostics?: number;
  active_diagnostics?: number;
  resolved_diagnostics?: number;
  total_hint_events?: number;
  active_remediation_triggers?: number;
  completed_remediation_triggers?: number;
  total_game_sessions?: number;
  total_pair_sessions?: number;
  total_peer_reviews?: number;
  total_lessons_viewed?: number;
  total_quizzes_completed?: number;
}

interface MasterySummary {
  total_concepts?: number;
  strong_count?: number;
  developing_count?: number;
  at_risk_count?: number;
}

interface ConceptTrend {
  concept_tag: string;
  repeat_count?: number;
  active_count?: number;
  struggle_level?: string | null;
  mastery_level?: string | null;
  mastery_score?: number | null;
  hint_dependency_level?: string | null;
  last_activity_at?: string;
  recommended_focus?: string;
}

interface TimelineEvent {
  event_id: string;
  component: string;
  event_type?: string;
  title: string;
  summary?: string;
  concept_tag?: string | null;
  occurred_at: string;
}

export interface Overview {
  counts?: Counts;
  mastery?: MasterySummary;
  concept_trends?: ConceptTrend[];
  recent_timeline?: TimelineEvent[];
}

/** `overview` is null when Code Coach could not be reached - not when it is empty. */
export function OverviewView({ firstName, overview }: { firstName: string; overview: Overview | null }) {
  const counts = overview?.counts ?? {};
  const waiting = counts.active_remediation_triggers ?? 0;

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
    (counts.total_diagnostics ?? 0) === 0 &&
    waiting === 0 &&
    (counts.total_game_sessions ?? 0) === 0 &&
    (counts.total_pair_sessions ?? 0) === 0 &&
    (overview.recent_timeline?.length ?? 0) === 0;

  if (isNewAccount) {
    return (
      <div className="space-y-8">
        <Hero name={firstName} overview={overview} newAccount />
        <Reveal>
          <GettingStarted />
        </Reveal>
      </div>
    );
  }

  if (overview === null) {
    return (
      <div className="space-y-8">
        <Hero name={firstName} overview={null} />
        <Unavailable what="Your summary" />
        <JumpIn />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <Hero name={firstName} overview={overview} />
      <LearningLoop counts={counts} />

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="lg:col-span-3">
          <FocusNext trends={overview.concept_trends ?? []} />
        </section>
        <section className="lg:col-span-2">
          <ActivityFeed events={overview.recent_timeline ?? []} />
        </section>
      </div>
    </div>
  );
}

/* ── Hero ─────────────────────────────────────────────────────────────────── */

function Hero({
  name,
  overview,
  newAccount = false,
}: {
  name: string;
  overview: Overview | null;
  newAccount?: boolean;
}) {
  const counts = overview?.counts ?? {};
  const waiting = counts.active_remediation_triggers ?? 0;
  const open = counts.active_diagnostics ?? 0;
  const fixed = counts.resolved_diagnostics ?? 0;
  const lessonsDone = counts.completed_remediation_triggers ?? 0;
  const strong = overview?.mastery?.strong_count ?? 0;

  const message = newAccount
    ? // Deliberately not "you are all caught up". Nothing has happened yet,
      // and saying so is the difference between a student setting the
      // platform up and one concluding it does not work.
      'Nothing has happened on your account yet. Here is how to get the platform watching your code.'
    : overview === null
      ? 'We could not reach your summary just now, so the numbers are missing rather than zero.'
      : waiting > 0
        ? `You have ${waiting} ${waiting === 1 ? 'lesson' : 'lessons'} waiting, built from the mistakes you have been repeating.`
        : open > 0
          ? `${open} ${open === 1 ? 'issue is' : 'issues are'} still open in your code, and you have fixed ${fixed} so far. Keep going.`
          : 'Nothing is waiting for you right now. Write some Java and anything worth working on will show up here.';

  // One clear next step, picked in the order the loop runs.
  const primary =
    waiting > 0
      ? { href: '/study', label: 'Start your next lesson' }
      : open > 0
        ? { href: '/insights', label: 'See what to fix' }
        : { href: '/play', label: 'Play a practice round' };
  const secondary =
    primary.href === '/insights'
      ? { href: '/play', label: 'Practise', icon: Gamepad2 }
      : { href: '/insights', label: 'Your insights', icon: Radar };
  const SecondaryIcon = secondary.icon;

  return (
    <Reveal
      as="section"
      className="relative overflow-hidden rounded-cg-xl border border-line bg-card p-6 shadow-cg-sm sm:p-9"
    >
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
      {/* A faint dot grid, the one texture borrowed from the portfolio site.
          Masked to fade out, so it reads as depth rather than a pattern. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:radial-gradient(rgb(var(--cg-rgb-border-strong))_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_at_70%_40%,black,transparent_70%)]"
      />

      <div className="relative grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">
            {newAccount ? 'Welcome' : greeting()}
          </p>

          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink sm:text-[2.6rem] sm:leading-tight">
            {newAccount ? 'Welcome, ' : 'Hello, '}
            <span className="cg-gradient-text">{name}</span>
          </h1>

          <p className="mt-3 max-w-xl text-body">{message}</p>

          {!newAccount && overview !== null && (
            <>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href={primary.href} className={buttonClass({ size: 'lg' })}>
                  {primary.label}
                  <ArrowRight size={16} strokeWidth={2.4} aria-hidden />
                </Link>
                <Link href={secondary.href} className={buttonClass({ variant: 'secondary', size: 'lg' })}>
                  <SecondaryIcon size={16} aria-hidden />
                  {secondary.label}
                </Link>
              </div>

              <ul className="mt-6 flex flex-wrap gap-2">
                <HeroChip icon={CheckCircle2} tone="text-ok">
                  <b className="font-semibold text-ink">{fixed}</b> {fixed === 1 ? 'issue' : 'issues'} fixed
                </HeroChip>
                <HeroChip icon={ClipboardCheck} tone="text-hue-study">
                  <b className="font-semibold text-ink">{lessonsDone}</b>{' '}
                  {lessonsDone === 1 ? 'lesson' : 'lessons'} completed
                </HeroChip>
                <HeroChip icon={TrendingUp} tone="text-hue-pair">
                  <b className="font-semibold text-ink">{strong}</b>{' '}
                  {strong === 1 ? 'concept' : 'concepts'} looking strong
                </HeroChip>
              </ul>
            </>
          )}
        </div>

        {!newAccount && overview !== null && <MasteryRing mastery={overview.mastery ?? {}} />}
      </div>
    </Reveal>
  );
}

function HeroChip({
  icon: Icon,
  tone,
  children,
}: {
  icon: LucideIcon;
  tone: string;
  children: React.ReactNode;
}) {
  return (
    <li className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card/70 px-3 py-1.5 text-sm text-body backdrop-blur">
      <Icon size={15} strokeWidth={2.3} className={tone} aria-hidden />
      <span>{children}</span>
    </li>
  );
}

/**
 * Where the student stands across every concept, in one glance.
 *
 * Counts of concepts at each level rather than an average score: an average
 * of 60% hides whether that is everything half-learned or a few things
 * solid and a few not started, and those need different next steps.
 */
function MasteryRing({ mastery }: { mastery: MasterySummary }) {
  const strong = mastery.strong_count ?? 0;
  const developing = mastery.developing_count ?? 0;
  const atRisk = mastery.at_risk_count ?? 0;
  const total = mastery.total_concepts ?? strong + developing + atRisk;

  return (
    <div className="flex flex-col items-center gap-4 rounded-cg-lg border border-line bg-card/70 p-5 backdrop-blur sm:flex-row lg:flex-col">
      <Ring
        label={`${strong} strong, ${developing} developing and ${atRisk} needing work, of ${total} concepts`}
        segments={[
          { value: strong, tone: 'text-ok', label: 'Strong' },
          { value: developing, tone: 'text-warn', label: 'Developing' },
          { value: atRisk, tone: 'text-danger', label: 'Needs work' },
        ]}
      >
        <div>
          <div className="text-3xl font-extrabold tracking-tight text-ink">
            <CountUp value={total} />
          </div>
          <div className="text-xs font-medium text-muted">
            {total === 1 ? 'concept' : 'concepts'} tracked
          </div>
        </div>
      </Ring>

      <div className="grid gap-1.5">
        <LegendItem tone="bg-ok" label="Strong" value={strong} />
        <LegendItem tone="bg-warn" label="Developing" value={developing} />
        <LegendItem tone="bg-danger" label="Needs work" value={atRisk} />
      </div>
    </div>
  );
}

/* ── The learning loop ───────────────────────────────────────────────────── */

/**
 * The four components as the four steps they are to a student.
 *
 * Each step doubles as the way into its section, which is why the old
 * "Jump in" list is gone from this page: it was the sidebar a second time.
 */
function LearningLoop({ counts }: { counts: Counts }) {
  const found = counts.total_diagnostics ?? 0;
  const fixed = counts.resolved_diagnostics ?? 0;
  const open = counts.active_diagnostics ?? 0;
  const lessonsWaiting = counts.active_remediation_triggers ?? 0;
  const lessonsDone = counts.completed_remediation_triggers ?? 0;
  const lessonsAll = lessonsWaiting + lessonsDone;

  const steps: Array<{
    step: string;
    title: string;
    href: string;
    icon: LucideIcon;
    text: string;
    bg: string;
    ring: string;
    bar: string;
    value: number;
    unit: string;
    detail: string;
    progress?: { value: number; label: string };
  }> = [
    {
      step: '01',
      title: 'Spot it',
      href: '/insights',
      icon: Bug,
      text: 'text-hue-insight',
      bg: 'bg-hue-insight/10',
      ring: 'group-hover:ring-hue-insight/40',
      bar: 'bg-hue-insight',
      value: found,
      unit: found === 1 ? 'issue spotted' : 'issues spotted',
      detail: `${fixed} fixed · ${open} still open`,
      progress: found > 0 ? { value: (fixed / found) * 100, label: 'Share of issues fixed' } : undefined,
    },
    {
      step: '02',
      title: 'Learn it',
      href: '/study',
      icon: Sparkles,
      text: 'text-hue-study',
      bg: 'bg-hue-study/10',
      ring: 'group-hover:ring-hue-study/40',
      bar: 'bg-hue-study',
      value: counts.total_lessons_viewed ?? 0,
      unit: (counts.total_lessons_viewed ?? 0) === 1 ? 'lesson opened' : 'lessons opened',
      detail: `${counts.total_quizzes_completed ?? 0} quizzes done · ${lessonsWaiting} waiting`,
      progress:
        lessonsAll > 0
          ? { value: (lessonsDone / lessonsAll) * 100, label: 'Share of lessons completed' }
          : undefined,
    },
    {
      step: '03',
      title: 'Practise it',
      href: '/play',
      icon: Gamepad2,
      text: 'text-hue-play',
      bg: 'bg-hue-play/10',
      ring: 'group-hover:ring-hue-play/40',
      bar: 'bg-hue-play',
      value: counts.total_game_sessions ?? 0,
      unit: (counts.total_game_sessions ?? 0) === 1 ? 'game played' : 'games played',
      detail: 'Short rounds aimed at your weak spots',
    },
    {
      step: '04',
      title: 'Pair on it',
      href: '/pair',
      icon: Users,
      text: 'text-hue-pair',
      bg: 'bg-hue-pair/10',
      ring: 'group-hover:ring-hue-pair/40',
      bar: 'bg-hue-pair',
      value: counts.total_pair_sessions ?? 0,
      unit: (counts.total_pair_sessions ?? 0) === 1 ? 'pair session' : 'pair sessions',
      detail: `${counts.total_peer_reviews ?? 0} session reviews submitted`,
    },
  ];

  return (
    <section>
      <Reveal>
        <SectionTitle hint="Each step feeds the next">Your learning loop</SectionTitle>
      </Reveal>

      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((item, index) => {
          const Icon = item.icon;

          return (
            <Reveal as="li" key={item.href} delay={index * 80} className="relative">
              <Link
                href={item.href}
                className={`cg-card cg-card-hover cg-focusable group flex h-full flex-col p-5 ring-1 ring-transparent ${item.ring}`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`grid h-10 w-10 place-items-center rounded-cg ${item.bg} ${item.text} transition-transform duration-300 ease-cg group-hover:scale-110`}
                  >
                    <Icon size={19} strokeWidth={2.2} aria-hidden />
                  </span>
                  <span className="font-mono text-xs font-semibold text-muted">{item.step}</span>
                </div>

                <h3 className="mt-4 text-sm font-semibold text-ink">{item.title}</h3>

                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold tracking-tight text-ink">
                    <CountUp value={item.value} />
                  </span>
                  <span className="text-sm text-muted">{item.unit}</span>
                </div>

                <p className="mt-1 flex-1 text-xs text-muted">{item.detail}</p>

                {item.progress && (
                  <div className="mt-4">
                    <FillBar
                      value={item.progress.value}
                      tone={item.bar}
                      label={item.progress.label}
                      height="h-1.5"
                      delay={index * 80}
                    />
                  </div>
                )}

                <span
                  className={`mt-4 inline-flex items-center gap-1 text-sm font-semibold ${item.text}`}
                >
                  Open
                  <ArrowRight
                    size={15}
                    strokeWidth={2.4}
                    aria-hidden
                    className="transition-transform duration-200 ease-cg group-hover:translate-x-1"
                  />
                </span>
              </Link>

              {/* The arrow to the next step. Only where the four sit in a row;
                  on two columns it would point at nothing. */}
              {index < steps.length - 1 && (
                <span
                  aria-hidden
                  className="absolute -right-[1.15rem] top-1/2 z-10 hidden h-7 w-7 -translate-y-1/2 place-items-center rounded-full border border-line bg-card text-muted shadow-cg-xs lg:grid"
                >
                  <ChevronRight size={15} strokeWidth={2.4} />
                </span>
              )}
            </Reveal>
          );
        })}
      </ol>
    </section>
  );
}

/* ── Focus next ──────────────────────────────────────────────────────────── */

/**
 * Code Coach's `recommended_focus` for each concept, as a button.
 *
 * The values are its own (dashboard_service._recommended_focus) and are
 * already ordered by urgency there; this only names them and picks where they
 * lead. An unrecognised value falls back to "keep coding" rather than to a
 * lesson that may not exist.
 */
const FOCUS: Record<string, { label: string; why: string; href: (tag: string) => string; icon: LucideIcon }> = {
  study_guider_and_collaboration: {
    label: 'Take the lesson',
    why: 'Repeating and still open — a lesson is the quickest fix.',
    href: (tag) => `/study?concept=${encodeURIComponent(tag)}`,
    icon: BookOpen,
  },
  gamification_and_practice: {
    label: 'Practise it',
    why: 'Still showing up — a few practice rounds will help.',
    href: () => '/play',
    icon: Gamepad2,
  },
  targeted_practice: {
    label: 'Practise it',
    why: 'Mastery is low — targeted practice will build it.',
    href: () => '/play',
    icon: Target,
  },
  reinforcement: {
    label: 'Keep it sharp',
    why: 'You have this one — an occasional round keeps it.',
    href: () => '/play',
    icon: Star,
  },
  monitor: {
    label: 'Keep coding',
    why: 'Nothing to act on yet — the editor is watching.',
    href: () => '/insights',
    icon: Compass,
  },
};

const MASTERY_TONE = {
  strong: { tone: 'ok', label: 'Strong', bar: 'bg-ok' },
  developing: { tone: 'warn', label: 'Developing', bar: 'bg-warn' },
  at_risk: { tone: 'danger', label: 'Needs work', bar: 'bg-danger' },
} as const;

const STRUGGLE_TONE = {
  high: { tone: 'danger', label: 'Struggling' },
  medium: { tone: 'warn', label: 'Some trouble' },
  low: { tone: 'neutral', label: 'Occasional' },
} as const;

function FocusNext({ trends }: { trends: ConceptTrend[] }) {
  return (
    <>
      <Reveal>
        <SectionTitle hint={trends.length ? 'Most urgent first' : undefined}>
          What to work on next
        </SectionTitle>
      </Reveal>

      {trends.length === 0 ? (
        <Reveal>
          <EmptyState icon={Target} title="Nothing to focus on yet">
            Once the editor has seen a concept a few times, it shows up here with the
            one thing most worth doing about it.
          </EmptyState>
        </Reveal>
      ) : (
        <div className="grid gap-3">
          {trends.slice(0, 4).map((trend, index) => {
            const focus = FOCUS[trend.recommended_focus ?? ''] ?? FOCUS.monitor;
            const FocusIcon = focus.icon;
            const mastery =
              MASTERY_TONE[(trend.mastery_level ?? '') as keyof typeof MASTERY_TONE] ?? null;
            const struggle =
              STRUGGLE_TONE[(trend.struggle_level ?? '') as keyof typeof STRUGGLE_TONE] ?? null;
            const raw = trend.mastery_score ?? null;
            const score = raw === null ? null : raw <= 1 ? raw * 100 : raw;

            return (
              <Reveal key={trend.concept_tag} delay={index * 70}>
                <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold capitalize text-ink">
                        {formatConcept(trend.concept_tag)}
                      </h3>
                      {struggle && <Badge tone={struggle.tone}>{struggle.label}</Badge>}
                      {mastery && <Badge tone={mastery.tone}>{mastery.label}</Badge>}
                    </div>

                    <p className="mt-1 text-sm text-body">{focus.why}</p>

                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                      <span>
                        Seen <b className="font-semibold text-ink">{trend.repeat_count ?? 0}×</b>
                      </span>
                      <span>
                        <b className="font-semibold text-ink">{trend.active_count ?? 0}</b> still open
                      </span>
                      {trend.hint_dependency_level === 'high' && (
                        <span className="inline-flex items-center gap-1">
                          <Lightbulb size={13} aria-hidden className="text-hue-play" />
                          Leaning on hints
                        </span>
                      )}
                      {trend.last_activity_at && <span>{relativeTime(trend.last_activity_at)}</span>}
                    </div>

                    {score !== null && (
                      <div className="mt-3 flex items-center gap-3">
                        <FillBar
                          value={score}
                          tone={mastery?.bar ?? 'bg-accent'}
                          label={`${formatConcept(trend.concept_tag)} mastery`}
                          height="h-1.5"
                          delay={index * 70}
                        />
                        <span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums text-ink">
                          {Math.round(score)}%
                        </span>
                      </div>
                    )}
                  </div>

                  <Link
                    href={focus.href(trend.concept_tag)}
                    className={buttonClass({ variant: 'secondary', size: 'sm', className: 'shrink-0 self-start sm:self-center' })}
                  >
                    <FocusIcon size={15} aria-hidden />
                    {focus.label}
                  </Link>
                </Card>
              </Reveal>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ── Activity ────────────────────────────────────────────────────────────── */

/** An icon per kind of event, so the feed can be scanned without reading it. */
const EVENT_ICON: Record<string, LucideIcon> = {
  code_diagnostic_detected: Bug,
  diagnostic_resolved: CheckCircle2,
  hint_shown: Lightbulb,
  struggle_signal_created: Flame,
  micro_lesson_viewed: BookOpen,
  quiz_completed: ClipboardCheck,
  mastery_updated: TrendingUp,
  game_adaptation_decision_created: Gamepad2,
  game_session_completed: Gamepad2,
  pair_session_started: Users,
  collaboration_prompt_shown: MessageCircle,
  peer_review_submitted: Star,
};

/**
 * A few of Code Coach's summaries name internal ids - "Quiz q-81f2 finished",
 * "The lesson l-77 was opened", "started for task cm0x..." - which mean
 * nothing to the student. Those are rewritten from the parts that do; the
 * rest only have their identifiers made readable.
 */
function eventSummary(event: TimelineEvent): string {
  const concept = event.concept_tag ? formatConcept(event.concept_tag) : null;

  switch (event.event_type) {
    case 'micro_lesson_viewed':
      return concept ? `You opened a lesson on ${concept}.` : 'You opened a lesson.';
    case 'quiz_completed': {
      const score = event.summary?.match(/(\d+)%/)?.[1];
      if (score === undefined) return 'You finished a quiz.';
      return `You scored ${score}% on the quiz${concept ? ` for ${concept}` : ''}.`;
    }
    case 'pair_session_started':
      return 'You started a pair programming session.';
    default:
      return humaniseSummary(event.summary);
  }
}

function ActivityFeed({ events }: { events: TimelineEvent[] }) {
  return (
    <>
      <Reveal>
        <SectionTitle hint={events.length ? 'Most recent first' : undefined}>Recent activity</SectionTitle>
      </Reveal>

      {events.length === 0 ? (
        <Reveal>
          <EmptyState icon={Clock3} title="Nothing here yet">
            Your activity appears as you write code, work through lessons and practise.
          </EmptyState>
        </Reveal>
      ) : (
        <Reveal>
          <Card className="p-5">
            <ol className="relative space-y-5">
              {/* The spine the events hang from. */}
              <span aria-hidden className="absolute bottom-2 left-[15px] top-2 w-px bg-line" />

              {events.slice(0, 8).map((event) => {
                const Icon = EVENT_ICON[event.event_type ?? ''] ?? Sparkles;
                const resolved = event.event_type === 'diagnostic_resolved';

                return (
                  <li key={event.event_id} className="relative flex gap-3">
                    {/* Opaque underneath, tinted on top: the tint alone is
                        translucent and the spine would show through it. */}
                    <span className="relative z-10 h-8 w-8 shrink-0 rounded-full bg-card">
                      <span
                        className={`grid h-full w-full place-items-center rounded-full ring-1 ring-inset ${
                          resolved ? 'bg-ok/10 text-ok ring-ok/25' : componentTone(event.component)
                        }`}
                      >
                        <Icon size={15} strokeWidth={2.2} aria-hidden />
                      </span>
                    </span>

                    <div className="min-w-0 flex-1 pt-0.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-ink">{event.title}</p>
                        <time
                          dateTime={event.occurred_at}
                          className="shrink-0 text-xs tabular-nums text-muted"
                        >
                          {relativeTime(event.occurred_at)}
                        </time>
                      </div>
                      {event.summary && (
                        <p className="mt-0.5 text-sm text-body">{eventSummary(event)}</p>
                      )}
                      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
                        {formatComponent(event.component)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>
        </Reveal>
      )}
    </>
  );
}

/* ── Fallback shortcuts ──────────────────────────────────────────────────────
   Only when the summary could not be loaded: the loop above is the way in
   otherwise. Reads lib/nav.ts, so a section renamed in the sidebar is renamed
   here too. */

function JumpIn() {
  return (
    <section>
      <SectionTitle>Jump in</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        {SECTIONS.filter((section) => section.href !== '/').map((section, index) => {
          const Icon = section.icon;

          return (
            <Reveal key={section.href} delay={index * 60}>
              <Link
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
                  <span className="block truncate text-sm text-muted">{section.blurb}</span>
                </span>
                <ArrowRight
                  size={17}
                  aria-hidden
                  className="shrink-0 text-muted transition-transform duration-200 ease-cg group-hover:translate-x-0.5 group-hover:text-ink"
                />
              </Link>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

/**
 * Rendered on the server, so this is the SERVER's clock and time zone.
 *
 * Acceptable for a greeting, which is decorative. It would not be acceptable
 * for a timestamp, which is why relativeTime deals in elapsed time - a
 * duration is the same number in every time zone, so it cannot disagree with
 * the client the way a formatted wall-clock date would.
 */
function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
