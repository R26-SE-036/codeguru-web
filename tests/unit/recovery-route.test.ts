/**
 * POST /api/auth/recovery - forgot password, reset password, confirm a
 * recovery email. Only those three actions, each with only its own fields, may
 * reach Code Coach.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/code-coach', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/code-coach')>()),
  accountRecovery: vi.fn(),
}));

import { POST } from '@/app/api/auth/recovery/route';
import { AuthError, accountRecovery } from '@/lib/code-coach';
import { makeRequest } from './helpers';

const post = (body: unknown) =>
  makeRequest('/api/auth/recovery', { body, headers: { 'x-forwarded-for': '203.0.113.7' } });

describe('POST /api/auth/recovery', () => {
  beforeEach(() => {
    vi.mocked(accountRecovery).mockReset();
    vi.mocked(accountRecovery).mockResolvedValue({ message: 'ok' });
  });

  it.each([
    [{ action: 'forgot', email: ' ana@example.com ' }, 'password/forgot', { email: 'ana@example.com' }],
    [
      { action: 'reset', token: 't'.repeat(40), newPassword: 'BrandNew456!' },
      'password/reset',
      { token: 't'.repeat(40), new_password: 'BrandNew456!' },
    ],
    [{ action: 'confirm', token: 't'.repeat(40) }, 'recovery-email/confirm', { token: 't'.repeat(40) }],
  ])('forwards %j with only its own fields and the student\'s address', async (input, path, body) => {
    const response = await POST(await post({ ...input, extra: 'dropped' }));

    expect(response.status).toBe(200);
    expect(accountRecovery).toHaveBeenCalledWith(path, body, '203.0.113.7');
  });

  it.each([
    [{ action: 'login', email: 'a@b.c' }],
    [{ action: 'toString' }],
    [{ action: 'reset', token: 't'.repeat(40) }],
    [{}],
  ])('refuses %j without calling Code Coach', async (input) => {
    const response = await POST(await post(input));

    expect(response.status).toBe(400);
    expect(accountRecovery).not.toHaveBeenCalled();
  });

  it('passes Code Coach\'s refusal through', async () => {
    vi.mocked(accountRecovery).mockRejectedValue(new AuthError('That reset link has expired.', 400));

    const response = await POST(await post({ action: 'confirm', token: 't'.repeat(40) }));

    expect(response.status).toBe(400);
    expect((await response.json()).detail).toBe('That reset link has expired.');
  });
});
