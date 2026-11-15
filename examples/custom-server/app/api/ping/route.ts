import type { WebSocket } from 'ws';

export function GET() {
  return new Response('Connect to this route with a WebSocket', {
    status: 426,
    headers: { Connection: 'Upgrade', Upgrade: 'websocket' },
  });
}

/** Answer every ping straight away, so the page can measure the round trip. */
export function UPGRADE(client: WebSocket) {
  client.on('message', (data) => {
    client.send(JSON.stringify({ ping: data.toString(), serverTime: Date.now() }));
  });
}
