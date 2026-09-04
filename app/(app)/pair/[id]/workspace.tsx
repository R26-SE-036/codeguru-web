'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { ApiError, api } from '@/lib/api';
import { usePairSocket } from '@/lib/use-pair-socket';

// Monaco pulls in a large editor bundle and touches `window` on import.
// Client-only, and code-split so it does not weigh on any other route.
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => <div className="h-full animate-pulse rounded-cg bg-inset" />,
});

/**
 * Ported from Pair_Path app/pair/[id]/page.tsx.
 *
 * The collaboration model is the original's: the editor broadcasts on change,
 * roles switch on request, runs are broadcast to the room, and the ML engine
 * pushes interventions. What changed is the connection - see lib/use-pair-socket
 * for why this is the one place a token reaches the browser, and why the socket
 * is now same-origin instead of io('http://localhost:3001').
 */

interface Session {
  id: string;
  joinCode: string;
  status: string;
  finalCode?: string;
  question?: {
    title?: string;
    description?: string;
    starterCode?: string;
  };
}

interface ChatMessage {
  userId: string;
  message: string;
  timestamp?: string;
}

interface RunResult {
  success: boolean;
  stdout?: string;
  stderr?: string;
  compileError?: string | null;
}

interface Intervention {
  id: string;
  message: string;
  action?: string;
}

