/**
 * WebSocket socket handler.
 *
 * @deprecated Prefer UPGRADE and {@link UpgradeHandler}
 * @param client WebSocket client instance
 * @param request Node.js HTTP incoming message instance
 * @param server WebSocket server instance
 * @param context Route context
 */
export type SocketHandler = (
  client: import('ws').WebSocket,
  request: import('http').IncomingMessage,
  server: import('ws').WebSocketServer,
  context: { params: Record<string, string | string[]> },
) => unknown;

/**
 * WebSocket upgrade handler.
 *
 * @param client WebSocket client instance
 * @param server WebSocket server instance
 * @param request Next.js request instance
 * @param context Route context
 */
export type UpgradeHandler = (
  client: import('ws').WebSocket,
  server: import('ws').WebSocketServer,
  request: import('next/server').NextRequest,
  context: import('./module.js').RouteContext<string>,
) => unknown;
