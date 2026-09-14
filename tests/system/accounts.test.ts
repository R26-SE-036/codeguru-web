/**
 * An account from start to finish, through the web app, against Code Coach and
 * PairPath for real - including that signing out means something to the other
 * services, not only to this one.
 */
import { describe, expect, it } from 'vitest';

import { Visitor, newStudent, said, signUp } from './platform';

describe('an account, start to finish', () => {
  const student = newStudent('accounts');
  const visitor = new Visitor();
  let userId = '';
  let beforeSignOut: Visitor;

  it('registers, and is signed in with a cookie scripts cannot read', async () => {
    const registered = await signUp(visitor, student);

    expect(registered.status, said(registered)).toBe(200);
    expect(registered.body.user.email).toBe(student.email);
    expect(JSON.stringify(registered.body)).not.toMatch(/token/i);
    userId = registered.body.user.user_id;

    const cookie = registered.headers.getSetCookie().find((line) => line.startsWith('codeguru_session='));
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
  });

  it('knows who is signed in, and that pairing is connected', async () => {
    const session = await visitor.get('/api/auth/session');

    expect(session.status, said(session)).toBe(200);
    expect(session.body.user.email).toBe(student.email);
    expect(session.body.pairPathConnected, 'the PairPath token exchange failed at sign-up').toBe(true);
  });

  it('refuses a second account with the same email', async () => {
    const duplicate = await signUp(new Visitor(), student);

    expect([400, 409], said(duplicate)).toContain(duplicate.status);
    expect(duplicate.body.detail).toMatch(/already/i);
  });

  it('signs out, and the old cookie stops working at every service', async () => {
    beforeSignOut = Visitor.withCookies(visitor.cookies());

    const signedOut = await visitor.post('/api/auth/logout');
    expect(signedOut.status, said(signedOut)).toBe(200);
    expect((await visitor.get('/api/auth/session')).status).toBe(401);

    // A copy of the cookie from before still opens - it is sealed, not stored -
    // but the tokens inside were revoked at Code Coach, which every other
    // service asks. So the services must refuse it.
    const study = await beforeSignOut.get('/api/bff/study/progress/me');
    expect(study.status, `Study Guider accepted a revoked token: ${said(study)}`).toBe(401);

    const play = await beforeSignOut.get(`/api/bff/play/profile/${userId}`);
    expect(play.status, `the gamification engine accepted a revoked token: ${said(play)}`).toBe(401);
  });

  it('refuses a wrong password with a reason', async () => {
    const refused = await new Visitor().post('/api/auth/login', { identifier: student.email, password: 'not-the-password-1' });

    expect(refused.status, said(refused)).toBe(401);
    expect(typeof refused.body.detail).toBe('string');
  });

  it('signs back in', async () => {
    const signedIn = await visitor.post('/api/auth/login', { identifier: student.email, password: student.password });

    expect(signedIn.status, said(signedIn)).toBe(200);
    expect((await visitor.get('/api/auth/session')).status).toBe(200);
  });
});
