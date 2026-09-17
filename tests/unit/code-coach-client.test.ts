/**
 * The server-side Code Coach client: the wire format it sends, and the error
 * text it turns Code Coach's three failure shapes into.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  AuthError,
  exchangeForPairPath,
  login,
  logout,
  refresh,
  register,
} from '@/lib/code-coach';
import { jsonResponse } from './helpers';

const TOKENS = {
  user: { user_id: 'user_1', email: 'ana@example.com', full_name: 'Ana' },
  tokens: { access_token: 'a1', refresh_token: 'r1', expires_in: 3600 },
};

type Calls = { mock: { calls: unknown[][] } };

function stubFetch(response: Response | (() => Promise<Response>)) {
  const mock = vi.fn(
    async (_url: string, _init?: RequestInit): Promise<Response> =>
      typeof response === 'function' ? response() : response,
  );
  vi.stubGlobal('fetch', mock);
  return mock;
}

const urlOf = (mock: Calls, call = 0) => mock.mock.calls[call][0];
const initOf = (mock: Calls, call = 0) => mock.mock.calls[call][1] as RequestInit;
const sentBody = (mock: Calls, call = 0) => JSON.parse(String(initOf(mock, call).body));
const headersOf = (mock: Calls) => new Headers(initOf(mock).headers as Record<string, string>);

describe('wire format', () => {
  it('logs in with snake_case fields and the web client name', async () => {
    const mock = stubFetch(jsonResponse(TOKENS));
    const before = Date.now();

    const session = await login('ana@example.com', 'pw');

    expect(urlOf(mock)).toBe('http://code-coach:8080/api/v1/auth/login');
    expect(sentBody(mock)).toEqual({ identifier: 'ana@example.com', password: 'pw', client_name: 'codeguru-web' });
    expect(session).toMatchObject({ accessToken: 'a1', refreshToken: 'r1', user: TOKENS.user });
    expect(session.accessExpiresAt).toBeGreaterThanOrEqual(before + 3600 * 1000);
  });

  it('registers with full_name', async () => {
    const mock = stubFetch(jsonResponse(TOKENS));
    await register('Ana', 'ana@example.com', 'pw');
    expect(sentBody(mock)).toEqual({ full_name: 'Ana', email: 'ana@example.com', password: 'pw', client_name: 'codeguru-web' });
  });

  it('refreshes with refresh_token', async () => {
    const mock = stubFetch(jsonResponse(TOKENS));
    await refresh('r0');
    expect(urlOf(mock)).toBe('http://code-coach:8080/api/v1/auth/refresh');
    expect(sentBody(mock)).toEqual({ refresh_token: 'r0' });
  });
});

describe('the student\'s address', () => {
  it.each([
    ['login', () => login('a', 'b', '203.0.113.7')],
    ['register', () => register('A', 'a@b.c', 'pw', '203.0.113.7')],
    ['refresh', () => refresh('r0', '203.0.113.7')],
  ])('%s passes it on, so Code Coach limits each student and not this server', async (_label, call) => {
    const mock = stubFetch(jsonResponse(TOKENS));
    await call();
    expect(headersOf(mock).get('x-forwarded-for')).toBe('203.0.113.7');
  });

  it('sends none when there is none to send', async () => {
    const mock = stubFetch(jsonResponse(TOKENS));
    await login('a', 'b', null);
    expect(headersOf(mock).has('x-forwarded-for')).toBe(false);
  });
});

describe('errors a student reads', () => {
  it('passes Code Coach wording through', async () => {
    stubFetch(jsonResponse({ detail: 'Invalid credentials.' }, 401));
    await expect(login('a', 'b')).rejects.toMatchObject({ message: 'Invalid credentials.', status: 401 });
  });

  it('turns a validation list into sentences, not [object Object]', async () => {
    stubFetch(
      jsonResponse(
        {
          detail: [
            { loc: ['body', 'password'], msg: 'String should have at least 8 characters', type: 'string_too_short' },
            { loc: ['body'], msg: 'Field required', type: 'missing' },
          ],
        },
        422,
      ),
    );

    await expect(register('A', 'a@b.c', 'short')).rejects.toThrow(
      'password: String should have at least 8 characters. Field required',
    );
  });

  it('explains a rate limit that came back without JSON', async () => {
    stubFetch(new Response('slow down', { status: 429 }));
    await expect(login('a', 'b')).rejects.toThrow(/Too many attempts/);
  });

  it('does not invent a reason for a proxy error page', async () => {
    stubFetch(new Response('<html>Bad gateway</html>', { status: 502 }));
    await expect(login('a', 'b')).rejects.toThrow('Request failed (502).');
  });

  it('reports an unreachable Code Coach as status 0, never as a wrong password', async () => {
    stubFetch(() => Promise.reject(new TypeError('fetch failed')));
    const error = (await login('a', 'b').catch((e: unknown) => e)) as AuthError;
    expect(error).toBeInstanceOf(AuthError);
    expect(error.status).toBe(0);
    expect(error.message).toMatch(/Cannot reach Code Coach/);
  });

  it('lets a failed logout pass quietly', async () => {
    stubFetch(() => Promise.reject(new TypeError('fetch failed')));
    await expect(logout('a1')).resolves.toBeUndefined();
  });
});

describe('exchangeForPairPath', () => {
  it('sends codeCoachAccessToken exactly and returns PairPath\'s own user id', async () => {
    const mock = stubFetch(jsonResponse({ accessToken: 'pp-token', user: { id: 'pp-user' } }));

    expect(await exchangeForPairPath('a1')).toEqual({ token: 'pp-token', userId: 'pp-user' });
    expect(urlOf(mock)).toBe('http://pairpath-api:3001/auth/exchange');
    expect(sentBody(mock)).toEqual({ codeCoachAccessToken: 'a1' });
  });

  it.each([
    ['a refusal', () => Promise.resolve(jsonResponse({ message: 'no' }, 503))],
    ['an unexpected body', () => Promise.resolve(jsonResponse({ token: 'wrong-key' }))],
    ['an outage', () => Promise.reject(new TypeError('fetch failed'))],
  ])('fails soft on %s', async (_label, respond) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubFetch(respond as () => Promise<Response>);
    expect(await exchangeForPairPath('a1')).toBeNull();
  });
});
