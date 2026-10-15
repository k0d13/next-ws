import { createServer, type Server } from 'node:http';
import { connect as connectTcp } from 'node:net';
import type NextNodeServer from 'next/dist/server/next-server.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type RawData, WebSocket, WebSocketServer } from 'ws';
import type { Adapter } from './helpers/adapter.js';
import type { RouteModule } from './helpers/module.js';
import { broadcast, join } from './helpers/rooms.js';
import type { UpgradeHandler } from './helpers/socket.js';
import {
  getRequestStorage,
  getWebSocketServer,
  setAdapter,
  setHttpServer,
  setWebSocketServer,
} from './persistent.js';
import { setupWebSocketServer } from './setup.js';

const logger = vi.hoisted(() => ({ error: vi.fn(), ready: vi.fn(), warn: vi.fn() }));
vi.mock('next/dist/build/output/log.js', () => logger);

// Route modules by filename, standing in for what Next.js would compile
const modules = vi.hoisted(() => new Map<string, RouteModule | undefined>());
vi.mock('./helpers/module.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./helpers/module.js')>()),
  importRouteModule: async (_: unknown, filename: string) => modules.get(filename),
}));

let httpServer: Server;
let port: number;

function route(path: string, module: RouteModule['userland'] | undefined) {
  modules.set(`app${path}/route`, module && { userland: module });
}

function createNextServer(options: { basePath?: string; server?: Server } = {}) {
  return {
    serverOptions: {
      httpServer: options.server ?? httpServer,
      conf: { basePath: options.basePath },
    },
    appPathRoutes: Object.fromEntries([...modules.keys()].map((f) => [f.slice(3, -6), [f]])),
    getAppPathRoutes: () => ({}),
    prepare: async () => {},
  } as unknown as NextNodeServer;
}

beforeEach(async () => {
  httpServer = createServer();
  await new Promise<void>((r) => httpServer.listen(0, '127.0.0.1', r));
  port = (httpServer.address() as { port: number }).port;
});

afterEach(async () => {
  for (const client of getWebSocketServer()?.clients ?? []) client.terminate();
  await new Promise((r) => httpServer.close(r));
  for (const key of ['http-server', 'websocket-server', 'request-store', 'adapter', 'rooms'])
    Reflect.deleteProperty(globalThis, Symbol.for(`next-ws.${key}`));
  modules.clear();
  vi.clearAllMocks();
});

