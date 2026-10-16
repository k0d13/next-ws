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
