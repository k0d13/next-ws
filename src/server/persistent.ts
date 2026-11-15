import * as logger from 'next/dist/build/output/log.js';
import type { Adapter } from './helpers/adapter.js';
import type { Rooms } from './helpers/rooms.js';
import type { RequestStorage } from './helpers/store.js';

function useGlobal<T>(key: PropertyKey) {
  return [
    function get() {
      return Reflect.get(globalThis, key) as T | undefined;
    },
    function set(value: T) {
      return Reflect.set(globalThis, key, value);
    },
    function use(getter: () => T) {
      const existing = Reflect.get(globalThis, key);
      if (existing) return existing as T;
      Reflect.set(globalThis, key, getter());
      return Reflect.get(globalThis, key) as T;
    },
  ] as const;
}

const [getHttpServer, setHttpServer, useHttpServer] = //
  useGlobal<import('node:http').Server>(
    Symbol.for('next-ws.http-server'), //
  );

export {
  getHttpServer,
  /** Set the HTTP server, for a custom server. Call it before Next.js starts. */
  setHttpServer,
  useHttpServer,
};

const [getWebSocketServer, setWebSocketServer, useWebSocketServer] = //
  useGlobal<import('ws').WebSocketServer>(
    Symbol.for('next-ws.websocket-server'), //
  );

export {
  getWebSocketServer,
  /**
   * Set the WebSocket server instance, such as one with a lower `maxPayload`. Call it before the
   * first connection, in a custom server or in `register()` of `instrumentation.ts`.
   *
   * @param value WebSocket server instance, created with `noServer: true`
   */
  setWebSocketServer,
  useWebSocketServer,
};

const [getRequestStorage, setRequestStorage, useRequestStorage] = //
  useGlobal<RequestStorage>(
    Symbol.for('next-ws.request-store'), //
  );

export { getRequestStorage, setRequestStorage, useRequestStorage };

const [getRooms, , useRooms] = //
  useGlobal<Rooms>(
    Symbol.for('next-ws.rooms'), //
  );

export {
  /** Get or create the rooms every copy of next-ws shares. */
  useRooms,
};

const [getAdapter, setAdapterValue] = //
  useGlobal<Adapter | undefined>(
    Symbol.for('next-ws.adapter'), //
  );

/**
 * Set the adapter that connects rooms across instances. Call it before the first client joins a
 * room, in a custom server or in `register()` of `instrumentation.ts`.
 */
function setAdapter(value: Adapter | undefined) {
  if (getRooms())
    logger.warn('[next-ws] setAdapter() was called after rooms were first used, it has no effect');
  return setAdapterValue(value);
}

export { getAdapter, setAdapter };