/** Open a WebSocket and resolve once it is open, or with the status it was rejected with. */
async function open(path: string, headers?: Record<string, string>) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}${path}`, { headers });
  const messages: { data: RawData; isBinary: boolean }[] = [];
  socket.on('message', (data, isBinary) => messages.push({ data, isBinary }));
  return new Promise<{ socket: WebSocket; status?: number; messages: typeof messages }>(
    (resolve, reject) => {
      socket.once('open', () => resolve({ socket, messages }));
      socket.once('unexpected-response', (_, res) =>
        resolve({ socket, status: res.statusCode, messages }),
      );
      socket.once('error', reject);
    },
  );
}

const nextMessage = (socket: WebSocket) =>
  new Promise<string>((r) => socket.once('message', (data) => r(data.toString())));
const closed = (socket: WebSocket) =>
  new Promise<number>((r) => socket.once('close', (code) => r(code)));
const texts = (messages: { data: RawData }[]) => messages.map((m) => String(m.data));
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Send a raw upgrade request, for headers a WebSocket client would never send. */
function rawUpgrade(lines: string[]) {
  return new Promise<string>((resolve, reject) => {
    const socket = connectTcp(port, '127.0.0.1', () =>
      socket.write(`${lines.join('\r\n')}\r\n\r\n`),
    );
    let data = '';
    socket.on('data', (chunk) => (data += chunk));
    socket.on('close', () => resolve(data));
    socket.on('error', reject);
  });
}

// ===== Setup ===== //

describe('setupWebSocketServer', () => {
  it('logs an error when there is no HTTP server', () => {
    setupWebSocketServer({ serverOptions: {} } as unknown as NextNodeServer);
    expect(logger.error).toHaveBeenCalledWith('[next-ws] was not able to find the HTTP server');
  });

  it('attaches once however often it is called', () => {
    const next = createNextServer();
    setupWebSocketServer(next);
    setupWebSocketServer(next);
    expect(httpServer.listenerCount('upgrade')).toBe(1);
    expect(logger.ready).toHaveBeenCalledOnce();
  });
});

// ===== Upgrade ===== //

describe('upgrade', () => {
  it('calls UPGRADE with the client, server, request and params', async () => {
    const handler = vi.fn<UpgradeHandler>((client) => client.send('hi'));
    route('/rooms/[room]', { UPGRADE: handler });
    setupWebSocketServer(createNextServer());

    const { socket, messages } = await open('/rooms/general?x=1');
    await vi.waitFor(() => expect(messages).toHaveLength(1));

    const [client, server, request, context] = handler.mock.calls[0]!;
    expect(client).toBeInstanceOf(WebSocket);
    expect(server).toBe(getWebSocketServer());
    expect(request.nextUrl.pathname).toBe('/rooms/general');
    expect(request.nextUrl.searchParams.get('x')).toBe('1');
    // Awaitable like Next.js params, and readable directly like next-ws 2 params
    expect(await context.params).toEqual({ room: 'general' });
    expect(context.params.room).toBe('general');
    socket.close();
  });

  it('uses a WebSocket server set before the first connection', async () => {
    const server = new WebSocketServer({ noServer: true });
    let received: unknown;
    route('/ws', { UPGRADE: (_client, wsServer) => void (received = wsServer) });
    setupWebSocketServer(createNextServer());
    // Set after setup, as `instrumentation.ts` would
    setWebSocketServer(server);
    const { socket } = await open('/ws');
    await vi.waitFor(() => expect(received).toBe(server));
    socket.close();
  });

  it('waits for Next.js to finish preparing', async () => {
    const order: string[] = [];
    route('/ws', { UPGRADE: () => void order.push('upgrade') });
    const next = createNextServer();
    Reflect.set(next, 'prepare', async () => {
      await delay(20);
      order.push('prepared');
    });
    setupWebSocketServer(next);
    const { socket } = await open('/ws');
    await vi.waitFor(() => expect(order).toEqual(['prepared', 'upgrade']));
    socket.close();
  });

  it('emits connection on the WebSocket server', async () => {
    route('/ws', { UPGRADE: () => {} });
    setupWebSocketServer(createNextServer());
    const server = new WebSocketServer({ noServer: true });
    setWebSocketServer(server);
    const connection = new Promise((r) => server.once('connection', r));
    const { socket } = await open('/ws');
    await connection;
    socket.close();
  });

  it('makes the request available to headers() and cookies() inside UPGRADE', async () => {
    let store: unknown;
    route('/ws', { UPGRADE: () => void (store = getRequestStorage()?.getStore()) });
    setupWebSocketServer(createNextServer());
    const { socket } = await open('/ws', { 'x-test': 'yes', cookie: 'session=abc' });
    await vi.waitFor(() => expect(store).toBeDefined());
    const { headers, cookies } = store as { headers: Headers; cookies: Map<string, unknown> };
    expect(headers.get('x-test')).toBe('yes');
    expect(cookies.get('session')).toMatchObject({ value: 'abc' });
    socket.close();
  });

  it('keeps the request available inside event listeners', async () => {
    route('/ws', {
      UPGRADE: (client) =>
        client.on('message', () => {
          const store = getRequestStorage()?.getStore();
          client.send(store?.headers.get('x-test') ?? 'missing');
        }),
    });
    setupWebSocketServer(createNextServer());
    const { socket } = await open('/ws', { 'x-test': 'still here' });
    socket.send('ping');
    expect(await nextMessage(socket)).toBe('still here');
    socket.close();
  });

  it('closes with 1011 when UPGRADE throws', async () => {
    route('/ws', {
      UPGRADE: () => {
        throw new Error('Boom');
      },
    });
    setupWebSocketServer(createNextServer());
    const { socket } = await open('/ws');
    expect(await closed(socket)).toBe(1011);
    expect(logger.error).toHaveBeenCalledWith(
      "[next-ws] error in socket handler for '/ws'",
      expect.any(Error),
    );
  });

  it('leaves Next.js paths for Next.js to handle', async () => {
    route('/[...rest]', { UPGRADE: () => {} });
    setupWebSocketServer(createNextServer({ basePath: '/base' }));
    // Stand in for Next.js answering its own sockets
    httpServer.on('upgrade', (message, socket) => {
      if (message.url?.startsWith('/base/_next/')) socket.end('HTTP/1.1 418 Teapot\r\n\r\n');
    });
    expect(await open('/base/_next/hmr')).toMatchObject({ status: 418 });
  });

  it('serves paths that only contain _next', async () => {
    route('/[id]', { UPGRADE: (client) => client.send('mine') });
    setupWebSocketServer(createNextServer());
    const { socket, messages } = await open('/_next-ish');
    await vi.waitFor(() => expect(texts(messages)).toEqual(['mine']));
    socket.close();
  });
});

// ===== Held Messages ===== //

describe('held messages', () => {
  it('holds messages until UPGRADE starts listening', async () => {
    let ready!: () => void;
    const gate = new Promise<void>((r) => (ready = r));
    route('/ws', {
      UPGRADE: async (client) => {
        await gate;
        client.on('message', (data) => client.send(`got ${data}`));
      },
    });
    setupWebSocketServer(createNextServer());
    const { socket, messages } = await open('/ws');
    socket.send('early');
    await delay(20);
    ready();
    await vi.waitFor(() => expect(texts(messages)).toEqual(['got early']));
    socket.close();
  });

  it('delivers to a listener added while UPGRADE is still running', async () => {
    route('/ws', {
      UPGRADE: async (client) => {
        client.on('message', (data) => client.send(`got ${data}`));
        // Runs for the life of the connection
        await new Promise(() => {});
      },
    });
    setupWebSocketServer(createNextServer());
    const { socket, messages } = await open('/ws');
    socket.send('hello');
    await vi.waitFor(() => expect(texts(messages)).toEqual(['got hello']));
    socket.close();
  });

  it('notices a client closing while UPGRADE is still running', async () => {
    let closedOnServer = false;
    route('/ws', {
      UPGRADE: async (client) => {
        client.once('close', () => (closedOnServer = true));
        await new Promise(() => {});
      },
    });
    setupWebSocketServer(createNextServer());
    const { socket } = await open('/ws');
    socket.send('unheard');
    socket.close();
    await vi.waitFor(() => expect(closedOnServer).toBe(true));
  });

  it('keeps the request available to held messages', async () => {
    route('/ws', {
      UPGRADE: async (client) => {
        await delay(20);
        client.on('message', () => {
          client.send(getRequestStorage()?.getStore()?.headers.get('x-test') ?? 'missing');
        });
      },
    });
    setupWebSocketServer(createNextServer());
    const { socket } = await open('/ws', { 'x-test': 'held' });
    socket.send('ping');
    expect(await nextMessage(socket)).toBe('held');
    socket.close();
  });
});

// ===== Rejection ===== //

describe('rejection', () => {
  it('responds 404 when no route matches', async () => {
    setupWebSocketServer(createNextServer());
    expect(await open('/missing')).toMatchObject({ status: 404 });
  });

  it('leaves unmatched upgrades to the listeners of a custom server', async () => {
    setHttpServer(httpServer);
    setupWebSocketServer(createNextServer());
    // Stand in for a custom server's own WebSocket server on another path
    httpServer.on('upgrade', (message, socket) => {
      if (message.url === '/graphql') socket.end('HTTP/1.1 418 Teapot\r\n\r\n');
    });
    expect(await open('/graphql')).toMatchObject({ status: 418 });
  });

  it('responds 404 when the route has no UPGRADE export', async () => {
    route('/ws', {});
    setupWebSocketServer(createNextServer());
    expect(await open('/ws')).toMatchObject({ status: 404 });
  });

  it('responds 500 when the route module cannot be imported', async () => {
    route('/ws', undefined);
    setupWebSocketServer(createNextServer());
    expect(await open('/ws')).toMatchObject({ status: 500 });
  });

  it('responds 500 when reading the handler throws', async () => {
    modules.set('app/ws/route', {
      get userland(): never {
        throw new Error('Not ready');
      },
    });
    setupWebSocketServer(createNextServer());
    expect(await open('/ws')).toMatchObject({ status: 500 });
  });

  it('responds 400 to a malformed Host header instead of crashing', async () => {
    route('/ws', { UPGRADE: () => {} });
    setupWebSocketServer(createNextServer());
    const response = await rawUpgrade([
      'GET /ws HTTP/1.1',
      'Host: a b',
      'Upgrade: websocket',
      'Connection: Upgrade',
      'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
      'Sec-WebSocket-Version: 13',
    ]);
    expect(response).toMatch(/^HTTP\/1\.1 400 Bad Request/);
  });
});

// ===== Rooms ===== //

describe('rooms', () => {
  function createAdapter() {
    const handlers = new Map<string, (message: string) => void>();
    return {
      broadcast: vi.fn(async (room: string, message: string) => handlers.get(room)?.(message)),
      subscribe: vi.fn(async (room: string, handler: (message: string) => void) => {
        handlers.set(room, handler);
      }),
      unsubscribe: vi.fn(async (room: string) => void handlers.delete(room)),
      close: vi.fn(async () => {}),
    } satisfies Adapter;
  }

  const chat: UpgradeHandler = async (client, _server, request) => {
    const room = request.nextUrl.pathname;
    await join(client, room);
    client.on('message', (data) => void broadcast(room, String(data), { except: client }));
  };

  it('does not relay messages on its own', async () => {
    const adapter = createAdapter();
    setAdapter(adapter);
    route('/chat', { UPGRADE: () => {} });
    setupWebSocketServer(createNextServer());
    const a = await open('/chat');
    const b = await open('/chat');
    a.socket.send('hello');
    await delay(20);
    expect(b.messages).toEqual([]);
    expect(adapter.subscribe).not.toHaveBeenCalled();
    a.socket.close();
    b.socket.close();
  });

  it('broadcasts through an adapter set before the first connection', async () => {
    const adapter = createAdapter();
    route('/chat', { UPGRADE: chat });
    setupWebSocketServer(createNextServer());
    setAdapter(adapter);

    const a = await open('/chat');
    const b = await open('/chat');
    await vi.waitFor(() => expect(adapter.subscribe).toHaveBeenCalledOnce());
    a.socket.send('hello');
    expect(await nextMessage(b.socket)).toBe('hello');
    expect(a.messages).toEqual([]);
    expect(adapter.broadcast).toHaveBeenCalledOnce();
    a.socket.close();
    b.socket.close();
  });

  it('does not deliver to a client before UPGRADE joins it to the room', async () => {
    let accept!: () => void;
    const accepted = new Promise<void>((r) => (accept = r));
    route('/chat', { UPGRADE: chat });
    route('/pending', {
      UPGRADE: async (client) => {
        await accepted;
        await join(client, '/chat');
      },
    });
    setupWebSocketServer(createNextServer());
    const member = await open('/chat');
    const pending = await open('/pending');
    await vi.waitFor(() => expect(getWebSocketServer()?.clients.size).toBe(2));

    member.socket.send('secret');
    await delay(20);
    expect(pending.messages).toEqual([]);

    accept();
    await delay(20);
    member.socket.send('welcome');
    expect(await nextMessage(pending.socket)).toBe('welcome');
    member.socket.close();
    pending.socket.close();
  });

  it('unsubscribes once everyone has left', async () => {
    const adapter = createAdapter();
    setAdapter(adapter);
    route('/chat', { UPGRADE: chat });
    setupWebSocketServer(createNextServer());
    const { socket } = await open('/chat');
    await vi.waitFor(() => expect(adapter.subscribe).toHaveBeenCalled());
    socket.close();
    await vi.waitFor(() => expect(adapter.unsubscribe).toHaveBeenCalledWith('/chat'));
  });

  it('closes with 1011 when joining fails in UPGRADE', async () => {
    const adapter = createAdapter();
    adapter.subscribe.mockRejectedValueOnce(new Error('Redis is down'));
    setAdapter(adapter);
    route('/chat', { UPGRADE: chat });
    setupWebSocketServer(createNextServer());
    const { socket } = await open('/chat');
    expect(await closed(socket)).toBe(1011);
  });

  it('closes the adapter with the HTTP server', async () => {
    const adapter = createAdapter();
    setupWebSocketServer(createNextServer());
    setAdapter(adapter);
    httpServer.emit('close');
    await vi.waitFor(() => expect(adapter.close).toHaveBeenCalledOnce());
  });
});
