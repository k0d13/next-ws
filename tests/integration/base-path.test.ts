import * as semver from 'semver';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, reject } from './helpers/client.js';
import { buildFixture, modes, nextVersion, type Server, startFixture } from './helpers/server.js';

describe.each(modes)('base path (%s)', (mode) => {
  let server: Server;
  beforeAll(async () => {
    if (mode === 'prod') buildFixture('base-path', '.next-prod');
    server = await startFixture({ fixture: 'base-path', mode });
  });
  afterAll(() => server?.stop());

  it('serves routes under the base path', async () => {
    const client = await connect(server.wsUrl('/base/api/ws'));
    client.send('hello');
    expect(await client.next()).toBe('hello');
    await client.close();
  });

  it('rejects routes outside the base path', async () => {
    expect(await reject(server.wsUrl('/api/ws'))).toEqual({ type: 'response', statusCode: 404 });
  });

  it.runIf(mode === 'dev')('leaves the Next.js HMR socket under the base path alone', async () => {
    // CHANGE(next@16): HMR moved from /_next/webpack-hmr to /_next/hmr
    const path = semver.major(nextVersion) >= 16 ? '/_next/hmr' : '/_next/webpack-hmr';
    const client = await connect(server.wsUrl(`/base${path}`));
    await client.close();
  });
});
