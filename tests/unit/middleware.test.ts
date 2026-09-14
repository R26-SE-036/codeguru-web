/**
 * The auth gate: who is redirected where, and the one place tokens refresh.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/code-coach', () => ({ refresh: vi.fn() }));

import { refresh } from '@/lib/code-coach';
import { SESSION_COOKIE, unsealSession } from '@/lib/session';
import { config, middleware } from '@/middleware';
import { ORIGIN, makeRequest, makeSession } from './helpers';

const passedThrough = (response: Response) => response.headers.get('x-middleware-next') === '1';

describe('without a session', () => {
  it('sends a page to sign in and back, on the address the student used', async () => {
    const response = await middleware(await makeRequest('/study?tab=due'));

    expect(response.status).toBe(307);
    // The origin the browser asked on - the edge's 8090 here - not the
    // container's own port. Sign-in landing on the wrong port is how a
    // redirect bug reads to a student.
    expect(response.headers.get('location')).toBe(`${ORIGIN}/login?next=%2Fstudy%3Ftab%3Ddue`);
  });

  it('does not add a pointless next for the home page', async () => {
    const response = await middleware(await makeRequest('/'));
    expect(response.headers.get('location')).toBe(`${ORIGIN}/login`);
  });

  it.each(['/login', '/register', '/login?redirect_uri=http%3A%2F%2F127.0.0.1%3A53682%2Fcallback'])(
    'lets %s through',
    async (path) => {
      expect(passedThrough(await middleware(await makeRequest(path)))).toBe(true);
    },
  );

  it('answers an API call with 401 JSON, not a redirect to HTML', async () => {
    const response = await middleware(await makeRequest('/api/bff/coach/students/me'));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ detail: 'Not signed in.' });
  });
});

describe('with a session', () => {
  it('passes a fresh session straight through without refreshing', async () => {
    const response = await middleware(await makeRequest('/study', { session: makeSession() }));

    expect(passedThrough(response)).toBe(true);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('sends a signed-in student away from the login page to where they were going', async () => {
    const response = await middleware(await makeRequest('/login?next=%2Fplay', { session: makeSession() }));
    expect(response.headers.get('location')).toBe(`${ORIGIN}/play`);
  });

  it('lets a signed-in browser reach the sign-in page when VS Code is asking to be connected', async () => {
    const response = await middleware(
      await makeRequest(`/login?redirect_uri=${encodeURIComponent('http://127.0.0.1:53682/callback')}`, {
        session: makeSession(),
      }),
    );
    expect(passedThrough(response)).toBe(true);
  });

  it('recognises the editor behind a proxy, where Next rewrites the 127.0.0.1 in the query to localhost', async () => {
    const { NextRequest } = await import('next/server');
    const { sealSession } = await import('@/lib/session');

    // How the standalone server in the container sees the request: its own
    // host is 0.0.0.0, so NextURL's localhost rewrite lands on redirect_uri.
    const request = new NextRequest(
      `http://0.0.0.0:4200/login?redirect_uri=${encodeURIComponent('http://127.0.0.1:53682/callback')}`,
      { headers: { cookie: `${SESSION_COOKIE}=${await sealSession(makeSession())}` } },
    );
    expect(request.nextUrl.searchParams.get('redirect_uri')).toBe('http://localhost:53682/callback');

    expect(passedThrough(await middleware(request))).toBe(true);
  });

  it('still sends a signed-in browser on when the return address is not the editor\'s', async () => {
    const response = await middleware(
      await makeRequest(`/register?redirect_uri=${encodeURIComponent('http://evil.example/callback')}`, {
        session: makeSession(),
      }),
    );
    expect(response.headers.get('location')).toBe(`${ORIGIN}/`);
  });

  it.each(['//evil.example/phish', 'https://evil.example', 'javascript:alert(1)'])(
    'never follows next=%s off the site',
    async (next) => {
      const response = await middleware(
        await makeRequest(`/login?next=${encodeURIComponent(next)}`, { session: makeSession() }),
      );
      expect(response.headers.get('location')).toBe(`${ORIGIN}/`);
    },
  );
});

describe('refreshing', () => {
  const expiring = () =>
    makeSession({ accessExpiresAt: Date.now() + 60 * 1000, refreshToken: 'old-refresh' });

  it('refreshes once and carries the PairPath identity across', async () => {
    vi.mocked(refresh).mockResolvedValue(
      makeSession({ accessToken: 'new-access', refreshToken: 'new-refresh', pairPathToken: undefined, pairPathUserId: undefined }),
    );

    const response = await middleware(
      await makeRequest('/study', { session: expiring(), headers: { 'x-forwarded-for': '203.0.113.7' } }),
    );

    expect(refresh).toHaveBeenCalledTimes(1);
    // With the student's address: Code Coach rate-limits refreshes per client.
    expect(refresh).toHaveBeenCalledWith('old-refresh', '203.0.113.7');
    expect(passedThrough(response)).toBe(true);

    const stored = await unsealSession(response.cookies.get(SESSION_COOKIE)?.value);
    expect(stored).toMatchObject({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      pairPathToken: 'pairpath-token',
      pairPathUserId: 'pairpath-user-1',
    });
  });

  it('clears a spent session and sends a page to sign in', async () => {
    vi.mocked(refresh).mockRejectedValue(new Error('revoked'));

    const response = await middleware(await makeRequest('/study', { session: expiring() }));

    expect(response.headers.get('location')).toBe(`${ORIGIN}/login`);
    expect(response.headers.get('set-cookie')).toMatch(new RegExp(`${SESSION_COOKIE}=;`));
  });

  it('clears a spent session and answers an API call with 401', async () => {
    vi.mocked(refresh).mockRejectedValue(new Error('revoked'));

    const response = await middleware(await makeRequest('/api/bff/study/x', { session: expiring() }));

    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie')).toMatch(new RegExp(`${SESSION_COOKIE}=;`));
  });
});

describe('which requests the gate sees', () => {
  const matcher = new RegExp(`^${config.matcher[0]}$`);

  it.each(['/', '/study', '/pair/abc/results', '/api/bff/coach/students/me', '/api/pair/socket-token'])(
    'guards %s',
    (path) => {
      expect(matcher.test(path)).toBe(true);
    },
  );

  it.each(['/api/auth/login', '/api/auth/handoff', '/_next/static/chunk.js', '/_next/image', '/icon.svg', '/favicon.ico'])(
    'leaves %s alone',
    (path) => {
      expect(matcher.test(path)).toBe(false);
    },
  );
});
