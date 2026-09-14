/**
 * The edge: what the one public address serves, and where it routes each path.
 */
import { describe, expect, it } from 'vitest';

import { BASE } from './platform';

describe('the edge', () => {
  it('serves the sign-in page without naming a single backend', async () => {
    const response = await fetch(`${BASE}/login`);
    const html = await response.text();

    expect(response.status).toBe(200);
    // The form itself renders in the browser (it reads the query string); the
    // server-rendered shell carries the heading.
    expect(html).toContain('Welcome back');
    for (const internal of ['code-coach:8080', 'study-guider:8010', 'pairpath-api:3001', 'gamification-api:3002', '127.0.0.1:8000']) {
      expect(html).not.toContain(internal);
    }
  });

  it('sends a signed-out page to sign in on the public address, not a container port', async () => {
    const response = await fetch(`${BASE}/study`, { redirect: 'manual' });

    expect(response.status).toBe(307);
    // Next sends the Location relative, which the browser resolves against the
    // address it used. Either form is right; a different host or port is not.
    const location = new URL(response.headers.get('location') ?? '', BASE);
    expect(location.href).toBe(`${BASE}/login?next=%2Fstudy`);
  });

  it('answers a signed-out API call with 401, not a redirect to HTML', async () => {
    const response = await fetch(`${BASE}/api/bff/coach/students/me/diagnostics`, { redirect: 'manual' });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ detail: 'Not signed in.' });
  });

  it('routes /api/v1 to Code Coach, for the editor extension', async () => {
    const response = await fetch(`${BASE}/api/v1/auth/me`);

    // Code Coach's own wording. The web app's would be "Not signed in.", which
    // would mean the route is missing and the extension has nowhere to go.
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ detail: 'Authentication is required.' });
  });

  it.each(['/openapi.json', '/docs', '/redoc'])('keeps Code Coach\'s %s internal', async (path) => {
    const response = await fetch(`${BASE}${path}`, { redirect: 'manual' });
    const body = await response.text();

    // The web app answers these - a redirect to sign in, or its 404 - and
    // never Code Coach's schema or documentation pages.
    expect(body).not.toContain('"openapi"');
    expect(body).not.toMatch(/swagger-ui|redoc\.standalone|<redoc/i);
  });

  it('reaches PairPath\'s socket server under /pair-ws', async () => {
    const response = await fetch(`${BASE}/pair-ws/socket.io/?EIO=4&transport=polling`);

    expect(response.status).toBe(200);
    // Engine.IO's open packet: the handshake got through the rewrite.
    expect(await response.text()).toMatch(/^0\{"sid":/);
  });
});
