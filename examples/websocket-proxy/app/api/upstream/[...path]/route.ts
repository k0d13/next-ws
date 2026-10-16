import type { RouteContext } from 'next-ws/server';
import type { NextRequest } from 'next/server';
import type { WebSocket, WebSocketServer } from 'ws';

// Stands in for the external server the proxy forwards to

export function GET() {
  return new Response('Connect to this route with a WebSocket', {
    status: 426,
    headers: { Connection: 'Upgrade', Upgrade: 'websocket' },
  });
}

export function UPGRADE(
  client: WebSocket,
  _server: WebSocketServer,
  _request: NextRequest,
  context: RouteContext<'/api/upstream/[...path]'>,
) {
  const path = context.params.path.join('/');
  client.send(`Connected to upstream at /${path}`);
  client.on('message', (data) => client.send(`Echo: ${data}`));
}
