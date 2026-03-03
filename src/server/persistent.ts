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
   * @returns Existing HTTP server instance if even
   */
  getHttpServer,
  /**
   * Set the HTTP server instance.
   * @param value HTTP server instance
   */
  setHttpServer,
  /**
   * Get or set the HTTP server instance.
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
   * @returns Existing WebSocket server instance if even
   */
  getWebSocketServer,
  /**
   * Set the WebSocket server instance.
   * @param value WebSocket server instance
   */
  setWebSocketServer,
  /**
   * Get or set the WebSocket server instance.
   * @param getter Function to get the WebSocket server instance
   * @returns Existing or created WebSocket server instance
   */
  useWebSocketServer,
};

// ===== Request Storage ===== //

const [getRequestStorage, setRequestStorage, useRequestStorage] = //
  useGlobal<import('./helpers/store').RequestStorage>(
    Symbol.for('next-ws.request-store'), //
  );

export {
  /**
   * Get the request storage instance.
   * @returns Existing request storage instance if even
   */
  getRequestStorage,
  /**
   * Set the request storage instance.
   * @param value Request storage instance
   */
  setRequestStorage,
  /**
   * Get or set the request storage instance.
   * @param getter Function to get the request storage instance
   * @returns Existing or created request storage instance
   */
  useRequestStorage,
};

// ===== Adapter ===== //

const [getAdapter, setAdapter, useAdapter] = //
  useGlobal<import('./helpers/adapter').Adapter | undefined>(
    Symbol.for('next-ws.adapter'), //
  );

export {
  /**
   * Get the adapter instance.
   * @returns Existing adapter instance if set
   */
  getAdapter,
  /**
   * Set the adapter instance.
   * @param value Adapter instance
   */
  setAdapter,
  /**
   * Get or set the adapter instance.
   * @param getter Function to get the adapter instance
   * @returns Existing or created adapter instance
   */
  useAdapter,
};
