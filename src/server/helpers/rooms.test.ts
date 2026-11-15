import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import type { Adapter } from './adapter.js';
import { Rooms } from './rooms.js';

/** An adapter that delivers broadcasts to every Rooms instance sharing it, like Redis would. */
function createBus() {
  const subscribers = new Map<string, Set<(message: string) => void>>();
  function createAdapter() {
    const handlers = new Map<string, (message: string) => void>();
    const adapter = {
      broadcast: vi.fn(async (room: string, message: string) => {
        for (const handler of subscribers.get(room) ?? []) handler(message);
      }),
      subscribe: vi.fn(async (room: string, handler: (message: string) => void) => {
        handlers.set(room, handler);
        if (!subscribers.has(room)) subscribers.set(room, new Set());
        subscribers.get(room)!.add(handler);
      }),
      unsubscribe: vi.fn(async (room: string) => {
        subscribers.get(room)?.delete(handlers.get(room)!);
        handlers.delete(room);
      }),
      close: vi.fn(async () => {}),
    } satisfies Adapter;
    return adapter;
  }
  return { createAdapter, subscribers: (room: string) => subscribers.get(room) };
}

function createClient() {
  const client = Object.assign(new EventEmitter(), {
    OPEN: 1,
    readyState: 1,
    send: vi.fn(),
  });
  return client as unknown as WebSocket & { send: ReturnType<typeof vi.fn> };
}

