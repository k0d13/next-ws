import { randomUUID } from 'node:crypto';
import * as logger from 'next/dist/build/output/log.js';
import type { RawData, WebSocket } from 'ws';
import { getAdapter, useRooms } from '../persistent.js';
import type { Adapter } from './adapter.js';

/** Anything a client can be sent. Strings are sent as text, everything else as binary. */
export type Message = string | RawData | ArrayBufferView;

export interface BroadcastOptions {
  /** A client not to send the message to, such as the one it came from. */
  except?: WebSocket;
}

/** What next-ws sends through an adapter for each broadcast. */
interface Envelope {
  /** Identifier of the client to leave out, if any. */
  except?: string;
  /** Whether the message is binary, in which case `data` is base64. */
  binary: boolean;
  data: string;
}

function toBuffer(data: Exclude<Message, string>) {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
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
      (value?.except === undefined || typeof value.except === 'string') &&
      typeof value?.binary === 'boolean' &&
      typeof value.data === 'string'
    )
      return value;
  } catch {}
  return null;
}

/** Tracks which local clients are in which room, and delivers broadcasts through an adapter. */
export class Rooms {
  readonly #adapter?: Adapter;
  readonly #rooms = new Map<string, Set<WebSocket>>();
  readonly #memberships = new WeakMap<WebSocket, Set<string>>();
  readonly #ids = new WeakMap<WebSocket, string>();
  /** Pending subscribe or unsubscribe for each room, so they reach the adapter in order. */
  readonly #pending = new Map<string, Promise<void>>();

  constructor(adapter?: Adapter) {
    this.#adapter = adapter;
  }

  /** Number of local clients in each room. */
  get sizes() {
    return Object.fromEntries([...this.#rooms].map(([room, clients]) => [room, clients.size]));
  }

  /**
   * Clients connected to this instance that are in a room.
   *
   * @param room Room identifier
   * @returns Local clients in the room
   */
  clients(room: string) {
    return [...(this.#rooms.get(room) ?? [])];
  }

  /**
   * Add a client to a room, subscribing to the room first if this is its first client here. The
   * client leaves every room it is in when it closes.
   *
   * @param client WebSocket client
   * @param room Room identifier
   */
  async join(client: WebSocket, room: string) {
    if (client.readyState !== client.OPEN) return;

    let memberships = this.#memberships.get(client);
    if (!memberships) {
      memberships = new Set();
      this.#memberships.set(client, memberships);
      client.once('close', () => {
        for (const joined of memberships!)
          this.leave(client, joined).catch((cause: unknown) => {
            logger.error(`[next-ws] adapter could not unsubscribe from '${joined}'`, cause);
          });
      });
    }
    memberships.add(room);

    let clients = this.#rooms.get(room);
    if (!clients) {
      clients = new Set();
      this.#rooms.set(room, clients);
      const adapter = this.#adapter;
      if (adapter) this.#queue(room, () => adapter.subscribe(room, (m) => this.#deliver(room, m)));
    }
    clients.add(client);

    try {
      await this.#pending.get(room);
    } catch (cause) {
      await this.leave(client, room);
      throw cause;
    }
  }

  /**
   * Remove a client from a room, unsubscribing from the room if it was the last client here.
   *
   * @param client WebSocket client
   * @param room Room identifier
   */
  async leave(client: WebSocket, room: string) {
    this.#memberships.get(client)?.delete(room);
    const clients = this.#rooms.get(room);
    if (!clients?.delete(client) || clients.size > 0) return;
    this.#rooms.delete(room);

    const adapter = this.#adapter;
    if (!adapter) return;
    this.#queue(room, () => adapter.unsubscribe(room));
    await this.#pending.get(room);
  }

  /**
   * Send a message to every client in a room, on every instance.
   *
   * @param room Room identifier
   * @param data Message to send
   * @param options Who to leave out
   */
  async broadcast(room: string, data: Message, options: BroadcastOptions = {}) {
    const binary = typeof data !== 'string';
    const except = options.except && this.#idOf(options.except);

    if (!this.#adapter) return this.#send(room, binary ? toBuffer(data) : data, binary, except);

    const envelope: Envelope = {
      except,
      binary,
      data: binary ? toBuffer(data).toString('base64') : data,
    };
    await this.#adapter.broadcast(room, JSON.stringify(envelope));
  }

  #idOf(client: WebSocket) {
    let id = this.#ids.get(client);
    if (!id) this.#ids.set(client, (id = randomUUID()));
    return id;
  }

  #deliver(room: string, message: string) {
    const envelope = parseEnvelope(message);
    if (!envelope) return this.#send(room, message, false);
    const data = envelope.binary ? Buffer.from(envelope.data, 'base64') : envelope.data;
    this.#send(room, data, envelope.binary, envelope.except);
  }

  #send(room: string, data: string | Buffer, binary: boolean, except?: string) {
    for (const client of this.#rooms.get(room) ?? []) {
      if (except && this.#ids.get(client) === except) continue;
      if (client.readyState === client.OPEN) client.send(data, { binary });
    }
  }

  /** Run an adapter call once the previous one for the same room has settled. */
  #queue(room: string, call: () => Promise<void> | void) {
    const previous = this.#pending.get(room) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(call);
    this.#pending.set(room, next);
    // Forget it once settled, unless another call has been queued behind it
    const forget = () => this.#pending.get(room) === next && this.#pending.delete(room);
    void next.then(forget, forget);
  }
}

/** The rooms every copy of next-ws shares, using the adapter set when they are first needed. */
function rooms() {
  return useRooms(() => new Rooms(getAdapter()));
}

/**
 * Add a client to a room, so it receives what is broadcast there from any instance. Clients leave
 * every room when they close.
 *
 * @param client WebSocket client
 * @param room Room name, such as `request.nextUrl.pathname` or `chat:general`
 */
export function join(client: WebSocket, room: string) {
  return rooms().join(client, room);
}

/**
 * Remove a client from a room.
 *
 * @param client WebSocket client
 * @param room Room name
 */
export function leave(client: WebSocket, room: string) {
  return rooms().leave(client, room);
}

/**
 * Send a message to every client in a room. With an adapter, this reaches clients on every
 * instance.
 *
 * @param room Room name
 * @param data Message to send, strings are sent as text and anything else as binary
 * @param options Who to leave out
 */
export function broadcast(room: string, data: Message, options?: BroadcastOptions) {
  return rooms().broadcast(room, data, options);
}

/**
 * Get the clients connected to this instance that are in a room.
 *
 * @param room Room name
 * @returns Local clients in the room
 */
export function getClients(room: string) {
  return rooms().clients(room);
}
