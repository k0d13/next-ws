import { WebSocket } from 'ws';

/**
 * Adapter backed by Redis pub/sub.
 *
 * @implements {import('next-ws/server').Adapter}
 */
export class RedisAdapter {
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
export class BrokerAdapter {
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
