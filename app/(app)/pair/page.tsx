'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ApiError, api } from '@/lib/api';

/**
 * Ported from Pair_Path dashboard/page.tsx.
 *
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
      // PairPath unavailable is a 503 from the proxy, distinct from a rejection.
      // Saying which one it is stops a student trying to sign in again over an
      // outage that has nothing to do with their session.
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
      <header>
        <h1 className="text-2xl font-semibold text-ink">Pair programming</h1>
        <p className="mt-1 text-body">
          Work through a problem with a partner, with the editor shared live.
        </p>
      </header>

      {error && (
        <p role="alert" className="rounded-cg bg-danger-soft px-4 py-3 text-danger">
          {error}
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-cg border border-line bg-card p-5">
          <h2 className="font-medium text-ink">Start a session</h2>

          <label htmlFor="topic" className="mt-4 block text-sm text-muted">
            Topic
          </label>
          <select
            id="topic"
            value={topicId}
            onChange={(event) => {
              setTopicId(event.target.value);
              setQuestionId('');
            }}
            className="mt-1 w-full rounded-cg border border-line bg-card px-3 py-2 text-ink"
          >
            <option value="">Choose a topic…</option>
            {topics?.map((topic) => (
              <option key={topic.id} value={topic.id}>
                {topic.name}
              </option>
            ))}
          </select>

          <label htmlFor="question" className="mt-4 block text-sm text-muted">
            Question
          </label>
          <select
            id="question"
            value={questionId}
            onChange={(event) => setQuestionId(event.target.value)}
            disabled={!questions.length}
            className="mt-1 w-full rounded-cg border border-line bg-card px-3 py-2 text-ink disabled:opacity-60"
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

          <button
            type="button"
            onClick={createSession}
            disabled={!questionId || busy}
            className="mt-5 w-full rounded-cg bg-accent px-4 py-2.5 font-medium text-white transition hover:bg-accent-strong disabled:opacity-50"
          >
            Start
          </button>
        </section>

        <section className="rounded-cg border border-line bg-card p-5">
          <h2 className="font-medium text-ink">Join a partner</h2>
          <p className="mt-1 text-sm text-muted">Enter the code they share with you.</p>

          <input
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
            placeholder="ABC123"
            maxLength={12}
            className="mt-4 w-full rounded-cg border border-line bg-card px-3 py-2 font-mono uppercase tracking-widest text-ink"
          />

          <button
            type="button"
            onClick={join}
            disabled={!joinCode.trim() || busy}
            className="mt-5 w-full rounded-cg border border-line px-4 py-2.5 font-medium text-body transition hover:bg-card-alt disabled:opacity-50"
          >
            Join
          </button>
        </section>
      </div>

      {sessions.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-medium text-ink">Your sessions</h2>
          <ul className="divide-y divide-line rounded-cg border border-line bg-card">
            {sessions.map((session) => (
              <li
                key={session.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div>
                  <p className="text-ink">{session.question?.title ?? 'Pair session'}</p>
                  <p className="text-sm text-muted">
                    {session.status} · code{' '}
                    <span className="font-mono">{session.joinCode}</span>
                  </p>
                </div>
                <Link
                  href={
                    session.status === 'ACTIVE'
                      ? `/pair/${session.id}`
                      : `/pair/${session.id}/results`
                  }
                  className="text-accent hover:underline"
                >
                  {session.status === 'ACTIVE' ? 'Rejoin' : 'See results'}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
