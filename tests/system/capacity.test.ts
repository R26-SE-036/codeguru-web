/**
 * A class using the platform at once, and whether the server it is going to
 * run on has the memory for it.
 *
 * The deployment is one t4g.small: 2 GiB for eight containers, the operating
 * system and Docker. deploy/aws/docker-compose.yml gives each container a
 * memory ceiling, and a container that reaches its ceiling is killed. This
 * drives a realistic load through the edge and measures each container's peak
 * against that ceiling, so a limit that is too low fails here rather than as
 * a restart loop on the server during a class.
 *
 * Twelve students, each clicking through the pages a student actually opens
 * with a pause between clicks - about the traffic of forty students reading.
 * Each has an account of their own: PairPath limits requests per student, and
 * one account for all of them would measure that limit instead of capacity.
 *
 * The memory checks need `docker stats` for the containers serving
 * SYSTEM_BASE_URL, so they run only against a local stack. Latency is checked
 * anywhere; run it against the server too.
 */
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { beforeAll, describe, expect, it } from 'vitest';

import { BASE, Visitor, newStudent, said, signUp } from './platform';

const STUDENTS = 12;
const SECONDS = 45;
const PAUSE_MS: [number, number] = [1000, 2000];
/** The instance's 2 GiB, less what Amazon Linux and dockerd hold. */
const INSTANCE_BUDGET_MIB = 1600;
/** Of each container's own ceiling. */
const CEILING_SHARE = 0.85;
const P95_LIMIT_MS = 3000;

const execFileAsync = promisify(execFile);

const LOOP_BUG = `public class Marks {
    public static void main(String[] args) {
        int[] marks = {70, 80, 90};
        for (int i = 0; i <= marks.length; i++) {
            System.out.println(marks[i]);
        }
    }
}
`;

/** Memory ceilings from the server's compose file, in MiB, by service. */
const ceilings: Record<string, number> = (() => {
  const compose = readFileSync(fileURLToPath(new URL('../../deploy/aws/docker-compose.yml', import.meta.url)), 'utf-8');
  const found: Record<string, number> = {};
  let service = '';
  for (const line of compose.split(/\r?\n/)) {
    service = line.match(/^ {2}([a-z0-9-]+):\s*$/)?.[1] ?? service;
    const limit = line.match(/limits: \{memory: (\d+)m\}/)?.[1];
    if (limit) found[service] = Number(limit);
  }
  return found;
})();

async function isLocalStack(): Promise<boolean> {
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) return false;
  try {
    const { stdout } = await execFileAsync('docker', ['ps', '--format', '{{.Names}}']);
    return stdout.includes('codeguru-web-');
  } catch {
    return false;
  }
}

/** Current memory of each codeguru container, in MiB, by service name. */
async function memoryNow(): Promise<Record<string, number>> {
  const { stdout } = await execFileAsync('docker', ['stats', '--no-stream', '--format', '{{.Name}}|{{.MemUsage}}']);
  const units: Record<string, number> = { B: 1 / 1024 / 1024, KiB: 1 / 1024, MiB: 1, GiB: 1024 };
  const usage: Record<string, number> = {};
  for (const line of stdout.trim().split('\n')) {
    const [name, reading] = line.split('|');
    const service = name?.match(/^codeguru-(.+)-\d+$/)?.[1];
    const amount = reading?.match(/^([\d.]+)(B|KiB|MiB|GiB)/);
    if (service && amount) usage[service] = Number(amount[1]) * units[amount[2]];
  }
  return usage;
}

const percentile = (values: number[], share: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))] ?? 0);
};

