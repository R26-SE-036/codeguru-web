import http from 'node:http';

import type { APIRequestContext, Page } from '@playwright/test';

export const BASE = (process.env.E2E_BASE_URL ?? 'http://localhost:8090').replace(/\/+$/, '');

/** The extension's loopback listener - must match LOOPBACK_PORT in browserAuth.ts. */
export const CALLBACK_PORT = 53682;
export const CALLBACK = `http://127.0.0.1:${CALLBACK_PORT}/callback`;

export interface Student {
  fullName: string;
  email: string;
  password: string;
}

export function newStudent(label: string): Student {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
  return {
    fullName: `Browser Test ${label}`,
    email: `codeguru.e2e.${label}.${stamp}@example.com`,
    password: `BrowserTest${stamp}`,
  };
}

/**
 * Create an account through the web app's API. With `page.request` the browser
 * page shares the resulting cookie and is signed in; with the `request` fixture
 * it is not.
 */
export async function register(request: APIRequestContext, student: Student) {
  const attempt = () =>
    request.post('/api/auth/register', {
      data: { fullName: student.fullName, email: student.email, password: student.password },
    });

  let response = await attempt();
  if (response.status() === 429) {
    await new Promise((resolve) => setTimeout(resolve, 61_000));
    response = await attempt();
  }
  if (!response.ok()) {
    throw new Error(`Registering ${student.email} failed: ${response.status()} ${await response.text()}`);
  }
  return response.json();
}

/**
 * Collect what should never happen on a page: an uncaught script error, or a
 * 5xx from the app's own API. Asserted empty at the end of a test.
 */
export function watchForProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`uncaught error: ${error.message}`));
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/api/') && response.status() >= 500) {
      problems.push(`${response.status()} from ${url.pathname}`);
    }
  });
  return problems;
}

/**
 * Stand in for the extension's loopback listener. Resolves `code` with the
 * first code the browser brings back. `listening` is false when the port is
 * taken - most likely by a real VS Code sign-in in progress.
 */
export async function fakeExtensionListener() {
  let deliver: (code: string | null) => void = () => {};
  const code = new Promise<string | null>((resolve) => (deliver = resolve));

  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', CALLBACK);
    if (url.pathname !== '/callback') {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end('<!doctype html><title>Code Guru</title><h1>You are signed in</h1>');
    deliver(url.searchParams.get('code'));
  });

  const listening = await new Promise<boolean>((resolve) => {
    server.once('error', () => resolve(false));
    server.listen(CALLBACK_PORT, '127.0.0.1', () => resolve(true));
  });

  return { listening, code, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}
