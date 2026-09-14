/**
 * Where the BFF sends a request, and with which token. A wrong answer here sends
 * a student's token to the wrong service, or to localhost in production.
 */
import { describe, expect, it, vi } from 'vitest';

import { baseUrl, credentialKind, isServiceKey, tokenFor, upstreamUrl } from '@/lib/upstream';
import { makeSession } from './helpers';

describe('upstreamUrl', () => {
  it.each([
    ['coach', '/students/me/diagnostics', '?limit=5', 'http://code-coach:8080/api/v1/students/me/diagnostics?limit=5'],
    ['study', '/remediation/triggers', '', 'http://study-guider:8010/api/remediation/triggers'],
    ['pair', '/sessions/my', '', 'http://pairpath-api:3001/sessions/my'],
    ['play', '/profile/user_1', '', 'http://gamification-api:3002/api/v1/gamification/profile/user_1'],
  ] as const)('maps %s%s to its service', (service, path, search, expected) => {
    expect(upstreamUrl(service, path, search)).toBe(expected);
  });

  it('adds the leading slash a caller forgot', () => {
    expect(upstreamUrl('coach', 'auth/me', '')).toBe('http://code-coach:8080/api/v1/auth/me');
  });

  it('ignores trailing slashes on the configured address', () => {
    vi.stubEnv('CODE_COACH_URL', 'http://code-coach:8080///');
    expect(baseUrl('coach')).toBe('http://code-coach:8080');
  });
});

describe('baseUrl without configuration', () => {
  it('falls back to the local dev port in development', () => {
    vi.stubEnv('STUDY_GUIDER_URL', '');
    vi.stubEnv('NODE_ENV', 'development');
    expect(baseUrl('study')).toBe('http://127.0.0.1:8010');
  });

  it('refuses to guess in production', () => {
    vi.stubEnv('STUDY_GUIDER_URL', '');
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => baseUrl('study')).toThrow(/STUDY_GUIDER_URL is not set/);
  });
});

describe('isServiceKey', () => {
  it.each(['coach', 'study', 'pair', 'play'])('knows %s', (key) => {
    expect(isServiceKey(key)).toBe(true);
  });

  // Names every plain object answers to. Accepting them would route a request
  // to an "upstream" that is Object.prototype's method.
  it.each(['admin', '', 'toString', 'constructor', '__proto__', 'hasOwnProperty'])(
    'does not know %j',
    (key) => {
      expect(isServiceKey(key)).toBe(false);
    },
  );
});

describe('tokenFor', () => {
  it('gives PairPath its own token, never the platform one', () => {
    expect(tokenFor('pair', makeSession())).toBe('pairpath-token');
    expect(tokenFor('pair', makeSession({ pairPathToken: undefined }))).toBeNull();
  });

  it.each(['coach', 'study', 'play'] as const)('gives %s the platform token', (service) => {
    expect(tokenFor(service, makeSession())).toBe('platform-access-token');
    expect(credentialKind(service)).toBe('platform');
  });
});
