import { randomUUID } from 'node:crypto';
import type { RawData, WebSocket } from 'ws';
import type { Adapter } from './adapter.js';

/** What next-ws sends through an adapter for each client message. */
interface Envelope {
  /** Identifier of the client that sent the message, so it is not echoed back. */
  sender: string;
  /** Whether the message is binary, in which case `data` is base64. */
  binary: boolean;
  data: string;
}

function toBuffer(data: RawData) {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data);
}

/**
 * Parse a message from an adapter. Anything that is not an envelope, such as a message published by
 * another service, is delivered to every client as text.
 */
function parseEnvelope(message: string): Envelope | null {
  try {
    const value = JSON.parse(message);
    if (
      typeof value?.sender === 'string' &&
      typeof value.binary === 'boolean' &&
      typeof value.data === 'string'
    )
      return value;
  } catch {}
  return null;
}

/** Tracks which local clients are in which room, and relays their messages through an adapter. */
export class Rooms {
  readonly #adapter: Adapter;
  readonly #rooms = new Map<string, Set<WebSocket>>();
  readonly #clientIds = new WeakMap<WebSocket, string>();
  /** Pending subscribe or unsubscribe for each room, so they reach the adapter in order. */
  readonly #pending = new Map<string, Promise<void>>();

  constructor(adapter: Adapter) {
    this.#adapter = adapter;
  }

  /** Number of local clients in each room. */
  get sizes() {
    return Object.fromEntries([...this.#rooms].map(([room, clients]) => [room, clients.size]));
  }

  /**
   * Add a client to a room, subscribing to the room first if this is its first client here.
   *
   * @param room Room identifier
   * @param client WebSocket client
   */
  async join(room: string, client: WebSocket) {
    let clients = this.#rooms.get(room);
    if (!clients) {
      clients = new Set();
      this.#rooms.set(room, clients);
      this.#queue(room, () =>
        this.#adapter.subscribe(room, (message) => this.#deliver(room, message)),
      );
    }
    clients.add(client);
    this.#clientIds.set(client, randomUUID());

    try {
      await this.#pending.get(room);
    } catch (cause) {
      await this.leave(room, client);
      throw cause;
    }
  }

  /**
   * Remove a client from a room, unsubscribing from the room if it was the last client here.
   *
   * @param room Room identifier
   * @param client WebSocket client
   */
  async leave(room: string, client: WebSocket) {
    const clients = this.#rooms.get(room);
    if (!clients?.delete(client) || clients.size > 0) return;
    this.#rooms.delete(room);
    this.#queue(room, () => this.#adapter.unsubscribe(room));
    await this.#pending.get(room);
  }

  /**
   * Publish a client's message to every other client in the room, on every instance.
   *
   * @param room Room identifier
   * @param client WebSocket client that sent the message
   * @param data Message data
   * @param isBinary Whether the message is binary
   */
  async publish(room: string, client: WebSocket, data: RawData, isBinary: boolean) {
    const envelope: Envelope = {
      sender: this.#clientIds.get(client) ?? '',
      binary: isBinary,
      data: isBinary ? toBuffer(data).toString('base64') : toBuffer(data).toString('utf8'),
    };
    await this.#adapter.broadcast(room, JSON.stringify(envelope));
  }

  #deliver(room: string, message: string) {
    const envelope = parseEnvelope(message);
    const data = envelope?.binary
      ? Buffer.from(envelope.data, 'base64')
      : (envelope?.data ?? message);

    for (const client of this.#rooms.get(room) ?? []) {
      if (envelope && this.#clientIds.get(client) === envelope.sender) continue;
      if (client.readyState === client.OPEN)
        client.send(data, { binary: envelope?.binary ?? false });
    }
  }

  /** Run an adapter call once the previous one for the same room has settled. */
  #queue(room: string, call: () => Promise<void> | void) {
    const previous = this.#pending.get(room) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(call);
    this.#pending.set(room, next);
    // Forget it once settled, unless another call has been queued behind it
    void next.then(
      () => this.#pending.get(room) === next && this.#pending.delete(room),
      () => this.#pending.get(room) === next && this.#pending.delete(room),
    );
  }
}
