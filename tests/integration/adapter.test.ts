import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startBroker } from './helpers/broker.js';
import { connect } from './helpers/client.js';
import { buildFixture, modes, type Server, startFixture } from './helpers/server.js';

// A real Redis when REDIS_URL is set, as it is in CI, otherwise a stand-in broker
const redisUrl = process.env.REDIS_URL;
const backend = redisUrl ? 'redis' : 'broker';

describe.each(modes)(`adapter with ${backend} (%s)`, (mode) => {
  let one: Server;
  let two: Server;
  let broker: Awaited<ReturnType<typeof startBroker>> | undefined;
  beforeAll(async () => {
    if (mode === 'prod') buildFixture('adapter', '.next-prod');
    if (!redisUrl) broker = await startBroker();
    const env: Record<string, string> = redisUrl
      ? { REDIS_URL: redisUrl }
      : { BROKER_URL: broker!.url };
    // Two dev servers cannot share a build directory, two production servers can
    const start = (id: string) =>
      startFixture({
        fixture: 'adapter',
        mode,
        distDir: mode === 'dev' ? `.next-dev-${id}` : '.next-prod',
        env: { INSTANCE_ID: id, ...env },
      });
    [one, two] = await Promise.all([start('one'), start('two')]);
  });
  afterAll(async () => {
    await Promise.all([one?.stop(), two?.stop()]);
    await broker?.stop();
  });

  /** Connect to an instance and wait for its greeting, so the subscription is in place. */
  async function join(server: Server, path = '/api/rooms/general') {
    const client = await connect(server.wsUrl(path));
    await client.next();
    return client;
  }

  it('connects to each instance', async () => {
    const a = await connect(one.wsUrl('/api/rooms/general'));
    const b = await connect(two.wsUrl('/api/rooms/general'));
    expect(await a.next()).toBe('instance:one');
    expect(await b.next()).toBe('instance:two');
    await Promise.all([a.close(), b.close()]);
  });

  it('delivers messages to clients on another instance', async () => {
    const a = await join(one);
    const b = await join(two);
    a.send('hello from one');
    expect(await b.next()).toBe('hello from one');
    b.send('hello from two');
    expect(await a.next()).toBe('hello from two');
    await Promise.all([a.close(), b.close()]);
  });

  it('delivers messages to every client on an instance', async () => {
    const a = await join(one);
    const b = await join(one);
    const c = await join(two);
    c.send('to everyone');
    expect(await a.next()).toBe('to everyone');
    expect(await b.next()).toBe('to everyone');
    await Promise.all([a.close(), b.close(), c.close()]);
  });

  it('does not echo a message back to its sender', async () => {
    const a = await join(one);
    const b = await join(two);
    a.send('first');
    expect(await b.next()).toBe('first');
    // If `first` had come back to `a`, it would arrive before `second`
    b.send('second');
    expect(await a.next()).toBe('second');
    await Promise.all([a.close(), b.close()]);
  });

  it('keeps binary messages binary across instances', async () => {
    const a = await join(one);
    const b = await join(two);
    a.send(Buffer.from([0, 1, 255]));
    const { data, isBinary } = await b.raw();
    expect(isBinary).toBe(true);
    expect([...(data as Buffer)]).toEqual([0, 1, 255]);
    await Promise.all([a.close(), b.close()]);
  });

  it('keeps rooms separate', async () => {
    const a = await join(one, '/api/rooms/general');
    const b = await join(two, '/api/rooms/general');
    const c = await join(two, '/api/rooms/other');
    const d = await join(one, '/api/rooms/other');
    a.send('for general');
    d.send('for other');
    expect(await b.next()).toBe('for general');
    // `c` would see `for general` first if rooms leaked into each other
    expect(await c.next()).toBe('for other');
    await Promise.all([a.close(), b.close(), c.close(), d.close()]);
  });

  it('keeps delivering after a client reconnects', async () => {
    const a = await join(one);
    const first = await join(two);
    await first.close();
    const second = await join(two);
    a.send('after reconnect');
    expect(await second.next()).toBe('after reconnect');
    await Promise.all([a.close(), second.close()]);
  });
});
