import { broadcast, join } from 'next-ws/server';

export async function UPGRADE(client, _server, request) {
  const room = request.nextUrl.pathname;
  await join(client, room);
  client.on('message', (data, isBinary) => {
    void broadcast(room, isBinary ? data : data.toString(), { except: client });
  });
  // Sent once subscribed, so tests know messages from other instances will arrive
  client.send(`instance:${process.env.INSTANCE_ID}`);
}
