'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Bot,
  Code2,
  History,
  Loader2,
  MessagesSquare,
  Rows3,
} from 'lucide-react';

import { ApiError, api } from '@/lib/api';
import {
  STATE_TONE,
  describeEvent,
  eventIcon,
  eventLabel,
  isFailedRun,
  mergeTimeline,
  minutesInto,
  parseMetadata,
  sessionDuration,
  stateLabel,
  type Prediction,
  type SessionEvent,
} from '@/lib/pair-events';
import { Badge, Card, EmptyState, PageHeader, Unavailable, buttonClass } from '@/components/ui';

/**
 * Everything one session left behind.
 *
 * Ported from Pair_Path frontend/src/app/session-history/[id]/page.tsx, which
 * had the same four tabs. What it could not show is what changed underneath:
 *
 *  - the chat tab rendered `metadata.content`, a key only the seed writes. Real
 *    notes were stored under `note` - and until today they were not stored at
 *    all, because the client sent the text under a third key the gateway never
 *    read. See websocket.gateway.ts.
 *  - the role beside each event was always blank, because every row was written
 *    with role: ''. Sessions recorded before that fix still show nothing here,
 *    and that is honest: the information was never captured.
 */

interface Member {
  userId: string;
  role: string;
  user?: { firstName?: string; lastName?: string; email?: string };
}

interface Intervention {
  id: string;
  state: string;
  action: string;
  message: string;
  shownAt: string;
  accepted?: boolean | null;
}

interface SessionDetail {
  id: string;
  joinCode: string;
  status: string;
  startedAt: string;
  endedAt?: string | null;
  finalCode?: string | null;
  question?: { title?: string; description?: string; difficulty?: string };
  members?: Member[];
  events?: SessionEvent[];
  predictions?: Prediction[];
  interventions?: Intervention[];
}

