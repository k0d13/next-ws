import { join } from 'next-ws/server';
import type { WebSocket } from 'ws';
import { DASHBOARD_ROOM } from '@/lib/events';
import { watch } from '@/lib/sampler';

export function GET() {
  return new Response('Connect to this route with a WebSocket', {
    status: 426,
    headers: { Connection: 'Upgrade', Upgrade: 'websocket' },
  });
}

export async function UPGRADE(client: WebSocket) {
  // Announcements are broadcast to this room, see app/actions.ts
  await join(client, DASHBOARD_ROOM);
  watch(client);
}
