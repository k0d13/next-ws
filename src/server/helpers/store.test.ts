import { describe, expect, it } from 'vitest';
import { createRequestStore } from './store.js';

function createRequest(headers: Record<string, string>) {
  return new Request('http://localhost:3000/api/ws', { headers });
}

describe('createRequestStore', () => {
  it('exposes the request headers', () => {
    const store = createRequestStore(createRequest({ 'x-user': 'alice' }));
    expect(store.headers.get('x-user')).toBe('alice');
  });

  it('copies the headers rather than sharing them', () => {
    const request = createRequest({ 'x-user': 'alice' });
    const store = createRequestStore(request);
    request.headers.set('x-user', 'bob');
    expect(store.headers.get('x-user')).toBe('alice');
  });

  it.each(['append', 'set', 'delete'] as const)('throws when headers.%s is called', (method) => {
    const store = createRequestStore(createRequest({}));
    // @ts-expect-error - every method throws regardless of arguments
    expect(() => store.headers[method]('x-user', 'bob')).toThrow('Headers are read-only');
  });

  it('parses cookies from the Cookie header', () => {
    const store = createRequestStore(createRequest({ cookie: 'session=abc; theme=dark' }));
    expect(store.cookies.get('session')?.value).toBe('abc');
    expect(store.cookies.getAll().map((c) => c.name)).toEqual(['session', 'theme']);
    expect(store.cookies.has('theme')).toBe(true);
  });

  it('has no cookies without a Cookie header', () => {
    const store = createRequestStore(createRequest({}));
    expect(store.cookies.getAll()).toEqual([]);
  });

  it.each(['set', 'delete'] as const)('throws when cookies.%s is called', (method) => {
    const store = createRequestStore(createRequest({}));
    // @ts-expect-error - every method throws regardless of arguments
    expect(() => store.cookies[method]('session', 'xyz')).toThrow('Cookies are read-only');
  });
});
