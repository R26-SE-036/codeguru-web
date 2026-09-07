'use client';

import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Loader2 } from 'lucide-react';

import { ApiError, api } from '@/lib/api';
import {
  STATE_TONE,
  describeEvent,
  eventIcon,
  eventLabel,
  isFailedRun,
  mergeTimeline,
  minutesInto,
  sessionDuration,
  stateLabel,
  type Prediction,
  type SessionEvent,
} from '@/lib/pair-events';
import { Badge, Card, EmptyState, PageHeader, Unavailable } from '@/components/ui';

/**
 * How the classifier read a session, minute by minute.
 *
 * Ported from Pair_Path frontend/src/app/ml-analytics/page.tsx. Two things
 * changed in the move:
 *
 *  - it called http://localhost:3001 directly, with no token. A deployed build
 *    would have queried the developer's laptop, and every request went past the
 *    JWT guard. It goes through the BFF now, like everything else here.
 *  - the metadata line read keys that only prisma/seeds.ts writes, so it
 *    described the seeded demo rows and said nothing about real ones. See
 *    lib/pair-events.ts.
 */

interface SessionSummary {
  id: string;
  status: string;
  startedAt: string;
  endedAt?: string | null;
  predictions: Prediction[];
}

interface SessionDetail {
  id: string;
  status: string;
  startedAt: string;
  endedAt?: string | null;
  question?: { title?: string };
  events?: SessionEvent[];
  predictions?: Prediction[];
}

export default function AnalyticsPage() {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    let live = true;
    api
      .get<SessionSummary[]>('pair', '/sessions/analytics/all')
      .then((data) => live && setSessions(data))
      .catch((err) => {
        if (!live) return;
        setUnavailable(err instanceof ApiError && err.isUnavailable);
        setSessions([]);
      });
    return () => {
      live = false;
    };
  }, []);

  const select = useCallback(async (id: string) => {
    setSelectedId(id);
    setLoadingDetail(true);
    try {
      setDetail(await api.get<SessionDetail>('pair', `/sessions/analytics/${id}`));
    } catch {
      setDetail(null);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Pair"
        title="How a session was read"
        lead="Every prediction the collaboration model made, on the same axis as what the pair was doing at the time."
        icon={BarChart3}
        tone="text-hue-insight"
        toneBg="bg-hue-insight/10"
      />

      {unavailable ? (
        <Unavailable what="Session analytics" />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <SessionList
            sessions={sessions}
            selectedId={selectedId}
            onSelect={select}
          />

          <Card className="min-h-[28rem] overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
              <h2 className="font-semibold text-ink">
                {detail?.question?.title ?? 'Timeline'}
              </h2>
              {detail && (
                <span className="text-sm text-muted">
                  {sessionDuration(detail.startedAt, detail.endedAt)}
                  {detail.status === 'ACTIVE' ? ' · still running' : ''}
                </span>
              )}
            </div>

            <div className="max-h-[34rem] overflow-y-auto p-5">
              {!selectedId ? (
                <p className="py-16 text-center text-sm text-muted">
                  Pick a session to see how it unfolded.
                </p>
              ) : loadingDetail ? (
                <p className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
                  <Loader2 size={15} className="animate-spin" aria-hidden />
                  Loading…
                </p>
              ) : detail ? (
                <Timeline detail={detail} />
              ) : (
                <p className="py-16 text-center text-sm text-muted">
                  Could not load that session.
                </p>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function SessionList({
  sessions,
  selectedId,
  onSelect,
}: {
  sessions: SessionSummary[] | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (sessions === null) {
    return (
      <Card className="grid min-h-[12rem] place-items-center p-6">
        <Loader2 size={18} className="animate-spin text-muted" aria-hidden />
      </Card>
    );
  }

  if (sessions.length === 0) {
    return (
      <Card className="p-6">
        <EmptyState icon={BarChart3} title="No sessions with predictions yet">
          The model writes a prediction once a session has enough activity to
          read. Run a pair session and come back.
        </EmptyState>
      </Card>
    );
  }

  return (
    <Card className="divide-y divide-line overflow-hidden">
      {sessions.map((session) => {
        // The list arrives newest-prediction-first per session, so [0] is the
        // last thing the model thought before the session stopped.
        const latest = session.predictions?.[0];
        const selected = session.id === selectedId;

        return (
          <button
            key={session.id}
            type="button"
            onClick={() => onSelect(session.id)}
            aria-current={selected}
            className={`cg-focusable block w-full px-5 py-4 text-left transition ${
              selected ? 'bg-card-alt' : 'hover:bg-card-alt'
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="truncate font-mono text-xs text-muted">{session.id}</span>
              <span className="shrink-0 text-xs text-muted">
                {new Date(session.startedAt).toLocaleDateString()}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              {latest ? (
                <Badge tone={STATE_TONE[latest.predictedState] ?? 'neutral'}>
                  {stateLabel(latest.predictedState)}
                </Badge>
              ) : (
                <Badge tone="neutral">no prediction</Badge>
              )}
              <span className="text-xs text-muted">
                {sessionDuration(session.startedAt, session.endedAt)}
              </span>
            </div>
          </button>
        );
      })}
    </Card>
  );
}

function Timeline({ detail }: { detail: SessionDetail }) {
  const items = mergeTimeline(detail.events, detail.predictions);

  if (items.length === 0) {
    return (
      <p className="py-16 text-center text-sm text-muted">
        Nothing was recorded for this session.
      </p>
    );
  }

  return (
    <ol className="space-y-3">
      {items.map((item, index) => {
        const minute = minutesInto(item.at, detail.startedAt);

        if (item.kind === 'prediction') {
          return (
            <li
              key={`p${index}`}
              className="flex flex-wrap items-center gap-3 rounded-cg border border-accent/25 bg-accent/5 px-4 py-3"
            >
              <span className="w-16 shrink-0 font-mono text-xs text-muted">
                {minute}m
              </span>
              <Badge tone={STATE_TONE[item.predictedState] ?? 'neutral'}>
                {stateLabel(item.predictedState)}
              </Badge>
              <span className="text-sm text-body">
                {(item.confidence * 100).toFixed(0)}% confident
              </span>
              {/* The model that made this call. A prediction whose provenance
                  cannot be checked is not evidence of anything - and this
                  field is the only place a rule-based fallback or an outage
                  is distinguishable from a real prediction. */}
              <span className="ml-auto font-mono text-xs text-muted">
                {item.modelVersion}
              </span>
            </li>
          );
        }

        const Icon = eventIcon(item.eventType);
        const detailLine = describeEvent(item);

        return (
          <li key={`e${index}`} className="flex items-start gap-3 px-4 py-1.5">
            <span className="w-16 shrink-0 pt-0.5 font-mono text-xs text-muted">
              {minute}m
            </span>
            <span
              className={`mt-0.5 shrink-0 ${
                isFailedRun(item) ? 'text-warn' : 'text-muted'
              }`}
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
              {detailLine && <p className="mt-0.5 text-sm text-body">{detailLine}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
