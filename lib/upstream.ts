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

/**
 * Own keys only. `value in UPSTREAMS` also answered true for every name a plain
 * object inherits - toString, constructor, __proto__ - so /api/bff/toString/x
 * passed as a known service and went on to build an "upstream" out of
 * Object.prototype's method, attaching the student's platform token on the
 * way. It failed further down; it should never have got that far.
 */
export function isServiceKey(value: string): value is ServiceKey {
  return Object.hasOwn(UPSTREAMS, value);
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

/** A path that would leave the service's own API if it were forwarded. */
export class UnsafeUpstreamPathError extends Error {
  constructor(path: string) {
    super(`Refusing to forward the path ${JSON.stringify(path)}.`);
    this.name = 'UnsafeUpstreamPathError';
  }
}

/** `.` or `..`, including the percent-encoded spellings URL parsing treats as dots. */
const DOT_SEGMENT = /^(?:\.|%2e){1,2}$/i;

/**
 * Build the upstream URL for a proxied request.
 *
 * ==================== WHY THE PATH IS CHECKED HERE ====================
 * The proxy's path arrives as segments Next has already percent-decoded. A
 * browser normalises a literal `/../`, but `..%2F..%2Fopenapi.json` reaches
 * the route as one segment, `../../openapi.json`, and joining the segments
 * back into a URL turned it into real dot segments that fetch() resolved:
 *
 *     /api/bff/coach/..%2F..%2Fopenapi.json -> http://code-coach:8080/openapi.json
 *
 * So any signed-in student could reach any path on any of the four APIs -
 * Code Coach's unauthenticated root /analyze and its schema among them - with
 * their token attached. `\` did the same, since URL parsing reads it as `/`
 * for http, and a double-encoded `%252e%252e` arrived as `%2e%2e`, which URL
 * parsing also treats as `..`.
 *
 * Refused two ways: no segment may be a dot segment or contain a backslash,
 * and the URL as fetch() will resolve it must still be inside the service's
 * base path. The second is the one that matters; the first gives the reason.
 * =====================================================================
 */
export function upstreamUrl(service: ServiceKey, path: string, search: string): string {
  const upstream = UPSTREAMS[service];
  const suffix = path.startsWith('/') ? path : `/${path}`;

  if (suffix.includes('\\') || suffix.split('/').some((segment) => DOT_SEGMENT.test(segment))) {
    throw new UnsafeUpstreamPathError(path);
  }

  const base = new URL(`${baseUrl(service)}${upstream.basePath}/`);
  const url = `${baseUrl(service)}${upstream.basePath}${suffix}${search}`;
  const resolved = new URL(url);

  if (resolved.origin !== base.origin || !`${resolved.pathname}/`.startsWith(base.pathname)) {
    throw new UnsafeUpstreamPathError(path);
  }

  return url;
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
