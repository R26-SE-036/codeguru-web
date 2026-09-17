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

  it('grades a round, and keeps a test round out of the student\'s practice history', async () => {
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

    // The engine hands every finished round to Study Guider, which stores test
    // rounds but leaves them out of the practice history a student reads
    // (get_game_summaries, since Study Guider's e2d5f886): a round an automated
    // test played is not something the student did. So from the outside the
    // right answer is that it does NOT appear. Whether it arrived is visible
    // only in Study Guider's own store, which this suite does not read.
    //
    // The hand-off is fire-and-forget, so give it time to land before checking
    // it is hidden - a check made before it arrived would pass for nothing.
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const history = await browser.get('/api/bff/study/games/me?limit=20');
    expect(
      history.status,
      history.status === 503
        ? `Study Guider cannot reach its Neo4j database: ${said(history)}`
        : said(history),
    ).toBe(200);
    expect(
      (history.body.data ?? []).map((row: { game_session_id?: string }) => row.game_session_id),
      'a test round showed up in the student\'s practice history',
    ).not.toContain(submitted.body.gameSessionId);
  });

  it('refuses to serve one student another student\'s game', async () => {
    const other = await browser.get(`/api/bff/play/game/user_someone_else/auto/${CONCEPT}/auto`);
    expect(other.status, said(other)).toBe(403);
  });
});
