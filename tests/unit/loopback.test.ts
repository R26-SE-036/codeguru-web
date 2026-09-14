/**
 * The extension's return address is an attacker-supplied URL that receives a
 * sign-in credential. Every accepted shape here is one a malicious page could
 * use, so the refusals matter more than the acceptances.
 */
import { describe, expect, it } from 'vitest';

import {
  buildLoopbackRedirect,
  isAllowedLoopbackRedirect,
  isLoopbackRedirectSeenByMiddleware,
} from '@/lib/loopback';

describe('isAllowedLoopbackRedirect', () => {
  it.each([
    'http://127.0.0.1:53682/callback',
    'http://127.0.0.1:1024/callback',
    'http://127.0.0.1:65535/callback',
    'http://[::1]:53682/callback',
  ])('accepts the extension listener %s', (uri) => {
    expect(isAllowedLoopbackRedirect(uri)).toBe(true);
  });

  it.each([
    [null, 'nothing'],
    [undefined, 'nothing'],
    ['', 'an empty string'],
    ['not a url', 'garbage'],
    ['https://127.0.0.1:53682/callback', 'https, which the listener cannot serve'],
    ['http://localhost:53682/callback', 'localhost, which goes through name resolution'],
    ['http://evil.example:53682/callback', 'another host'],
    ['http://127.0.0.1.evil.example:53682/callback', 'a host that only starts like loopback'],
    ['http://127.0.0.2:53682/callback', 'another loopback-range address'],
    ['http://127.0.0.1:53682/other', 'another path'],
    ['http://127.0.0.1:53682/callback/', 'a trailing slash'],
    ['http://127.0.0.1:53682/callback?next=https://evil.example', 'a query of its own'],
    ['http://127.0.0.1:53682/callback#fragment', 'a fragment'],
    ['http://user:pass@127.0.0.1:53682/callback', 'credentials in the URL'],
    ['http://127.0.0.1/callback', 'no port'],
    ['http://127.0.0.1:80/callback', 'a privileged port'],
    ['http://127.0.0.1:1023/callback', 'the last privileged port'],
    ['javascript:alert(1)//127.0.0.1:53682/callback', 'a script URL'],
    ['//127.0.0.1:53682/callback', 'a protocol-relative URL'],
  ])('refuses %s (%s)', (uri, _reason) => {
    expect(isAllowedLoopbackRedirect(uri as string | null | undefined)).toBe(false);
  });
});

describe('isLoopbackRedirectSeenByMiddleware', () => {
  it.each([
    'http://127.0.0.1:53682/callback',
    // What middleware reads once NextURL has rewritten 127.0.0.1 behind a proxy.
    'http://localhost:53682/callback',
  ])('accepts %s', (uri) => {
    expect(isLoopbackRedirectSeenByMiddleware(uri)).toBe(true);
  });

  it.each([
    null,
    'not a url',
    'https://localhost:53682/callback',
    'http://localhost.evil.example:53682/callback',
    'http://evil.example:53682/callback',
    'http://localhost:53682/elsewhere',
    'http://localhost:80/callback',
    'http://localhost:53682/callback?steal=1',
  ])('still refuses %s', (uri) => {
    expect(isLoopbackRedirectSeenByMiddleware(uri)).toBe(false);
  });

  it('leaves the strict check refusing localhost, which is what mints codes', () => {
    expect(isAllowedLoopbackRedirect('http://localhost:53682/callback')).toBe(false);
  });
});

describe('buildLoopbackRedirect', () => {
  it('attaches the code to an allowed address', () => {
    expect(buildLoopbackRedirect('http://127.0.0.1:53682/callback', 'abc123')).toBe(
      'http://127.0.0.1:53682/callback?code=abc123',
    );
  });

  it('encodes a code rather than letting it add parameters', () => {
    const url = new URL(buildLoopbackRedirect('http://127.0.0.1:53682/callback', 'a&next=x y')!);
    expect(url.searchParams.get('code')).toBe('a&next=x y');
    expect(url.searchParams.get('next')).toBeNull();
  });

  it('re-checks the address instead of trusting the caller', () => {
    expect(buildLoopbackRedirect('http://evil.example/callback', 'abc123')).toBeNull();
  });
});
