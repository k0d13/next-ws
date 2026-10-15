import { AsyncLocalStorage, AsyncResource } from 'node:async_hooks';
import { type IncomingMessage, STATUS_CODES } from 'node:http';
import type { Duplex } from 'node:stream';
import * as logger from 'next/dist/build/output/log.js';
import type NextNodeServer from 'next/dist/server/next-server.js';
import { WebSocketServer } from 'ws';
import type { Adapter } from './helpers/adapter.js';
import { findMatchingRoute } from './helpers/match.js';
import { importRouteModule } from './helpers/module.js';
import { toNextRequest } from './helpers/request.js';
import { Rooms } from './helpers/rooms.js';
import { createRequestStore } from './helpers/store.js';
import { useHttpServer, useRequestStorage, useWebSocketServer } from './persistent.js';

export interface SetupOptions {
  adapter?: Adapter;
}

/**
 * Attach the WebSocket server to the HTTP server.
 *
 * @param nextServer Next.js Node server instance
 * @param options Setup options including optional adapter
 */
export function setupWebSocketServer(nextServer: NextNodeServer, options?: SetupOptions) {
  const httpServer = //
    // @ts-expect-error - serverOptions is protected
    useHttpServer(() => nextServer.serverOptions?.httpServer);
  if (!httpServer) return logger.error('[next-ws] was not able to find the HTTP server');
  const wsServer = //
    useWebSocketServer(() => new WebSocketServer({ noServer: true }));
  const requestStorage = //
    useRequestStorage(() => new AsyncLocalStorage());
  const adapter = options?.adapter;
  // @ts-expect-error - serverOptions is protected
  const basePath: string = nextServer.serverOptions?.conf.basePath || '';

  // Prevent double-attaching
  const kAttached = Symbol.for('next-ws.http-server.attached');
  if (Reflect.has(httpServer, kAttached)) return;
  Reflect.set(httpServer, kAttached, true);

  if (adapter) logger.ready('[next-ws] has started the WebSocket server with an adapter');
  else logger.ready('[next-ws] has started the WebSocket server');

  const rooms = adapter ? new Rooms(adapter) : undefined;

  async function handleUpgrade(message: IncomingMessage, socket: Duplex, head: Buffer) {
    // Next.js handles its own sockets, such as HMR
    if (message.url?.startsWith(`${basePath}/_next/`)) return;

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
      logger.error(`[next-ws] could not find route for page ${pathname}`);
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
      logger.error(`[next-ws] route '${pathname}' does not export an UPGRADE handler`);
      return rejectUpgrade(socket, 404);
    }

    wsServer.handleUpgrade(message, socket, head, (client) => {
      wsServer.emit('connection', client, message);

      void requestStorage
        .run(createRequestStore(request), async () => {
          // Emit every event in this request's context, so `headers()` and `cookies()` keep
          // working inside listeners the handler adds
          client.emit = AsyncResource.bind(client.emit, 'next-ws.client', client);

          if (rooms) {
            await rooms.join(pathname, client);
            client.on('message', (data, isBinary) => {
              rooms.publish(pathname, client, data, isBinary).catch((cause: unknown) => {
                logger.error(`[next-ws] adapter could not broadcast for '${pathname}'`, cause);
              });
            });
            client.once('close', () => {
              rooms.leave(pathname, client).catch((cause: unknown) => {
                logger.error(`[next-ws] adapter could not unsubscribe from '${pathname}'`, cause);
              });
            });
          }

          await handler(client, wsServer, request, { params: route.params });
        })
        .catch((cause: unknown) => {
          logger.error(`[next-ws] error in socket handler for '${pathname}'`, cause);
          try {
            client.close(1011, 'Internal Server Error');
          } catch {}
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

  // Cleanup adapter on server close
  if (adapter) {
    httpServer.once('close', async () => {
      try {
        await adapter.close();
      } catch (cause) {
        logger.error('[next-ws] adapter cleanup failed:', cause);
      }
    });
  }
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
