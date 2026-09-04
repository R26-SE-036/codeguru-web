/**
 * Where each backend lives, and which token it is given.
 *
 * The service registry used to be the portal's, and every cross-service link
 * went through `{portal}/go?to=<key>` so a sibling never had to know where its
 * siblings lived. That indirection existed because the four UIs were on four
 * origins. With one frontend the registry is just this table, and it is only
 * ever read on the server - no backend URL reaches a browser.
 */

import type { Session } from './session';

export type ServiceKey = 'coach' | 'study' | 'pair' | 'play';

/**
 * Which credential each service accepts.
 *
 * `platform` - the Code Coach access token. Study Guider and Gamification
 *   verify it by calling Code Coach's /auth/me, so they take it directly.
 *
 * `pairpath` - PairPath's own JWT, obtained from POST /auth/exchange. It does
 *   not accept the platform token: its Socket.IO handshake verifies its own
 *   signature and every foreign key points at a local users.id.
 */
type Credential = 'platform' | 'pairpath';

interface Upstream {
  /** Env var holding the base URL. */
  envVar: string;
  /** Only used when the env var is unset, and only in development. */
  devDefault: string;
  credential: Credential;
  /** Path prefix on the upstream, if it differs from what the client sends. */
  basePath: string;
}

const UPSTREAMS: Record<ServiceKey, Upstream> = {
  coach: {
    envVar: 'CODE_COACH_URL',
    devDefault: 'http://127.0.0.1:8000',
    credential: 'platform',
    basePath: '/api/v1',
  },
  study: {
    envVar: 'STUDY_GUIDER_URL',
    devDefault: 'http://127.0.0.1:8010',
    credential: 'platform',
    basePath: '/api',
  },
  pair: {
    envVar: 'PAIRPATH_URL',
    devDefault: 'http://127.0.0.1:3001',
    credential: 'pairpath',
    // PairPath mounts its routes at the root - no global prefix.
    basePath: '',
  },
  play: {
    envVar: 'GAMIFICATION_URL',
    devDefault: 'http://127.0.0.1:3002',
    credential: 'platform',
    basePath: '/api/v1/gamification',
  },
};

export function isServiceKey(value: string): value is ServiceKey {
  return value in UPSTREAMS;
}

/**
 * Resolve a service's base URL.
 *
 * In production the environment variable is required. The dev defaults are
 * deliberately not fallbacks everywhere: a missing variable in a deployed
 * environment should fail loudly, not quietly send a student's token to
 * 127.0.0.1 - which is the exact shape of the bug that had PairPath posting
 * feature vectors at Code Coach's port for months.
 */
export function baseUrl(service: ServiceKey): string {
  const upstream = UPSTREAMS[service];
  const configured = process.env[upstream.envVar];

  if (configured) return configured.replace(/\/+$/, '');

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `${upstream.envVar} is not set. It is required in production; there is no ` +
        `fallback, because falling back to localhost in a deployed environment ` +
        `fails silently.`,
    );
  }

  return upstream.devDefault;
}

/** Build the upstream URL for a proxied request. */
export function upstreamUrl(service: ServiceKey, path: string, search: string): string {
  const upstream = UPSTREAMS[service];
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl(service)}${upstream.basePath}${suffix}${search}`;
}

/**
 * The bearer token for this service, or null when the session cannot supply
 * one.
 *
 * Returning null rather than falling back to the platform token matters: a
 * PairPath request carrying a Code Coach token is not "slightly wrong", it is
 * unauthenticated, and sending it would turn a missing-exchange bug into a
 * confusing 401 from a service that looks configured.
 */
export function tokenFor(service: ServiceKey, session: Session): string | null {
  return UPSTREAMS[service].credential === 'pairpath'
    ? session.pairPathToken ?? null
    : session.accessToken;
}

export function credentialKind(service: ServiceKey): Credential {
  return UPSTREAMS[service].credential;
}