const TABS = [
  { key: 'timeline', label: 'Timeline', icon: Rows3 },
  { key: 'chat', label: 'Discussion', icon: MessagesSquare },
  { key: 'code', label: 'Final code', icon: Code2 },
  { key: 'interventions', label: 'Nudges', icon: Bot },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function SessionHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [session, setSession] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>('timeline');

  useEffect(() => {
    let live = true;
    api
      .get<SessionDetail>('pair', `/sessions/analytics/${id}`)
      .then((data) => live && setSession(data))
      .catch((err) => {
        if (!live) return;
        setError(
          err instanceof ApiError && err.isUnavailable
            ? 'unavailable'
            : 'Could not load that session.',
        );
      })
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [id]);

  if (loading) {
    return (
      <p className="flex items-center justify-center gap-2 py-24 text-sm text-muted">
        <Loader2 size={16} className="animate-spin" aria-hidden />
        Loading the session…
      </p>
    );
  }

  if (error === 'unavailable') return <Unavailable what="Session history" />;

  if (error || !session) {
    return (
      <EmptyState
        icon={History}
        title="Session not found"
        action={
          <Link href="/pair" className={buttonClass({ variant: 'secondary' })}>
            <ArrowLeft size={16} aria-hidden />
            Back to pairing
          </Link>
        }
      >
        {error ?? 'That session does not exist, or is not yours.'}
      </EmptyState>
    );
  }

  const notes = (session.events ?? []).filter((e) => e.eventType === 'DISCUSSION_NOTE');
  const nameOf = (userId: string) => {
    const member = session.members?.find((m) => m.userId === userId);
    if (!member?.user) return userId;
    return [member.user.firstName, member.user.lastName].filter(Boolean).join(' ') || userId;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pair"
        title={session.question?.title ?? 'Pair session'}
        lead={`${sessionDuration(session.startedAt, session.endedAt)} · ${new Date(
          session.startedAt,
        ).toLocaleString()}`}
        icon={History}
        tone="text-hue-pair"
        toneBg="bg-hue-pair/10"
        actions={
          <Link href="/pair" className={buttonClass({ variant: 'secondary', size: 'sm' })}>
            <ArrowLeft size={14} aria-hidden />
            All sessions
          </Link>
        }
      />

      <Card className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 text-sm">
        <span className="flex items-center gap-2">
          <span className="text-muted">Code</span>
          <span className="rounded bg-inset px-1.5 py-0.5 font-mono text-xs tracking-widest text-ink">
            {session.joinCode}
          </span>
        </span>
        <Badge tone={session.status === 'ACTIVE' ? 'ok' : 'neutral'}>
          {session.status === 'ACTIVE' ? 'Active' : 'Finished'}
        </Badge>
        {session.members?.map((member) => (
          <span key={member.userId} className="text-body">
            {nameOf(member.userId)}
            <span className="ml-1.5 text-xs uppercase tracking-wide text-muted">
              {member.role.toLowerCase()}
            </span>
          </span>
        ))}
      </Card>

      <div role="tablist" aria-label="Session record" className="flex flex-wrap gap-2">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={buttonClass({
              variant: tab === key ? 'primary' : 'secondary',
              size: 'sm',
            })}
          >
            <Icon size={14} strokeWidth={2.2} aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {tab === 'timeline' && <TimelineTab session={session} />}

      {tab === 'chat' && (
        <Card className="p-5">
          {notes.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">
              Nothing was said in this session.
            </p>
          ) : (
            <ul className="space-y-3">
              {notes.map((note, index) => (
                <li key={index}>
                  <p className="text-xs text-muted">
                    {nameOf(note.userId)}
                    {note.role ? ` · ${note.role.toLowerCase()}` : ''} ·{' '}
                    {new Date(note.timestamp).toLocaleTimeString()}
                  </p>
                  <p className="mt-1 rounded-cg bg-card-alt px-3 py-2 text-sm text-body">
                    {String(parseMetadata(note.metadata).note ?? '') || (
                      <span className="text-muted">
                        (no text was recorded for this message)
                      </span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'code' && (
        <Card className="overflow-hidden">
          <pre className="max-h-[32rem] overflow-auto bg-inset p-5 font-mono text-sm text-ink">
            {session.finalCode || '(no code was saved for this session)'}
          </pre>
        </Card>
      )}

      {tab === 'interventions' && <InterventionsTab session={session} />}
    </div>
  );
}

function TimelineTab({ session }: { session: SessionDetail }) {
  const items = mergeTimeline(session.events, session.predictions);

  if (items.length === 0) {
    return (
      <Card className="p-5">
        <p className="py-10 text-center text-sm text-muted">
          Nothing was recorded for this session.
        </p>
      </Card>
    );
  }

  return (
    <Card className="max-h-[34rem] overflow-y-auto p-5">
      <ol className="space-y-2">
        {items.map((item, index) => {
          const minute = minutesInto(item.at, session.startedAt);

          if (item.kind === 'prediction') {
            return (
              <li
                key={`p${index}`}
                className="flex flex-wrap items-center gap-3 rounded-cg border border-accent/25 bg-accent/5 px-4 py-2.5"
              >
                <span className="w-14 shrink-0 font-mono text-xs text-muted">{minute}m</span>
                <Badge tone={STATE_TONE[item.predictedState] ?? 'neutral'}>
                  {stateLabel(item.predictedState)}
                </Badge>
                <span className="text-sm text-body">
                  {(item.confidence * 100).toFixed(0)}% confident
                </span>
                <span className="ml-auto font-mono text-xs text-muted">
                  {item.modelVersion}
                </span>
              </li>
            );
          }

          const Icon = eventIcon(item.eventType);
          const line = describeEvent(item);

          return (
            <li key={`e${index}`} className="flex items-start gap-3 px-4 py-1">
              <span className="w-14 shrink-0 pt-0.5 font-mono text-xs text-muted">
                {minute}m
              </span>
              <span
                className={`mt-0.5 shrink-0 ${isFailedRun(item) ? 'text-warn' : 'text-muted'}`}
              >
                <Icon size={15} strokeWidth={2.1} aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-sm text-ink">
                  {eventLabel(item.eventType)}
                  {item.role ? (
                    <span className="ml-2 text-xs font-semibold uppercase tracking-wide text-muted">
                      {item.role.toLowerCase()}
                    </span>
                  ) : null}
                </p>
                {line && <p className="mt-0.5 text-sm text-body">{line}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function InterventionsTab({ session }: { session: SessionDetail }) {
  const interventions = session.interventions ?? [];

  if (interventions.length === 0) {
    return (
      <Card className="p-5">
        <p className="py-10 text-center text-sm text-muted">
          {/* Silence is a result, not a gap. The engine holds back below its
              confidence threshold and rate-limits what it does send. */}
          The engine stayed quiet through this session.
        </p>
      </Card>
    );
  }

  return (
    <Card className="divide-y divide-line overflow-hidden">
      {interventions.map((intervention) => (
        <div key={intervention.id} className="px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATE_TONE[intervention.state] ?? 'neutral'}>
              {stateLabel(intervention.state)}
            </Badge>
            <span className="font-mono text-xs text-muted">{intervention.action}</span>
            <span className="ml-auto text-xs text-muted">
              {new Date(intervention.shownAt).toLocaleTimeString()}
            </span>
          </div>
          <p className="mt-2 text-sm text-body">{intervention.message}</p>
          <p className="mt-1.5 text-xs text-muted">
            {/* Null is its own answer: the pair neither accepted nor dismissed
                it, which is different from having rejected it and is the more
                common outcome for a toast that dismisses itself. */}
            {intervention.accepted === true
              ? 'Marked helpful'
              : intervention.accepted === false
                ? 'Dismissed'
                : 'No response'}
          </p>
        </div>
      ))}
    </Card>
  );
}
