import { getHttpServer } from 'next-ws/server';

export function UPGRADE(client) {
  // The route sees the HTTP server that server.mjs created
  client.send(JSON.stringify({ customServer: Boolean(getHttpServer()?.customServer) }));
  client.on('message', (data) => client.send(data.toString()));
}
