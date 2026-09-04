import { NextRequest, NextResponse } from 'next/server';
import { AuthError, exchangeForPairPath, register } from '@/lib/code-coach';
import { SESSION_COOKIE, cookieOptions, sealSession } from '@/lib/session';

export async function POST(request: NextRequest) {
  let fullName: string;
  let email: string;
  let password: string;

  try {
    const body = await request.json();
    fullName = String(body?.fullName ?? '').trim();
    email = String(body?.email ?? '').trim();
    password = String(body?.password ?? '');
  } catch {
    return NextResponse.json({ detail: 'Malformed request.' }, { status: 400 });
  }

  if (!fullName || !email || !password) {
    return NextResponse.json(
      { detail: 'Enter your name, email and a password.' },
      { status: 400 },
    );
  }

  try {
    const session = await register(fullName, email, password);
    const pairPath = await exchangeForPairPath(session.accessToken);
    session.pairPathToken = pairPath?.token;
    session.pairPathUserId = pairPath?.userId;

    const response = NextResponse.json({ user: session.user });
    response.cookies.set(SESSION_COOKIE, await sealSession(session), cookieOptions());
    return response;
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { detail: error.message },
        { status: error.status === 0 ? 503 : error.status },
      );
    }
    console.error('Registration failed:', error);
    return NextResponse.json({ detail: 'Could not create your account.' }, { status: 500 });
  }
}

export const runtime = 'nodejs';
