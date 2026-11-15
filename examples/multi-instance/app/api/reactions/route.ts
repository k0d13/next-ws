import { broadcast, join } from 'next-ws/server';
import type { NextRequest } from 'next/server';
import type { WebSocket, WebSocketServer } from 'ws';
import { type Hello, isReaction } from '@/lib/reactions';

export function GET() {
  return new Response('Connect to this route with a WebSocket', {
    status: 426,
    headers: { Connection: 'Upgrade', Upgrade: 'websocket' },
  });
}

/**
 * Every client joins one room. Broadcasting to it goes through the adapter set in
 * instrumentation.ts, so reactions reach the room's clients on every instance.
 */
export async function UPGRADE(client: WebSocket, _server: WebSocketServer, request: NextRequest) {
  const room = request.nextUrl.pathname;
  await join(client, room);

  client.on('message', (data) => {
    let message: unknown;
    try {
      message = JSON.parse(data.toString());
    } catch {
      return;
    }
    // Only pass on well-formed reactions, the sender has already shown its own
    if (!isReaction(message)) return;
    // Redis can reject the publish, report it rather than leave the rejection unhandled
    broadcast(room, JSON.stringify(message), { except: client }).catch((cause: unknown) => {
      console.error(`Could not broadcast a reaction to ${room}`, cause);
    });
  });

  const hello: Hello = { type: 'hello', instance: process.env.INSTANCE_NAME ?? 'unknown' };
  client.send(JSON.stringify(hello));
}