export function Workspace({ sessionId, userId }: { sessionId: string; userId: string }) {
  const router = useRouter();

  const [session, setSession] = useState<Session | null>(null);
  const [code, setCode] = useState('');
  const [members, setMembers] = useState<string[]>([]);
  const [partnerConnected, setPartnerConnected] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [result, setResult] = useState<RunResult | null>(null);
  const [intervention, setIntervention] = useState<Intervention | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The last value we broadcast. Without it, an incoming code_update sets state,
  // which fires onChange, which broadcasts it straight back - two editors
  // bouncing the same edit between them.
  const lastBroadcast = useRef<string>('');

  const handlers = useMemo(
    () => ({
      room_state: (data: { members?: string[] }) => setMembers(data.members ?? []),
      code_update: (data: { code: string }) => {
        lastBroadcast.current = data.code;
        setCode(data.code);
      },
      discussion_note: (data: ChatMessage) => setMessages((prev) => [...prev, data]),
      code_result: (data: RunResult) => setResult(data),
      intervention: (data: Intervention) => setIntervention(data),
      user_joined: () => setPartnerConnected(true),
      user_left: () => setPartnerConnected(false),
      session_ended: () => router.push(`/pair/${sessionId}/review`),
    }),
    [router, sessionId],
  );

  const { socket, status, error: socketError } = usePairSocket(sessionId, {
    onConnect: (connected) => connected.emit('join_room', { sessionId, userId }),
    handlers: handlers as unknown as Record<string, (payload: never) => void>,
  });

  useEffect(() => {
    let live = true;
    api
      .get<Session>('pair', `/sessions/${sessionId}`)
      .then((data) => {
        if (!live) return;
        setSession(data);
        const initial = data.finalCode || data.question?.starterCode || '';
        lastBroadcast.current = initial;
        setCode(initial);
      })
      .catch((err) => {
        if (!live) return;
        setError(
          err instanceof ApiError && err.isUnavailable
            ? 'Pairing is unavailable right now.'
            : 'Could not load this session.',
        );
      });
    return () => {
      live = false;
    };
  }, [sessionId]);

  const onCodeChange = useCallback(
    (value: string | undefined) => {
      const next = value ?? '';
      setCode(next);
      if (next === lastBroadcast.current) return;
      lastBroadcast.current = next;
      socket.current?.emit('code_change', { sessionId, code: next, userId });
    },
    [socket, sessionId, userId],
  );

  function send() {
    const message = draft.trim();
    if (!message) return;
    socket.current?.emit('discussion_note', { sessionId, userId, message });
    setDraft('');
  }

  if (error) {
    return <p className="rounded-cg bg-danger-soft px-4 py-3 text-danger">{error}</p>;
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">
            {session?.question?.title ?? 'Pair session'}
          </h1>
          <p className="mt-1 text-sm text-muted">
            Code <span className="font-mono">{session?.joinCode ?? '—'}</span> ·{' '}
            {members.length} in the room
            {partnerConnected ? ' · partner connected' : ''}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <ConnectionBadge status={status} message={socketError} />
          <button
            type="button"
            onClick={() => socket.current?.emit('role_switch', { sessionId, userId })}
            disabled={status !== 'connected'}
            className="rounded-cg border border-line px-3 py-1.5 text-sm text-body transition hover:bg-card-alt disabled:opacity-50"
          >
            Switch roles
          </button>
          <button
            type="button"
            onClick={async () => {
              await api.post('pair', `/sessions/${sessionId}/end`, { finalCode: code });
              router.push(`/pair/${sessionId}/review`);
            }}
            className="rounded-cg bg-accent px-3 py-1.5 text-sm font-medium text-white transition hover:bg-accent-strong"
          >
            End session
          </button>
        </div>
      </header>

      {session?.question?.description && (
        <p className="rounded-cg border border-line bg-card px-4 py-3 text-body">
          {session.question.description}
        </p>
      )}

      {intervention && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-cg border-l-4 border-accent bg-accent-soft/40 px-4 py-3">
          <p className="text-body">{intervention.message}</p>
          <div className="flex gap-2">
            {[true, false].map((accepted) => (
              <button
                key={String(accepted)}
                type="button"
                onClick={() => {
                  socket.current?.emit('intervention_response', {
                    sessionId,
                    interventionId: intervention.id,
                    accepted,
                  });
                  setIntervention(null);
                }}
                className="rounded-cg border border-line bg-card px-3 py-1 text-sm text-body hover:bg-card-alt"
              >
                {accepted ? 'Helpful' : 'Dismiss'}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          {/*
            Fixed height, not a flex child that grows. The original let the chat
            column resize the editor, which made the editor jump every time a
            message arrived - there is a commit in that repo about exactly this.
          */}
          <div className="h-[26rem] overflow-hidden rounded-cg border border-line">
            <MonacoEditor
              height="100%"
              defaultLanguage="java"
              value={code}
              onChange={onCodeChange}
              options={{ minimap: { enabled: false }, fontSize: 14 }}
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => socket.current?.emit('run_code', { sessionId, code, userId })}
              disabled={status !== 'connected'}
              className="rounded-cg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-strong disabled:opacity-50"
            >
              Run
            </button>
            <span className="text-sm text-muted">
              Runs in an isolated sandbox, not on the server.
            </span>
          </div>

          {result && (
            <pre className="max-h-48 overflow-auto rounded-cg bg-inset p-3 font-mono text-sm text-ink">
              {result.compileError || result.stderr || result.stdout || '(no output)'}
            </pre>
          )}
        </div>

        <aside className="flex h-[32rem] flex-col rounded-cg border border-line bg-card">
          <h2 className="border-b border-line px-4 py-3 font-medium text-ink">Discussion</h2>

          <ul className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
            {messages.length === 0 ? (
              <li className="text-sm text-muted">
                Notes you write here are part of the session record.
              </li>
            ) : (
              messages.map((message, index) => (
                <li
                  key={index}
                  className={`rounded-cg px-3 py-2 text-sm ${
                    message.userId === userId
                      ? 'bg-accent-soft/40 text-ink'
                      : 'bg-card-alt text-body'
                  }`}
                >
                  {message.message}
                </li>
              ))
            )}
          </ul>

          <div className="flex gap-2 border-t border-line p-3">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && send()}
              placeholder="Say something…"
              className="flex-1 rounded-cg border border-line bg-card px-3 py-2 text-sm text-ink"
            />
            <button
              type="button"
              onClick={send}
              disabled={status !== 'connected'}
              className="rounded-cg bg-accent px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function ConnectionBadge({
  status,
  message,
}: {
  status: string;
  message: string | null;
}) {
  const label =
    status === 'connected'
      ? 'live'
      : status === 'connecting'
        ? 'connecting…'
        : status === 'unavailable'
          ? 'unavailable'
          : 'reconnecting…';

  const tone =
    status === 'connected'
      ? 'bg-ok/10 text-ok'
      : status === 'unavailable'
        ? 'bg-danger-soft text-danger'
        : 'bg-warn/10 text-warn';

  return (
    <span className={`rounded-cg px-2.5 py-1 text-sm ${tone}`} title={message ?? undefined}>
      {label}
    </span>
  );
}
