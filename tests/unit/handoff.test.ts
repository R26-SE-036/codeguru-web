/**
 * The VS Code extension's browser sign-in: the route that mints the one-time
 * code, and the page helper that sends the browser back to the editor.
 */
import { describe, expect, it, vi } from 'vitest';

import { POST as handoffRoute } from '@/app/api/auth/handoff/route';
import { completeExtensionHandoff } from '@/lib/extension-handoff';
import { jsonResponse, makeRequest, makeSession } from './helpers';

const CALLBACK = 'http://127.0.0.1:53682/callback';

describe('POST /api/auth/handoff', () => {
  it('refuses without a session and asks Code Coach for nothing', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await handoffRoute(await makeRequest('/api/auth/handoff', { body: { redirectUri: CALLBACK } }));

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    'http://evil.example/callback',
    'http://localhost:53682/callback',
    'https://127.0.0.1:53682/callback',
    'http://127.0.0.1:53682/callback?steal=1',
    undefined,
  ])('mints no code for %s', async (redirectUri) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await handoffRoute(
      await makeRequest('/api/auth/handoff', { body: { redirectUri }, session: makeSession() }),
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('mints a code under the extension client name and returns only the code', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ code: 'one-time-code-1234567890' }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await handoffRoute(
      await makeRequest('/api/auth/handoff', { body: { redirectUri: CALLBACK }, session: makeSession() }),
    );

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ code: 'one-time-code-1234567890' });
    expect(text).not.toContain('platform-access-token');

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://code-coach:8080/api/v1/auth/handoff');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer platform-access-token');
    // Its own client name, or the browser and the editor share one refresh
    // token and each rotation signs the other out.
    expect(JSON.parse(String(init.body))).toEqual({ client_name: 'codeguru-vscode' });
  });

  it('passes a Code Coach refusal through', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ detail: 'Authentication is required.' }, 401)));

    const response = await handoffRoute(
      await makeRequest('/api/auth/handoff', { body: { redirectUri: CALLBACK }, session: makeSession() }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ detail: 'Authentication is required.' });
  });

  it('reports Code Coach being down as 503', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('fetch failed'))));

    const response = await handoffRoute(
      await makeRequest('/api/auth/handoff', { body: { redirectUri: CALLBACK }, session: makeSession() }),
    );
    expect(response.status).toBe(503);
  });
});

describe('completeExtensionHandoff', () => {
  it('does nothing for an ordinary sign-in', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(await completeExtensionHandoff(null)).toBeNull();
    expect(await completeExtensionHandoff('http://evil.example/callback')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns the loopback address carrying the code', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ code: 'abc 123' }));
    vi.stubGlobal('fetch', fetchMock);

    const target = await completeExtensionHandoff(CALLBACK);

    expect(target).toBe('http://127.0.0.1:53682/callback?code=abc+123');
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/handoff', expect.objectContaining({ method: 'POST', credentials: 'same-origin' }));
  });

  it.each([
    ['a refusal', async () => jsonResponse({ detail: 'no' }, 401)],
    ['no code in the answer', async () => jsonResponse({})],
    ['an outage', async () => Promise.reject(new TypeError('fetch failed'))],
  ])('falls back to the normal redirect on %s', async (_label, respond) => {
    vi.stubGlobal('fetch', vi.fn(respond as () => Promise<Response>));
    expect(await completeExtensionHandoff(CALLBACK)).toBeNull();
  });
});
