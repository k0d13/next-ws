import { type WebSocket, WebSocketServer } from 'ws';

/**
 * Start a minimal pub/sub broker for the adapter fixture, standing in for Redis.
 *
 * @returns URL to connect to, and a function to stop the broker
 */
export async function startBroker() {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  const rooms = new Map<string, Set<WebSocket>>();

  server.on('connection', (socket) => {
    socket.on('message', (data) => {
      const { type, room, message } = JSON.parse(data.toString());
      if (type === 'subscribe') {
        if (!rooms.has(room)) rooms.set(room, new Set());
        rooms.get(room)!.add(socket);
      } else if (type === 'publish') {
        for (const subscriber of rooms.get(room) ?? [])
          subscriber.send(JSON.stringify({ room, message }));
      }
    });
    socket.on('close', () => {
      for (const subscribers of rooms.values()) subscribers.delete(socket);
    });
  });

  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  return {
    url: `ws://127.0.0.1:${port}`,
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
