/**
 * The VS Code extension's browser sign-in, end to end through the edge: the web
 * app mints a code, and the extension redeems it at Code Coach's /api/v1 on the
 * same public address. This is the path that had nowhere to go before Caddy
 * routed /api/v1.
 */
import { describe, expect, inject, it } from 'vitest';

import { BASE, Visitor, asEditor, said } from './platform';

const CALLBACK = 'http://127.0.0.1:53682/callback';

describe('signing the editor in from the browser', () => {
  const student = inject('student');
  const browser = Visitor.withCookies(inject('cookies'));
  let editorToken = '';

  it.each(['http://evil.example/callback', 'http://localhost:53682/callback', 'http://127.0.0.1:53682/elsewhere'])(
    'mints no code for %s',
    async (redirectUri) => {
      const refused = await browser.post('/api/auth/handoff', { redirectUri });
      expect(refused.status, said(refused)).toBe(400);
    },
  );

  it('trades a one-time code for the editor\'s own session', async () => {
    const minted = await browser.post('/api/auth/handoff', { redirectUri: CALLBACK });
    expect(minted.status, said(minted)).toBe(200);
    expect(minted.body.code).toMatch(/^.{16,}$/);

    const redeemed = await asEditor(null, '/api/v1/auth/handoff/redeem', { code: minted.body.code });
    expect(redeemed.status, `redeeming at ${BASE}/api/v1 failed: ${said(redeemed)}`).toBe(200);
    expect(redeemed.body.user.email).toBe(student.email);
    editorToken = redeemed.body.tokens.access_token;

    const me = await asEditor(editorToken, '/api/v1/auth/me');
    expect(me.status, said(me)).toBe(200);
    expect(me.body.user.email).toBe(student.email);

    const replayed = await asEditor(null, '/api/v1/auth/handoff/redeem', { code: minted.body.code });
    expect(replayed.status, said(replayed)).toBe(400);
    expect(replayed.body.detail).toMatch(/already been used or has expired/);
  });

  it('keeps the editor and the browser as separate sessions', async () => {
    const signedOut = await asEditor(editorToken, '/api/v1/auth/logout', {});
    expect(signedOut.status, said(signedOut)).toBe(200);
    expect((await asEditor(editorToken, '/api/v1/auth/me')).status).toBe(401);

    // Signing out of the editor must not sign the student out of the web.
    const browserSession = await browser.get('/api/auth/session');
    expect(browserSession.status, said(browserSession)).toBe(200);
    const diagnostics = await browser.get('/api/bff/coach/students/me/diagnostics?limit=1');
    expect(diagnostics.status, said(diagnostics)).toBe(200);
  });
});
