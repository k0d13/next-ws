import { connect as connectTcp } from 'node:net';
import * as semver from 'semver';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, reject } from './helpers/client.js';
import { buildFixture, modes, nextVersion, type Server, startFixture } from './helpers/server.js';

describe.each(modes)('app router (%s)', (mode) => {
  let server: Server;
  beforeAll(async () => {
    if (mode === 'prod') buildFixture('app-router', '.next-prod');
    server = await startFixture({ fixture: 'app-router', mode });
  });
  afterAll(() => server?.stop());

  // ===== Upgrade ===== //

  describe('upgrade', () => {
    it('echoes text messages', async () => {
      const client = await connect(server.wsUrl('/api/echo'));
      client.send('hello');
      expect(await client.next()).toBe('hello');
      await client.close();
    });

    it('echoes binary messages', async () => {
      const client = await connect(server.wsUrl('/api/echo'));
      client.send(Buffer.from([1, 2, 3]));
      const { data, isBinary } = await client.raw();
      expect(isBinary).toBe(true);
      expect([...(data as Buffer)]).toEqual([1, 2, 3]);
      await client.close();
    });

    it('sends binary messages from the server', async () => {
      const client = await connect(server.wsUrl('/api/binary'));
      const { data, isBinary } = await client.raw();
      expect(isBinary).toBe(true);
      expect([...(data as Buffer)]).toEqual([0, 1, 2, 255]);
      await client.close();
    });

    it('keeps connections independent', async () => {
      const a = await connect(server.wsUrl('/api/echo'));
      const b = await connect(server.wsUrl('/api/echo'));
      a.send('from a');
      b.send('from b');
      expect(await a.next()).toBe('from a');
      expect(await b.next()).toBe('from b');
      await Promise.all([a.close(), b.close()]);
    });

    it('shares one WebSocket server between connections', async () => {
      const a = await connect(server.wsUrl('/api/broadcast'));
      const b = await connect(server.wsUrl('/api/broadcast'));
      expect(await a.next()).toBe('ready');
      expect(await b.next()).toBe('ready');
      a.send('to everyone');
      expect(await a.next()).toBe('to everyone');
      expect(await b.next()).toBe('to everyone');
      await Promise.all([a.close(), b.close()]);
    });

    it('still serves plain HTTP requests to the same route', async () => {
      const response = await fetch(server.url('/api/echo'));
      expect(response.status).toBe(426);
      expect(response.headers.get('upgrade')).toBe('websocket');
    });

    it('serves routes inside route groups', async () => {
      const client = await connect(server.wsUrl('/api/grouped'));
      expect(await client.next()).toBe('grouped');
      await client.close();
    });

    it.runIf(mode === 'dev')('leaves the Next.js HMR socket alone', async () => {
      // CHANGE(next@16): HMR moved from /_next/webpack-hmr to /_next/hmr
      const path = semver.major(nextVersion) >= 16 ? '/_next/hmr' : '/_next/webpack-hmr';
      const client = await connect(server.wsUrl(path));
      expect(client.socket.readyState).toBe(client.socket.OPEN);
      await client.close();
    });

    it('serves a root route', async () => {
      const client = await connect(server.wsUrl('/'));
      expect(await client.next()).toBe('root');
      await client.close();
    });
  });

  // ===== Parameters ===== //

  describe('parameters', () => {
    it('passes dynamic segments', async () => {
      const client = await connect(server.wsUrl('/api/params/42'));
      expect(await client.json()).toEqual({ id: '42' });
      await client.close();
    });

    it('decodes dynamic segments', async () => {
      const client = await connect(server.wsUrl('/api/params/hello%20world'));
      expect(await client.json()).toEqual({ id: 'hello world' });
      await client.close();
    });

    it('passes catch-all segments', async () => {
      const client = await connect(server.wsUrl('/api/catch-all/a/b/c'));
      expect(await client.json()).toEqual({ path: ['a', 'b', 'c'] });
      await client.close();
    });

    it('passes optional catch-all segments', async () => {
      const client = await connect(server.wsUrl('/api/optional/a/b'));
      expect(await client.json()).toEqual({ slug: ['a', 'b'] });
      await client.close();
    });

    it('passes no parameters for an empty optional catch-all', async () => {
      const client = await connect(server.wsUrl('/api/optional'));
      expect(await client.json()).toEqual({});
      await client.close();
    });

    it('does not mistake a segment containing _next for a Next.js path', async () => {
      const client = await connect(server.wsUrl('/api/params/_next-thing'));
      expect(await client.json()).toEqual({ id: '_next-thing' });
      await client.close();
    });
  });

  // ===== Request ===== //

  describe('request', () => {
    const options = { headers: { 'x-test': 'header-value', cookie: 'session=cookie-value' } };

    it('passes the request to UPGRADE', async () => {
      const client = await connect(server.wsUrl('/api/request?room=general'), options);
      expect(await client.json()).toMatchObject({
        pathname: '/api/request',
        search: '?room=general',
        requestHeader: 'header-value',
        requestCookie: 'cookie-value',
      });
      await client.close();
    });

    it('resolves headers() and cookies() inside UPGRADE', async () => {
      const client = await connect(server.wsUrl('/api/request'), options);
      expect(await client.json()).toMatchObject({ header: 'header-value', cookie: 'cookie-value' });
      await client.close();
    });

    it('resolves headers() and cookies() inside event callbacks', async () => {
      const client = await connect(server.wsUrl('/api/request'), options);
      await client.next();
      client.send('again');
      expect(await client.json()).toEqual({ header: 'header-value', cookie: 'cookie-value' });
      await client.close();
    });

    it('keeps request context separate between connections', async () => {
      const a = await connect(server.wsUrl('/api/request'), { headers: { 'x-test': 'a' } });
      const b = await connect(server.wsUrl('/api/request'), { headers: { 'x-test': 'b' } });
      expect(await a.json()).toMatchObject({ header: 'a' });
      expect(await b.json()).toMatchObject({ header: 'b' });
      await Promise.all([a.close(), b.close()]);
    });
  });

  // ===== Rejection ===== //

  describe('rejection', () => {
    it('rejects a path with no route with 404', async () => {
      expect(await reject(server.wsUrl('/api/does-not-exist'))).toEqual({
        type: 'response',
        statusCode: 404,
      });
    });

    it('rejects a route without an UPGRADE export with 404', async () => {
      expect(await reject(server.wsUrl('/api/no-handler'))).toEqual({
        type: 'response',
        statusCode: 404,
      });
    });

    it('closes with 1011 when UPGRADE throws', async () => {
      const client = await connect(server.wsUrl('/api/throws'));
      expect(await client.closed).toMatchObject({ code: 1011 });
    });

    it('closes with 1011 when UPGRADE rejects', async () => {
      const client = await connect(server.wsUrl('/api/async-throws'));
      expect(await client.closed).toMatchObject({ code: 1011 });
    });

    it('survives an upgrade with a malformed Host header', async () => {
      const response = await new Promise<string>((resolve, rejectPromise) => {
        const socket = connectTcp(server.port, '127.0.0.1', () => {
          socket.write(
            [
              'GET /api/echo HTTP/1.1',
              'Host: a b',
              'Upgrade: websocket',
              'Connection: Upgrade',
              'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
              'Sec-WebSocket-Version: 13',
              '',
              '',
            ].join('\r\n'),
          );
        });
        let data = '';
        socket.on('data', (chunk) => (data += chunk));
        socket.on('close', () => resolve(data));
        socket.on('error', rejectPromise);
      });

      expect(response).toMatch(/^HTTP\/1\.1 400/);
      expect(server.alive()).toBe(true);
      const client = await connect(server.wsUrl('/api/echo'));
      await client.close();
    });

    it('stays up after every rejection', async () => {
      expect(server.alive()).toBe(true);
      expect(server.output()).not.toMatch(/unhandledRejection|uncaughtException/);
    });
  });
});
