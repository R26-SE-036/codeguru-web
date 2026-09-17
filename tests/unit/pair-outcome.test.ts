/**
 * Reporting a finished pair session: the id the browser names goes into a
 * PairPath URL, so only a PairPath id gets that far.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/pair/outcome/[id]/route';
import { makeRequest, makeSession } from './helpers';

const context = (id: string) => ({ params: Promise.resolve({ id }) });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the pair outcome route', () => {
  // Next decodes the segment, so `..` and `a/b` are what a crafted URL delivers.
  it.each(['..', '.', 'a/b', '..\\auth', 'x'.repeat(65), ''])('refuses the id %j without calling anything', async (id) => {
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);

    const response = await POST(await makeRequest('/api/pair/outcome/x', { method: 'POST', session: makeSession() }), context(id));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ recorded: false, reason: 'invalid_session_id' });
    expect(upstream).not.toHaveBeenCalled();
  });

  it('asks PairPath about a well-formed id', async () => {
    const upstream = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify({ status: 'ACTIVE', conceptTags: [] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', upstream);

    const response = await POST(
      await makeRequest('/api/pair/outcome/x', { method: 'POST', session: makeSession() }),
      context('cm1abc2def3ghi4jkl5mno6pq'),
    );

    expect(response.status).toBe(409);
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(String(upstream.mock.calls[0][0])).toBe('http://pairpath-api:3001/sessions/cm1abc2def3ghi4jkl5mno6pq/outcome');
  });
});
