import {
  Bot,
  Code2,
  FileText,
  LogIn,
  Play,
  RefreshCw,
  Terminal,
  type LucideIcon,
} from 'lucide-react';

import type { BadgeTone } from '@/components/ui';

/**
 * Reading a session's behavioural record back.
 *
 * Shared by the analytics timeline and a single session's history, because
 * these two pages disagreeing about what a CODE_RUN_RESULT means would be a
 * quiet way to make the same session look like two different sessions.
 *
 * ============ WHY THE METADATA KEYS ARE WORTH BEING CAREFUL ABOUT ============
 * The original page read `linesAdded`, `content` and `error`. None of those
 * are written by the gateway - they are keys from prisma/seeds.ts, which
 * inserts a handful of fabricated events for a demo. So the metadata line
 * rendered for the mock rows and rendered nothing at all for every real one,
 * which reads as "nothing happened" rather than "this page is looking in the
 * wrong place".
 *
 * The keys below are the ones websocket.gateway.ts actually writes. If that
 * changes, this is the file that has to change with it.
 * ============================================================================
 */

/** The five collaboration states, from ml/app/label_mapping.py. */
export const PAIR_STATES = [
  'PRODUCTIVE',
  'DRIVER_DOMINANCE',
  'PASSIVE_NAVIGATOR',
  'LOGIC_STRUGGLE',
  'DISENGAGED',
] as const;

export type PairState = (typeof PAIR_STATES)[number];

/**
 * Tone per state.
 *
 * Only PRODUCTIVE is "ok". The other four are things worth attending to rather
 * than failures - a pair in LOGIC_STRUGGLE is working hard - so they carry
 * warn and neutral rather than danger, which would read as the student having
 * done something wrong.
 */
export const STATE_TONE: Record<string, BadgeTone> = {
  PRODUCTIVE: 'ok',
  DRIVER_DOMINANCE: 'warn',
  PASSIVE_NAVIGATOR: 'accent',
  LOGIC_STRUGGLE: 'warn',
  DISENGAGED: 'neutral',
};

export function stateLabel(state: string): string {
  return state.replace(/_/g, ' ').toLowerCase();
}

export interface SessionEvent {
  id?: string;
  userId: string;
  role?: string;
  eventType: string;
  timestamp: string;
  metadata?: string | Record<string, unknown> | null;
}

export interface Prediction {
  id?: string;
  windowStart: string;
  windowEnd: string;
  predictedState: string;
  confidence: number;
  modelVersion: string;
}

const EVENT_ICONS: Record<string, LucideIcon> = {
  JOIN: LogIn,
  CODE_EDIT: Code2,
  CODE_RUN: Play,
  CODE_RUN_RESULT: Terminal,
  DISCUSSION_NOTE: FileText,
  ROLE_SWITCH: RefreshCw,
  INTERVENTION_RESPONSE: Bot,
};

export function eventIcon(eventType: string): LucideIcon {
  return EVENT_ICONS[eventType] ?? Code2;
}

const EVENT_LABELS: Record<string, string> = {
  JOIN: 'Joined',
  CODE_EDIT: 'Edited the code',
  CODE_RUN: 'Ran the code',
  CODE_RUN_RESULT: 'Run finished',
  DISCUSSION_NOTE: 'Said something',
  ROLE_SWITCH: 'Swapped roles',
  INTERVENTION_RESPONSE: 'Answered a nudge',
};

export function eventLabel(eventType: string): string {
  return EVENT_LABELS[eventType] ?? eventType.replace(/_/g, ' ').toLowerCase();
}

/**
 * The metadata column is a JSON string.
 *
 * Prisma types it as Json, but the gateway writes JSON.stringify(...) into it,
 * so a row holds a JSON *string* rather than an object. Both shapes are
 * handled: rows written by prisma/seeds.ts really are objects.
 */
export function parseMetadata(
  metadata: SessionEvent['metadata'],
): Record<string, unknown> {
  if (!metadata) return {};
  if (typeof metadata !== 'string') return metadata;
  try {
    const parsed = JSON.parse(metadata);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * One line describing what this event actually was, or null when the event
 * type carries everything in its label already.
 */
export function describeEvent(event: SessionEvent): string | null {
  const data = parseMetadata(event.metadata);

  switch (event.eventType) {
    case 'DISCUSSION_NOTE':
      // The words, not the count. docs/annotation-codebook.md is explicit that
      // five messages of "ok" is a passive navigator despite the count, so a
      // page showing only how many were sent cannot be annotated from.
      return typeof data.note === 'string' && data.note ? `“${data.note}”` : null;

    case 'CODE_EDIT':
    case 'CODE_RUN':
      return typeof data.codeLength === 'number'
        ? `${data.codeLength} characters in the editor`
        : null;

    case 'CODE_RUN_RESULT':
      if (typeof data.success !== 'boolean') return null;
      return data.success ? 'Compiled and ran' : 'Failed';

    case 'ROLE_SWITCH': {
      const roles = data.newRoles;
      if (!roles || typeof roles !== 'object') return null;
      const driver = Object.entries(roles as Record<string, string>).find(
        ([, role]) => role === 'DRIVER',
      );
      return driver ? 'Keyboard handed over' : null;
    }

    case 'INTERVENTION_RESPONSE':
      if (typeof data.accepted !== 'boolean') return null;
      return data.accepted ? 'Marked it helpful' : 'Dismissed it';

    default:
      return null;
  }
}

/** True when a run event says the run failed. Used to tint the row. */
export function isFailedRun(event: SessionEvent): boolean {
  if (event.eventType !== 'CODE_RUN_RESULT') return false;
  return parseMetadata(event.metadata).success === false;
}

export type TimelineItem =
  | ({ kind: 'event'; at: number } & SessionEvent)
  | ({ kind: 'prediction'; at: number } & Prediction);

/**
 * Events and predictions on one axis, oldest first.
 *
 * A prediction is placed at its window END, which is when it was made - the
 * window start is where the evidence begins, and putting it there would show
 * the model reacting before the behaviour it reacted to.
 */
export function mergeTimeline(
  events: SessionEvent[] = [],
  predictions: Prediction[] = [],
): TimelineItem[] {
  const items: TimelineItem[] = [
    ...events.map((event) => ({
      ...event,
      kind: 'event' as const,
      at: new Date(event.timestamp).getTime(),
    })),
    ...predictions.map((prediction) => ({
      ...prediction,
      kind: 'prediction' as const,
      at: new Date(prediction.windowEnd).getTime(),
    })),
  ];

  return items.filter((item) => Number.isFinite(item.at)).sort((a, b) => a.at - b.at);
}

/**
 * How long a session ran.
 *
 * An ACTIVE session has no endedAt, and subtracting from `null` yields NaN -
 * which the original rendered as "NaN mins". Measuring an unfinished session
 * up to now is both correct and the only thing anyone would want to read.
 */
export function sessionDuration(startedAt: string, endedAt?: string | null): string {
  const start = new Date(startedAt).getTime();
  if (!Number.isFinite(start)) return '—';

  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  if (!Number.isFinite(end)) return '—';

  const minutes = Math.max(0, Math.round((end - start) / 60000));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** Minutes from the session start, for labelling a timeline row. */
export function minutesInto(at: number, startedAt: string): number {
  const start = new Date(startedAt).getTime();
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, Math.floor((at - start) / 60000));
}
