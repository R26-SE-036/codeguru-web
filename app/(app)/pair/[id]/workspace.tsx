'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  ArrowLeft,
  CircleCheck,
  CircleX,
  Eye,
  Keyboard,
  Lightbulb,
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
import { Badge, Card, buttonClass } from '@/components/ui';

// Monaco pulls in a large editor bundle and touches `window` on import.
// Client-only, and code-split so it does not weigh on any other route.
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => <div className="h-full animate-pulse rounded-cg bg-inset" />,
});

/**
 * Ported from Pair_Path app/pair/[id]/page.tsx.
 *
 * The collaboration model is the original's: the driver types, the navigator
 * talks, roles switch on request, runs are broadcast to the room, and the ML
 * engine pushes interventions. What changed is the connection - see
 * lib/use-pair-socket for why this is the one place a token reaches the
 * browser, and why the socket is same-origin instead of
 * io('http://localhost:3001').
 *
 * ==================== WHAT THE FIRST PORT LOST ====================
 * The original honoured a delivery contract that this file had quietly
 * dropped, and each omission looked like a working feature:
 *
 *   - chat was emitted as `message` while the gateway reads `note`, so every
 *     line typed was broadcast as `undefined`, stored as `{}`, and rendered
 *     blank. The message COUNT still fed the model; the words reached nobody.
 *   - interventions were read at `.message`, which does not exist - the text
 *     is at `.delivery.message` - so every nudge rendered as an empty card.
 *   - `rag_hint` had no handler at all, so the entire retrieval pipeline
 *     reached no student.
 *   - `uiTarget` / `uiEffect` were ignored. They are the whole point of the
 *     contract: the engine says WHERE to draw attention and never sends
 *     solution content, so "glow the role-switch button" and "pulse the chat
 *     input" are the intervention. Rendering them all as one identical card
 *     discards the distinction the design rests on.
 *   - roles were invisible and both editors were writable, contradicting the
 *     platform constraint the annotation codebook and three of the model's
 *     fifteen features are built on.
 * ==================================================================
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
    difficulty?: string;
    /**
     * The platform concept tags. Shown because they are the thread between
     * components - the same tag names a Code Coach finding, a Study Guider
     * lesson and a practice game - and a student who never sees them cannot
     * connect the exercise in front of them to any of that.
     */
    conceptTags?: string[];
  };
}

/** A chat line. `note` is the wire name - see docs/inter-service-events.md. */
interface ChatNote {
  userId: string;
  note: string;
  timestamp?: string;
}

interface RunResult {
  success: boolean;
  stdout?: string;
  stderr?: string;
  compileError?: string | null;
  /**
   * Did the output match what the exercise expects?
   *
   * `null` when there is nothing to compare against - the program did not run,
   * or this exercise has no single right output. Distinct from `false`, and
   * the reason this is a tri-state rather than a boolean: a pair whose
   * exercise has no expected output must not be shown a red verdict.
   *
   * The expected text itself is never sent. Only this verdict is - see
   * common/public-select.ts in the API.
   */
  correct?: boolean | null;
}

/**
 * Where to draw attention, and how. Never solution content - that constraint
 * is what lets an intervention fire without giving the exercise away.
 */
interface Delivery {
  type?: string;
  uiTarget?: 'toast' | 'role_switch_button' | 'chat_input' | 'discussion_panel' | 'hint_panel' | 'none';
  uiEffect?: 'toast' | 'glow' | 'pulse' | 'highlight' | 'none';
  message?: string;
  audience?: 'pair' | 'driver' | 'navigator';
  autoDismissMs?: number;
}

interface Intervention {
  id: string;
  state?: string;
  action?: string;
  delivery?: Delivery;
}

/** The three-part scaffolded hint. Written by hand into the corpus, never generated. */
interface RagHint {
  conceptReminder: string;
  exampleIdea: string;
  reflectiveQuestion: string;
  retrievedConcepts?: string[];
  fallbackUsed?: boolean;
}

type Roles = Record<string, string>;

/**
 * uiEffect -> what it looks like.
 *
 * Deliberately a ring rather than a colour change: the effect has to read as
 * "look here" on a control that already has a meaning, without recolouring it
 * into something that looks like a different button.
 */
const EFFECT_CLASS: Record<string, string> = {
  glow: 'ring-2 ring-accent/60 ring-offset-2 ring-offset-page',
  pulse: 'ring-2 ring-accent/60 ring-offset-2 ring-offset-page animate-pulse',
  highlight: 'ring-2 ring-warn/60 ring-offset-2 ring-offset-page',
};

const DEFAULT_TOAST_MS = 4000;

