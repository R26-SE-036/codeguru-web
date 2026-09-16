/**
 * PairPath's live room, reached the way the browser reaches it: Socket.IO under
 * the edge's /pair-ws, authenticated with the token /api/pair/socket-token gives
 * a signed-in student.
 */
import { io, type Socket } from 'socket.io-client';
import { expect } from 'vitest';

import { BASE, Visitor, said } from './platform';

/** The next `event` on `socket`, or a rejection naming what never arrived. */
export function once<T = any>(socket: Socket, event: string, ms = 20_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no '${event}' within ${ms} ms`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

/** A connected socket for this token. Collects it into `sockets` for closing. */
export function connect(token: string, sockets: Socket[]): Promise<Socket> {
  return new Promise<Socket>((resolve, reject) => {
    const socket = io(BASE, {
      path: '/pair-ws/socket.io',
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
      timeout: 15_000,
    });
    sockets.push(socket);
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

/** The PairPath token the web app hands this student's browser for the socket. */
export async function socketToken(visitor: Visitor): Promise<string> {
  const reply = await visitor.get('/api/pair/socket-token');
  expect(reply.status, said(reply)).toBe(200);
  return reply.body.token as string;
}
