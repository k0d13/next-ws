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

// ===== HTTP Server ===== //

const [getHttpServer, setHttpServer, useHttpServer] = //
  useGlobal<import('node:http').Server>(
    Symbol.for('next-ws.http-server'), //
  );

export {
  /**
   * Get the HTTP server instance.
   *
   * @returns Existing HTTP server instance if set
   */
  getHttpServer,
  /**
   * Set the HTTP server instance, for a custom server. Call it before Next.js starts.
   *
   * @param value HTTP server instance
   */
  setHttpServer,
  /**
   * Get or set the HTTP server instance.
   *
   * @param getter Function to get the HTTP server instance
   * @returns Existing or created HTTP server instance
   */
  useHttpServer,
};

// ===== WebSocket Server ===== //

const [getWebSocketServer, setWebSocketServer, useWebSocketServer] = //
  useGlobal<import('ws').WebSocketServer>(
    Symbol.for('next-ws.websocket-server'), //
  );

export {
  /**
   * Get the WebSocket server instance.
   *
   * @returns Existing WebSocket server instance if one has been set or created
   */
  getWebSocketServer,
  /**
   * Set the WebSocket server instance, such as one with a lower `maxPayload`. Call it before the
   * first connection, in a custom server or in `register()` of `instrumentation.ts`.
   *
   * @param value WebSocket server instance, created with `noServer: true`
   */
  setWebSocketServer,
  /**
   * Get or set the WebSocket server instance.
   *
   * @param getter Function to get the WebSocket server instance
   * @returns Existing or created WebSocket server instance
   */
  useWebSocketServer,
};

// ===== Request Storage ===== //

const [getRequestStorage, setRequestStorage, useRequestStorage] = //
  useGlobal<RequestStorage>(
    Symbol.for('next-ws.request-store'), //
  );

export {
  /**
   * Get the request storage instance.
   *
   * @returns Existing request storage instance if even
   */
  getRequestStorage,
  /**
   * Set the request storage instance.
   *
   * @param value Request storage instance
   */
  setRequestStorage,
  /**
   * Get or set the request storage instance.
   *
   * @param getter Function to get the request storage instance
   * @returns Existing or created request storage instance
   */
  useRequestStorage,
};

// ===== Rooms ===== //

const [getRooms, , useRooms] = //
  useGlobal<Rooms>(
    Symbol.for('next-ws.rooms'), //
  );

export {
  /**
   * Get or create the rooms every copy of next-ws shares.
   *
   * @param getter Function to create the rooms
   * @returns Existing or created rooms
   */
  useRooms,
};

// ===== Adapter ===== //

const [getAdapter, setAdapterValue] = //
  useGlobal<Adapter | undefined>(
    Symbol.for('next-ws.adapter'), //
  );

/**
 * Set the adapter that connects rooms across instances. Call it before the first client joins a
 * room, in a custom server or in `register()` of `instrumentation.ts`.
 *
 * @param value Adapter instance
 */
function setAdapter(value: Adapter | undefined) {
  if (getRooms())
    logger.warn('[next-ws] setAdapter() was called after rooms were first used, it has no effect');
  return setAdapterValue(value);
}

export {
  /**
   * Get the adapter instance.
   *
   * @returns Existing adapter instance if set
   */
  getAdapter,
  setAdapter,
};
