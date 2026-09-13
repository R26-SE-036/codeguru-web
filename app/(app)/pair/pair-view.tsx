'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, BarChart3, BrainCircuit, History, KeyRound, Loader2, Play, Users } from 'lucide-react';

import { ApiError, api } from '@/lib/api';
import { FormError } from '@/components/field';
import { formatConcept, formatErrorType } from '@/lib/vocabulary';
import {
  Badge,
  Card,
  PageHeader,
  SectionTitle,
  buttonClass,
} from '@/components/ui';

/**
 * Start a session on a question, or join a partner's with their code.
 */

interface Topic {
  id: string;
  name: string;
  description?: string;
  /** GET /topics already carries every offered question on each topic. */
  questions?: Question[];
}

interface Question {
  id: string;
  title: string;
  difficulty?: string;
  conceptTags?: string[];
}

interface Member {
  userId: string;
  role: string;
  user?: { firstName?: string; lastName?: string };
}

interface Session {
  id: string;
  joinCode: string;
  status: string;
  startedAt: string;
  endedAt?: string | null;
  members?: Member[];
  question?: { id?: string; title?: string };
}

/**
 * Enough to tell two rows on the same question apart.
 *
 * The list showed the question title and the join code and nothing else, so
 * four attempts at "Array Bounds Checking" were four identical rows: no date,
 * no partner, no way to know which one was this morning's. Both fields were
 * already in the response and simply never rendered.
 */