describe('a class using the platform at once', () => {
  const students: Array<{ visitor: Visitor; userId: string; learningSessionId: string }> = [];
  const timings: Record<string, number[]> = {};
  const failures: string[] = [];
  const peaks: Record<string, number> = {};
  let local = false;

  beforeAll(async () => {
    local = await isLocalStack();

    // Registering is rate limited per client address, so this can take a
    // couple of minutes: signUp waits out the limit when it is reached.
    for (let i = 0; i < STUDENTS; i++) {
      const visitor = new Visitor();
      const registered = await signUp(visitor, newStudent(`load${i}`));
      expect(registered.status, said(registered)).toBe(200);

      const started = await visitor.post('/api/bff/coach/learning-sessions', {
        source_component: 'code_coach',
        language: 'java',
        task_id: 'capacity_test',
      });
      expect(started.status, said(started)).toBe(200);

      students.push({ visitor, userId: registered.body.user.user_id, learningSessionId: started.body.learning_session_id });
    }

    const steps: Array<[string, (student: (typeof students)[number]) => Promise<Response>]> = [
      ['GET /study (page)', ({ visitor }) => visitor.fetch('/study')],
      ['GET coach diagnostics', ({ visitor }) => visitor.fetch('/api/bff/coach/students/me/diagnostics?limit=20')],
      ['GET study curriculum', ({ visitor }) => visitor.fetch('/api/bff/study/progress/me/curriculum')],
      ['GET study overview', ({ visitor }) => visitor.fetch('/api/bff/study/dashboard/overview')],
      ['GET study games', ({ visitor }) => visitor.fetch('/api/bff/study/games/me?limit=20')],
      ['GET play profile', ({ visitor, userId }) => visitor.fetch(`/api/bff/play/profile/${userId}`)],
      ['GET pair topics', ({ visitor }) => visitor.fetch('/api/bff/pair/topics')],
      [
        'POST coach analyze',
        ({ visitor, learningSessionId }) =>
          visitor.fetch('/api/bff/coach/code-coach/analyze', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ language: 'java', code: LOOP_BUG, learning_session_id: learningSessionId, enable_logging: false }),
          }),
      ],
    ];

    let loading = true;
    const sampling = (async () => {
      while (local && loading) {
        for (const [service, mib] of Object.entries(await memoryNow())) {
          peaks[service] = Math.max(peaks[service] ?? 0, mib);
        }
      }
    })();

    const deadline = Date.now() + SECONDS * 1000;
    await Promise.all(
      students.map(async (student, index) => {
        // Staggered, as a class does not click in unison.
        await new Promise((resolve) => setTimeout(resolve, index * 150));
        for (let step = index; Date.now() < deadline; step++) {
          const [name, send] = steps[step % steps.length];
          const started = performance.now();
          try {
            const response = await send(student);
            await response.arrayBuffer();
            if (response.status >= 400 && !(name.endsWith('(page)') && response.status === 307)) {
              failures.push(`${name}: ${response.status}`);
            }
          } catch (error) {
            failures.push(`${name}: ${String(error)}`);
          }
          (timings[name] ??= []).push(performance.now() - started);

          const [least, most] = PAUSE_MS;
          await new Promise((resolve) => setTimeout(resolve, least + Math.random() * (most - least)));
        }
      }),
    );

    loading = false;
    await sampling;
  }, 600_000);

  it('answers every request, with no server errors and no student throttled', () => {
    const total = Object.values(timings).reduce((sum, list) => sum + list.length, 0);

    expect(total, 'hardly any requests were made').toBeGreaterThan(STUDENTS * 10);
    expect(failures, `${failures.length} of ${total} requests failed`).toEqual([]);
  });

  it(`answers 95% of requests within ${P95_LIMIT_MS} ms`, () => {
    const report = Object.entries(timings)
      .map(([name, list]) => `${name}: n=${list.length} p50=${percentile(list, 0.5)} p95=${percentile(list, 0.95)} max=${percentile(list, 1)}`)
      .join('\n');
    const all = Object.values(timings).flat();

    console.log(`\nLatency through ${BASE}, ms\n${report}\n`);
    expect(percentile(all, 0.95), report).toBeLessThanOrEqual(P95_LIMIT_MS);
  });

  it('keeps every container under its memory ceiling on the server, with room to spare', async (context) => {
    if (!local) context.skip();

    const report = Object.entries(peaks)
      .map(([service, mib]) => `${service}: peak ${Math.round(mib)} MiB of ${ceilings[service] ?? '?'} MiB`)
      .join('\n');
    console.log(`\nMemory under load\n${report}\n`);

    expect(Object.keys(peaks).sort(), 'docker stats did not report every service').toEqual(Object.keys(ceilings).sort());
    for (const [service, mib] of Object.entries(peaks)) {
      expect(mib, `${service} reached ${Math.round(mib)} MiB of its ${ceilings[service]} MiB ceiling`).toBeLessThan(
        ceilings[service] * CEILING_SHARE,
      );
    }
  });

  it(`fits the whole platform in ${INSTANCE_BUDGET_MIB} MiB of the instance`, async (context) => {
    if (!local) context.skip();

    const total = Object.values(peaks).reduce((sum, mib) => sum + mib, 0);
    expect(Math.round(total), `peaks were ${JSON.stringify(peaks)}`).toBeLessThanOrEqual(INSTANCE_BUDGET_MIB);
  });
});
