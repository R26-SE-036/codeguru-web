/**
 * Study Guider through the web app's proxy: triggers, the learning map, and a
 * quiz attempt read back as knowledge tracing. Every read here needs Study
 * Guider's Neo4j database, so a 503 names that rather than failing vaguely.
 *
 * Writing a lesson and a quiz spends the shared Gemini quota (twenty a day for
 * the whole project), so that check runs only with SYSTEM_TESTS_LLM=1.
 */
import { describe, expect, inject, it } from 'vitest';

import { Visitor, said, type Reply } from './platform';

const explain = (reply: Reply) =>
  reply.status === 503
    ? `Study Guider is up but could not reach its database, so nothing was read or saved - check that the Neo4j Aura instance is running. ${said(reply)}`
    : said(reply);

type Concept = { concept: string; state: string; attempts: number; observations: number };

describe('Study Guider', () => {
  const browser = Visitor.withCookies(inject('cookies'));

  it('lists the student\'s remediation triggers', async () => {
    const triggers = await browser.get('/api/bff/study/remediation/triggers');

    expect(triggers.status, explain(triggers)).toBe(200);
    expect(Array.isArray(triggers.body.triggers)).toBe(true);
  });

  it('maps all fourteen concepts, each with a state', async () => {
    const map = await browser.get('/api/bff/study/progress/me/curriculum');

    expect(map.status, explain(map)).toBe(200);
    const { concepts, total, review_due } = map.body.data as { concepts: Concept[]; total: number; review_due: unknown[] };
    expect(total).toBe(14);
    expect(concepts).toHaveLength(14);
    for (const concept of concepts) {
      expect(['mastered', 'in_progress', 'ready', 'locked']).toContain(concept.state);
    }
    expect(Array.isArray(review_due)).toBe(true);
  });

  it('records a quiz attempt under its concept and reads it back through knowledge tracing', async () => {
    // Sent as an error type, the way the quiz page once did: stored under its
    // concept tag, string_comparison.
    const saved = await browser.post('/api/bff/study/progress/update', {
      concept: 'STRING_EQUALITY_WITH_OPERATOR',
      score: 5,
      total_questions: 8,
    });
    expect(saved.status, explain(saved)).toBe(200);

    const history = await browser.get('/api/bff/study/progress/me');
    expect(history.status, explain(history)).toBe(200);
    expect(history.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ concept: 'string_comparison', score: 5, total: 8, status: 'NEEDS_REVIEW' }),
      ]),
    );

    const mastery = await browser.get('/api/bff/study/progress/me/mastery');
    expect(mastery.status, explain(mastery)).toBe(200);
    const estimate = mastery.body.data.find((item: { concept: string }) => item.concept === 'string_comparison');
    expect(estimate, 'no knowledge-tracing estimate for the attempt').toBeTruthy();
    expect(estimate.observations).toBeGreaterThanOrEqual(8);
    expect(estimate.mastered).toBe(false);
    expect(estimate.probability_known).toBeGreaterThan(0);
    expect(estimate.probability_known).toBeLessThan(1);

    const map = await browser.get('/api/bff/study/progress/me/curriculum');
    const concept = (map.body.data.concepts as Concept[]).find((item) => item.concept === 'string_comparison');
    expect(concept?.state).toBe('in_progress');
  });

  it('answers the dashboard overview', async () => {
    const overview = await browser.get('/api/bff/study/dashboard/overview');
    expect(overview.status, explain(overview)).toBe(200);
  });

  it.skipIf(!process.env.SYSTEM_TESTS_LLM)(
    'writes a lesson and an eight-question quiz for a mistake (spends Gemini quota)',
    async () => {
      const lesson = await browser.post('/api/bff/study/struggle/detect', {
        error_type: 'OFF_BY_ONE_LOOP_BOUNDARY',
        concept_tag: 'loop_boundaries',
        error_count: 3,
      });
      expect(lesson.status, explain(lesson)).toBe(200);
      expect(lesson.body.lesson_content?.explanation).toBeTruthy();

      const quiz = await browser.post('/api/bff/study/quiz/generate', { error_type: 'OFF_BY_ONE_LOOP_BOUNDARY' });
      expect(quiz.status, explain(quiz)).toBe(200);
      expect(quiz.body.quiz_data).toHaveLength(8);
      for (const question of quiz.body.quiz_data as Array<{ options: string[]; correct_answer: string }>) {
        expect(new Set(question.options).size).toBe(4);
        expect(question.options).toContain(question.correct_answer);
      }
    },
    240_000,
  );
});
