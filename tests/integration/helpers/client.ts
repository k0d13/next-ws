import type { IncomingMessage } from 'node:http';
import { type ClientOptions, type RawData, WebSocket } from 'ws';

const defaultTimeout = 30_000;

export interface Closed {
  code: number;
  reason: string;
}

export interface Client {
  socket: WebSocket;
  send(data: string | Buffer): void;
  /** Wait for the next message as text. */
  next(timeout?: number): Promise<string>;
  /** Wait for the next message and parse it as JSON. */
  json<T = unknown>(timeout?: number): Promise<T>;
  /** Wait for the next message, keeping binary messages as buffers. */
  raw(timeout?: number): Promise<{ data: RawData; isBinary: boolean }>;
  /** Resolves when the server closes the connection. */
  closed: Promise<Closed>;
  close(): Promise<Closed>;
}

/**
 * Open a WebSocket connection and queue every message it receives, so tests wait for messages
 * rather than for time to pass.
 *
 * @param url WebSocket URL
 * @param options Options passed to `ws`
 * @returns Connected client
 */
export async function connect(url: string, options?: ClientOptions): Promise<Client> {
  const socket = new WebSocket(url, options);
  const queue: { data: RawData; isBinary: boolean }[] = [];
  const waiting: ((message: { data: RawData; isBinary: boolean }) => void)[] = [];

  socket.on('message', (data, isBinary) => {
    const message = { data, isBinary };
    const resolve = waiting.shift();
    if (resolve) resolve(message);
    else queue.push(message);
  });

  const closed = new Promise<Closed>((resolve) =>
    socket.once('close', (code, reason) => resolve({ code, reason: reason.toString() })),
  );

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out connecting to ${url}`)),
      defaultTimeout,
    );
    socket.once('open', () => (clearTimeout(timer), resolve()));
    socket.once('error', (error) => (clearTimeout(timer), reject(error)));
    socket.once('unexpected-response', (_, response) => {
      clearTimeout(timer);
      reject(new Error(`Unexpected response ${response.statusCode} from ${url}`));
    });
  });

  function raw(timeout = defaultTimeout) {
    const queued = queue.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise<{ data: RawData; isBinary: boolean }>((resolve, reject) => {
      const timer = setTimeout(() => {
        waiting.splice(waiting.indexOf(handle), 1);
        reject(new Error(`Timed out waiting for a message from ${url}`));
      }, timeout);
      const handle = (message: { data: RawData; isBinary: boolean }) => {
        clearTimeout(timer);
        resolve(message);
      };
      waiting.push(handle);
      // The connection closing means no message is coming
      void closed.then(({ code }) => {
        if (!waiting.includes(handle)) return;
        clearTimeout(timer);
        waiting.splice(waiting.indexOf(handle), 1);
        reject(new Error(`Connection closed with ${code} while waiting for a message`));
      });
    });
  }

  const next = (timeout?: number) => raw(timeout).then(({ data }) => data.toString());

  return {
    socket,
    send: (data) => socket.send(data),
    next,
    json: <T>(timeout?: number) => next(timeout).then((text) => JSON.parse(text) as T),
    raw,
    closed,
    close() {
      if (socket.readyState !== WebSocket.CLOSED) socket.close();
      return closed;
    },
  };
}

export type Rejection =
  | { type: 'response'; statusCode: number }
  | { type: 'error'; message: string }
  | { type: 'closed'; code: number };

/**
 * Attempt a WebSocket connection that is expected to fail, and describe how it failed.
 *
 * @param url WebSocket URL
 * @param options Options passed to `ws`
 * @returns How the upgrade was rejected
 */
export async function reject(url: string, options?: ClientOptions): Promise<Rejection> {
  const socket = new WebSocket(url, options);
  return new Promise<Rejection>((resolve, rejectPromise) => {
    const timer = setTimeout(() => {
      socket.terminate();
      rejectPromise(new Error(`Upgrade to ${url} was neither accepted nor rejected`));
    }, defaultTimeout);
    const done = (rejection: Rejection) => {
      clearTimeout(timer);
      resolve(rejection);
    };

    socket.once('open', () => {
      socket.close();
      clearTimeout(timer);
      rejectPromise(new Error(`Upgrade to ${url} was accepted`));
    });
    socket.once('unexpected-response', (_, response: IncomingMessage) => {
      done({ type: 'response', statusCode: response.statusCode ?? 0 });
      response.destroy();
    });
    socket.once('error', (error) => done({ type: 'error', message: error.message }));
  });
}
