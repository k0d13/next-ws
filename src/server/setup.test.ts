import { createServer, type Server } from 'node:http';
import { connect as connectTcp } from 'node:net';
import type NextNodeServer from 'next/dist/server/next-server.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type RawData, WebSocket } from 'ws';
import type { Adapter } from './helpers/adapter.js';
import type { RouteModule } from './helpers/module.js';
import type { UpgradeHandler } from './helpers/socket.js';
import { getRequestStorage, getWebSocketServer } from './persistent.js';
import { setupWebSocketServer } from './setup.js';

const logger = vi.hoisted(() => ({ error: vi.fn(), ready: vi.fn() }));
vi.mock('next/dist/build/output/log.js', () => logger);

// Route modules by filename, standing in for what Next.js would compile
const modules = vi.hoisted(() => new Map<string, RouteModule | undefined>());
vi.mock('./helpers/module.js', () => ({
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
  for (const key of ['http-server', 'websocket-server', 'request-store', 'adapter'])
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
    expect(context).toEqual({ params: { room: 'general' } });
    socket.close();
  });

  it('emits connection on the WebSocket server', async () => {
    route('/ws', { UPGRADE: () => {} });
    setupWebSocketServer(createNextServer());
    const connection = new Promise((r) => getWebSocketServer()!.once('connection', r));
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
    await vi.waitFor(() => expect(messages.map((m) => m.data.toString())).toEqual(['mine']));
    socket.close();
  });
});

// ===== Rejection ===== //

describe('rejection', () => {
  it('responds 404 when no route matches', async () => {
    setupWebSocketServer(createNextServer());
    expect(await open('/missing')).toMatchObject({ status: 404 });
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

// ===== Adapter ===== //

describe('adapter', () => {
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

  it('relays messages to other clients in the room', async () => {
    const adapter = createAdapter();
    route('/chat', { UPGRADE: () => {} });
    setupWebSocketServer(createNextServer(), { adapter });

    const a = await open('/chat');
    const b = await open('/chat');
    await vi.waitFor(() => expect(adapter.subscribe).toHaveBeenCalledOnce());
    a.socket.send('hello');
    expect(await nextMessage(b.socket)).toBe('hello');
    expect(a.messages).toEqual([]);
    a.socket.close();
    b.socket.close();
  });

  it('unsubscribes once everyone has left', async () => {
    const adapter = createAdapter();
    route('/chat', { UPGRADE: () => {} });
    setupWebSocketServer(createNextServer(), { adapter });
    const { socket } = await open('/chat');
    await vi.waitFor(() => expect(adapter.subscribe).toHaveBeenCalled());
    socket.close();
    await vi.waitFor(() => expect(adapter.unsubscribe).toHaveBeenCalledWith('/chat'));
  });

  it('closes with 1011 when subscribing fails', async () => {
    const adapter = createAdapter();
    adapter.subscribe.mockRejectedValueOnce(new Error('Redis is down'));
    const handler = vi.fn();
    route('/chat', { UPGRADE: handler });
    setupWebSocketServer(createNextServer(), { adapter });
    const { socket } = await open('/chat');
    expect(await closed(socket)).toBe(1011);
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not forward messages until UPGRADE has finished', async () => {
    const adapter = createAdapter();
    let accept!: () => void;
    const accepted = new Promise<void>((r) => (accept = r));
    route('/chat', { UPGRADE: () => accepted });
    setupWebSocketServer(createNextServer(), { adapter });
    const a = await open('/chat');
    const b = await open('/chat');
    await vi.waitFor(() => expect(adapter.subscribe).toHaveBeenCalledOnce());

    a.socket.send('too early');
    await new Promise((r) => setTimeout(r, 50));
    expect(adapter.broadcast).not.toHaveBeenCalled();

    accept();
    await new Promise((r) => setTimeout(r, 0));
    a.socket.send('hello');
    expect(await nextMessage(b.socket)).toBe('hello');
    a.socket.close();
    b.socket.close();
  });

  it('does not forward messages from clients UPGRADE rejected', async () => {
    const adapter = createAdapter();
    route('/chat', {
      UPGRADE: async (client) => {
        await new Promise((r) => setTimeout(r, 20));
        client.close(1008, 'Sign in first');
      },
    });
    setupWebSocketServer(createNextServer(), { adapter });
    const { socket } = await open('/chat');
    socket.send('hello');
    expect(await closed(socket)).toBe(1008);
    expect(adapter.broadcast).not.toHaveBeenCalled();
  });

  it('leaves and skips UPGRADE when the client closes while subscribing', async () => {
    const adapter = createAdapter();
    let subscribed!: () => void;
    adapter.subscribe.mockImplementationOnce(() => new Promise<void>((r) => (subscribed = r)));
    const handler = vi.fn();
    route('/chat', { UPGRADE: handler });
    setupWebSocketServer(createNextServer(), { adapter });
    const { socket } = await open('/chat');
    await vi.waitFor(() => expect(adapter.subscribe).toHaveBeenCalledOnce());

    socket.close();
    await closed(socket);
    await vi.waitFor(() => expect(getWebSocketServer()?.clients.size).toBe(0));
    subscribed();
    await vi.waitFor(() => expect(adapter.unsubscribe).toHaveBeenCalledWith('/chat'));
    expect(handler).not.toHaveBeenCalled();
  });

  it('logs failed broadcasts without closing the client', async () => {
    const adapter = createAdapter();
    adapter.broadcast.mockRejectedValueOnce(new Error('Redis is down'));
    route('/chat', { UPGRADE: (client) => client.on('message', () => client.send('handled')) });
    setupWebSocketServer(createNextServer(), { adapter });
    const { socket } = await open('/chat');
    socket.send('hello');
    expect(await nextMessage(socket)).toBe('handled');
    await vi.waitFor(() =>
      expect(logger.error).toHaveBeenCalledWith(
        "[next-ws] adapter could not broadcast for '/chat'",
        expect.any(Error),
      ),
    );
    socket.close();
  });

  it('closes the adapter with the HTTP server', async () => {
    const adapter = createAdapter();
    setupWebSocketServer(createNextServer(), { adapter });
    httpServer.emit('close');
    await vi.waitFor(() => expect(adapter.close).toHaveBeenCalledOnce());
  });
});
