/**
 * Sign in, register, sign out, who am I, and the socket token: what each
 * answers, what it stores, and that no platform token reaches the browser.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/code-coach', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/code-coach')>()),
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  exchangeForPairPath: vi.fn(),
}));

import { POST as loginRoute } from '@/app/api/auth/login/route';
import { POST as logoutRoute } from '@/app/api/auth/logout/route';
import { POST as registerRoute } from '@/app/api/auth/register/route';
import { GET as sessionRoute } from '@/app/api/auth/session/route';
import { GET as socketTokenRoute } from '@/app/api/pair/socket-token/route';
import { AuthError, exchangeForPairPath, login, logout, register } from '@/lib/code-coach';
import { SESSION_COOKIE, unsealSession } from '@/lib/session';
import { makeRequest, makeSession } from './helpers';

const signedIn = () => makeSession({ pairPathToken: undefined, pairPathUserId: undefined });

/** What Caddy sets from the real peer before the request reaches this app. */
const FROM_EDGE = { 'x-forwarded-for': '203.0.113.7' };

describe('POST /api/auth/login', () => {
  it('seals the session into an httpOnly cookie and returns only the user', async () => {
    vi.mocked(login).mockResolvedValue(signedIn());
    vi.mocked(exchangeForPairPath).mockResolvedValue({ token: 'pp-token', userId: 'pp-user' });

    const response = await loginRoute(
      await makeRequest('/api/auth/login', {
        body: { identifier: ' ana@example.com ', password: 'pw' },
        headers: FROM_EDGE,
      }),
    );

    expect(response.status).toBe(200);
    // Trimmed, and with the student's address for Code Coach's rate limit.
    expect(login).toHaveBeenCalledWith('ana@example.com', 'pw', '203.0.113.7');

    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ user: signedIn().user });
    expect(text).not.toContain('platform-access-token');

    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);

    const stored = await unsealSession(response.cookies.get(SESSION_COOKIE)?.value);
    expect(stored).toMatchObject({ accessToken: 'platform-access-token', pairPathToken: 'pp-token', pairPathUserId: 'pp-user' });
  });

  it('still signs in when PairPath cannot be reached', async () => {
    vi.mocked(login).mockResolvedValue(signedIn());
    vi.mocked(exchangeForPairPath).mockResolvedValue(null);

    const response = await loginRoute(await makeRequest('/api/auth/login', { body: { identifier: 'a', password: 'b' } }));

    expect(response.status).toBe(200);
    const stored = await unsealSession(response.cookies.get(SESSION_COOKIE)?.value);
    expect(stored?.pairPathToken).toBeUndefined();
  });

  it.each([
    ['a body that is not JSON', { rawBody: '{nope', headers: { 'content-type': 'application/json' } }, 'Malformed request.'],
    ['no password', { body: { identifier: 'a' } }, 'Enter your email and password.'],
    ['a blank email', { body: { identifier: '   ', password: 'b' } }, 'Enter your email and password.'],
  ])('refuses %s with 400', async (_label, options, detail) => {
    const response = await loginRoute(await makeRequest('/api/auth/login', { method: 'POST', ...options }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ detail });
    expect(login).not.toHaveBeenCalled();
  });

  it('passes a rejection through with Code Coach wording', async () => {
    vi.mocked(login).mockRejectedValue(new AuthError('Invalid credentials.', 401));

    const response = await loginRoute(await makeRequest('/api/auth/login', { body: { identifier: 'a', password: 'b' } }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ detail: 'Invalid credentials.' });
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('passes a rate limit through', async () => {
    vi.mocked(login).mockRejectedValue(new AuthError('Too many attempts. Please wait a moment and try again.', 429));

    const response = await loginRoute(await makeRequest('/api/auth/login', { body: { identifier: 'a', password: 'b' } }));
    expect(response.status).toBe(429);
  });

  it('reports Code Coach being down as 503, not as a wrong password', async () => {
    vi.mocked(login).mockRejectedValue(new AuthError('Cannot reach Code Coach.', 0));

    const response = await loginRoute(await makeRequest('/api/auth/login', { body: { identifier: 'a', password: 'b' } }));
    expect(response.status).toBe(503);
  });

  it('does not leak an unexpected error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(login).mockRejectedValue(new Error('connection string postgres://secret@db'));

    const response = await loginRoute(await makeRequest('/api/auth/login', { body: { identifier: 'a', password: 'b' } }));

    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('secret');
  });
});