export function Workspace({ sessionId, userId }: { sessionId: string; userId: string }) {
  const router = useRouter();

  const [session, setSession] = useState<Session | null>(null);
  const [code, setCode] = useState('');
  const [members, setMembers] = useState<string[]>([]);
  const [roles, setRoles] = useState<Roles>({});
  const [partnerConnected, setPartnerConnected] = useState(false);
  const [notes, setNotes] = useState<ChatNote[]>([]);
  const monacoTheme = useMonacoTheme();

  const [draft, setDraft] = useState('');
  const [result, setResult] = useState<RunResult | null>(null);
  const [intervention, setIntervention] = useState<Intervention | null>(null);
  const [hint, setHint] = useState<RagHint | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The last value we broadcast. Without it, an incoming code_update sets state,
  // which fires onChange, which broadcasts it straight back - two editors
  // bouncing the same edit between them.
  const lastBroadcast = useRef<string>('');

  const myRole = roles[userId];
  const isNavigator = myRole === 'NAVIGATOR';

  const handlers = useMemo(
    () => ({
      // Handlers are registered once, when the socket connects, so none of
      // these may close over state - hence the functional updaters throughout.
      room_state: (data: { members?: string[]; roles?: Roles }) => {
        setMembers(data.members ?? []);
        if (data.roles) setRoles(data.roles);
      },
      role_switch: (data: { roles?: Roles }) => {
        if (data.roles) setRoles(data.roles);
      },
      code_update: (data: { code: string }) => {
        lastBroadcast.current = data.code;
        setCode(data.code);
      },
      discussion_note: (data: ChatNote) => setNotes((prev) => [...prev, data]),
      code_result: (data: RunResult) => setResult(data),
      intervention: (data: Intervention) => setIntervention(data),
      // A hint accompanies a logic struggle. It arrives separately from the
      // intervention that triggered it, and after it.
      rag_hint: (data: RagHint) => setHint(data),
      // The server refused something the client thought it could do - the two
      // views of the roles have drifted. Saying so beats typing into a void.
      edit_rejected: (data: { message?: string }) => setNotice(data?.message ?? null),
      role_switch_rejected: (data: { message?: string }) => setNotice(data?.message ?? null),
      user_joined: () => setPartnerConnected(true),
      user_left: () => setPartnerConnected(false),
      session_ended: () => router.push(`/pair/${sessionId}/review`),
      // Reopening a finished session used to connect, write a JOIN event and
      // accept edits onto a closed record. The gateway refuses now; this is
      // the client half - go where the session actually lives.
      session_closed: () => router.replace(`/pair/${sessionId}/results`),
    }),
    [router, sessionId],
  );

  const { socket, status, error: socketError } = usePairSocket(sessionId, {
    onConnect: (connected) => connected.emit('join_room', { sessionId }),
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

  /*
   * Praise dismisses itself.
   *
   * PRODUCTIVE earns a brief toast, and `autoDismissMs` on the delivery is the
   * engine saying so. Making a student click "Helpful" or "Dismiss" to clear
   * "good work, keep it up" interrupts the flow the message exists to affirm -
   * which is the opposite of the intervention's purpose.
   */
  useEffect(() => {
    if (intervention?.delivery?.uiEffect !== 'toast') return;
    const timer = setTimeout(
      () => setIntervention(null),
      intervention.delivery.autoDismissMs ?? DEFAULT_TOAST_MS,
    );
    return () => clearTimeout(timer);
  }, [intervention]);

  /** A rejection explains one action; it should not sit on screen afterwards. */
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  const onCodeChange = useCallback(
    (value: string | undefined) => {
      const next = value ?? '';
      setCode(next);
      if (next === lastBroadcast.current) return;
      lastBroadcast.current = next;
      // No userId: the gateway takes the identity from the verified handshake
      // and ignores anything the body claims.
      socket.current?.emit('code_change', { sessionId, code: next });
    },
    [socket, sessionId],
  );

  function send() {
    const note = draft.trim();
    if (!note) return;
    // `note`, not `message`. The gateway reads `note` and now refuses to log a
    // DISCUSSION_NOTE event without text, so the old key would be dropped
    // loudly rather than counted silently.
    socket.current?.emit('discussion_note', { sessionId, note });
    setNotes((prev) => [...prev, { userId, note, timestamp: new Date().toISOString() }]);
    setDraft('');
  }

  /** The effect classes for one target, when the live intervention names it. */
  const effectOn = (target: Delivery['uiTarget']) => {
    const delivery = intervention?.delivery;
    if (!delivery || delivery.uiTarget !== target) return '';
    return EFFECT_CLASS[delivery.uiEffect ?? ''] ?? '';
  };

  const isToast = intervention?.delivery?.uiEffect === 'toast';

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
          <RoleBadge role={myRole} />
          <ConnectionBadge status={status} message={socketError} />
          <button
            type="button"
            onClick={() => socket.current?.emit('role_switch', { sessionId })}
            disabled={status !== 'connected'}
            className={buttonClass({
              variant: 'secondary',
              size: 'sm',
              className: effectOn('role_switch_button'),
            })}
          >
            <RefreshCw size={14} strokeWidth={2.2} aria-hidden />
            Switch roles
          </button>
          <button
            type="button"
            onClick={async () => {
              // The room is told by the server, once the row says COMPLETED -
              // so the partner leaves too instead of sitting in a dead session.
              await api.post('pair', `/sessions/${sessionId}/end`, { finalCode: code });
              router.push(`/pair/${sessionId}/review`);
            }}
            className={buttonClass({ size: 'sm' })}
          >
            End session
          </button>
        </div>
      </header>

      {notice && (
        <p
          role="status"
          className="rounded-cg border border-warn/30 bg-warn/10 px-4 py-2.5 text-sm text-body"
        >
          {notice}
        </p>
      )}

      {session?.question?.description && (
        <Card className="p-5">
          <p className="text-body">{session.question.description}</p>

          {(session.question.conceptTags?.length || session.question.difficulty) && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {session.question.difficulty && (
                <Badge tone="neutral">{session.question.difficulty.toLowerCase()}</Badge>
              )}
              {session.question.conceptTags?.map((tag) => (
                <Badge key={tag} tone="accent">
                  {tag.replace(/_/g, ' ')}
                </Badge>
              ))}
            </div>
          )}
        </Card>
      )}

      {intervention?.delivery?.message && (
        <InterventionCard
          intervention={intervention}
          isToast={isToast}
          onRespond={(accepted) => {
            socket.current?.emit('intervention_response', {
              sessionId,
              interventionId: intervention.id,
              accepted,
            });
            setIntervention(null);
          }}
        />
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
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                padding: { top: 12 },
                // The navigator reads and talks; the driver types. The gateway
                // enforces the same rule, so this is the courtesy half of it -
                // without it the navigator types happily and every keystroke is
                // silently discarded on the server.
                readOnly: isNavigator,
                domReadOnly: isNavigator,
              }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => socket.current?.emit('run_code', { sessionId, code })}
              disabled={status !== 'connected'}
              className={buttonClass({ size: 'sm' })}
            >
              <Play size={15} strokeWidth={2.4} aria-hidden />
              Run
            </button>
            <span className="text-sm text-muted">
              {isNavigator
                ? 'You are navigating — read the code, spot the problem, say it in the chat.'
                : 'Runs in an isolated sandbox, not on the server.'}
            </span>
          </div>

          {result && (
            <Card className="overflow-hidden">
              <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
                <Terminal size={15} strokeWidth={2.2} aria-hidden className="text-muted" />
                <h3 className="text-sm font-semibold text-ink">Output</h3>
                <RunVerdict result={result} />
              </div>
              <pre className="max-h-48 overflow-auto bg-inset p-4 font-mono text-sm text-ink">
                {result.compileError ||
                  result.stderr ||
                  result.stdout ||
                  (result.success ? 'The program ran and printed nothing.' : '(no output)')}
              </pre>
            </Card>
          )}

          {hint && <HintPanel hint={hint} className={effectOn('hint_panel')} />}
        </div>

        <aside
          className={`flex h-[32rem] flex-col overflow-hidden rounded-cg-lg border border-line bg-card shadow-cg-sm ${effectOn(
            'discussion_panel',
          )}`}
        >
          <h2 className="flex items-center gap-2 border-b border-line px-4 py-3 font-semibold text-ink">
            <MessagesSquare size={16} strokeWidth={2.2} aria-hidden className="text-hue-pair" />
            Discussion
          </h2>

          <ul className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
            {notes.length === 0 ? (
              <li className="pt-6 text-center text-sm text-muted">
                Notes you write here are part of the session record.
              </li>
            ) : (
              notes.map((entry, index) => {
                const mine = entry.userId === userId;

                return (
                  <li
                    key={index}
                    className={`max-w-[85%] rounded-cg px-3 py-2 text-sm ${
                      mine
                        ? 'ml-auto bg-accent text-on-accent'
                        : 'mr-auto bg-card-alt text-body'
                    }`}
                  >
                    {entry.note}
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
              className={`cg-focusable h-10 flex-1 rounded-cg border border-line bg-card-alt px-3 text-sm text-ink placeholder:text-faint-nontext hover:border-line-strong focus-visible:border-accent ${effectOn(
                'chat_input',
              )}`}
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

/**
 * The nudge itself.
 *
 * Two shapes, chosen by uiEffect. A toast affirms and leaves; anything else
 * asks a question of the pair and is worth a response, which is the only
 * signal anyone has about whether these interventions land.
 */
function InterventionCard({
  intervention,
  isToast,
  onRespond,
}: {
  intervention: Intervention;
  isToast: boolean;
  onRespond: (accepted: boolean) => void;
}) {
  const message = intervention.delivery?.message;

  if (isToast) {
    return (
      <p
        role="status"
        className="flex animate-cg-fade items-center gap-3 rounded-cg border border-ok/30 bg-ok/10 px-4 py-2.5 text-sm text-body"
      >
        <Sparkles size={16} strokeWidth={2.2} aria-hidden className="shrink-0 text-ok" />
        {message}
      </p>
    );
  }

  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 border-l-4 border-l-accent p-4">
      <p className="flex items-center gap-3 text-body">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-cg bg-accent/10 text-accent">
          <Sparkles size={16} strokeWidth={2.2} aria-hidden />
        </span>
        {message}
      </p>
      <div className="flex gap-2">
        {[true, false].map((accepted) => (
          <button
            key={String(accepted)}
            type="button"
            onClick={() => onRespond(accepted)}
            className={buttonClass({ variant: 'secondary', size: 'sm' })}
          >
            {accepted ? 'Helpful' : 'Dismiss'}
          </button>
        ))}
      </div>
    </Card>
  );
}

/**
 * The retrieved hint, in the three parts the corpus is written in.
 *
 * Kept as three labelled sections rather than one paragraph because that
 * separation IS the pedagogy: a reminder of the concept, an idea to try, and a
 * question to answer - never the answer itself.
 */
function HintPanel({ hint, className }: { hint: RagHint; className?: string }) {
  return (
    <Card className={`overflow-hidden ${className ?? ''}`}>
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <Lightbulb size={15} strokeWidth={2.2} aria-hidden className="text-warn" />
        <h3 className="text-sm font-semibold text-ink">A nudge, not an answer</h3>
        {hint.fallbackUsed && (
          <span className="ml-auto text-xs text-muted">general guidance</span>
        )}
      </div>
      <dl className="space-y-3 p-4 text-sm">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Concept</dt>
          <dd className="mt-1 text-body">{hint.conceptReminder}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Try this</dt>
          <dd className="mt-1 text-body">{hint.exampleIdea}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Ask yourselves</dt>
          <dd className="mt-1 text-body">{hint.reflectiveQuestion}</dd>
        </div>
      </dl>
    </Card>
  );
}

/**
 * Which role this student holds.
 *
 * Shown because the editor's behaviour depends on it. A read-only editor with
 * no explanation reads as a broken page, and "switch roles" means nothing to
 * someone who does not know which one they are in.
 */
/**
 * Whether the run produced the answer the exercise wanted.
 *
 * Nothing is shown when there is no verdict to give: a program that failed to
 * compile already says so in the pane below, and an exercise with no recorded
 * expected output has nothing to compare against. Silence is the honest
 * result there - a grey "unknown" badge on every run would train the pair to
 * ignore the one place a real verdict appears.
 *
 * Deliberately says nothing about WHY the output differs. The expected text
 * stays on the server; showing it here would hand over the answer to most of
 * these exercises.
 */
function RunVerdict({ result }: { result: RunResult }) {
  if (!result.success || result.correct === null || result.correct === undefined) return null;

  return result.correct ? (
    <Badge tone="ok">
      <CircleCheck size={13} strokeWidth={2.3} aria-hidden />
      Matches the expected output
    </Badge>
  ) : (
    <Badge tone="warn">
      <CircleX size={13} strokeWidth={2.3} aria-hidden />
      Not the expected output yet
    </Badge>
  );
}

function RoleBadge({ role }: { role?: string }) {
  if (!role) return null;

  const navigator = role === 'NAVIGATOR';

  return (
    <Badge tone={navigator ? 'neutral' : 'accent'}>
      {navigator ? (
        <Eye size={13} strokeWidth={2.3} aria-hidden />
      ) : (
        <Keyboard size={13} strokeWidth={2.3} aria-hidden />
      )}
      {navigator ? 'Navigator' : 'Driver'}
    </Badge>
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
      // Losing the live connection mid-session changes what the workspace can
      // do - the Run and Switch roles buttons disable themselves - and the
      // only signal was a colour change on a dot.
      role="status"
      aria-live="polite"
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
