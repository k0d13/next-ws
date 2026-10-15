// Stands in for the external server the proxy forwards to

export function GET() {
  const headers = new Headers();
  headers.set('Connection', 'Upgrade');
  headers.set('Upgrade', 'websocket');
  return new Response('Upgrade Required', { status: 426, headers });
}

export function UPGRADE(
  client: import('ws').WebSocket,
  _server: import('ws').WebSocketServer,
  _request: import('next/server').NextRequest,
  context: import('next-ws/server').RouteContext<'/api/upstream/[...path]'>,
) {
  const path = context.params.path.join('/');
  client.send(`Connected to upstream at /${path}`);
  client.on('message', (data) => client.send(`Echo: ${data}`));
}
