/**
 * Which requests through the proxy are Pro features - as pure rules, so they
 * can be tested without a server.
 *
 * ==================== WHY THE PROXY IS THE GATE ====================
 * A browser reaches Study Guider, the gamification engine and PairPath's REST
 * API only through /api/bff (see deploy/Caddyfile: the public routes are this
 * app, Code Coach's /api/v1, and PairPath's socket). So one check here is real
 * enforcement, and none of the three services needed to change. The UI shows
 * locks as well, but a lock in the UI alone would be a suggestion.
 * ===================================================================
 *
 * The split (Code Guru Free / Pro):
 *   Study      Free opens 3 lessons a month, and their quizzes; the learning
 *              map is Pro.
 *   Practice   Free plays the daily challenge; free play, the leaderboard and
 *              its settings are Pro.
 *   Pair       Free runs exercise sessions and the review quiz; free coding,
 *              the comparison after the quiz, and analytics are Pro.
 *   Code Coach everything stays free, the VS Code extension included.
 */

import type { ServiceKey } from './upstream';

export type ProFeature =
  | 'free-play'
  | 'leaderboard'
  | 'learning-map'
  | 'lessons'
  | 'free-coding'
  | 'comparison'
  | 'pair-analytics';

export type GateDecision =
  | { kind: 'allow' }
  /** Pro only. A Free student gets 402. */
  | { kind: 'pro'; feature: ProFeature }
  /** Opening a lesson: allowed while the student has free lessons left this month. */
  | { kind: 'lesson'; triggerId: string; errorType: string | null; conceptTag: string | null }
  /** A lesson's quiz: allowed for a lesson the student opened this month. */
  | { kind: 'quiz'; errorType: string | null }
  /** Allowed, but a Free student's copy has the after-quiz comparison removed. */
  | { kind: 'strip-feedback' };

const ALLOW: GateDecision = { kind: 'allow' };

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

function field(body: unknown, key: string): unknown {
  return body && typeof body === 'object' ? (body as Record<string, unknown>)[key] : undefined;
}

export function gate(service: ServiceKey, method: string, path: string, body: unknown): GateDecision {
  const verb = method.toUpperCase();
  const clean = path.replace(/\/+$/, '') || '/';

  if (service === 'play') {
    // The daily challenge is the free taste; every other round is free play.
    if (verb === 'POST' && clean === '/game/submit') {
      return field(body, 'mode') === 'daily' ? ALLOW : { kind: 'pro', feature: 'free-play' };
    }
    if (verb === 'GET' && clean.startsWith('/game/')) return { kind: 'pro', feature: 'free-play' };
    if (clean === '/leaderboard' || clean === '/me/preferences') return { kind: 'pro', feature: 'leaderboard' };
    return ALLOW;
  }

  if (service === 'study') {
    if (verb === 'POST' && clean === '/struggle/detect') {
      const triggerId = text(field(body, 'trigger_id'));
      // No trigger id is not a lesson Study Guider will build; let it refuse.
      if (!triggerId) return ALLOW;
      return {
        kind: 'lesson',
        triggerId,
        errorType: text(field(body, 'error_type')),
        conceptTag: text(field(body, 'concept_tag')),
      };
    }
    if (verb === 'POST' && clean === '/quiz/generate') {
      return { kind: 'quiz', errorType: text(field(body, 'error_type')) };
    }
    if (clean === '/progress/me' || clean.startsWith('/progress/me/')) {
      return { kind: 'pro', feature: 'learning-map' };
    }
    return ALLOW;
  }

  if (service === 'pair') {
    if (verb === 'POST' && clean === '/sessions' && field(body, 'mode') === 'FREE') {
      return { kind: 'pro', feature: 'free-coding' };
    }
    if (clean.startsWith('/sessions/analytics')) return { kind: 'pro', feature: 'pair-analytics' };
    // /reviews/:id and /reviews/:id/submit carry the comparison; /answer and
    // /result do not.
    if (/^\/reviews\/[^/]+$/.test(clean) && verb === 'GET') return { kind: 'strip-feedback' };
    if (/^\/reviews\/[^/]+\/submit$/.test(clean) && verb === 'POST') return { kind: 'strip-feedback' };
    return ALLOW;
  }

  return ALLOW;
}

/** What a Free student is told, by feature. Shown verbatim by the UI. */
export const LOCKED_MESSAGE: Record<ProFeature, string> = {
  'free-play': 'Free play is part of Code Guru Pro. The daily challenge is free - upgrade to play any format, any time.',
  leaderboard: 'Leaderboards are part of Code Guru Pro.',
  'learning-map': 'The learning map is part of Code Guru Pro.',
  lessons: 'You have used this month’s free lessons. Upgrade to Pro for unlimited lessons.',
  'free-coding': 'Free coding is part of Code Guru Pro. Exercise sessions stay free.',
  comparison: 'The side-by-side comparison and your path to the solution are part of Code Guru Pro.',
  'pair-analytics': 'Pair analytics are part of Code Guru Pro.',
};

/** A Free student's copy of a review: the comparison replaced by a flag. */
export function withoutFeedback(review: unknown): unknown {
  if (!review || typeof review !== 'object' || Array.isArray(review)) return review;
  const record = review as Record<string, unknown>;
  if (!('feedback' in record) || record.feedback === null) return review;
  return { ...record, feedback: null, feedbackLocked: true };
}

/** Whether a quiz belongs to a lesson the student opened this month. */
export function quizUnlocked(
  errorType: string | null,
  unlocked: Array<{ error_type?: string | null; concept_tag?: string | null }>,
): boolean {
  if (!errorType) return false;
  return unlocked.some((u) => u.error_type === errorType || u.concept_tag === errorType);
}
