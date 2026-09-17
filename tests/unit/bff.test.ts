/**
 * The single proxy every browser call goes through: where it sends a request,
 * which token it attaches, what it refuses to forward, and how it repairs a
 * PairPath token.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/code-coach', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/code-coach')>()),
  exchangeForPairPath: vi.fn(),
}));

import { GET, POST } from '@/app/api/bff/[service]/[...path]/route';
import { exchangeForPairPath } from '@/lib/code-coach';
import { SESSION_COOKIE, unsealSession } from '@/lib/session';
import { jsonResponse, makeRequest, makeSession } from './helpers';

const context = (service: string, ...path: string[]) => ({ params: Promise.resolve({ service, path }) });

/** An upstream answer, built fresh per call - the route may cancel a body it discards. */
const reply =
  (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  () =>
    jsonResponse(body, status, headers);

/**
 * What each upstream call carried, copied at the moment it was made. The route
 * reuses one Headers object and sets a fresh token on it before a retry, so
 * reading mock.calls afterwards would show the retry's token on both calls.
 */
const snapshots = new WeakMap<ReturnType<typeof vi.fn>, Array<{ url: string; init: RequestInit; headers: Headers }>>();

/** Upstream answers in order; the last one repeats. */
function stubUpstream(...answers: Array<(() => Response) | Error>) {
  const queue = [...answers];
  const seen: Array<{ url: string; init: RequestInit; headers: Headers }> = [];
  const mock = vi.fn(async (url: string, init: RequestInit) => {
    seen.push({ url, init, headers: new Headers(init.headers) });
    const next = queue.length > 1 ? queue.shift()! : queue[0];
    if (next instanceof Error) throw next;
    return next();
  });
  snapshots.set(mock, seen);
  vi.stubGlobal('fetch', mock);
  return mock;
}

const sent = (mock: ReturnType<typeof vi.fn>, call = 0) => snapshots.get(mock)![call];

describe('refusals', () => {
  it.each(['admin', 'toString', 'constructor', '__proto__'])('answers 404 for the unknown service %j', async (service) => {
    const upstream = stubUpstream(reply({}));

    const response = await GET(await makeRequest(`/api/bff/${service}/x`, { session: makeSession() }), context(service, 'x'));

    expect(response.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  // Next hands the route decoded segments, so `..%2F..%2Fopenapi.json` arrives
  // as the single segment below - which once reached Code Coach's root.
  it.each([
    [['..', '..', 'openapi.json']],
    [['../../openapi.json']],
    [['..\\..\\openapi.json']],
    [['%2e%2e', '%2e%2e', 'openapi.json']],
  ])('answers 400 for the path %j and calls nothing', async (path) => {
    const upstream = stubUpstream(reply({}));

    const response = await GET(await makeRequest('/api/bff/coach/x', { session: makeSession() }), context('coach', ...path));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ detail: 'Invalid path.' });
    expect(upstream).not.toHaveBeenCalled();
  });

  it('answers 401 without a session, even if middleware were bypassed', async () => {
    const upstream = stubUpstream(reply({}));

    const response = await GET(await makeRequest('/api/bff/coach/students/me'), context('coach', 'students', 'me'));

    expect(response.status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  });
});

describe('forwarding', () => {
  it('sends the path and query to the right service with the session token', async () => {
    const upstream = stubUpstream(reply({ diagnostics: [] }));

    const response = await GET(
      await makeRequest('/api/bff/coach/students/me/diagnostics?limit=5', {
        session: makeSession(),
        headers: { accept: 'application/json' },
      }),
      context('coach', 'students', 'me', 'diagnostics'),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ diagnostics: [] });

    const { url, init, headers } = sent(upstream);
    expect(url).toBe('http://code-coach:8080/api/v1/students/me/diagnostics?limit=5');
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    expect(headers.get('authorization')).toBe('Bearer platform-access-token');
    expect(headers.get('accept')).toBe('application/json');
  });

  it('never forwards the cookie, and never lets the browser choose the token', async () => {
    const upstream = stubUpstream(reply({}));

    await GET(
      await makeRequest('/api/bff/study/progress/me', {
        session: makeSession(),
        headers: { authorization: 'Bearer chosen-by-the-browser' },
      }),
      context('study', 'progress', 'me'),
    );

    const { headers } = sent(upstream);
    expect(headers.get('cookie')).toBeNull();
    expect(headers.get('host')).toBeNull();
    expect(headers.get('authorization')).toBe('Bearer platform-access-token');
  });

  it('forwards a POST body unchanged', async () => {
    const upstream = stubUpstream(reply({ ok: true }, 201));

    const response = await POST(
      await makeRequest('/api/bff/play/game/submit', { session: makeSession(), body: { questionId: 'q1', selectedAnswer: 'B' } }),
      context('play', 'game', 'submit'),
    );

    expect(response.status).toBe(201);
    const { url, init } = sent(upstream);
    expect(url).toBe('http://gamification-api:3002/api/v1/gamification/game/submit');
    expect(init.method).toBe('POST');
    expect(JSON.parse(Buffer.from(init.body as ArrayBuffer).toString())).toEqual({ questionId: 'q1', selectedAnswer: 'B' });
  });

  it('passes an upstream error status and body through', async () => {
    stubUpstream(reply({ detail: 'Study Guider could not reach its database.' }, 503));

    const response = await GET(await makeRequest('/api/bff/study/x', { session: makeSession() }), context('study', 'x'));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ detail: 'Study Guider could not reach its database.' });
  });

  it('drops the upstream Set-Cookie', async () => {
    stubUpstream(reply({}, 200, { 'set-cookie': 'upstream=1; Path=/' }));

    const response = await GET(await makeRequest('/api/bff/coach/x', { session: makeSession() }), context('coach', 'x'));
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('reports an unreachable service as 503, never 401', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    stubUpstream(new TypeError('fetch failed'));

    const response = await GET(await makeRequest('/api/bff/coach/x', { session: makeSession() }), context('coach', 'x'));
    expect(response.status).toBe(503);
  });

  it('does not retry a 401 from a platform-token service', async () => {
    const upstream = stubUpstream(reply({ detail: 'expired' }, 401));

    const response = await GET(await makeRequest('/api/bff/coach/x', { session: makeSession() }), context('coach', 'x'));

    expect(response.status).toBe(401);
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(exchangeForPairPath).not.toHaveBeenCalled();
  });
});

describe('PairPath token repair', () => {
  it('exchanges for a missing token and stores it on the session', async () => {
    vi.mocked(exchangeForPairPath).mockResolvedValue({ token: 'fresh-pp', userId: 'pp-2' });
    const upstream = stubUpstream(reply([]));

    const response = await GET(
      await makeRequest('/api/bff/pair/sessions/my', { session: makeSession({ pairPathToken: undefined }) }),
      context('pair', 'sessions', 'my'),
    );

    expect(response.status).toBe(200);
    expect(sent(upstream).headers.get('authorization')).toBe('Bearer fresh-pp');
    const stored = await unsealSession(response.cookies.get(SESSION_COOKIE)?.value);
    expect(stored).toMatchObject({ pairPathToken: 'fresh-pp', pairPathUserId: 'pp-2' });
  });

  it('answers 503 when no PairPath token can be obtained', async () => {
    vi.mocked(exchangeForPairPath).mockResolvedValue(null);
    const upstream = stubUpstream(reply([]));

    const response = await GET(
      await makeRequest('/api/bff/pair/topics', { session: makeSession({ pairPathToken: undefined }) }),
      context('pair', 'topics'),
    );

    expect(response.status).toBe(503);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('retries a rejected token once with a fresh one', async () => {
    vi.mocked(exchangeForPairPath).mockResolvedValue({ token: 'fresh-pp', userId: 'pp-2' });
    const upstream = stubUpstream(reply({ message: 'expired' }, 401), reply({ ok: true }));

    const response = await GET(await makeRequest('/api/bff/pair/topics', { session: makeSession() }), context('pair', 'topics'));

    expect(response.status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(2);
    expect(sent(upstream, 0).headers.get('authorization')).toBe('Bearer pairpath-token');
    expect(sent(upstream, 1).headers.get('authorization')).toBe('Bearer fresh-pp');
    expect(response.cookies.get(SESSION_COOKIE)?.value).toBeTruthy();
  });

  it('passes a second rejection through instead of looping', async () => {
    vi.mocked(exchangeForPairPath).mockResolvedValue({ token: 'fresh-pp', userId: 'pp-2' });
    const upstream = stubUpstream(reply({ message: 'no' }, 401));

    const response = await GET(await makeRequest('/api/bff/pair/topics', { session: makeSession() }), context('pair', 'topics'));

    expect(response.status).toBe(401);
    expect(upstream).toHaveBeenCalledTimes(2);
    expect(exchangeForPairPath).toHaveBeenCalledTimes(1);
  });

  it('does not exchange twice when the token was minted for this very request', async () => {
    vi.mocked(exchangeForPairPath).mockResolvedValue({ token: 'fresh-pp', userId: 'pp-2' });
    const upstream = stubUpstream(reply({ message: 'no' }, 401));

    const response = await GET(
      await makeRequest('/api/bff/pair/topics', { session: makeSession({ pairPathToken: undefined }) }),
      context('pair', 'topics'),
    );

    expect(response.status).toBe(401);
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(exchangeForPairPath).toHaveBeenCalledTimes(1);
  });
});
