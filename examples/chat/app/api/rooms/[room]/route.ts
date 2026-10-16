import type { RouteContext } from 'next-ws/server';
import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import type { WebSocket, WebSocketServer } from 'ws';
import { parseClientMessage } from '@/lib/protocol';
import { getRoom, releaseRoom } from '@/lib/rooms';
import { NAME_COOKIE, normaliseName, normaliseRoom } from '@/lib/session';

export function GET() {
  return new Response('Connect to this route with a WebSocket', {
    status: 426,
    headers: { Connection: 'Upgrade', Upgrade: 'websocket' },
  });
}

export async function UPGRADE(
  client: WebSocket,
  _server: WebSocketServer,
  _request: NextRequest,
  { params }: RouteContext<'/api/rooms/[room]'>,
) {
  // The browser sends cookies with the upgrade request, so the session works just like it
  // does in a page or a server action
  const name = normaliseName((await cookies()).get(NAME_COOKIE)?.value);
  if (!name) return client.close(1008, 'Sign in first');

  const roomName = normaliseRoom(params.room);
  if (!roomName) return client.close(1008, 'Unknown room');

  const room = getRoom(roomName);
  room.join(client, name);

  client.on('message', (data) => {
    const message = parseClientMessage(data.toString());
    if (message?.type === 'message') room.post(name, message.text);
    else if (message?.type === 'typing') room.typing(client, message.typing);
  });

  client.once('close', () => {
    room.leave(client);
    releaseRoom(roomName);
  });
}
