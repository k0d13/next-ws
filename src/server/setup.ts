import { AsyncLocalStorage, AsyncResource } from 'node:async_hooks';
import { type IncomingMessage, STATUS_CODES } from 'node:http';
import type { Duplex } from 'node:stream';
import { debuglog } from 'node:util';
import * as logger from 'next/dist/build/output/log.js';
import type NextNodeServer from 'next/dist/server/next-server.js';
import { type RawData, type WebSocket, WebSocketServer } from 'ws';
import { findMatchingRoute } from './helpers/match.js';
import { createParams, importRouteModule } from './helpers/module.js';
import { toNextRequest } from './helpers/request.js';
import { createRequestStore } from './helpers/store.js';
import {
  getAdapter,
  getHttpServer,
  useHttpServer,
  useRequestStorage,
  useWebSocketServer,
} from './persistent.js';

const debug = debuglog('next-ws');

/** Most a client can send before its handler is ready, beyond which messages are dropped. */
const maxHeldBytes = 1024 * 1024;

/**
 * Attach the WebSocket server to the HTTP server. The patched Next.js server calls this.
 *
 * @param nextServer Next.js Node server instance
 */
export function setupWebSocketServer(nextServer: NextNodeServer) {
  // A server set before Next.js started belongs to a custom server, which may handle some upgrades
  // itself
  const customServer = getHttpServer() !== undefined;
  const httpServer = //
    // @ts-expect-error - serverOptions is protected
    useHttpServer(() => nextServer.serverOptions?.httpServer);
  if (!httpServer) return logger.error('[next-ws] was not able to find the HTTP server');

  // Prevent double-attaching
  const kAttached = Symbol.for('next-ws.http-server.attached');
  if (Reflect.has(httpServer, kAttached)) return;
  Reflect.set(httpServer, kAttached, true);

  const requestStorage = //
    useRequestStorage(() => new AsyncLocalStorage());
  // @ts-expect-error - serverOptions is protected
  const basePath: string = nextServer.serverOptions?.conf.basePath || '';

  logger.ready('[next-ws] has started the WebSocket server');

  async function handleUpgrade(message: IncomingMessage, socket: Duplex, head: Buffer) {
    // Next.js handles its own sockets, such as HMR
    if (message.url?.startsWith(`${basePath}/_next/`)) return;

    // Wait for Next.js to finish starting, which runs `instrumentation.ts` where an adapter or
    // WebSocket server may be set
    await nextServer.prepare();

    let request: ReturnType<typeof toNextRequest>;
    try {
      request = toNextRequest(message);
    } catch (cause) {
      logger.error('[next-ws] could not parse upgrade request', cause);
      return rejectUpgrade(socket, 400);
    }
    const pathname = request.nextUrl.pathname;

    const route = findMatchingRoute(nextServer, pathname);
    if (!route) {
      // Next.js leaves these for a custom server's own upgrade listeners, and so does next-ws
      if (customServer) return;
      debug(`no route for upgrade to ${pathname}`);
      return rejectUpgrade(socket, 404);
    }

    const module = await importRouteModule(nextServer, route.filename);
    if (!module) {
      logger.error(`[next-ws] could not import module for page ${pathname}`);
      return rejectUpgrade(socket, 500);
    }

    // Reading `userland` can throw if `ensureUserland()` did not fully resolve it, which the
    // catch around this function turns into a 500
    const handler = module.userland.UPGRADE;
    if (typeof handler !== 'function') {
      debug(`route '${pathname}' does not export an UPGRADE handler`);
      return rejectUpgrade(socket, 404);
    }

    const wsServer = //
      useWebSocketServer(() => new WebSocketServer({ noServer: true }));
    wsServer.handleUpgrade(message, socket, head, (client) => {
      wsServer.emit('connection', client, message);

      void requestStorage.run(createRequestStore(request), () => {
        // Emit every event in this request's context, so `headers()` and `cookies()` keep
        // working inside listeners the handler adds
        const release = holdMessages(
          client,
          AsyncResource.bind(client.emit, 'next-ws.client', client),
        );

        return Promise.resolve()
          .then(() => handler(client, wsServer, request, { params: createParams(route.params) }))
          .then(
            () => release(true),
            (cause: unknown) => {
              release(false);
              logger.error(`[next-ws] error in socket handler for '${pathname}'`, cause);
              try {
                client.close(1011, 'Internal Server Error');
              } catch {}
            },
          );
      });
    });
  }

  httpServer.on('upgrade', (message, socket, head) => {
    // Nothing thrown here can be allowed to become an unhandled rejection, it would take down the
    // whole server
    handleUpgrade(message, socket, head).catch((cause: unknown) => {
      logger.error('[next-ws] could not handle upgrade', cause);
      rejectUpgrade(socket, 500);
    });
  });

  // Clean up the adapter, wherever it was set, once the server closes
  httpServer.once('close', async () => {
    try {
      await getAdapter()?.close();
    } catch (cause) {
      logger.error('[next-ws] adapter cleanup failed:', cause);
    }
  });
}

/**
 * Hold the messages a client sends while nothing listens for them, until the handler adds a
 * `message` listener or settles, so a handler can await before it starts listening.
 *
 * @param client WebSocket client
 * @param emit Emit function to deliver events with
 * @returns Function that stops holding, delivering or dropping what was held
 */
function holdMessages(client: WebSocket, emit: WebSocket['emit']) {
  let held: [RawData, boolean][] | undefined = [];
  let heldBytes = 0;

  const release = (deliver: boolean) => {
    const messages = held;
    held = undefined;
    client.off('newListener', onListener);
    if (deliver) for (const args of messages ?? []) emit.call(client, 'message', ...args);
  };
  // Deliver once the listener has been added, after the handler's synchronous code has run
  const onListener = (event: string | symbol) => {
    if (event === 'message') queueMicrotask(() => release(true));
  };
  client.on('newListener', onListener);

  client.emit = function (event: string | symbol, ...args: unknown[]) {
    if (held && event === 'message' && client.listenerCount('message') === 0) {
      const [data, isBinary] = args as [RawData, boolean];
      heldBytes += Array.isArray(data)
        ? data.reduce((n, b) => n + b.byteLength, 0)
        : data.byteLength;
      if (heldBytes <= maxHeldBytes) held.push([data, isBinary]);
      else debug('dropped a message sent before the UPGRADE handler was ready');
      return true;
    }
    return emit.call(client, event, ...args);
  };

  return release;
}

/**
 * Reject an upgrade with an HTTP response, so the client sees why.
 *
 * @param socket Socket the upgrade was requested on
 * @param status HTTP status code
 */
function rejectUpgrade(socket: Duplex, status: number) {
  if (!socket.writable) return void socket.destroy();
  socket.end(
    `HTTP/1.1 ${status} ${STATUS_CODES[status]}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
  );
}
