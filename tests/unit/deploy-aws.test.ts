/**
 * The EC2 deployment's files, checked against the local stack they are meant
 * to reproduce and against the rules a public server adds.
 *
 * deploy/aws/docker-compose.yml is written by hand beside deploy/docker-compose.yml,
 * and the two drift the moment one changes. Each check here is a way the server
 * would differ from the stack every other suite has just tested: a service
 * missing, a probe on a different port, student code run outside the Lambda,
 * a container with no memory ceiling on a 2 GB instance.
 *
 * Read as text, like deploy-config.test.ts, and for the same reason.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const path = (relative: string) => fileURLToPath(new URL(`../../${relative}`, import.meta.url));
const read = (relative: string) => readFileSync(path(relative), 'utf-8').replace(/\r\n/g, '\n');

/** Each service's block of compose text, by name. */
function servicesOf(compose: string): Record<string, string> {
  const body = compose.slice(compose.indexOf('\nservices:\n'), compose.indexOf('\nvolumes:\n'));
  const blocks: Record<string, string> = {};
  const starts = [...body.matchAll(/^ {2}([a-z0-9-]+):\s*$/gm)];
  starts.forEach((match, index) => {
    blocks[match[1]] = body.slice(match.index, starts[index + 1]?.index ?? body.length);
  });
  return blocks;
}

const local = servicesOf(read('deploy/docker-compose.yml'));
const awsCompose = read('deploy/aws/docker-compose.yml');
const aws = servicesOf(awsCompose);
const buildScript = read('deploy/aws/build-and-push.sh');
const prepareEnv = read('deploy/aws/prepare-env.sh');

const probe = (block: string) => block.match(/test: (\[.*\])/)?.[1];
const setting = (block: string, name: string) => block.match(new RegExp(`^\\s+${name}: (.+)$`, 'm'))?.[1];

/** name -> build context, from the IMAGES table in build-and-push.sh. */
const images = Object.fromEntries(
  [...buildScript.matchAll(/^\s+"([a-z0-9-]+)\|([^"]+)"$/gm)].map(([, name, context]) => [name, context]),
);

describe('the server\'s compose file', () => {
  it('runs the same services as the local stack', () => {
    expect(Object.keys(aws).sort()).toEqual(Object.keys(local).sort());
  });

  it('builds nothing - every image comes from the registry', () => {
    expect(awsCompose).not.toMatch(/^\s+build:/m);

    for (const [name, block] of Object.entries(aws)) {
      if (name === 'caddy') continue;
      expect(setting(block, 'image'), name).toBe(`"\${REGISTRY:?}/codeguru/${name}:\${TAG:?}"`);
    }
  });

  it('publishes only the edge, on the ports a certificate needs', () => {
    const publishing = Object.entries(aws)
      .filter(([, block]) => /^ {4}ports:/m.test(block))
      .map(([name]) => name);

    expect(publishing).toEqual(['caddy']);
    expect(aws.caddy).toContain('"80:80"');
    expect(aws.caddy).toContain('"443:443"');
  });

  it.each(Object.keys(local).filter((name) => name !== 'caddy'))('probes %s exactly as the local stack does', (name) => {
    expect(probe(aws[name]), `${name} has no healthcheck`).toBeTruthy();
    expect(probe(aws[name])).toBe(probe(local[name]));
  });

  it.each(['CODE_COACH_URL', 'STUDY_GUIDER_URL', 'PAIRPATH_URL', 'GAMIFICATION_URL', 'ML_SERVICE_URL'])(
    'points %s where the local stack does',
    (variable) => {
      for (const name of Object.keys(local)) {
        expect(setting(aws[name], variable), `${name}.${variable}`).toBe(setting(local[name], variable));
      }
    },
  );

  it.each(Object.keys(local))('caps %s\'s memory', (name) => {
    expect(aws[name]).toMatch(/limits: \{memory: \d+m\}/);
  });

  it('gives every service a restart policy and rotated logs', () => {
    expect(awsCompose).toMatch(/x-service: &service\n\s+restart: unless-stopped\n\s+logging:/);
    expect(awsCompose).toMatch(/options: \{max-size: "\d+m", max-file: "\d+"\}/);
    for (const [name, block] of Object.entries(aws)) {
      expect(block, name).toContain('<<: *service');
    }
  });

  it('starts nothing before what it depends on is healthy', () => {
    const conditions = [...awsCompose.matchAll(/condition: (\w+)/g)].map((match) => match[1]);
    expect(new Set(conditions)).toEqual(new Set(['service_healthy']));
  });
});