describe('POST /api/auth/register', () => {
  it('creates the account and signs the student in', async () => {
    vi.mocked(register).mockResolvedValue(signedIn());
    vi.mocked(exchangeForPairPath).mockResolvedValue({ token: 'pp-token', userId: 'pp-user' });

    const response = await registerRoute(
      await makeRequest('/api/auth/register', {
        body: { fullName: ' Ana ', email: 'ana@example.com', password: 'Password123' },
        headers: FROM_EDGE,
      }),
    );

    expect(response.status).toBe(200);
    expect(register).toHaveBeenCalledWith('Ana', 'ana@example.com', 'Password123', '203.0.113.7');
    expect(response.cookies.get(SESSION_COOKIE)?.value).toBeTruthy();
  });

  it('refuses a missing name', async () => {
    const response = await registerRoute(
      await makeRequest('/api/auth/register', { body: { email: 'ana@example.com', password: 'Password123' } }),
    );
    expect(response.status).toBe(400);
    expect(register).not.toHaveBeenCalled();
  });

  it('passes a duplicate account through', async () => {
    vi.mocked(register).mockRejectedValue(new AuthError('An account with that email already exists.', 409));

    const response = await registerRoute(
      await makeRequest('/api/auth/register', { body: { fullName: 'A', email: 'a@b.c', password: 'Password123' } }),
    );
    expect(response.status).toBe(409);
  });
});

describe('POST /api/auth/logout', () => {
  it('revokes the tokens with Code Coach and clears the cookie', async () => {
    const response = await logoutRoute(await makeRequest('/api/auth/logout', { method: 'POST', session: makeSession() }));

    expect(logout).toHaveBeenCalledWith('platform-access-token');
    expect(response.headers.get('set-cookie')).toMatch(new RegExp(`${SESSION_COOKIE}=;`));
  });

  it('still clears the cookie with no session to revoke', async () => {
    const response = await logoutRoute(await makeRequest('/api/auth/logout', { method: 'POST' }));

    expect(logout).not.toHaveBeenCalled();
    expect(await response.json()).toEqual({ ok: true });
  });
});

describe('GET /api/auth/session', () => {
  it('answers 401 with no session', async () => {
    const response = await sessionRoute(await makeRequest('/api/auth/session'));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ user: null });
  });

  it('returns the user and whether pairing works, never a token or expiry', async () => {
    const response = await sessionRoute(await makeRequest('/api/auth/session', { session: makeSession() }));
    const text = await response.text();

    expect(JSON.parse(text)).toEqual({ user: makeSession().user, pairPathConnected: true });
    expect(text).not.toMatch(/token|accessExpiresAt/i);
  });
});

describe('GET /api/pair/socket-token', () => {
  it('answers 401 with no session', async () => {
    expect((await socketTokenRoute(await makeRequest('/api/pair/socket-token'))).status).toBe(401);
  });

  it('answers 503 when PairPath was unreachable at sign-in', async () => {
    const response = await socketTokenRoute(await makeRequest('/api/pair/socket-token', { session: signedIn() }));
    expect(response.status).toBe(503);
  });

  it('hands out only the PairPath token', async () => {
    const response = await socketTokenRoute(await makeRequest('/api/pair/socket-token', { session: makeSession() }));
    const text = await response.text();

    expect(JSON.parse(text)).toEqual({ token: 'pairpath-token' });
    expect(text).not.toContain('platform-access-token');
  });
});
