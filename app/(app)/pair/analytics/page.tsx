'use client';

import { useCallback, useEffect, useState } from 'react';
import { BarChart3, Bot, Loader2 } from 'lucide-react';

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

/** GET /sessions/analytics/interventions - see nudge-effect.ts in the API. */
interface EffectGroup {
  key: string;
  shown: number;
  measured: number;
  improved: number;
  unchanged: number;
  otherChange: number;
  enoughToCompare: boolean;
}

interface NudgeEffect {
  windowSeconds: number;
  horizonMinutes: number;
  minToCompare: number;
  byResponse: EffectGroup[];
  byState: EffectGroup[];
  reinforcement: EffectGroup;
}

export default function AnalyticsPage() {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [effect, setEffect] = useState<NudgeEffect | null>(null);

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

    // Separate, and never fatal: a page that cannot say whether the nudges
    // helped can still show every session.
    api
      .get<NudgeEffect>('pair', '/sessions/analytics/interventions')
      .then((data) => live && setEffect(data))
      .catch(() => {});

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

      {effect && !unavailable && <NudgeEffectCard effect={effect} />}

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
                  {detail.status === 'EXPIRED' ? ' · expired, nobody ended it' : ''}
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

const RESPONSE_LABEL: Record<string, string> = {
  accepted: 'Marked it helpful',
  dismissed: 'Dismissed it',
  no_response: 'Did not respond',
};

/**
 * Did the nudges change what the model saw next?
 *
 * The research question this component exists for, asked of the data for the
 * first time. Every nudge recorded the state that triggered it and whether
 * the pair accepted it, and every minute the model recorded what it saw -
 * and nothing had ever put the two side by side.
 *
 * Counts always; percentages only once a row has enough measured nudges to be
 * worth reading. "100%" from two nudges is a coincidence dressed as a finding,
 * and this page would be the easiest place in the project to mistake one for
 * the other.
 */
function NudgeEffectCard({ effect }: { effect: NudgeEffect }) {
  const problemShown = effect.byResponse.reduce((sum, group) => sum + group.shown, 0);
  if (problemShown === 0 && effect.reinforcement.shown === 0) return null;

  const reinforcement = effect.reinforcement;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 border-b border-line px-5 py-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-cg bg-hue-insight/10 text-hue-insight">
          <Bot size={17} strokeWidth={2.2} aria-hidden />
        </span>
        <div>
          <h2 className="font-semibold text-ink">Did the nudges help?</h2>
          <p className="text-sm text-muted">
            What the model saw next, after each nudge in your sessions.
          </p>
        </div>
      </div>

      {problemShown > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th scope="col" className="px-5 py-2.5 font-semibold">
                  When the pair…
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">
                  Shown
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">
                  Measured
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">
                  Recovered
                </th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">
                  Same state
                </th>
                <th scope="col" className="px-5 py-2.5 text-right font-semibold">
                  Other problem
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {effect.byResponse.map((group) => (
                <EffectRow
                  key={group.key}
                  label={RESPONSE_LABEL[group.key] ?? group.key}
                  group={group}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {effect.byState.length > 0 && (
        <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-line px-5 py-3 text-sm">
          {effect.byState.map((group) => (
            <span key={group.key} className="inline-flex items-center gap-2">
              <Badge tone={STATE_TONE[group.key] ?? 'neutral'}>{stateLabel(group.key)}</Badge>
              <span className="text-muted">
                {group.improved} of {group.measured} measured recovered
              </span>
            </span>
          ))}
        </div>
      )}

      {reinforcement.shown > 0 && (
        <p className="border-t border-line px-5 py-3 text-sm text-body">
          Encouragement on a productive pair: {reinforcement.improved} of{' '}
          {reinforcement.measured} measured stayed productive
          {reinforcement.shown > reinforcement.measured
            ? `, ${reinforcement.shown - reinforcement.measured} not measured`
            : ''}
          .
        </p>
      )}

      <p className="border-t border-line bg-card-alt px-5 py-3 text-xs text-muted">
        &ldquo;Next&rdquo; is the first prediction made only from activity after the nudge — at
        least {Math.round(effect.windowSeconds / 60)} minutes on, and within{' '}
        {effect.horizonMinutes}. These are counts, not proof: a pair chooses whether to accept a
        nudge, and the model reading both sides of it was trained on simulated sessions.
        Percentages appear once a row has {effect.minToCompare} measured nudges.
      </p>
    </Card>
  );
}

function EffectRow({ label, group }: { label: string; group: EffectGroup }) {
  const rate = (count: number) =>
    group.enoughToCompare && group.measured > 0 ? (
      <span className="ml-1 text-xs text-muted">({Math.round((100 * count) / group.measured)}%)</span>
    ) : null;

  return (
    <tr>
      <th scope="row" className="px-5 py-2.5 text-left font-medium text-ink">
        {label}
        {!group.enoughToCompare && group.measured > 0 ? (
          <span className="ml-2 text-xs font-normal text-muted">too few to compare</span>
        ) : null}
      </th>
      <td className="px-3 py-2.5 text-right tabular-nums text-muted">{group.shown}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-muted">{group.measured}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-ink">
        {group.improved}
        {rate(group.improved)}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-ink">
        {group.unchanged}
        {rate(group.unchanged)}
      </td>
      <td className="px-5 py-2.5 text-right tabular-nums text-ink">
        {group.otherChange}
        {rate(group.otherChange)}
      </td>
    </tr>
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
