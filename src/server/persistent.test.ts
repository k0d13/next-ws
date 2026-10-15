import { afterEach, describe, expect, it, vi } from 'vitest';
import * as persistent from './persistent.js';

const logger = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock('next/dist/build/output/log.js', () => logger);

const keys = [
  'next-ws.http-server',
  'next-ws.websocket-server',
  'next-ws.request-store',
  'next-ws.adapter',
  'next-ws.rooms',
];
afterEach(() => {
  for (const key of keys) Reflect.deleteProperty(globalThis, Symbol.for(key));
});

describe.each([
  ['HttpServer', 'next-ws.http-server'],
  ['WebSocketServer', 'next-ws.websocket-server'],
  ['RequestStorage', 'next-ws.request-store'],
] as const)('%s', (name, key) => {
  const get = persistent[`get${name}`] as () => unknown;
  const set = persistent[`set${name}`] as (value: unknown) => boolean;
  const use = persistent[`use${name}`] as (getter: () => unknown) => unknown;

  it('is undefined until set', () => {
    expect(get()).toBeUndefined();
  });

  it('returns the value that was set', () => {
    const value = {};
    set(value);
    expect(get()).toBe(value);
  });

  it('stores the value on globalThis under a registered symbol', () => {
    // Patched Next.js code and bundled route code each load their own copy of
    // next-ws, so the value has to live somewhere they can all reach
    const value = {};
    set(value);
    expect(Reflect.get(globalThis, Symbol.for(key))).toBe(value);
  });

  it('creates the value once with use', () => {
    const first = use(() => ({ n: 1 }));
    const second = use(() => ({ n: 2 }));
    expect(second).toBe(first);
    expect(get()).toBe(first);
  });

  it('prefers a value set earlier over the getter', () => {
    const value = {};
    set(value);
    expect(use(() => ({}))).toBe(value);
  });
});

describe('Adapter', () => {
  it('returns the adapter that was set', () => {
    const adapter = { broadcast() {}, subscribe() {}, unsubscribe() {}, close() {} };
    persistent.setAdapter(adapter);
    expect(persistent.getAdapter()).toBe(adapter);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('warns when set after rooms were first used', () => {
    persistent.useRooms(() => ({}) as never);
    persistent.setAdapter(undefined);
    expect(logger.warn).toHaveBeenCalledOnce();
  });
});
