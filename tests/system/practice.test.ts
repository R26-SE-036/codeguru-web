/**
 * Practice games through the web app's proxy: served, graded, handed to Study
 * Guider, and never another student's.
 */
import { describe, expect, inject, it } from 'vitest';

import { Visitor, eventually, said } from './platform';

const CONCEPT = 'loop_boundaries';

describe('a practice round', () => {
  const browser = Visitor.withCookies(inject('cookies'));
  const userId = inject('userId');

  it('answers the student\'s profile', async () => {
    const profile = await browser.get(`/api/bff/play/profile/${userId}`);
    expect(profile.status, said(profile)).toBe(200);
  });

  it('serves a question that gives nothing away', async () => {
    const game = await browser.get(`/api/bff/play/game/${userId}/auto/${CONCEPT}/auto`);

    expect(game.status, said(game)).toBe(200);
    expect(game.body.correctAnswer).toBeUndefined();
    expect(game.body.explanation).toBeUndefined();
    expect(game.body.hints).toBeUndefined();
    expect(typeof game.body.hintCount).toBe('number');
    expect(game.body.id).toBeTruthy();
    expect('decisionId' in game.body).toBe(true);
  });

  it('grades a round and hands its summary to Study Guider', async () => {
    const game = await browser.get(`/api/bff/play/game/${userId}/auto/${CONCEPT}/auto`);
    expect(game.status, said(game)).toBe(200);

    const submitted = await browser.post('/api/bff/play/game/submit', {
      userId,
      learningSessionId: `system-test-${Date.now()}`,
      gameType: game.body.gameType,
      conceptTag: CONCEPT,
      questionId: game.body.id,
      // Wrong on purpose: the round must be recorded, and a test that had to
      // answer correctly would need the answer the endpoint withholds.
      selectedAnswer: '__system_test_wrong_answer__',
      hintUsage: 0,
      timeTakenSeconds: 1,
      attemptCount: 1,
      decisionId: game.body.decisionId,
      wasExploratory: game.body.wasExploratory === true,
      // Keeps these rounds out of every reported figure.
      dataSource: 'test',
    });

    expect(submitted.status, said(submitted)).toBe(200);
    expect(typeof submitted.body.score).toBe('number');

    // The hand-off is fire-and-forget by design, so it is polled for.
    let last = '';
    const summary = await eventually(async () => {
      const summaries = await browser.get('/api/bff/study/games/me?limit=20');
      last = said(summaries);
      return summaries.status === 200
        ? (summaries.body.data ?? []).find((row: { game_session_id?: string }) => row.game_session_id === submitted.body.gameSessionId)
        : undefined;
    }, 20_000);

    expect(
      summary,
      last.startsWith('503')
        ? `the round could not reach Study Guider because Study Guider cannot reach its Neo4j database: ${last}`
        : `the round never reached Study Guider; its game list answered ${last}`,
    ).toBeTruthy();
    expect(summary.concept).toBe(CONCEPT);
  });

  it('refuses to serve one student another student\'s game', async () => {
    const other = await browser.get(`/api/bff/play/game/user_someone_else/auto/${CONCEPT}/auto`);
    expect(other.status, said(other)).toBe(403);
  });
});
