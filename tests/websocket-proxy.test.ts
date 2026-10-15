import type { AddressInfo } from 'node:net';
import { expect, test } from '@playwright/test';
import type { NextRequest } from 'next/server';
import { type RawData, WebSocket, WebSocketServer } from 'ws';
import { UPGRADE } from '../examples/websocket-proxy/app/api/proxy/[...path]/route';

test.use({ baseURL: 'http://localhost:3006' });

test.describe('WebSocket Proxy', () => {
  test('connects through the proxy to the upstream path', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('li').first()).toHaveText(
      'Connected to upstream at /custom/path',
    );
  });

  test('forwards messages both ways', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('li').first()).toBeVisible();

    await page.fill('input[name=message]', 'hello');
    await page.click('button[type=submit]');
    await expect(page.locator('li').last()).toHaveText('Echo: hello');
  });
});

// Runs the proxy route in process against an upstream whose handshake can be
// held back, so messages are sent while the upstream is still connecting
test.describe('WebSocket Proxy forwarding', () => {
  const servers: WebSocketServer[] = [];
  const previousUpstream = process.env.UPSTREAM_URL;

  test.afterEach(async () => {
    for (const server of servers.splice(0)) {
      for (const client of server.clients) client.terminate();
      await new Promise((resolve) => server.close(resolve));
    }
    process.env.UPSTREAM_URL = previousUpstream;
  });

  async function listen(
    options: ConstructorParameters<typeof WebSocketServer>[0],
  ) {
    const server = new WebSocketServer({ ...options, port: 0 });
    servers.push(server);
    await new Promise((resolve) => server.once('listening', resolve));
    return { server, port: (server.address() as AddressInfo).port };
  }

  async function startProxy(handshakeDelay: number) {
    const upstreamPaths: string[] = [];
    const upstream = await listen({
      verifyClient: (info, callback) => {
        upstreamPaths.push(info.req.url ?? '');
        setTimeout(() => callback(true), handshakeDelay);
      },
    });
    upstream.server.on('connection', (socket) =>
      socket.on('message', (data, isBinary) =>
        socket.send(data, { binary: isBinary }),
      ),
    );
    process.env.UPSTREAM_URL = `ws://localhost:${upstream.port}`;

    const proxy = await listen({});
    proxy.server.on('connection', (client, request) => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      UPGRADE(
        client,
        proxy.server,
        { nextUrl: url } as unknown as NextRequest,
        {
          params: { path: url.pathname.split('/').filter(Boolean) },
        },
      );
    });

    return { proxyPort: proxy.port, upstreamPaths };
  }

  test('delivers messages sent before the upstream is open', async () => {
    const { proxyPort, upstreamPaths } = await startProxy(500);
    const client = new WebSocket(`ws://localhost:${proxyPort}/a/b?x=1`);

    const received: [RawData, boolean][] = [];
    const done = new Promise<void>((resolve) =>
      client.on('message', (data, isBinary) => {
        received.push([data, isBinary]);
        if (received.length === 2) resolve();
      }),
    );
    client.once('open', () => {
      client.send('queued text');
      client.send(Buffer.from([0, 1, 2, 255]));
    });
    await done;
    client.close();

    expect(upstreamPaths).toEqual(['/a/b?x=1']);
    expect(
      received.map(([data, isBinary]) => [[...(data as Buffer)], isBinary]),
    ).toEqual([
      [[...Buffer.from('queued text')], false],
      [[0, 1, 2, 255], true],
    ]);
  });

  test('closes the client when too much is queued', async () => {
    const { proxyPort } = await startProxy(60_000);
    const client = new WebSocket(`ws://localhost:${proxyPort}/stalled`);

    const closed = new Promise<number>((resolve) =>
      client.once('close', (code) => resolve(code)),
    );
    client.once('open', () => client.send(Buffer.alloc(2 * 1024 * 1024)));

    expect(await closed).toBe(1009);
  });
});
