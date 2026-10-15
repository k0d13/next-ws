import type { WebSocket } from 'ws';
import type { Hello } from '@/lib/reactions';

export function GET() {
  return new Response('Connect to this route with a WebSocket', {
    status: 426,
    headers: { Connection: 'Upgrade', Upgrade: 'websocket' },
  });
}

/**
 * The adapter set in server.ts relays every message to this room's other clients on every instance,
 * so the route only has to say hello.
 */
export function UPGRADE(client: WebSocket) {
  const hello: Hello = { type: 'hello', instance: process.env.INSTANCE_NAME ?? 'unknown' };
  client.send(JSON.stringify(hello));
}
