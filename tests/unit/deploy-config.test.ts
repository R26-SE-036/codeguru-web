/**
 * The deployment's wiring, checked against itself.
 *
 * Every line here encodes a failure that looked like something else: a
 * backend published on the host is an unguarded door; a Caddy route to the
 * wrong port answers 502 for one feature only; a dependency that is started
 * but not healthy produced "Can't reach database" on the first login; and the
 * extension defaulting to a port the stack does not serve opened a sign-in
 * page nothing answered.
 *
 * Read as text rather than parsed: compose's own parser is the authority, and
 * `docker compose config` runs in the live preflight. These catch the drift a
 * reviewer would miss, without a YAML dependency.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const path = (relative: string) => fileURLToPath(new URL(`../../${relative}`, import.meta.url));
const read = (relative: string) => readFileSync(path(relative), 'utf-8').replace(/\r\n/g, '\n');

const compose = read('deploy/docker-compose.yml');
const caddyfile = read('deploy/Caddyfile');
const dockerfile = read('Dockerfile');
const envExample = Object.fromEntries(
  read('deploy/.env.example')
    .split('\n')
    .filter((line) => /^[A-Z_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1).trim()]),
);

/** Each service's block of compose text, by name. */
const services: Record<string, string> = (() => {
  const body = compose.slice(compose.indexOf('\nservices:\n'), compose.indexOf('\nvolumes:\n'));
  const blocks: Record<string, string> = {};
  const starts = [...body.matchAll(/^ {2}([a-z0-9-]+):\s*$/gm)];
  starts.forEach((match, index) => {
    blocks[match[1]] = body.slice(match.index, starts[index + 1]?.index ?? body.length);
  });
  return blocks;
})();

/** The port a service's own healthcheck probes - the port it listens on. */
const listensOn = (service: string) => services[service]?.match(/127\.0\.0\.1:(\d+)/)?.[1];

describe('compose', () => {
  it('has the platform\'s services', () => {
    expect(Object.keys(services).sort()).toEqual(
      ['caddy', 'code-coach', 'gamification-api', 'gamification-ml', 'pairpath-api', 'pairpath-ml', 'study-guider', 'web'].sort(),
    );
  });

  it('publishes ports from the edge only', () => {
    const publishing = Object.entries(services)
      .filter(([, block]) => /^ {4}ports:/m.test(block))
      .map(([name]) => name);

    expect(publishing).toEqual(['caddy']);
    expect(services.caddy).toContain('"${HTTP_PORT:-8080}:80"');
  });

  it.each(Object.keys({ ...services, caddy: undefined }).filter((name) => name !== 'caddy'))(
    '%s has a healthcheck probing its own port',
    (name) => {
      expect(services[name]).toMatch(/healthcheck:/);
      expect(listensOn(name)).toMatch(/^\d+$/);
    },
  );

  it('starts nothing before what it depends on is healthy', () => {
    const conditions = [...compose.matchAll(/condition: (\w+)/g)].map((match) => match[1]);
    expect(conditions.length).toBeGreaterThan(0);
    expect(new Set(conditions)).toEqual(new Set(['service_healthy']));
  });

  it.each([
    ['web', 'CODE_COACH_URL', 'code-coach'],
    ['web', 'STUDY_GUIDER_URL', 'study-guider'],
    ['web', 'PAIRPATH_URL', 'pairpath-api'],
    ['web', 'GAMIFICATION_URL', 'gamification-api'],
    ['study-guider', 'CODE_COACH_URL', 'code-coach'],
    ['pairpath-api', 'CODE_COACH_URL', 'code-coach'],
    ['pairpath-api', 'ML_SERVICE_URL', 'pairpath-ml'],
    ['gamification-api', 'CODE_COACH_URL', 'code-coach'],
    ['gamification-api', 'ML_SERVICE_URL', 'gamification-ml'],
    ['gamification-api', 'STUDY_GUIDER_URL', 'study-guider'],
  ])('%s reaches %s at %s, on the port it listens on', (service, variable, target) => {
    const url = services[service].match(new RegExp(`${variable}: (\\S+)`))?.[1];
    expect(url, `${variable} is not set on ${service}`).toBeTruthy();
    expect(url).toBe(`http://${target}:${listensOn(target)}`);
  });

  it('keeps the browser\'s socket on the edge rather than PairPath\'s own port', () => {
    expect(services.web).toMatch(/NEXT_PUBLIC_PAIR_WS_URL: ""/);
  });
});

describe('Caddy', () => {
  const routes = [...caddyfile.matchAll(/(handle(?:_path)?)\s+(\S*)\s*\{\s*reverse_proxy\s+([a-z0-9-]+):(\d+)\s*\}/g)].map(
    ([, directive, matcher, service, port]) => ({ directive, matcher, service, port }),
  );

  it('routes every path to a service on the port it listens on', () => {
    expect(routes.length).toBeGreaterThanOrEqual(3);
    for (const route of routes) {
      expect(Object.keys(services)).toContain(route.service);
      expect(route.port, `${route.matcher || 'the default route'} -> ${route.service}`).toBe(listensOn(route.service));
    }
  });

  it('strips /pair-ws for Socket.IO and keeps the /api/v1 prefix Code Coach mounts at', () => {
    expect(routes).toEqual(
      expect.arrayContaining([
        { directive: 'handle_path', matcher: '/pair-ws/*', service: 'pairpath-api', port: '3001' },
        { directive: 'handle', matcher: '/api/v1/*', service: 'code-coach', port: '8080' },
        { directive: 'handle', matcher: '', service: 'web', port: '4200' },
      ]),
    );
  });

  it('does not route /api/v1 over a path the web app serves', () => {
    expect(readdirSync(path('app/api'))).not.toContain('v1');
  });

  it('matches the port the web image serves on', () => {
    expect(dockerfile).toMatch(/^ENV PORT=4200$/m);
    expect(dockerfile).toMatch(/^ENV HOSTNAME=0\.0\.0\.0$/m);
  });
});

describe('the example environment', () => {
  it('gives a public origin on the port the edge publishes', () => {
    expect(envExample.HTTP_PORT).toMatch(/^\d+$/);
    expect(envExample.PUBLIC_ORIGIN).toBe(`http://localhost:${envExample.HTTP_PORT}`);
  });

  const extensionManifest = path('../code-coach/extension/code-coach-vscode/package.json');

  it.skipIf(!existsSync(extensionManifest))(
    'is where the VS Code extension signs in and sends its requests by default',
    () => {
      const properties = JSON.parse(readFileSync(extensionManifest, 'utf-8')).contributes.configuration.properties;

      expect(properties['codeCoach.portalUrl'].default).toBe(envExample.PUBLIC_ORIGIN);
      expect(properties['codeCoach.backendUrl'].default).toBe(envExample.PUBLIC_ORIGIN);
    },
  );
});
