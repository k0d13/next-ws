import { IncomingMessage } from 'node:http';
import { Socket } from 'node:net';
import { TLSSocket } from 'node:tls';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { toNextRequest } from './request.js';

function createMessage(options: {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  socket?: Socket;
}) {
  const message = new IncomingMessage(options.socket ?? new Socket());
  message.url = options.url ?? '/';
  message.method = options.method ?? 'GET';
  message.headers = { host: 'localhost:3000', ...options.headers };
  return message;
}

describe('toNextRequest', () => {
  it('returns a NextRequest', () => {
    expect(toNextRequest(createMessage({}))).toBeInstanceOf(NextRequest);
  });

  it('builds the URL from the Host header and request path', () => {
    const request = toNextRequest(createMessage({ url: '/api/ws?room=general' }));
    expect(request.url).toBe('http://localhost:3000/api/ws?room=general');
    expect(request.nextUrl.pathname).toBe('/api/ws');
    expect(request.nextUrl.searchParams.get('room')).toBe('general');
  });

  it('uses https for encrypted sockets', () => {
    const socket = new TLSSocket(new Socket());
    const request = toNextRequest(createMessage({ socket }));
    expect(request.url).toBe('https://localhost:3000/');
    socket.destroy();
  });

  it('copies the method and headers', () => {
    const request = toNextRequest(
      createMessage({
        headers: { upgrade: 'websocket', 'sec-websocket-protocol': 'chat' },
      }),
    );
    expect(request.method).toBe('GET');
    expect(request.headers.get('upgrade')).toBe('websocket');
    expect(request.headers.get('sec-websocket-protocol')).toBe('chat');
  });

  it('exposes cookies from the Cookie header', () => {
    const request = toNextRequest(
      createMessage({ headers: { cookie: 'session=abc; theme=dark' } }),
    );
    expect(request.cookies.get('session')?.value).toBe('abc');
    expect(request.cookies.get('theme')?.value).toBe('dark');
  });

  it('passes the Referer header through as the referrer', () => {
    const request = toNextRequest(
      createMessage({ headers: { referer: 'http://localhost:3000/chat' } }),
    );
    expect(request.referrer).toBe('http://localhost:3000/chat');
  });

  it('aborts the request signal when the message is aborted', () => {
    const message = createMessage({});
    const request = toNextRequest(message);
    expect(request.signal.aborted).toBe(false);
    message.emit('aborted');
    expect(request.signal.aborted).toBe(true);
  });

  // Bug 2 in the handoff: a malformed Host header throws, and the caller does not catch it
  it('throws for a malformed Host header', () => {
    expect(() => toNextRequest(createMessage({ headers: { host: 'a b' } }))).toThrow();
  });
});
