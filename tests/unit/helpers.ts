import { NextRequest } from 'next/server';

import { SESSION_COOKIE, sealSession, type Session } from '@/lib/session';

/** The public origin the compose stack serves, so redirects are checked against it. */
export const ORIGIN = 'http://localhost:8090';

export function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    accessToken: 'platform-access-token',
    refreshToken: 'platform-refresh-token',
    accessExpiresAt: Date.now() + 60 * 60 * 1000,
    pairPathToken: 'pairpath-token',
    pairPathUserId: 'pairpath-user-1',
    user: { user_id: 'user_1', email: 'ana@example.com', full_name: 'Ana Student' },
    ...overrides,
  };
}

export async function makeRequest(
  path: string,
  options: {
    method?: string;
    session?: Session;
    body?: unknown;
    rawBody?: string;
    headers?: Record<string, string>;
  } = {},
): Promise<NextRequest> {
  const headers = new Headers(options.headers);
  if (options.session) {
    headers.set('cookie', `${SESSION_COOKIE}=${await sealSession(options.session)}`);
  }

  let body: string | undefined;
  if (options.rawBody !== undefined) {
    body = options.rawBody;
  } else if (options.body !== undefined) {
    body = JSON.stringify(options.body);
    headers.set('content-type', 'application/json');
  }

  return new NextRequest(`${ORIGIN}${path}`, {
    method: options.method ?? (body === undefined ? 'GET' : 'POST'),
    headers,
    body,
  });
}

/** A fetch Response with a JSON body. */
export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}
