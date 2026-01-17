import { AsyncLocalStorage } from 'node:async_hooks';
import * as logger from 'next/dist/build/output/log.js';
import type NextNodeServer from 'next/dist/server/next-server.js';
import { WebSocketServer, WebSocket } from 'ws';
import type { Adapter } from './helpers/adapter.js';
import { findMatchingRoute } from './helpers/match.js';
import { importRouteModule } from './helpers/module.js';
import { toNextRequest } from './helpers/request.js';
import { createRequestStore } from './helpers/store.js';
import {
  useHttpServer,
  useRequestStorage,
  useWebSocketServer,
} from './persistent.js';

export interface SetupOptions {
  adapter?: Adapter;
}

/**
 * Attach the WebSocket server to the HTTP server.
 * @param nextServer Next.js Node server instance
 * @param options Setup options including optional adapter
 */
export function setupWebSocketServer(
  nextServer: NextNodeServer,
  options?: SetupOptions,
) {
  const httpServer = //
    // @ts-expect-error - serverOptions is protected
    useHttpServer(() => nextServer.serverOptions?.httpServer);
  if (!httpServer)
    return logger.error('[next-ws] was not able to find the HTTP server');
  const wsServer = //
    useWebSocketServer(() => new WebSocketServer({ noServer: true }));
  const requestStorage = //
    useRequestStorage(() => new AsyncLocalStorage());
  const adapter = options?.adapter;

  if (adapter) {
    logger.ready('[next-ws] adapter configured for multi-instance support');
  } else {
    logger.ready('[next-ws] has started the WebSocket server');
  }

  // Prevent double-attaching
  const kAttached = Symbol.for('next-ws.http-server.attached');
  if (Reflect.has(httpServer, kAttached)) return;
  Reflect.set(httpServer, kAttached, true);

  // Store route -> clients mapping for adapter broadcasts
  const routeClients = new Map<string, Set<import('ws').WebSocket>>();

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
        'DeprecationWarning: [next-ws] SOCKET is deprecated, prefer UPGRADE instead, see https://github.com/apteryxxyz/next-ws#-usage',
      );

    wsServer.handleUpgrade(message, socket, head, async (client) => {
      wsServer.emit('connection', client, message);

      // Track client by route for adapter
      if (adapter) {
        if (!routeClients.has(pathname)) {
          routeClients.set(pathname, new Set());

          // Subscribe to adapter messages for this route
          adapter.onMessage(pathname, (message: unknown) => {
            const clients = routeClients.get(pathname);
            if (!clients) return;

            for (const localClient of clients) {
              if (localClient.readyState === WebSocket.OPEN) {
                localClient.send(
                  typeof message === 'string'
                    ? message
                    : JSON.stringify(message),
                );
              }
            }
          });
        }
        routeClients.get(pathname)?.add(client);
      }

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

        // Intercept client messages to broadcast via adapter
        if (adapter) {
          client.on('message', (data) => {
            adapter.broadcast(pathname, data).catch((err: unknown) => {
              logger.error('[next-ws] adapter broadcast failed:', err);
            });
          });
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

      client.once('close', () => {
        if (adapter) {
          routeClients.get(pathname)?.delete(client);
        }
      });
    });

    return;
  });

  // Cleanup adapter on server close
  if (adapter) {
    httpServer.once('close', async () => {
      await adapter.close().catch((err: unknown) => {
        logger.error('[next-ws] adapter cleanup failed:', err);
      });
    });
  }
}