describe('Rooms', () => {
  it('subscribes once per room', async () => {
    const adapter = createBus().createAdapter();
    const rooms = new Rooms(adapter);
    await rooms.join(createClient(), '/a');
    await rooms.join(createClient(), '/a');
    await rooms.join(createClient(), '/b');
    expect(adapter.subscribe).toHaveBeenCalledTimes(2);
    expect(rooms.sizes).toEqual({ '/a': 2, '/b': 1 });
  });

  it('unsubscribes once the last client leaves', async () => {
    const adapter = createBus().createAdapter();
    const rooms = new Rooms(adapter);
    const [a, b] = [createClient(), createClient()];
    await rooms.join(a, '/a');
    await rooms.join(b, '/a');
    await rooms.leave(a, '/a');
    expect(adapter.unsubscribe).not.toHaveBeenCalled();
    await rooms.leave(b, '/a');
    expect(adapter.unsubscribe).toHaveBeenCalledWith('/a');
    expect(rooms.sizes).toEqual({});
  });

  it('ignores a client leaving a room it is not in', async () => {
    const adapter = createBus().createAdapter();
    const rooms = new Rooms(adapter);
    await rooms.leave(createClient(), '/a');
    expect(adapter.unsubscribe).not.toHaveBeenCalled();
  });

  it('subscribes again after a room empties and fills', async () => {
    const adapter = createBus().createAdapter();
    const rooms = new Rooms(adapter);
    const client = createClient();
    await rooms.join(client, '/a');
    await rooms.leave(client, '/a');
    await rooms.join(client, '/a');
    expect(adapter.subscribe).toHaveBeenCalledTimes(2);
    expect(adapter.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('calls the adapter in order for a room', async () => {
    const calls: string[] = [];
    const gate = Promise.withResolvers<void>();
    const adapter: Adapter = {
      broadcast: async () => {},
      // Subscribing is slow, unsubscribing still has to wait for it
      subscribe: () => gate.promise.then(() => void calls.push('sub')),
      unsubscribe: async () => void calls.push('unsub'),
      close: async () => {},
    };
    const rooms = new Rooms(adapter);
    const client = createClient();
    const joined = rooms.join(client, '/a');
    const left = rooms.leave(client, '/a');
    gate.resolve();
    await Promise.allSettled([joined, left]);
    expect(calls).toEqual(['sub', 'unsub']);
  });

  it('removes the client and rethrows when subscribing fails', async () => {
    const adapter = createBus().createAdapter();
    adapter.subscribe.mockRejectedValueOnce(new Error('Redis is down'));
    const rooms = new Rooms(adapter);
    await expect(rooms.join(createClient(), '/a')).rejects.toThrow('Redis is down');
    expect(rooms.sizes).toEqual({});
    // A later client gets a fresh attempt
    await rooms.join(createClient(), '/a');
    expect(adapter.subscribe).toHaveBeenCalledTimes(2);
  });

  it('delivers to every client on every instance except the one left out', async () => {
    const bus = createBus();
    const one = new Rooms(bus.createAdapter());
    const two = new Rooms(bus.createAdapter());
    const [sender, local, remote] = [createClient(), createClient(), createClient()];
    await one.join(sender, '/a');
    await one.join(local, '/a');
    await two.join(remote, '/a');

    await one.broadcast('/a', 'hello', { except: sender });
    expect(sender.send).not.toHaveBeenCalled();
    expect(local.send).toHaveBeenCalledWith('hello', { binary: false });
    expect(remote.send).toHaveBeenCalledWith('hello', { binary: false });
  });

  it('keeps binary messages binary', async () => {
    const bus = createBus();
    const one = new Rooms(bus.createAdapter());
    const [sender, receiver] = [createClient(), createClient()];
    await one.join(sender, '/a');
    await one.join(receiver, '/a');

    await one.broadcast('/a', Buffer.from([0, 1, 255]), { except: sender });
    const [data, options] = receiver.send.mock.calls[0]!;
    expect([...(data as Buffer)]).toEqual([0, 1, 255]);
    expect(options).toEqual({ binary: true });
  });

  it('sends strings as text and anything else as binary', async () => {
    const rooms = new Rooms();
    const client = createClient();
    await rooms.join(client, '/a');
    await rooms.broadcast('/a', 'text');
    await rooms.broadcast('/a', new Uint8Array([1, 2]));
    expect(client.send.mock.calls).toEqual([
      ['text', { binary: false }],
      [Buffer.from([1, 2]), { binary: true }],
    ]);
  });

  it('joins fragmented and ArrayBuffer messages', async () => {
    const bus = createBus();
    const one = new Rooms(bus.createAdapter());
    const [sender, receiver] = [createClient(), createClient()];
    await one.join(sender, '/a');
    await one.join(receiver, '/a');

    await one.broadcast('/a', [Buffer.from('he'), Buffer.from('llo')], { except: sender });
    await one.broadcast('/a', new TextEncoder().encode('bye').buffer as ArrayBuffer, {
      except: sender,
    });
    expect(receiver.send.mock.calls.map(([data]) => String(data))).toEqual(['hello', 'bye']);
  });

  it('does not deliver to other rooms', async () => {
    const bus = createBus();
    const rooms = new Rooms(bus.createAdapter());
    const [sender, other] = [createClient(), createClient()];
    await rooms.join(sender, '/a');
    await rooms.join(other, '/b');
    await rooms.broadcast('/a', Buffer.from('hello'), { except: sender });
    expect(other.send).not.toHaveBeenCalled();
  });

  it('skips clients that are not open', async () => {
    const bus = createBus();
    const rooms = new Rooms(bus.createAdapter());
    const [sender, closing] = [createClient(), createClient()];
    await rooms.join(sender, '/a');
    await rooms.join(closing, '/a');
    Reflect.set(closing, 'readyState', 2);
    await rooms.broadcast('/a', Buffer.from('hello'), { except: sender });
    expect(closing.send).not.toHaveBeenCalled();
  });

  it('delivers messages from other publishers as text', async () => {
    const bus = createBus();
    const rooms = new Rooms(bus.createAdapter());
    const client = createClient();
    await rooms.join(client, '/a');
    for (const handler of bus.subscribers('/a') ?? []) handler('{"from":"elsewhere"}');
    expect(client.send).toHaveBeenCalledWith('{"from":"elsewhere"}', { binary: false });
  });

  it('delivers locally without an adapter', async () => {
    const rooms = new Rooms();
    const [a, b] = [createClient(), createClient()];
    await rooms.join(a, '/a');
    await rooms.join(b, '/a');
    await rooms.broadcast('/a', 'hello', { except: a });
    expect(a.send).not.toHaveBeenCalled();
    expect(b.send).toHaveBeenCalledWith('hello', { binary: false });
  });

  it('lists the local clients in a room', async () => {
    const rooms = new Rooms();
    const [a, b] = [createClient(), createClient()];
    await rooms.join(a, '/a');
    await rooms.join(b, '/b');
    expect(rooms.clients('/a')).toEqual([a]);
    expect(rooms.clients('/missing')).toEqual([]);
  });

  it('joins a room once however often a client joins it', async () => {
    const rooms = new Rooms();
    const client = createClient();
    await rooms.join(client, '/a');
    await rooms.join(client, '/a');
    await rooms.broadcast('/a', 'hello');
    expect(client.send).toHaveBeenCalledOnce();
  });

  it('leaves every room when a client closes', async () => {
    const adapter = createBus().createAdapter();
    const rooms = new Rooms(adapter);
    const client = createClient();
    await rooms.join(client, '/a');
    await rooms.join(client, '/b');
    client.emit('close');
    expect(rooms.sizes).toEqual({});
    await vi.waitFor(() => expect(adapter.unsubscribe).toHaveBeenCalledTimes(2));
  });

  it('does not add a client that is not open', async () => {
    const rooms = new Rooms();
    const client = createClient();
    Reflect.set(client, 'readyState', 3);
    await rooms.join(client, '/a');
    expect(rooms.sizes).toEqual({});
  });
});
