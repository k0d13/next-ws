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
    this.sub.on('message', (room, message) => this.handlers.get(room)?.(message));
  }

  async broadcast(room, message) {
    await this.pub.publish(room, message);
  }

  async subscribe(room, handler) {
    this.handlers.set(room, handler);
    await this.sub.subscribe(room);
  }

  async unsubscribe(room) {
    this.handlers.delete(room);
    await this.sub.unsubscribe(room);
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
      this.handlers.get(room)?.(message);
    });
    await new Promise((resolve, reject) => {
      this.socket.once('open', resolve);
      this.socket.once('error', reject);
    });
  }

  broadcast(room, message) {
    this.socket.send(JSON.stringify({ type: 'publish', room, message }));
  }

  subscribe(room, handler) {
    this.handlers.set(room, handler);
    this.socket.send(JSON.stringify({ type: 'subscribe', room }));
  }

  unsubscribe(room) {
    this.handlers.delete(room);
    this.socket.send(JSON.stringify({ type: 'unsubscribe', room }));
  }

  close() {
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
