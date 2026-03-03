import { headers } from 'next/headers';

export function GET() {
  const headers = new Headers();
  headers.set('Connection', 'Upgrade');
  headers.set('Upgrade', 'websocket');
  return new Response('Upgrade Required', { status: 426, headers });
}

export async function UPGRADE(client: import('ws').WebSocket) {
  await headers();

  client.send(
    JSON.stringify({
      author: 'System',
      content: `Connected to instance ${process.env.INSTANCE_ID || 'unknown'}`,
    }),
  );
}