describe('student code on the server', () => {
  it('runs in the Lambda, which the API cannot start without', () => {
    expect(setting(aws['pairpath-api'], 'CODE_RUNNER_LAMBDA_FUNCTION')).toBe('"${CODE_RUNNER_LAMBDA_FUNCTION:?}"');
  });

  it('keeps the image\'s production mode, and no way to run outside the sandbox', () => {
    // The local stack overrides NODE_ENV to development to allow unsandboxed
    // runs; the server must keep the image's production.
    expect(setting(local['pairpath-api'], 'NODE_ENV')).toBe('development');
    expect(setting(aws['pairpath-api'], 'NODE_ENV')).toBeUndefined();
    expect(awsCompose).not.toMatch(/^\s+CODE_RUNNER_ALLOW_UNSANDBOXED:/m);
    expect(awsCompose).not.toMatch(/INCLUDE_JDK/);
  });

  it('is kept out of the env files copied to the server', () => {
    const drop = prepareEnv.match(/^DROP='(.+)'$/m)?.[1];
    expect(drop, 'prepare-env.sh has no DROP pattern').toBeTruthy();

    const pattern = new RegExp(drop!);
    for (const line of ['CODE_RUNNER_ALLOW_UNSANDBOXED=true', 'INTEGRATION_STUDENT_PASSWORD=x', 'PORT=3002']) {
      expect(pattern.test(line), line).toBe(true);
    }
    for (const line of ['MONGODB_URI=x', 'JWT_SECRET=x', 'CODE_COACH_URL=x']) {
      expect(pattern.test(line), line).toBe(false);
    }
  });
});

describe('the images and env files the server needs', () => {
  it('builds an image for every service the compose file pulls, and the Lambda\'s', () => {
    const pulled = [...awsCompose.matchAll(/\/codeguru\/([a-z0-9-]+):/g)].map((match) => match[1]);
    expect(Object.keys(images).sort()).toEqual([...pulled, 'code-runner'].sort());
  });

  it('builds for the instance\'s arm64, without the attestation manifest Lambda rejects', () => {
    expect(buildScript).toContain('--platform linux/arm64');
    expect(buildScript).toContain('--provenance=false');
  });

  const workspace = path('..');

  it.skipIf(!existsSync(`${workspace}/code-coach`))('builds from contexts that exist and have a Dockerfile', () => {
    for (const [name, context] of Object.entries(images)) {
      expect(existsSync(`${workspace}/${context}/Dockerfile`), `${name}: ${context}/Dockerfile`).toBe(true);
    }
  });

  it('writes every env file the compose file reads', () => {
    const read = [...new Set([...awsCompose.matchAll(/env_file: \[env\/([a-z-]+\.env)\]/g)].map((match) => match[1]))];
    const written = [...prepareEnv.matchAll(/^copy \S+\s+([a-z-]+\.env)$/gm)].map((match) => match[1]);

    expect(read.length).toBeGreaterThan(0);
    expect(written.sort()).toEqual(read.sort());
  });

  it('keeps those credentials out of git and out of the web image', () => {
    expect(read('.gitignore')).toMatch(/^deploy\/aws\/env\/$/m);
    expect(read('.dockerignore')).toMatch(/^deploy$/m);
  });
});
