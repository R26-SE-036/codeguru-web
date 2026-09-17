/**
 * A pair session with two real students: created and joined through the web
 * app's proxy, then the live room over Socket.IO through the edge's /pair-ws.
 */
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { connect as connectSocket, once, socketToken } from './pair-socket';
import { BASE, Visitor, newStudent, said, signUp } from './platform';

describe('a pair session', () => {
  const driver = Visitor.withCookies(inject('cookies'));
  const partner = new Visitor();
  const stranger = new Visitor();
  const sockets: Socket[] = [];
  let session: { id: string; joinCode: string } | null = null;

  const connect = (token: string) => connectSocket(token, sockets);

  beforeAll(async () => {
    for (const [visitor, label] of [[partner, 'partner'], [stranger, 'stranger']] as const) {
      const registered = await signUp(visitor, newStudent(label));
      expect(registered.status, said(registered)).toBe(200);
    }
  });

  afterAll(async () => {
    for (const socket of sockets) socket.close();
    if (session) await driver.post(`/api/bff/pair/sessions/${session.id}/end`, {});
  });

  it('lists topics that have exercises', async () => {
    const topics = await driver.get('/api/bff/pair/topics');

    expect(topics.status, said(topics)).toBe(200);
    expect(Array.isArray(topics.body)).toBe(true);
    expect(topics.body.some((topic: { questions?: unknown[] }) => (topic.questions ?? []).length > 0)).toBe(true);
  });

  it('creates a session with a six-character join code', async () => {
    const topics = await driver.get('/api/bff/pair/topics');
    const question = topics.body.flatMap((topic: { questions?: Array<{ id: string }> }) => topic.questions ?? [])[0];

    const created = await driver.post('/api/bff/pair/sessions', { questionId: question.id });

    expect([200, 201], said(created)).toContain(created.status);
    expect(created.body.joinCode).toMatch(/^[A-Za-z0-9]{6}$/);
    session = { id: created.body.id, joinCode: created.body.joinCode };
  });

  it('lets the partner join by code, and nobody after them', async () => {
    expect(session, 'no session was created').toBeTruthy();

    const joined = await partner.post('/api/bff/pair/sessions/join', { joinCode: session!.joinCode });
    expect([200, 201], said(joined)).toContain(joined.status);

    const third = await stranger.post('/api/bff/pair/sessions/join', { joinCode: session!.joinCode });
    expect(third.status, said(third)).toBe(400);
  });

  it('opens the live room to its members and to nobody else', async () => {
    expect(session, 'no session was created').toBeTruthy();

    const driverSocket = await connect(await socketToken(driver));
    const roomState = once<{ members: string[] }>(driverSocket, 'room_state');
    driverSocket.emit('join_room', { sessionId: session!.id });
    expect((await roomState).members.length).toBeGreaterThanOrEqual(1);

    const partnerSocket = await connect(await socketToken(partner));
    const arrived = once(driverSocket, 'user_joined');
    partnerSocket.emit('join_room', { sessionId: session!.id });
    await arrived;

    const strangerSocket = await connect(await socketToken(stranger));
    const refused = once<{ message: string }>(strangerSocket, 'auth_error');
    strangerSocket.emit('join_room', { sessionId: session!.id });
    expect((await refused).message).toMatch(/not a member/i);
  });

  it('drops a socket that brings no valid token', async () => {
    const socket = io(BASE, {
      path: '/pair-ws/socket.io',
      auth: { token: 'not-a-real-token' },
      transports: ['websocket'],
      reconnection: false,
    });
    sockets.push(socket);

    const reason = await once<string>(socket, 'disconnect');
    expect(reason).toBe('io server disconnect');
  });
});
