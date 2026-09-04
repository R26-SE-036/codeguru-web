'use client';

import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

/**
 * The Socket.IO connection to PairPath.
 *
 * ==================== THE ONE EXCEPTION TO THE BFF ====================
 * Every other backend call in this app goes through /api/bff/* and the browser
 * never holds a token. This is the exception, and it is structural rather than
 * a shortcut: Socket.IO opens a WebSocket, Next.js route handlers cannot proxy
 * an upgrade, and PairPath's gateway verifies its own JWT during the handshake
 * (websocket.gateway.ts reads `client.handshake.auth.token`). Putting the BFF
 * in the middle would mean reimplementing the gateway.
 *
 * What bounds the exposure:
 *
 *  - The token is PairPath's own, not the platform one, so it is useless
 *    against Code Coach, Study Guider or Gamification.
 *  - It is fetched into a local variable and never persisted. Nothing here
 *    touches localStorage; that habit is what this architecture exists to end.
 *  - The connection is same-origin. The load balancer routes /pair-ws/* to
 *    PairPath, so there is no cross-origin request and no CORS involved.
 *
 * The original connected to a hardcoded io('http://localhost:3001'), which
 * meant a deployed build opened a socket to the developer's own machine.
 * =====================================================================
 */

export type SocketStatus = 'connecting' | 'connected' | 'disconnected' | 'unavailable';

interface Options {
  /** Called once the socket is connected, to join the room. */
  onConnect?: (socket: Socket) => void;
  /** Event name -> handler. Registered before connection, removed on cleanup. */
  handlers?: Record<string, (payload: never) => void>;
}

export function usePairSocket(sessionId: string | null, options: Options = {}) {
  const [status, setStatus] = useState<SocketStatus>('connecting');
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Held in refs so changing a handler does not tear down and rebuild the
  // connection - which would drop the student out of the room mid-session.
  const onConnectRef = useRef(options.onConnect);
  const handlersRef = useRef(options.handlers);
  onConnectRef.current = options.onConnect;
  handlersRef.current = options.handlers;

  useEffect(() => {
    if (!sessionId) return;

    let live = true;
    let socket: Socket | null = null;

    (async () => {
      let token: string;

      try {
        const response = await fetch('/api/pair/socket-token', {
          credentials: 'same-origin',
          cache: 'no-store',
        });

        if (!response.ok) {
          const body = await response.json().catch(() => null);
          if (!live) return;
          setStatus('unavailable');
          setError(body?.detail ?? 'Pairing is unavailable.');
          return;
        }

        token = (await response.json()).token;
      } catch {
        if (!live) return;
        setStatus('unavailable');
        setError('Could not reach the server.');
        return;
      }

      if (!live) return;

      // Same-origin. `path` is where the load balancer forwards to PairPath;
      // there is no host here on purpose, so this works identically in
      // development and deployed.
      socket = io({
        path: '/pair-ws/socket.io',
        auth: { token },
        // Websocket only. The polling fallback needs sticky sessions to work
        // behind a load balancer, and a silent downgrade to polling makes
        // real-time collaboration feel broken rather than fail loudly.
        transports: ['websocket'],
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        setStatus('connected');
        setError(null);
        if (socket) onConnectRef.current?.(socket);
      });

      socket.on('disconnect', () => setStatus('disconnected'));

      socket.on('connect_error', (err) => {
        setStatus('disconnected');
        setError(err.message);
      });

      // The gateway emits this and then disconnects when the handshake token
      // is missing or invalid. Saying so is better than showing "disconnected"
      // and letting the student retry into the same failure.
      socket.on('auth_error', (payload: { message?: string }) => {
        setStatus('unavailable');
        setError(payload?.message ?? 'Your pairing session could not be authenticated.');
      });

      for (const [event, handler] of Object.entries(handlersRef.current ?? {})) {
        socket.on(event, handler as (payload: unknown) => void);
      }
    })();

    return () => {
      live = false;
      socket?.disconnect();
      socketRef.current = null;
    };
  }, [sessionId]);

  return { socket: socketRef, status, error };
}
