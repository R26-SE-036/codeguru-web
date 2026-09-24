import { NextRequest, NextResponse } from 'next/server';
import { AuthError, accountRecovery, type RecoveryAction } from '@/lib/code-coach';

/**
 * Forgot password, reset password, and confirm a recovery email - the three
 * account actions that happen without a session.
 *
 *     POST /api/auth/recovery  { action: 'forgot',  email }
 *                              { action: 'reset',   token, newPassword }
 *                              { action: 'confirm', token }
 *
 * Only these three, each with only its own fields, are passed on to Code
 * Coach. Setting the recovery email needs a session and goes through the
 * ordinary proxy (PUT /api/bff/coach/auth/me/recovery-email) instead.
 */
const ACTIONS: Record<string, { path: RecoveryAction; body: (input: Record<string, unknown>) => Record<string, unknown> | null }> = {
  forgot: {
    path: 'password/forgot',
    body: ({ email }) => (typeof email === 'string' && email.trim() ? { email: email.trim() } : null),
  },
  reset: {
    path: 'password/reset',
    body: ({ token, newPassword }) =>
      typeof token === 'string' && typeof newPassword === 'string'
        ? { token, new_password: newPassword }
        : null,
  },
  confirm: {
    path: 'recovery-email/confirm',
    body: ({ token }) => (typeof token === 'string' ? { token } : null),
  },
};

export async function POST(request: NextRequest) {
  let input: Record<string, unknown>;
  try {
    input = (await request.json()) ?? {};
  } catch {
    return NextResponse.json({ detail: 'Malformed request.' }, { status: 400 });
  }

  const action = typeof input.action === 'string' ? ACTIONS[input.action] : undefined;
  const body = action && Object.hasOwn(ACTIONS, input.action as string) ? action.body(input) : null;
  if (!action || !body) {
    return NextResponse.json({ detail: 'Malformed request.' }, { status: 400 });
  }

  try {
    const result = await accountRecovery(action.path, body, request.headers.get('x-forwarded-for'));
    return NextResponse.json({ message: result.message });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ detail: error.message }, { status: error.status === 0 ? 503 : error.status });
    }
    console.error('Account recovery failed:', error);
    return NextResponse.json({ detail: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}

export const runtime = 'nodejs';
