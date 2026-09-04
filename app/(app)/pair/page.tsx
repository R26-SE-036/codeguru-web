'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, KeyRound, Loader2, Play, Users } from 'lucide-react';

import { ApiError, api } from '@/lib/api';
import { FormError } from '@/components/field';
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
}

interface Question {
  id: string;
  title: string;
  difficulty?: string;
}

interface Session {
  id: string;
  joinCode: string;
  status: string;
  startedAt: string;
  question?: { title?: string };
}

const SELECT_CLASS =
  'cg-focusable h-11 w-full rounded-cg border border-line bg-card px-3 text-ink ' +
  'hover:border-line-strong focus-visible:border-accent disabled:opacity-60';

export default function PairPage() {
  const router = useRouter();

  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [topicId, setTopicId] = useState('');
  const [questionId, setQuestionId] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [topicList, mySessions] = await Promise.all([
        api.get<Topic[]>('pair', '/topics'),
        api.get<Session[]>('pair', '/sessions/my').catch(() => [] as Session[]),
      ]);
      setTopics(topicList);
      setSessions(mySessions);
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

  async function createSession() {
    if (!questionId) return;
    setBusy(true);
    setError(null);
    try {
      const session = await api.post<Session>('pair', '/sessions', { questionId });
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
      />

      {error && <FormError>{error}</FormError>}

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
            onClick={createSession}
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

              return (
                <Link
                  key={session.id}
                  href={active ? `/pair/${session.id}` : `/pair/${session.id}/results`}
                  className="cg-focusable group flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition hover:bg-card-alt"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-ink">
                      {session.question?.title ?? 'Pair session'}
                    </p>
                    <p className="mt-0.5 flex items-center gap-2 text-sm text-muted">
                      <span>code</span>
                      <span className="rounded bg-inset px-1.5 py-0.5 font-mono text-xs tracking-widest text-ink">
                        {session.joinCode}
                      </span>
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <Badge tone={active ? 'ok' : 'neutral'}>
                      {active ? 'Active' : 'Finished'}
                    </Badge>
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-accent">
                      {active ? 'Rejoin' : 'Results'}
                      <ArrowRight
                        size={15}
                        aria-hidden
                        className="transition-transform duration-200 ease-cg group-hover:translate-x-0.5"
                      />
                    </span>
                  </div>
                </Link>
              );
            })}
          </Card>
        </section>
      )}
    </div>
  );
}
