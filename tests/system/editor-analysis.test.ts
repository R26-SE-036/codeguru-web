/**
 * The editor's core loop against the live platform: sign the extension in, open
 * a learning session, analyse Java through the edge, and see the same finding
 * from the web.
 */
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { Visitor, asEditor, eventually, said } from './platform';

const CALLBACK = 'http://127.0.0.1:53682/callback';

/** Reads one past the end of the array: i <= marks.length. */
const BUGGY = `public class Marks {
    public static void main(String[] args) {
        int[] marks = {70, 80, 90};
        for (int i = 0; i <= marks.length; i++) {
            System.out.println(marks[i]);
        }
    }
}
`;

const FIXED = BUGGY.replace('i <= marks.length', 'i < marks.length');

type Diagnostic = { error_type: string; diagnostic_id: string; line: number; concept_tag: string; message: string };

describe('the editor analysing Java', () => {
  const browser = Visitor.withCookies(inject('cookies'));
  let token = '';
  let learningSessionId = '';

  beforeAll(async () => {
    const minted = await browser.post('/api/auth/handoff', { redirectUri: CALLBACK });
    expect(minted.status, said(minted)).toBe(200);
    const redeemed = await asEditor(null, '/api/v1/auth/handoff/redeem', { code: minted.body.code });
    expect(redeemed.status, said(redeemed)).toBe(200);
    token = redeemed.body.tokens.access_token;
  });

  afterAll(async () => {
    if (token) await asEditor(token, '/api/v1/auth/logout', {});
  });

  const analyse = (code: string) =>
    asEditor<{ diagnostics: Diagnostic[] }>(token, '/api/v1/code-coach/analyze', {
      language: 'java',
      code,
      learning_session_id: learningSessionId,
      enable_logging: false,
    });

  it('opens a learning session', async () => {
    const started = await asEditor(token, '/api/v1/learning-sessions', {
      source_component: 'code_coach',
      language: 'java',
      task_id: 'system_test',
    });

    expect(started.status, said(started)).toBe(200);
    learningSessionId = started.body.learning_session_id;
    expect(learningSessionId).toBeTruthy();
  });

  it('finds the loop that reads past the end of the array', async () => {
    const analysed = await analyse(BUGGY);

    expect(analysed.status, said(analysed)).toBe(200);
    const finding = analysed.body.diagnostics.find((item) => item.error_type === 'OFF_BY_ONE_LOOP_BOUNDARY');
    expect(finding, `diagnostics were: ${JSON.stringify(analysed.body.diagnostics)}`).toBeTruthy();
    expect(finding!.concept_tag).toBe('loop_boundaries');
    expect(finding!.diagnostic_id).toBeTruthy();
    expect(finding!.message).toBeTruthy();
  });

  it('shows the same finding to the student on the web', async () => {
    // Code Coach answers the analysis first and saves the findings in a
    // background task after, so the web's read is polled rather than assumed
    // to land after the write.
    let last = '';
    const listed = await eventually(async () => {
      const reply = await browser.get('/api/bff/coach/students/me/diagnostics?limit=50');
      last = said(reply);
      return reply.status === 200 && JSON.stringify(reply.body).includes('OFF_BY_ONE_LOOP_BOUNDARY') ? reply : undefined;
    }, 20_000);

    expect(listed, `the finding never appeared on the web; the list answered ${last}`).toBeTruthy();
  });

  it('drops the finding once the loop is fixed', async () => {
    const analysed = await analyse(FIXED);

    expect(analysed.status, said(analysed)).toBe(200);
    expect(analysed.body.diagnostics.map((item) => item.error_type)).not.toContain('OFF_BY_ONE_LOOP_BOUNDARY');
  });

  it('refuses to analyse for a caller with no token', async () => {
    const refused = await asEditor(null, '/api/v1/code-coach/analyze', { language: 'java', code: BUGGY });
    expect(refused.status, said(refused)).toBe(401);
  });
});
