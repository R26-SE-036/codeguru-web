/**
 * The session cookie is the only credential the browser holds. It must be
 * unreadable, tamper-evident, bounded in size, and opened by nothing but this
 * server's key.
 */
import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { makeSession } from './helpers';

/** A fresh copy of the module, because it caches its key on first use. */
async function sessionModule(key?: string) {
  vi.resetModules();
  if (key !== undefined) vi.stubEnv('SESSION_ENCRYPTION_KEY', key);
  return import('@/lib/session');
}

afterEach(() => {
  vi.useRealTimers();
});

describe('sealing and opening', () => {
  it('round-trips a session', async () => {
    const { sealSession, unsealSession } = await sessionModule();
    const session = makeSession();

    expect(await unsealSession(await sealSession(session))).toMatchObject(session);
  });

  it('never carries a token the browser could read', async () => {
    const { sealSession } = await sessionModule();
    const sealed = await sealSession(makeSession());

    // Five JWE segments, and none of them - raw or base64url-decoded - holds
    // either token. Signed-but-not-encrypted would fail the decoded check.
    expect(sealed.split('.')).toHaveLength(5);
    const decoded = sealed
      .split('.')
      .map((part) => Buffer.from(part, 'base64url').toString('latin1'))
      .join('');
    for (const secret of ['platform-access-token', 'platform-refresh-token', 'pairpath-token']) {
      expect(sealed).not.toContain(secret);
      expect(decoded).not.toContain(secret);
    }
  });

  it('treats a tampered cookie as no session', async () => {
    const { sealSession, unsealSession } = await sessionModule();
    const parts = (await sealSession(makeSession())).split('.');
    const ciphertext = parts[3];
    parts[3] = (ciphertext[0] === 'A' ? 'B' : 'A') + ciphertext.slice(1);

    expect(await unsealSession(parts.join('.'))).toBeNull();
  });

  it('treats a cookie sealed with another key as no session', async () => {
    const first = await sessionModule(randomBytes(32).toString('base64'));
    const sealed = await first.sealSession(makeSession());

    const second = await sessionModule(randomBytes(32).toString('base64'));
    expect(await second.unsealSession(sealed)).toBeNull();
  });

  it('treats an expired cookie as no session', async () => {
    const { sealSession, unsealSession } = await sessionModule();
    const sealed = await sealSession(makeSession());

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 8 * 24 * 60 * 60 * 1000);
    expect(await unsealSession(sealed)).toBeNull();
  });

  it.each([undefined, '', 'garbage', 'a.b.c.d.e'])('treats %j as no session', async (value) => {
    const { unsealSession } = await sessionModule();
    expect(await unsealSession(value)).toBeNull();
  });

  it('does not accept a session without an access token', async () => {
    const { sealSession, unsealSession } = await sessionModule();
    expect(await unsealSession(await sealSession(makeSession({ accessToken: '' })))).toBeNull();
  });

  it('refuses to issue a cookie a browser would silently drop', async () => {
    const { sealSession } = await sessionModule();
    const bloated = makeSession({ user: { user_id: 'u', full_name: 'x'.repeat(4000) } });

    await expect(sealSession(bloated)).rejects.toThrow(/4KB/);
  });
});

describe('the encryption key', () => {
  it('accepts 32 bytes of base64, as the documented command prints', async () => {
    const { sealSession } = await sessionModule(randomBytes(32).toString('base64'));
    await expect(sealSession(makeSession())).resolves.toBeTypeOf('string');
  });

  it('accepts a 32-byte passphrase', async () => {
    const { sealSession } = await sessionModule('p'.repeat(32));
    await expect(sealSession(makeSession())).resolves.toBeTypeOf('string');
  });

  it('refuses to run without one', async () => {
    const { sealSession } = await sessionModule('');
    await expect(sealSession(makeSession())).rejects.toThrow(/SESSION_ENCRYPTION_KEY is not set/);
  });

  it('refuses a short key rather than padding it', async () => {
    const { sealSession } = await sessionModule(randomBytes(16).toString('base64'));
    await expect(sealSession(makeSession())).rejects.toThrow(/exactly 32 bytes/);
  });
});

describe('refresh timing and cookie attributes', () => {
  it('refreshes inside the five-minute margin and not before', async () => {
    const { needsRefresh } = await sessionModule();
    const now = Date.now();

    expect(needsRefresh(makeSession({ accessExpiresAt: now + 10 * 60 * 1000 }))).toBe(false);
    expect(needsRefresh(makeSession({ accessExpiresAt: now + 4 * 60 * 1000 }))).toBe(true);
    expect(needsRefresh(makeSession({ accessExpiresAt: now - 1000 }))).toBe(true);
  });

  it('keeps the cookie away from scripts and cross-site requests', async () => {
    const { cookieOptions } = await sessionModule();

    expect(cookieOptions()).toMatchObject({
      httpOnly: true,
      // Lax, not Strict: the extension's sign-in returns by top-level navigation.
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });
  });

  it('marks the cookie Secure in production only', async () => {
    const { cookieOptions } = await sessionModule();

    vi.stubEnv('NODE_ENV', 'production');
    expect(cookieOptions().secure).toBe(true);

    vi.stubEnv('NODE_ENV', 'development');
    expect(cookieOptions().secure).toBe(false);
  });
});
