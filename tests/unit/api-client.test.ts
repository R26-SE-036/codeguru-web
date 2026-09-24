/**
 * The browser's API client: which error text a student sees, and whether an
 * outage is told apart from a refusal.
 */
import { describe, expect, it, vi } from 'vitest';

import { ApiError, api, errorMessage } from '@/lib/api';
import { jsonResponse } from './helpers';

describe('errorMessage', () => {
  it.each([
    ['FastAPI detail', { detail: 'Not signed in.' }, 'Not signed in.'],
    [
      'NestJS message over its status phrase',
      { statusCode: 400, message: 'That session already has two people in it.', error: 'Bad Request' },
      'That session already has two people in it.',
    ],
    [
      'NestJS validation list',
      { message: ['joinCode must be a string', 'joinCode should not be empty'], error: 'Bad Request' },
      'joinCode must be a string. joinCode should not be empty',
    ],
    ['Express error', { error: 'userId is required' }, 'userId is required'],
    ['a blank detail, falling through', { detail: '   ', error: 'Real reason' }, 'Real reason'],
    ['nothing usable', { detail: [{ nope: 1 }] }, 'Request failed (500).'],
    ['no body', null, 'Request failed (500).'],
  ])('reads %s', (_label, body, expected) => {
    expect(errorMessage(body, 500)).toBe(expected);
  });
});

describe('ApiError.isUnavailable', () => {
  it.each([
    [503, true],
    [504, true],
    [0, true],
    [401, false],
    [403, false],
    [429, false],
    [500, false],
  ])('status %i -> %s', (status, expected) => {
    expect(new ApiError('x', status).isUnavailable).toBe(expected);
  });
});

describe('api requests', () => {
  it('goes through the same-origin BFF with the cookie and no token', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await api.post('study', 'quiz/generate', { error_type: 'X' });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/bff/study/quiz/generate');
    expect(init.credentials).toBe('same-origin');
    expect(init.method).toBe('POST');
    expect(JSON.stringify(init.headers)).not.toMatch(/authorization/i);
  });

  it('reports an unreachable server as unavailable, not as a refusal', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('fetch failed'))));

    const error = (await api.get('coach', '/students/me').catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.isUnavailable).toBe(true);
  });

  it('carries the backend reason and status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ detail: 'Daily limit reached.' }, 429)));

    const error = await api.get('study', '/quiz').catch((e) => e);
    expect(error).toMatchObject({ status: 429, message: 'Daily limit reached.' });
  });

  it('answers a 204 with nothing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
    await expect(api.put('pair', '/x', {})).resolves.toBeUndefined();
  });
});
