import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect } from './helpers/client.js';
import { buildFixture, modes, type Server, startFixture } from './helpers/server.js';

describe.each(modes)('custom server (%s)', (mode) => {
  let server: Server;
  beforeAll(async () => {
    if (mode === 'prod') buildFixture('custom-server', '.next-prod');
    server = await startFixture({ fixture: 'custom-server', mode, script: 'server.mjs' });
  });
  afterAll(() => server?.stop());

  it('uses the HTTP server set with setHttpServer', async () => {
    const client = await connect(server.wsUrl('/api/ws'));
    expect(await client.json()).toEqual({ customServer: true });
    client.send('hello');
    expect(await client.next()).toBe('hello');
    await client.close();
  });

  it('still serves requests the custom server handles itself', async () => {
    const response = await fetch(server.url('/health'));
    expect(await response.text()).toBe('ok');
  });

  it('starts the WebSocket server once', () => {
    expect(server.output().match(/\[next-ws\] has started/g) ?? []).toHaveLength(1);
  });
});