function whenStarted(iso: string): string {
  const started = new Date(iso);
  if (Number.isNaN(started.getTime())) return '';

  const today = new Date();
  const sameDay = started.toDateString() === today.toDateString();

  // Times for today, dates for anything older - which is the way somebody
  // scanning for "the one I was just in" actually reads this list.
  return sameDay
    ? `Today, ${started.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
    : started.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** The other person, or nobody if they never arrived. */
function partnerName(session: Session, me: string): string | null {
  const partner = session.members?.find((m) => m.userId !== me);
  if (!partner) return null;

  const name = [partner.user?.firstName, partner.user?.lastName].filter(Boolean).join(' ').trim();
  return name || null;
}

/** One entry from Code Coach's GET /collaboration/me/prompts. */
interface CoachPrompt {
  concept_tag: string;
  error_type?: string | null;
  linked_diagnostic_id?: string | null;
  collaboration_mode: string;
  title: string;
  prompt_text: string;
  based_on_struggle_level?: string | null;
  based_on_mastery_level?: string | null;
}

interface Recommendation {
  concept: string;
  reason: string;
  question: Question;
  attempted: boolean;
  tip: string;
}

const DIFFICULTY_RANK: Record<string, number> = { BEGINNER: 0, INTERMEDIATE: 1, ADVANCED: 2 };

/**
 * Why this concept, in words a student would recognise as about them.
 *
 * Built from Code Coach's structured fields rather than its `rationale`, which
 * is written for a developer ("The pair is working around the concept
 * loop_control. There are currently 1 active diagnostic(s)...").
 *
 * Reads every prompt Code Coach returned for the concept, not just the first:
 * one concept can arrive as both a pair prompt (from an open diagnostic) and a
 * review prompt (from a struggle), and each carries half the story.
 */
function reasonFor(prompts: CoachPrompt[]): string {
  const error = formatErrorType(prompts.find((p) => p.error_type)?.error_type);
  const named = error ? `"${error}"` : 'this';

  if (prompts.some((p) => p.based_on_struggle_level === 'high')) {
    return `You have run into ${named} repeatedly in your own code.`;
  }
  if (prompts.some((p) => p.linked_diagnostic_id)) {
    return `Code Coach found ${named} in your code and it is still open.`;
  }
  if (prompts.some((p) => ['at_risk', 'developing'].includes(p.based_on_mastery_level ?? ''))) {
    return 'Your mastery of this is still developing.';
  }
  return `Code Coach has seen ${named} in your work.`;
}

/**
 * Code Coach says which concepts to practise; the bank says which exercise
 * practises them.
 *
 * ================ WHY THIS JOIN IS POSSIBLE AT ALL ================
 * Code Coach built a collaboration API that ranks concepts for pair work from
 * a student's own diagnostics, struggles and mastery - and nothing on the
 * platform ever called it. A student could hit the same loop bug three times
 * in the editor, open Pair, and be offered exactly the list everyone else was.
 *
 * It only joins because every exercise carries the platform's canonical
 * concept tags - the vocabulary Code Coach reports under. The bank used to be
 * tagged `arrays`, `loops`, `bounds`, which matches nothing Code Coach says,
 * so this would have found no exercise for any concept.
 * ================================================================
 *
 * Code Coach's order is kept: it already ranks by priority. Within a concept,
 * an exercise this student has not done comes before one they have, then the
 * gentler difficulty first. An exercise is recommended once even when it
 * practises several of the concepts.
 */
function recommend(
  prompts: CoachPrompt[],
  topics: Topic[],
  sessions: Session[],
  limit = 3,
): Recommendation[] {
  const attempted = new Set(
    sessions.map((s) => s.question?.id).filter((id): id is string => Boolean(id)),
  );
  const offered = topics.flatMap((topic) => topic.questions ?? []);

  const byConcept = new Map<string, CoachPrompt[]>();
  for (const prompt of prompts) {
    byConcept.set(prompt.concept_tag, [...(byConcept.get(prompt.concept_tag) ?? []), prompt]);
  }

  const used = new Set<string>();
  const picks: Recommendation[] = [];

  for (const [concept, group] of byConcept) {
    const question = offered
      .filter((q) => q.conceptTags?.includes(concept) && !used.has(q.id))
      .sort(
        (a, b) =>
          Number(attempted.has(a.id)) - Number(attempted.has(b.id)) ||
          (DIFFICULTY_RANK[a.difficulty ?? ''] ?? 9) - (DIFFICULTY_RANK[b.difficulty ?? ''] ?? 9) ||
          a.title.localeCompare(b.title),
      )[0];
    if (!question) continue;

    used.add(question.id);
    const pairPrompt = group.find((p) => p.collaboration_mode === 'pair_programming') ?? group[0];
    picks.push({
      concept,
      reason: reasonFor(group),
      question,
      attempted: attempted.has(question.id),
      tip: pairPrompt.prompt_text,
    });
    if (picks.length === limit) break;
  }

  return picks;
}

const SELECT_CLASS =
  'cg-focusable h-11 w-full rounded-cg border border-line bg-card px-3 text-ink ' +
  'hover:border-line-strong focus-visible:border-accent disabled:opacity-60';

export function PairView({ userId }: { userId: string }) {
  const router = useRouter();

  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [topicId, setTopicId] = useState('');
  const [questionId, setQuestionId] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [coachPrompts, setCoachPrompts] = useState<CoachPrompt[]>([]);

  const recommendations = useMemo(
    () => recommend(coachPrompts, topics ?? [], sessions),
    [coachPrompts, topics, sessions],
  );

  const load = useCallback(async () => {
    try {
      const [topicList, mySessions, prompts] = await Promise.all([
        api.get<Topic[]>('pair', '/topics'),
        api.get<Session[]>('pair', '/sessions/my').catch(() => [] as Session[]),
        // Code Coach, not PairPath, and never fatal: a student with no history,
        // or a Code Coach that is down, still gets the ordinary picker - they
        // just are not told where to start.
        api
          .get<{ prompts?: CoachPrompt[] }>('coach', '/collaboration/me/prompts?limit=25')
          .then((response) => response?.prompts ?? [])
          .catch(() => [] as CoachPrompt[]),
      ]);
      setTopics(topicList);
      setSessions(mySessions);
      setCoachPrompts(prompts);
    } catch (err) {
      // Unavailable is a 503 from the proxy, distinct from a rejection. Saying
      // which one it is stops a student trying to sign in again over an outage
      // that has nothing to do with their session.
      setError(
        err instanceof ApiError && err.isUnavailable
          ? 'Pairing is unavailable right now. Everything else still works.'
          : 'Could not load pairing.',
      );
      setTopics([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!topicId) {
      setQuestions([]);
      return;
    }
    api
      .get<Question[]>('pair', `/questions/topic/${topicId}`)
      .then(setQuestions)
      .catch(() => setQuestions([]));
  }, [topicId]);

  async function createSession(id: string = questionId) {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      const session = await api.post<Session>('pair', '/sessions', { questionId: id });
      router.push(`/pair/${session.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start a session.');
      setBusy(false);
    }
  }

  async function join() {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setBusy(true);
    setError(null);
    try {
      const session = await api.post<Session>('pair', '/sessions/join', { joinCode: code });
      router.push(`/pair/${session.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not join that session.');
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Pair"
        title="Solve it with a partner"
        lead="Work through a problem together in a shared editor. One drives, one navigates, and you swap as you go."
        icon={Users}
        tone="text-hue-pair"
        toneBg="bg-hue-pair/10"
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/pair/analytics"
              className={buttonClass({ variant: 'secondary', size: 'sm' })}
            >
              <BarChart3 size={14} strokeWidth={2.2} aria-hidden />
              Analytics
            </Link>
            <Link
              href="/pair/sandbox"
              className={buttonClass({ variant: 'secondary', size: 'sm' })}
            >
              <BrainCircuit size={14} strokeWidth={2.2} aria-hidden />
              Model sandbox
            </Link>
          </div>
        }
      />

      {error && <FormError>{error}</FormError>}

      {/* Only when there is something to say. A student with no Code Coach
          history gets no card at all rather than an empty one - an empty
          "Recommended for you" reads as "we looked and found nothing". */}
      {recommendations.length > 0 && (
        <section>
          <SectionTitle hint="From your Code Coach history">Recommended for you</SectionTitle>

          <Card className="divide-y divide-line overflow-hidden">
            {recommendations.map((pick) => (
              <div
                key={pick.question.id}
                className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="accent">{formatConcept(pick.concept)}</Badge>
                    <p className="font-semibold text-ink">{pick.question.title}</p>
                    {pick.question.difficulty && (
                      <span className="text-xs text-muted">
                        {pick.question.difficulty.toLowerCase()}
                        {pick.attempted ? ' \u00b7 done before' : ''}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted">{pick.reason}</p>
                  <p className="mt-1 text-sm text-ink">
                    <span className="font-semibold">Try together:</span> {pick.tip}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => createSession(pick.question.id)}
                  disabled={busy}
                  className={buttonClass({ size: 'sm' })}
                >
                  <Play size={14} strokeWidth={2.2} aria-hidden />
                  Start
                </button>
              </div>
            ))}
          </Card>
        </section>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        {/* ── Start ──────────────────────────────────────────────────────── */}
        <Card className="flex flex-col p-6">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-cg bg-hue-pair/10 text-hue-pair">
              <Play size={18} strokeWidth={2.2} aria-hidden />
            </span>
            <div>
              <h2 className="font-bold text-ink">Start a session</h2>
              <p className="text-sm text-muted">Pick something to work on.</p>
            </div>
          </div>

          <div className="mt-5 flex-1 space-y-4">
            <div>
              <label htmlFor="topic" className="mb-1.5 block text-sm font-semibold text-ink">
                Topic
              </label>
              <select
                id="topic"
                value={topicId}
                onChange={(event) => {
                  setTopicId(event.target.value);
                  setQuestionId('');
                }}
                className={SELECT_CLASS}
              >
                <option value="">
                  {topics === null ? 'Loading…' : 'Choose a topic…'}
                </option>
                {topics?.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="question"
                className="mb-1.5 block text-sm font-semibold text-ink"
              >
                Question
              </label>
              <select
                id="question"
                value={questionId}
                onChange={(event) => setQuestionId(event.target.value)}
                disabled={!questions.length}
                className={SELECT_CLASS}
              >
                <option value="">
                  {questions.length ? 'Choose a question…' : 'Pick a topic first'}
                </option>
                {questions.map((question) => (
                  <option key={question.id} value={question.id}>
                    {question.title}
                    {question.difficulty ? ` · ${question.difficulty}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={() => createSession()}
            disabled={!questionId || busy}
            className={buttonClass({ size: 'lg', className: 'mt-6 w-full' })}
          >
            {busy ? <Loader2 size={17} className="animate-spin" aria-hidden /> : null}
            Start session
          </button>
        </Card>

        {/* ── Join ───────────────────────────────────────────────────────── */}
        <Card className="flex flex-col p-6">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-cg bg-hue-insight/10 text-hue-insight">
              <KeyRound size={18} strokeWidth={2.2} aria-hidden />
            </span>
            <div>
              <h2 className="font-bold text-ink">Join a partner</h2>
              <p className="text-sm text-muted">Enter the code they share with you.</p>
            </div>
          </div>

          <div className="mt-5 flex-1">
            <label htmlFor="joinCode" className="mb-1.5 block text-sm font-semibold text-ink">
              Session code
            </label>
            <input
              id="joinCode"
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
              placeholder="ABC123"
              maxLength={12}
              autoComplete="off"
              // A code is read aloud and typed in a hurry, so it gets room to
              // breathe: monospace, wide tracking, and large enough that a
              // 0/O or 1/I mix-up is visible before it is submitted.
              className="cg-focusable h-14 w-full rounded-cg border border-line bg-card-alt text-center font-mono text-2xl font-semibold uppercase tracking-[0.35em] text-ink placeholder:text-faint-nontext placeholder:tracking-[0.35em] hover:border-line-strong focus-visible:border-accent"
            />
          </div>

          <button
            type="button"
            onClick={join}
            disabled={!joinCode.trim() || busy}
            className={buttonClass({
              variant: 'secondary',
              size: 'lg',
              className: 'mt-6 w-full',
            })}
          >
            {busy ? <Loader2 size={17} className="animate-spin" aria-hidden /> : null}
            Join session
          </button>
        </Card>
      </div>

      {sessions.length > 0 && (
        <section>
          <SectionTitle hint={`${sessions.length} total`}>Your sessions</SectionTitle>

          <Card className="divide-y divide-line overflow-hidden">
            {sessions.map((session) => {
              const active = session.status === 'ACTIVE';
              // Closed by the idle sweep rather than by anybody finishing it,
              // so there are no reviews to compare and no results to show.
              const expired = session.status === 'EXPIRED';
              const partner = partnerName(session, userId);

              const destination = active
                ? `/pair/${session.id}`
                : expired
                  ? `/pair/${session.id}/history`
                  : `/pair/${session.id}/results`;

              return (
                <div
                  key={session.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                >
                  <Link href={destination} className="cg-focusable group min-w-0 flex-1">
                    <p className="font-semibold text-ink">
                      {session.question?.title ?? 'Pair session'}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                      <span>{whenStarted(session.startedAt)}</span>
                      <span aria-hidden>·</span>
                      {/* "on your own" rather than nothing: a session nobody
                          joined looks the same as one whose partner failed to
                          load, and they are different problems. */}
                      <span>{partner ? `with ${partner}` : 'on your own'}</span>
                      <span aria-hidden>·</span>
                      <span className="rounded bg-inset px-1.5 py-0.5 font-mono text-xs tracking-widest text-ink">
                        {session.joinCode}
                      </span>
                    </p>
                  </Link>

                  <div className="flex items-center gap-3">
                    <Badge tone={active ? 'ok' : expired ? 'warn' : 'neutral'}>
                      {active ? 'Active' : expired ? 'Expired' : 'Finished'}
                    </Badge>

                    <Link
                      href={`/pair/${session.id}/history`}
                      className="cg-focusable inline-flex items-center gap-1 rounded-cg-sm px-2 py-1 text-sm font-semibold text-muted transition hover:text-ink"
                    >
                      <History size={14} strokeWidth={2.2} aria-hidden />
                      Record
                    </Link>

                    {/* No second link for an expired session: "Results" would
                        lead to a page that can only report there are none. */}
                    {!expired && (
                      <Link
                        href={destination}
                        className="cg-focusable group inline-flex items-center gap-1 text-sm font-semibold text-accent"
                      >
                        {active ? 'Rejoin' : 'Results'}
                        <ArrowRight
                          size={15}
                          aria-hidden
                          className="transition-transform duration-200 ease-cg group-hover:translate-x-0.5"
                        />
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </Card>
        </section>
      )}
    </div>
  );
}
