import type { WebSocket } from 'ws';
import { watch } from '@/lib/sampler';

export function GET() {
  return new Response('Connect to this route with a WebSocket', {
    status: 426,
    headers: { Connection: 'Upgrade', Upgrade: 'websocket' },
  });
}

export function UPGRADE(client: WebSocket) {
  watch(client);
}
