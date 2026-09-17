/**
 * Talking to the running platform the way its two kinds of client do: a browser
 * with a cookie jar, and the editor extension with a bearer token.
 */

export const BASE = (process.env.SYSTEM_BASE_URL ?? 'http://localhost:8090').replace(/\/+$/, '');

export interface Student {
  fullName: string;
  email: string;
  password: string;
}

export function newStudent(label: string): Student {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
  return {
    fullName: `System Test ${label}`,
    // example.com is reserved (RFC 2606), so these can never reach a real inbox.
    email: `codeguru.system.${label}.${stamp}@example.com`,
    password: `SystemTest${stamp}`,
  };
}

export interface Reply<T = any> {
  status: number;
  body: T;
  headers: Headers;
}

async function read<T>(response: Response): Promise<Reply<T>> {
  const text = await response.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Not JSON; the text is the body.
  }
  return { status: response.status, body: body as T, headers: response.headers };
}

/** For assertion messages: what the service actually said. */
export const said = (reply: Reply) => `${reply.status} ${typeof reply.body === 'string' ? reply.body.slice(0, 300) : JSON.stringify(reply.body)}`;

/** A browser: same-origin requests and a cookie jar. Redirects are not followed. */
export class Visitor {
  private readonly jar = new Map<string, string>();

  static withCookies(cookies: Array<[string, string]>): Visitor {
    const visitor = new Visitor();
    for (const [name, value] of cookies) visitor.jar.set(name, value);
    return visitor;
  }

  cookies(): Array<[string, string]> {
    return [...this.jar];
  }

  async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.jar.size) {
      headers.set('cookie', [...this.jar].map(([name, value]) => `${name}=${value}`).join('; '));
    }

    const response = await fetch(`${BASE}${path}`, {
      ...init,
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(60_000),
    });

    for (const line of response.headers.getSetCookie()) {
      const [pair, ...attributes] = line.split(';');
      const split = pair.indexOf('=');
      const name = pair.slice(0, split).trim();
      const value = pair.slice(split + 1).trim();
      const expired =
        !value ||
        attributes.some((attribute) => /^\s*max-age=0\s*$/i.test(attribute) || /^\s*expires=.*1970/i.test(attribute));

      if (expired) this.jar.delete(name);
      else this.jar.set(name, value);
    }

    return response;
  }

  async get<T = any>(path: string): Promise<Reply<T>> {
    return read<T>(await this.fetch(path));
  }

  async post<T = any>(path: string, body: unknown = {}): Promise<Reply<T>> {
    return read<T>(
      await this.fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );
  }
}

/** The editor extension: a bearer token, and Code Coach's /api/v1 on the same edge. */
export async function asEditor<T = any>(
  token: string | null,
  path: string,
  body?: unknown,
): Promise<Reply<T>> {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';

  return read<T>(
    await fetch(`${BASE}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    }),
  );
}

/**
 * Register through the web app, waiting out the per-client rate limit once if
 * an earlier run in the same minute used it up.
 */
export async function signUp(visitor: Visitor, student: Student): Promise<Reply> {
  const attempt = () =>
    visitor.post('/api/auth/register', {
      fullName: student.fullName,
      email: student.email,
      password: student.password,
    });

  let reply = await attempt();
  if (reply.status === 429) {
    const wait = Math.min(65, Number(reply.headers.get('retry-after')) || 61);
    await new Promise((resolve) => setTimeout(resolve, wait * 1000));
    reply = await attempt();
  }
  return reply;
}

/** Poll until `check` returns something, or give up after `ms`. */
export async function eventually<T>(check: () => Promise<T | undefined | null>, ms: number): Promise<T | undefined> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return undefined;
}
