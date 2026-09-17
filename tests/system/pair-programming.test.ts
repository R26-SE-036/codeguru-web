/**
 * Pair programming from start to finish, with two new students: the driver
 * types and the navigator sees it, they swap, the pair runs Java and both see
 * the output, the session ends for both, and its outcome reaches Code Coach.
 *
 * pairing.test.ts stops once the room is open. Everything after that - the
 * events PairPath records for its model, the compiler, the end of a session and
 * the hand-off of its outcome - is what a pair actually does, and is most of
 * what PairPath writes to its database.
 */
import type { Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { connect, once, socketToken } from './pair-socket';
import { Visitor, newStudent, said, signUp } from './platform';

const MARKER = `pair-system-test-${Date.now()}`;

const PROGRAM = `public class Main {
    public static void main(String[] args) {
        System.out.println("${MARKER}");
    }
}
`;

const BROKEN = `public class Main {
    public static void main(String[] args) {
        System.out.println("missing semicolon")
    }
}
`;

type CodeResult = { success: boolean; stdout: string; stderr: string; compileError: string | null; correct: boolean | null };

type RunOutcome =
  | { event: 'code_result'; payload: CodeResult }
  | { event: 'run_rejected'; payload: { reason: string; message: string } };

/** Whichever answer to a run arrives first, with both listeners removed after. */
function nextRunOutcome(socket: Socket, ms: number): Promise<RunOutcome> {
  return new Promise((resolve, reject) => {
    const stop = () => {
      clearTimeout(timer);
      socket.off('code_result', onResult);
      socket.off('run_rejected', onRejected);
    };
    const onResult = (payload: CodeResult) => {
      stop();
      resolve({ event: 'code_result', payload });
    };
    const onRejected = (payload: { reason: string; message: string }) => {
      stop();
      resolve({ event: 'run_rejected', payload });
    };
    const timer = setTimeout(() => {
      stop();
      reject(new Error(`no answer to run_code within ${ms} ms`));
    }, ms);
    socket.on('code_result', onResult);
    socket.on('run_rejected', onRejected);
  });
}

describe('pair programming, start to finish', () => {
  const first = new Visitor();
  const second = new Visitor();
  const sockets: Socket[] = [];
  const socketOf = new Map<Visitor, Socket>();
  /** Each student's PairPath user id - the `sub` of the token their socket uses. */
  const pairIdOf = new Map<Visitor, string>();
  let session = { id: '', joinCode: '' };
  /** PairPath user id -> DRIVER or NAVIGATOR, as the room last announced. */
  let roles: Record<string, string> = {};

  /** Whoever currently holds the given role. */
  const holding = (role: 'DRIVER' | 'NAVIGATOR', current: Record<string, string>) => {
    const visitor = [first, second].find((candidate) => current[pairIdOf.get(candidate)!] === role);
    expect(visitor, `nobody is ${role} in ${JSON.stringify(current)}`).toBeTruthy();
    return { visitor: visitor!, socket: socketOf.get(visitor!)! };
  };

  beforeAll(async () => {
    for (const [visitor, label] of [[first, 'pairfirst'], [second, 'pairsecond']] as const) {
      const registered = await signUp(visitor, newStudent(label));
      expect(registered.status, said(registered)).toBe(200);
    }

    const topics = await first.get('/api/bff/pair/topics');
    expect(topics.status, said(topics)).toBe(200);
    const questions = topics.body.flatMap((topic: { questions?: Array<{ id: string }> }) => topic.questions ?? []);
    expect(questions.length, 'the exercise bank is empty - was prisma/seeds.ts run?').toBeGreaterThan(0);

    const created = await first.post('/api/bff/pair/sessions', { questionId: questions[0].id });
    expect([200, 201], said(created)).toContain(created.status);
    session = { id: created.body.id, joinCode: created.body.joinCode };

    const joined = await second.post('/api/bff/pair/sessions/join', { joinCode: session.joinCode });
    expect([200, 201], said(joined)).toContain(joined.status);

    for (const visitor of [first, second]) {
      const token = await socketToken(visitor);
      pairIdOf.set(visitor, JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf-8')).sub);

      const socket = await connect(token, sockets);
      socketOf.set(visitor, socket);
      const state = once<{ roles: Record<string, string> }>(socket, 'room_state');
      socket.emit('join_room', { sessionId: session.id });
      roles = (await state).roles;
    }
  }, 300_000);

  afterAll(() => {
    for (const socket of sockets) socket.close();
  });

  it('gives one partner the keyboard and the other the navigator\'s seat', () => {
    expect(Object.values(roles).sort()).toEqual(['DRIVER', 'NAVIGATOR']);
    expect(Object.keys(roles).sort()).toEqual([...pairIdOf.values()].sort());
  });

  it('shows the driver\'s typing to the navigator, and refuses the navigator\'s', async () => {
    const driver = holding('DRIVER', roles);
    const navigator = holding('NAVIGATOR', roles);

    const update = once<{ code: string }>(navigator.socket, 'code_update');
    driver.socket.emit('code_change', { sessionId: session.id, code: PROGRAM });
    expect((await update).code).toBe(PROGRAM);

    const rejected = once<{ message: string }>(navigator.socket, 'edit_rejected');
    navigator.socket.emit('code_change', { sessionId: session.id, code: '// the navigator typing' });
    expect((await rejected).message).toMatch(/read-only/i);
  });

  it('swaps the roles for both partners at once', async () => {
    const before = roles;
    const seenByFirst = once<{ roles: Record<string, string> }>(socketOf.get(first)!, 'role_switch');
    const seenBySecond = once<{ roles: Record<string, string> }>(socketOf.get(second)!, 'role_switch');

    holding('DRIVER', before).socket.emit('role_switch', { sessionId: session.id });

    const [a, b] = await Promise.all([seenByFirst, seenBySecond]);
    expect(a.roles).toEqual(b.roles);
    for (const id of Object.keys(before)) {
      expect(a.roles[id]).toBe(before[id] === 'DRIVER' ? 'NAVIGATOR' : 'DRIVER');
    }
    roles = a.roles;
  });

  it('compiles and runs Java for the pair, and both partners see the output', async () => {
    const seenByFirst = once<CodeResult>(socketOf.get(first)!, 'code_result', 90_000);
    const seenBySecond = once<CodeResult>(socketOf.get(second)!, 'code_result', 90_000);

    holding('DRIVER', roles).socket.emit('run_code', { sessionId: session.id, code: PROGRAM });

    const [a, b] = await Promise.all([seenByFirst, seenBySecond]);
    expect(a.success, `stderr: ${a.stderr} compile: ${a.compileError}`).toBe(true);
    expect(a.stdout).toContain(MARKER);
    expect(b.stdout).toBe(a.stdout);
    // The exercise's expected output is not this marker, and the verdict says so
    // without revealing what the expected output is.
    expect(a.correct).toBe(false);
    expect(JSON.stringify(a)).not.toMatch(/expectedOutput/i);
  }, 120_000);

  it('reports a compile error as a compile error', async () => {
    const driver = holding('DRIVER', roles).socket;

    // PairPath announces a run's result before it has finished recording the
    // run, and answers "busy" to another run until it has. A student pressing
    // Run again at once sees that message; the test waits and asks again, as
    // they would.
    let outcome: RunOutcome;
    for (let attempt = 1; ; attempt++) {
      const answered = nextRunOutcome(driver, 90_000);
      driver.emit('run_code', { sessionId: session.id, code: BROKEN });

      outcome = await answered;
      if (outcome.event === 'code_result' || outcome.payload.reason !== 'busy' || attempt === 10) break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    expect(outcome.event, JSON.stringify(outcome.payload)).toBe('code_result');
    const { success, compileError } = outcome.payload as CodeResult;
    expect(success).toBe(false);
    expect(compileError).toMatch(/';' expected|error/i);
  }, 180_000);

  it('ends the session for both partners', async () => {
    const endedForNavigator = once(holding('NAVIGATOR', roles).socket, 'session_ended');
    const driver = holding('DRIVER', roles).visitor;

    const ended = await driver.post(`/api/bff/pair/sessions/${session.id}/end`, { finalCode: PROGRAM });
    expect([200, 201], said(ended)).toContain(ended.status);
    await endedForNavigator;

    const loaded = await second.get(`/api/bff/pair/sessions/${session.id}`);
    expect(loaded.status, said(loaded)).toBe(200);
    expect(loaded.body.status).toBe('COMPLETED');
  });

  it('reports the finished session to Code Coach once, however often it is asked', async () => {
    const reported = await first.post(`/api/pair/outcome/${session.id}`, {});
    expect(reported.status, said(reported)).toBe(200);
    expect(reported.body.recorded, said(reported)).toBe(true);

    const again = await first.post(`/api/pair/outcome/${session.id}`, {});
    expect(again.status, said(again)).toBe(200);
    expect(again.body.alreadyRecorded, said(again)).toBe(true);
  });

  it('lists the session in each partner\'s history', async () => {
    for (const visitor of [first, second]) {
      const mine = await visitor.get('/api/bff/pair/sessions/my');
      expect(mine.status, said(mine)).toBe(200);
      expect(JSON.stringify(mine.body)).toContain(session.id);
    }
  });
});
