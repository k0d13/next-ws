import { Redis } from 'ioredis';
import type { Adapter } from 'next-ws/server';

/**
 * Shares WebSocket rooms between servers through Redis pub/sub. Each room is a Redis channel, and
 * next-ws decides when to subscribe and unsubscribe, so this only has to move strings around.
 */
export class RedisAdapter implements Adapter {
  // A connection in subscriber mode cannot publish, so publishing gets its own
  readonly #publisher: Redis;
  readonly #subscriber: Redis;
  readonly #handlers = new Map<string, (message: string) => void>();

  constructor(url: string) {
    this.#publisher = new Redis(url);
    this.#subscriber = new Redis(url);
    this.#subscriber.on('message', (room: string, message: string) => {
      this.#handlers.get(room)?.(message);
    });
  }

  async broadcast(room: string, message: string) {
    await this.#publisher.publish(room, message);
  }

  async subscribe(room: string, handler: (message: string) => void) {
    this.#handlers.set(room, handler);
    await this.#subscriber.subscribe(room);
  }

  async unsubscribe(room: string) {
    this.#handlers.delete(room);
    await this.#subscriber.unsubscribe(room);
  }

  async close() {
    await Promise.all([this.#publisher.quit(), this.#subscriber.quit()]);
  }
}
