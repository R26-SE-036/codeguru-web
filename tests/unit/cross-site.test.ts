/**
 * Which requests count as a write from another site. The cookie's SameSite=Lax
 * does not cover the first deployment's address - see lib/cross-site.ts.
 */
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { isCrossSiteWrite } from '@/lib/cross-site';

const request = (method: string, headers: Record<string, string>, url = 'https://13-201-10-20.sslip.io/api/auth/logout') =>
  new NextRequest(url, { method, headers });

describe('isCrossSiteWrite', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('refuses a %s whose Origin is another host', (method) => {
    expect(isCrossSiteWrite(request(method, { host: '13-201-10-20.sslip.io', origin: 'https://evil.example' }))).toBe(true);
  });

  it('refuses another host under the same suffix, which SameSite counts as the same site', () => {
    expect(
      isCrossSiteWrite(request('POST', { host: '13-201-10-20.sslip.io', origin: 'https://198-51-100-4.sslip.io' })),
    ).toBe(true);
  });

  it('refuses a different port on the same hostname', () => {
    expect(isCrossSiteWrite(request('POST', { host: 'localhost:8090', origin: 'http://localhost:3000' }))).toBe(true);
  });

  it.each(['cross-site', 'same-site'])('refuses Sec-Fetch-Site: %s even without an Origin', (site) => {
    expect(isCrossSiteWrite(request('POST', { host: '13-201-10-20.sslip.io', 'sec-fetch-site': site }))).toBe(true);
  });

  it.each(['null', 'not a url'])('refuses the Origin %j', (origin) => {
    expect(isCrossSiteWrite(request('POST', { host: '13-201-10-20.sslip.io', origin }))).toBe(true);
  });

  it('allows the app\'s own origin', () => {
    expect(
      isCrossSiteWrite(
        request('POST', { host: '13-201-10-20.sslip.io', origin: 'https://13-201-10-20.sslip.io', 'sec-fetch-site': 'same-origin' }),
      ),
    ).toBe(false);
  });

  it('compares against the Host the browser used, not the container address Next sees behind the proxy', () => {
    expect(
      isCrossSiteWrite(
        request('POST', { host: 'localhost:8090', origin: 'http://localhost:8090' }, 'http://localhost:4200/api/auth/logout'),
      ),
    ).toBe(false);
  });

  it('allows a request with no browser provenance at all - curl, the system tests, a server', () => {
    expect(isCrossSiteWrite(request('POST', { host: '13-201-10-20.sslip.io' }))).toBe(false);
  });

  it.each(['GET', 'HEAD', 'OPTIONS'])('does not check a %s', (method) => {
    expect(isCrossSiteWrite(request(method, { host: '13-201-10-20.sslip.io', origin: 'https://evil.example' }))).toBe(false);
  });
});
