/**
 * Free and Pro, as the proxy enforces them. The proxy is the only way a
 * browser reaches Study Guider, the gamification engine and PairPath, so these
 * rules are the paywall - a rule missing here is a Pro feature given away.
 */
import { describe, expect, it } from 'vitest';

import { gate, quizUnlocked, withoutFeedback } from '@/lib/plan-gate';

describe('Practice', () => {
  it('leaves the daily challenge free and makes every other round Pro', () => {
    expect(gate('play', 'GET', '/daily', undefined)).toEqual({ kind: 'allow' });
    expect(gate('play', 'POST', '/game/submit', { mode: 'daily' })).toEqual({ kind: 'allow' });
    expect(gate('play', 'POST', '/game/submit', { mode: 'adaptive' })).toEqual({ kind: 'pro', feature: 'free-play' });
    expect(gate('play', 'POST', '/game/submit', {})).toEqual({ kind: 'pro', feature: 'free-play' });
    expect(gate('play', 'GET', '/game/u1/BugHunt/loop_boundaries/auto', undefined)).toEqual({
      kind: 'pro',
      feature: 'free-play',
    });
  });

  it('makes the leaderboard Pro but leaves the player overview and catalogue open', () => {
    expect(gate('play', 'GET', '/leaderboard', undefined).kind).toBe('pro');
    expect(gate('play', 'PATCH', '/me/preferences', {}).kind).toBe('pro');
    expect(gate('play', 'GET', '/me/overview', undefined).kind).toBe('allow');
    expect(gate('play', 'GET', '/catalog', undefined).kind).toBe('allow');
  });
});

describe('Study', () => {
  it('counts opening a lesson against the free quota', () => {
    expect(
      gate('study', 'POST', '/struggle/detect', { trigger_id: 't1', error_type: 'OFF_BY_ONE', concept_tag: 'loops' }),
    ).toEqual({ kind: 'lesson', triggerId: 't1', errorType: 'OFF_BY_ONE', conceptTag: 'loops' });
  });

  it('lets a quiz through only for a lesson opened this month', () => {
    expect(gate('study', 'POST', '/quiz/generate', { error_type: 'OFF_BY_ONE' })).toEqual({
      kind: 'quiz',
      errorType: 'OFF_BY_ONE',
    });
    expect(quizUnlocked('OFF_BY_ONE', [{ error_type: 'OFF_BY_ONE' }])).toBe(true);
    expect(quizUnlocked('OFF_BY_ONE', [{ error_type: 'NULL_CHECK' }])).toBe(false);
    expect(quizUnlocked(null, [{ error_type: 'OFF_BY_ONE' }])).toBe(false);
  });

  it('makes the learning map Pro and leaves the lesson list open', () => {
    expect(gate('study', 'GET', '/progress/me', undefined).kind).toBe('pro');
    expect(gate('study', 'GET', '/progress/me/curriculum', undefined).kind).toBe('pro');
    expect(gate('study', 'GET', '/remediation/triggers', undefined).kind).toBe('allow');
  });
});

describe('Pair', () => {
  it('makes free coding Pro and keeps exercise sessions and joining free', () => {
    expect(gate('pair', 'POST', '/sessions', { mode: 'FREE' })).toEqual({ kind: 'pro', feature: 'free-coding' });
    expect(gate('pair', 'POST', '/sessions', { questionId: 'q1' }).kind).toBe('allow');
    expect(gate('pair', 'POST', '/sessions/join', { joinCode: 'ABC123' }).kind).toBe('allow');
  });

  it('removes the comparison from a Free copy of the review, and only from the review', () => {
    expect(gate('pair', 'GET', '/reviews/s1', undefined).kind).toBe('strip-feedback');
    expect(gate('pair', 'POST', '/reviews/s1/submit', {}).kind).toBe('strip-feedback');
    expect(gate('pair', 'POST', '/reviews/s1/answer', { step: 0, choice: 1 }).kind).toBe('allow');
    expect(gate('pair', 'GET', '/reviews/s1/result', undefined).kind).toBe('allow');

    const review = { score: 2, solution: { code: 'x', note: null }, feedback: { strengths: ['a'] } };
    expect(withoutFeedback(review)).toEqual({ score: 2, solution: review.solution, feedback: null, feedbackLocked: true });
    // Nothing to remove before the quiz is done.
    expect(withoutFeedback({ feedback: null })).toEqual({ feedback: null });
  });

  it('makes analytics Pro', () => {
    expect(gate('pair', 'GET', '/sessions/analytics/all', undefined).kind).toBe('pro');
    expect(gate('pair', 'GET', '/sessions/analytics/interventions', undefined).kind).toBe('pro');
  });
});

describe('Code Coach', () => {
  it('stays free, the extension and the dashboards included', () => {
    for (const path of ['/code-coach/analyze', '/students/me/diagnostics/summary', '/dashboard/me/overview', '/billing/me']) {
      expect(gate('coach', 'GET', path, undefined).kind).toBe('allow');
    }
  });
});
