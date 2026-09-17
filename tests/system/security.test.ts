/**
 * What the public address refuses: paths outside a service's API, another
 * student's records, forged credentials, writes from another site, oversized
 * bodies - and a rate limit a client can dodge by naming its own address.
 *
 * Each of these is a property the other suites cannot see, because they only
 * ever ask for what they are allowed to have.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';

import { BASE, Visitor, asEditor, newStudent, said, signUp } from './platform';

const CALLBACK = 'http://127.0.0.1:53682/callback';

describe('the proxy', () => {
  const browser = Visitor.withCookies(inject('cookies'));

  // Each of these once answered 200 with the service's own schema or health -
  // see upstreamUrl in lib/upstream.ts.
  it.each([
    '/api/bff/coach/..%2F..%2Fopenapi.json',
    '/api/bff/coach/%2E%2E%2F%2E%2E%2Fopenapi.json',
    '/api/bff/coach/..%5C..%5Copenapi.json',
    '/api/bff/coach/%252e%252e/%252e%252e/openapi.json',
    '/api/bff/coach/%2e%2e/%2e%2e/openapi.json',
    '/api/bff/study/..%2Fopenapi.json',
    '/api/bff/play/..%2F..%2F..%2Fhealth',
  ])('does not leave the service\'s API for %s', async (path) => {
    const reply = await browser.get(path);

    // 400 from the proxy, or 404 where Next resolved the dots itself first.
    expect([400, 404], said(reply)).toContain(reply.status);
    expect(JSON.stringify(reply.body)).not.toMatch(/"openapi"|"status":"ok"/);
  });

  it('does not reach Code Coach\'s unauthenticated root /analyze either', async () => {
    const reply = await browser.post('/api/bff/coach/..%2F..%2Fanalyze', { language: 'java', code: 'class A {}' });
    expect(reply.status, said(reply)).toBe(400);
  });
});

describe('the edge\'s response headers', () => {
  it.each(['/login', '/api/v1/auth/me', '/api/bff/coach/students/me/diagnostics'])(
    'protect %s and name no software',
    async (path) => {
      const response = await fetch(`${BASE}${path}`, { redirect: 'manual' });
      await response.arrayBuffer();

      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('x-frame-options')).toBe('DENY');
      expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
      expect(response.headers.get('strict-transport-security')).toMatch(/max-age=\d+/);
      expect(response.headers.get('x-powered-by')).toBeNull();
      expect(response.headers.get('server')).toBeNull();
    },
  );
});

describe('a request body', () => {
  const browser = Visitor.withCookies(inject('cookies'));
  const huge = 'x'.repeat(2 * 1024 * 1024);

  it('over the limit is refused at the edge, before sign-in reads it', async () => {
    const response = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@example.com', password: huge }),
    });
    await response.arrayBuffer();
    expect(response.status).toBe(413);
  });

  it('over the limit is refused before the proxy buffers it for Code Coach', async () => {
    const reply = await browser.post('/api/bff/coach/code-coach/analyze', { language: 'java', code: huge });
    expect(reply.status).toBe(413);
  });

  it('that is malformed is a 400, never a server error', async () => {
    const response = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    });
    expect(response.status).toBe(400);
  });
});

describe('credentials that were tampered with', () => {
  const browser = Visitor.withCookies(inject('cookies'));
  let token = '';

  const flip = (value: string) => {
    const at = Math.floor(value.length / 2);
    return `${value.slice(0, at)}${value[at] === 'A' ? 'B' : 'A'}${value.slice(at + 1)}`;
  };

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

  it('a session cookie with one character changed is no session at all', async () => {
    const [[name, value]] = inject('cookies');
    const forged = Visitor.withCookies([[name, flip(value)]]);

    expect((await forged.get('/api/bff/coach/students/me/diagnostics')).status).toBe(401);
    expect((await forged.get('/api/auth/session')).status).toBe(401);

    const page = await forged.fetch('/study');
    expect(page.status).toBe(307);
    expect(page.headers.get('location')).toContain('/login');
  });

  it('an editor token with one character changed is refused by every service that checks it', async () => {
    expect((await asEditor(token, '/api/v1/auth/me')).status, 'the real token should work').toBe(200);

    const forged = flip(token);
    expect((await asEditor(forged, '/api/v1/auth/me')).status).toBe(401);
    expect((await asEditor(forged, '/api/v1/students/me/diagnostics')).status).toBe(401);
  });
});

describe('another student', () => {
  const owner = Visitor.withCookies(inject('cookies'));
  const ownerId = inject('userId');
  const other = new Visitor();
  let learningSessionId = '';

  beforeAll(async () => {
    const registered = await signUp(other, newStudent('other'));
    expect(registered.status, said(registered)).toBe(200);

    const started = await owner.post('/api/bff/coach/learning-sessions', {
      source_component: 'code_coach',
      language: 'java',
      task_id: `security_${Date.now()}`,
    });
    expect(started.status, said(started)).toBe(200);
    learningSessionId = started.body.learning_session_id;
  }, 300_000);

  it('cannot open a learning session that is not theirs, or its findings', async () => {
    expect((await owner.get(`/api/bff/coach/learning-sessions/${learningSessionId}`)).status).toBe(200);

    // 404, not 403: a stranger learns nothing, not even that the id exists.
    expect((await other.get(`/api/bff/coach/learning-sessions/${learningSessionId}`)).status).toBe(404);
    expect((await other.get(`/api/bff/coach/learning-sessions/${learningSessionId}/diagnostics`)).status).toBe(404);
  });

  it('cannot read the owner\'s game profile', async () => {
    const reply = await other.get(`/api/bff/play/profile/${ownerId}`);
    expect(reply.status, said(reply)).toBe(403);
  });

  it('reads their own diagnostics without any of the owner\'s', async () => {
    const reply = await other.get('/api/bff/coach/students/me/diagnostics?limit=50');
    expect(reply.status, said(reply)).toBe(200);
    expect(JSON.stringify(reply.body)).not.toContain(learningSessionId);
  });
});

describe('a write from another site', () => {
  const student = new Visitor();

  beforeAll(async () => {
    const registered = await signUp(student, newStudent('crosssite'));
    expect(registered.status, said(registered)).toBe(200);
  }, 300_000);

  const post = (path: string, headers: Record<string, string>) =>
    student.fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: '{}' });

  it('cannot sign the student out', async () => {
    const response = await post('/api/auth/logout', { origin: 'https://evil.example' });

    expect(response.status).toBe(403);
    expect((await student.get('/api/auth/session')).status, 'the forged sign-out worked').toBe(200);
  });

  it('cannot act through the proxy from a neighbouring *.sslip.io host', async () => {
    const response = await post('/api/bff/pair/sessions', {
      origin: 'https://198-51-100-4.sslip.io',
      'sec-fetch-site': 'same-site',
    });
    expect(response.status).toBe(403);
  });

  it('is not granted CORS by any service', async () => {
    const evil = { origin: 'https://evil.example' };

    const read = await student.fetch('/api/bff/coach/students/me/diagnostics', { headers: evil });
    expect(read.headers.get('access-control-allow-origin')).toBeNull();

    const editor = await fetch(`${BASE}/api/v1/auth/me`, { headers: evil });
    expect(editor.headers.get('access-control-allow-origin')).toBeNull();

    const preflight = await fetch(`${BASE}/api/v1/auth/login`, {
      method: 'OPTIONS',
      headers: { ...evil, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' },
    });
    expect(preflight.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('from the app\'s own page still goes through', async () => {
    const response = await post('/api/auth/logout', { origin: BASE, 'sec-fetch-site': 'same-origin' });

    expect(response.status).toBe(200);
    expect((await student.get('/api/auth/session')).status).toBe(401);
  });
});

/*
 * Last in the file, with a minute's wait around each check. Before: so the
 * limit starts empty, and a 429 is this check's doing rather than left over
 * from the sign-ups above - otherwise the second check would pass on the
 * first one's attempts. After: the suites that follow sign students in.
 */
describe('the sign-in rate limit', () => {
  const minute = () => new Promise((resolve) => setTimeout(resolve, 61_000));

  beforeEach(minute, 90_000);
  afterAll(minute, 90_000);

  it.each([
    ['the web app\'s sign-in', '/api/auth/login', (i: number) => ({ identifier: `codeguru.system.nobody.${i}@example.com`, password: 'not-the-password-1' })],
    ['Code Coach\'s, for the editor', '/api/v1/auth/login', (i: number) => ({ identifier: `codeguru.system.nobody.${i}@example.com`, password: 'not-the-password-1' })],
  ])('cannot be dodged at %s by sending a different X-Forwarded-For each time', async (_, path, body) => {
    const statuses: number[] = [];

    for (let i = 1; i <= 12; i++) {
      const response = await fetch(`${BASE}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.${i}` },
        body: JSON.stringify(body(i)),
      });
      await response.arrayBuffer();
      statuses.push(response.status);
    }

    // Caddy replaces a client's X-Forwarded-For with the address it really
    // came from; if it passed the header on, every attempt would be a new client.
    expect(statuses, `statuses were ${statuses.join(', ')}`).toContain(429);
  });
});
