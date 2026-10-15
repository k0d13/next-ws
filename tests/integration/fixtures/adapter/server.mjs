import { AsyncLocalStorage } from 'node:async_hooks';
import { createServer } from 'node:http';

globalThis.AsyncLocalStorage ??= AsyncLocalStorage;

const { default: next } = await import('next');
const { setAdapter, setHttpServer, setWebSocketServer } = await import('next-ws/server');
const { WebSocket, WebSocketServer } = await import('ws');

/**
 * Adapter backed by Redis pub/sub.
 *
 * @implements {import('next-ws/server').Adapter}
 */
class RedisAdapter {
  handlers = new Map();

  async connect() {
    const { default: Redis } = await import('ioredis');
    this.pub = new Redis(process.env.REDIS_URL);
    this.sub = new Redis(process.env.REDIS_URL);
    this.sub.on('message', (room, message) => {
      for (const handler of this.handlers.get(room) ?? []) handler(message);
    });
  }

  async broadcast(room, message) {
    await this.pub.publish(room, Buffer.isBuffer(message) ? message.toString() : String(message));
  }

  async onMessage(room, handler) {
    if (!this.handlers.has(room)) {
      this.handlers.set(room, new Set());
      await this.sub.subscribe(room);
    }
    this.handlers.get(room).add(handler);
  }

  async close() {
    await Promise.all([this.pub.quit(), this.sub.quit()]);
  }
}

/**
 * Adapter backed by the broker the tests start, so the adapter contract can be tested without
 * Redis.
 *
 * @implements {import('next-ws/server').Adapter}
 */
class BrokerAdapter {
  handlers = new Map();

  async connect() {
    this.socket = new WebSocket(process.env.BROKER_URL);
    this.socket.on('message', (data) => {
      const { room, message } = JSON.parse(data.toString());
      for (const handler of this.handlers.get(room) ?? []) handler(message);
    });
    await new Promise((resolve, reject) => {
      this.socket.once('open', resolve);
      this.socket.once('error', reject);
    });
  }

  async broadcast(room, message) {
    message = Buffer.isBuffer(message) ? message.toString() : String(message);
    this.socket.send(JSON.stringify({ type: 'publish', room, message }));
  }

  async onMessage(room, handler) {
    if (!this.handlers.has(room)) {
      this.handlers.set(room, new Set());
      this.socket.send(JSON.stringify({ type: 'subscribe', room }));
    }
    this.handlers.get(room).add(handler);
  }

  async close() {
    this.socket.close();
  }
}

const adapter = process.env.REDIS_URL ? new RedisAdapter() : new BrokerAdapter();
await adapter.connect();

const port = Number(process.env.PORT);
const app = next({ dev: process.env.NODE_ENV !== 'production', hostname: '127.0.0.1', port });
const handle = app.getRequestHandler();

const httpServer = createServer((req, res) => handle(req, res));
setHttpServer(httpServer);
setWebSocketServer(new WebSocketServer({ noServer: true }));
setAdapter(adapter);

await app.prepare();
httpServer.listen(port, '127.0.0.1');
