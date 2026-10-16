import type { NextRequest } from 'next/server';
import type { WebSocket, WebSocketServer } from 'ws';
import type { RouteContext } from './module.js';

/**
 * WebSocket upgrade handler, exported as `UPGRADE` from a route file. Messages the client sends
 * before the handler adds a `message` listener, or before it settles, are held rather than lost.
 *
 * @param client WebSocket client instance
 * @param server WebSocket server instance
 * @param request Next.js request instance
 * @param context Route context, compatible with the `RouteContext` type Next.js generates
 */
export type UpgradeHandler = (
  client: WebSocket,
  server: WebSocketServer,
  request: NextRequest,
  context: RouteContext<string>,
) => unknown;
