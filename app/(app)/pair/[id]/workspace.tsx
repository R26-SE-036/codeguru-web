'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  ArrowLeft,
  MessagesSquare,
  Play,
  RefreshCw,
  SendHorizonal,
  Sparkles,
  Terminal,
  TriangleAlert,
  Users,
} from 'lucide-react';

import { ApiError, api } from '@/lib/api';
import { usePairSocket } from '@/lib/use-pair-socket';
import { useMonacoTheme } from '@/lib/theme';
import { Card, buttonClass } from '@/components/ui';

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
  const monacoTheme = useMonacoTheme();

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
    return (
      <div className="mx-auto max-w-2xl">
        <Card className="px-6 py-12 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-cg-lg bg-danger/10 text-danger">
            <TriangleAlert size={22} strokeWidth={2} aria-hidden />
          </span>
          <h1 className="mt-4 text-lg font-bold text-ink">Session unavailable</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-body">{error}</p>
          <Link
            href="/pair"
            className={buttonClass({ variant: 'secondary', className: 'mt-6' })}
          >
            <ArrowLeft size={16} strokeWidth={2.2} aria-hidden />
            Back to pairing
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-cg bg-hue-pair/10 text-hue-pair">
            <Users size={19} strokeWidth={2.1} aria-hidden />
          </span>
          <div>
            <h1 className="font-bold text-ink">
              {session?.question?.title ?? 'Pair session'}
            </h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
              <span className="rounded bg-inset px-1.5 py-0.5 font-mono text-xs tracking-widest text-ink">
                {session?.joinCode ?? '—'}
              </span>
              <span>
                {members.length} in the room
                {partnerConnected ? ' · partner connected' : ''}
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ConnectionBadge status={status} message={socketError} />
          <button
            type="button"
            onClick={() => socket.current?.emit('role_switch', { sessionId, userId })}
            disabled={status !== 'connected'}
            className={buttonClass({ variant: 'secondary', size: 'sm' })}
          >
            <RefreshCw size={14} strokeWidth={2.2} aria-hidden />
            Switch roles
          </button>
          <button
            type="button"
            onClick={async () => {
              await api.post('pair', `/sessions/${sessionId}/end`, { finalCode: code });
              router.push(`/pair/${sessionId}/review`);
            }}
            className={buttonClass({ size: 'sm' })}
          >
            End session
          </button>
        </div>
      </header>

      {session?.question?.description && (
        <Card className="p-5">
          <p className="text-body">{session.question.description}</p>
        </Card>
      )}

      {intervention && (
        <Card className="flex flex-wrap items-center justify-between gap-3 border-l-4 border-l-accent p-4">
          <p className="flex items-center gap-3 text-body">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-cg bg-accent/10 text-accent">
              <Sparkles size={16} strokeWidth={2.2} aria-hidden />
            </span>
            {intervention.message}
          </p>
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
                className={buttonClass({ variant: 'secondary', size: 'sm' })}
              >
                {accepted ? 'Helpful' : 'Dismiss'}
              </button>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-3">
          {/*
            Fixed height, not a flex child that grows. The original let the chat
            column resize the editor, which made the editor jump every time a
            message arrived - there is a commit in that repo about exactly this.
          */}
          <div className="h-[26rem] overflow-hidden rounded-cg-lg border border-line shadow-cg-sm">
            <MonacoEditor
              height="100%"
              defaultLanguage="java"
              // Monaco ships its own themes and does not read our CSS variables,
              // so it is the one surface that has to be told the theme by hand.
              theme={monacoTheme}
              value={code}
              onChange={onCodeChange}
              options={{ minimap: { enabled: false }, fontSize: 14, padding: { top: 12 } }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => socket.current?.emit('run_code', { sessionId, code, userId })}
              disabled={status !== 'connected'}
              className={buttonClass({ size: 'sm' })}
            >
              <Play size={15} strokeWidth={2.4} aria-hidden />
              Run
            </button>
            <span className="text-sm text-muted">
              Runs in an isolated sandbox, not on the server.
            </span>
          </div>

          {result && (
            <Card className="overflow-hidden">
              <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
                <Terminal size={15} strokeWidth={2.2} aria-hidden className="text-muted" />
                <h3 className="text-sm font-semibold text-ink">Output</h3>
              </div>
              <pre className="max-h-48 overflow-auto bg-inset p-4 font-mono text-sm text-ink">
                {result.compileError || result.stderr || result.stdout || '(no output)'}
              </pre>
            </Card>
          )}
        </div>

        <aside className="flex h-[32rem] flex-col overflow-hidden rounded-cg-lg border border-line bg-card shadow-cg-sm">
          <h2 className="flex items-center gap-2 border-b border-line px-4 py-3 font-semibold text-ink">
            <MessagesSquare size={16} strokeWidth={2.2} aria-hidden className="text-hue-pair" />
            Discussion
          </h2>

          <ul className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
            {messages.length === 0 ? (
              <li className="pt-6 text-center text-sm text-muted">
                Notes you write here are part of the session record.
              </li>
            ) : (
              messages.map((message, index) => {
                const mine = message.userId === userId;

                return (
                  <li
                    key={index}
                    className={`max-w-[85%] rounded-cg px-3 py-2 text-sm ${
                      mine
                        ? 'ml-auto bg-accent text-on-accent'
                        : 'mr-auto bg-card-alt text-body'
                    }`}
                  >
                    {message.message}
                  </li>
                );
              })
            )}
          </ul>

          <div className="flex gap-2 border-t border-line p-3">
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && send()}
              placeholder="Say something…"
              className="cg-focusable h-10 flex-1 rounded-cg border border-line bg-card-alt px-3 text-sm text-ink placeholder:text-faint-nontext hover:border-line-strong focus-visible:border-accent"
            />
            <button
              type="button"
              onClick={send}
              disabled={status !== 'connected'}
              aria-label="Send message"
              className={buttonClass({ size: 'sm', className: 'px-3' })}
            >
              <SendHorizonal size={15} strokeWidth={2.3} aria-hidden />
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
      ? 'bg-ok/10 text-ok ring-ok/25'
      : status === 'unavailable'
        ? 'bg-danger/10 text-danger ring-danger/25'
        : 'bg-warn/10 text-warn ring-warn/25';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-cg-sm px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${tone}`}
      title={message ?? undefined}
    >
      {/* Pulses only while the connection is not settled, so a steady dot means
          steady - the animation itself carries the state. */}
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full bg-current ${
          status === 'connected' || status === 'unavailable' ? '' : 'animate-pulse'
        }`}
      />
      {label}
    </span>
  );
}
