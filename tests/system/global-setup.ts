import type { TestProject } from 'vitest/node';

import { BASE, Visitor, newStudent, said, signUp, type Student } from './platform';

declare module 'vitest' {
  export interface ProvidedContext {
    student: Student;
    userId: string;
    cookies: Array<[string, string]>;
  }
}

/**
 * Refuse to start unless the platform answers, then create the one student the
 * suites share.
 *
 * Fails rather than skips. A pre-deploy gate that goes green because nothing
 * was reachable has checked nothing, and says the opposite.
 */
export default async function setup(project: TestProject) {
  let status: number;
  try {
    status = (await fetch(`${BASE}/login`, { signal: AbortSignal.timeout(15_000) })).status;
  } catch (error) {
    throw new Error(
      `\n\nNothing is answering at ${BASE}. The system tests exercise the running platform:\n\n` +
        '    cd codeguru-web/deploy && docker compose up -d --wait\n\n' +
        `(${String(error)})\n`,
    );
  }
  if (status !== 200) {
    throw new Error(`\n\n${BASE}/login answered ${status}, not the sign-in page. Is that the Code Guru edge?\n`);
  }

  const student = newStudent('main');
  const visitor = new Visitor();
  const registered = await signUp(visitor, student);
  if (registered.status !== 200) {
    throw new Error(`\n\nCould not create the system-test student through /api/auth/register: ${said(registered)}\n`);
  }

  project.provide('student', student);
  project.provide('userId', registered.body.user.user_id);
  project.provide('cookies', visitor.cookies());
}
