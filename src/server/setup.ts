import { AsyncLocalStorage } from 'node:async_hooks';
import * as logger from 'next/dist/build/output/log.js';
import type NextNodeServer from 'next/dist/server/next-server.js';
import * as import_ws from 'ws';
import { findMatchingRoute } from './helpers/match.js';
import { importRouteModule } from './helpers/module.js';
import { toNextRequest } from './helpers/request.js';
import { createRequestStore } from './helpers/store.js';
import {
  useHttpServer,
  useRequestStorage,
  useWebSocketServer,
} from './persistent.js';

const WebSocketServer =
  import_ws.WebSocketServer ||
  (import_ws as { Server?: typeof import_ws.WebSocketServer }).Server;

/**
 * Attach the WebSocket server to the HTTP server.
 * @param nextServer Next.js Node server instance
 */
export function setupWebSocketServer(nextServer: NextNodeServer) {
  const httpServer = //
    // @ts-expect-error - serverOptions is protected
    useHttpServer(() => nextServer.serverOptions?.httpServer);
  if (!httpServer)
    return logger.error('[next-ws] was not able to find the HTTP server');
  const wsServer = //
    useWebSocketServer(() => new WebSocketServer({ noServer: true }));
  const requestStorage = //
    useRequestStorage(() => new AsyncLocalStorage());

  logger.ready('[next-ws] has started the WebSocket server');

  // Prevent double-attaching
  const kAttached = Symbol.for('next-ws.http-server.attached');
  if (Reflect.has(httpServer, kAttached)) return;
  Reflect.set(httpServer, kAttached, true);

  httpServer.on('upgrade', async (message, socket, head) => {
    const request = toNextRequest(message);

    const pathname = request.nextUrl.pathname;
    if (pathname.includes('/_next')) return;

    const route = findMatchingRoute(nextServer, pathname);
    if (!route) {
      logger.error(`[next-ws] could not find route for page ${pathname}`);
      return socket.end();
    }

    const module = await importRouteModule(nextServer, route.filename);
    if (!module) {
      logger.error(`[next-ws] could not import module for page ${pathname}`);
      return socket.end();
    }

    const handleUpgrade = module.userland.UPGRADE;
    const handleSocket = module.userland.SOCKET;
    if (
      (!handleUpgrade || typeof handleUpgrade !== 'function') &&
      (!handleSocket || typeof handleSocket !== 'function')
    ) {
      logger.error(`[next-ws] route '${pathname}' does not export a handler`);
      return socket.end();
    }
    if (handleSocket)
      logger.warnOnce(
        'DeprecationWarning: [next-ws] SOCKET is deprecated, prefer UPGRADE instead, see https://github.com/k0d13/next-ws#-usage',
      );

    wsServer.handleUpgrade(message, socket, head, async (client) => {
      wsServer.emit('connection', client, message);

      try {
        const context = { params: route.params };
        if (handleUpgrade) {
          await requestStorage.run(
            createRequestStore(request), //
            () => handleUpgrade(client, wsServer, request, context),
          );
        }
        //
        else if (handleSocket) {
          const handleClose = //
            await handleSocket(client, message, wsServer, context);
          if (typeof handleClose === 'function')
            client.once('close', () => handleClose());
        }
      } catch (cause) {
        logger.error(
          `[next-ws] error in socket handler for '${pathname}'`,
          cause,
        );
        try {
          client.close(1011, 'Internal Server Error');
        } catch {}
      }
    });

    return;
  });
}
