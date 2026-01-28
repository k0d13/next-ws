import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { expect, test } from '@playwright/test';

let instance1: ChildProcess;
let instance2: ChildProcess;
const PORT_1 = 3004;
const PORT_2 = 3005;

async function isRedisAvailable(): Promise<boolean> {
  try {
    const Redis = (await import('ioredis')).default;
    const testRedis = new Redis({
      host: 'localhost',
      port: 6379,
      retryStrategy: () => null,
      lazyConnect: true,
    });
    await testRedis.connect();
    await testRedis.ping();
    await testRedis.quit();
    return true;
  } catch {
    return false;
  }
}

test.describe('Redis Adapter Multi-Instance', () => {
  test.beforeAll(async () => {
    const redisAvailable = await isRedisAvailable();
    if (!redisAvailable) {
      test.skip();
      return;
    }

    instance1 = spawn('npm', ['run', 'dev'], {
      cwd: 'examples/redis-adapter',
      env: {
        ...process.env,
        PORT: String(PORT_1),
        INSTANCE_ID: 'instance-1',
        REDIS_URL: 'redis://localhost:6379',
      },
      stdio: 'pipe',
    });

    instance2 = spawn('npm', ['run', 'dev'], {
      cwd: 'examples/redis-adapter',
      env: {
        ...process.env,
        PORT: String(PORT_2),
        INSTANCE_ID: 'instance-2',
        REDIS_URL: 'redis://localhost:6379',
      },
      stdio: 'pipe',
    });

    await Promise.all([
      waitForServer(PORT_1, instance1),
      waitForServer(PORT_2, instance2),
    ]);

    await sleep(1000);
  });

  test.afterAll(async () => {
    if (instance1) {
      try {
        instance1.kill('SIGTERM');
      } catch {}
      await waitForProcessExit(instance1);
    }
    if (instance2) {
      try {
        instance2.kill('SIGTERM');
      } catch {}
      await waitForProcessExit(instance2);
    }
  });

  test('messages broadcast across instances via Redis adapter', async ({
    browser,
  }) => {
    const page1 = await browser.newPage();
    const page2 = await browser.newPage();

    try {
      await page1.goto(`http://localhost:${PORT_1}`);
      await page1.waitForLoadState('networkidle');

      await page2.goto(`http://localhost:${PORT_2}`);
      await page2.waitForLoadState('networkidle');

      await sleep(1000);

      const welcomeMessage1 = await page1.textContent('li:first-child');
      expect(welcomeMessage1).toContain('instance-1');

      const welcomeMessage2 = await page2.textContent('li:first-child');
      expect(welcomeMessage2).toContain('instance-2');

      await page1.fill('input[name=author]', 'Alice');
      await page1.fill('input[name=content]', 'Hello from instance 1!');
      await page1.click('button[type=submit]');

      await sleep(1500);

      const page1LastMessage = await page1.textContent('li:last-child');
      expect(page1LastMessage).toContain('Alice');
      expect(page1LastMessage).toContain('Hello from instance 1!');

      const page2LastMessage = await page2.textContent('li:last-child');
      expect(page2LastMessage).toContain('Alice');
      expect(page2LastMessage).toContain('Hello from instance 1!');

      await page2.fill('input[name=author]', 'Bob');
      await page2.fill('input[name=content]', 'Hello from instance 2!');
      await page2.click('button[type=submit]');

      await sleep(1500);

      const page2NewMessage = await page2.textContent('li:last-child');
      expect(page2NewMessage).toContain('Bob');
      expect(page2NewMessage).toContain('Hello from instance 2!');

      const page1NewMessage = await page1.textContent('li:last-child');
      expect(page1NewMessage).toContain('Bob');
      expect(page1NewMessage).toContain('Hello from instance 2!');
    } finally {
      await page1.close();
      await page2.close();
    }
  });

  test('multiple clients on same instance receive broadcasts from other instances', async ({
    browser,
  }) => {
    const page1a = await browser.newPage();
    const page1b = await browser.newPage();
    const page2 = await browser.newPage();

    try {
      await page1a.goto(`http://localhost:${PORT_1}`);
      await page1b.goto(`http://localhost:${PORT_1}`);
      await page2.goto(`http://localhost:${PORT_2}`);

      await page1a.waitForLoadState('networkidle');
      await page1b.waitForLoadState('networkidle');
      await page2.waitForLoadState('networkidle');

      await sleep(1000);

      await page2.fill('input[name=author]', 'Charlie');
      await page2.fill('input[name=content]', 'Broadcasting to all!');
      await page2.click('button[type=submit]');

      await sleep(1500);

      const message1a = await page1a.textContent('li:last-child');
      expect(message1a).toContain('Charlie');
      expect(message1a).toContain('Broadcasting to all!');

      const message1b = await page1b.textContent('li:last-child');
      expect(message1b).toContain('Charlie');
      expect(message1b).toContain('Broadcasting to all!');

      const message2 = await page2.textContent('li:last-child');
      expect(message2).toContain('Charlie');
      expect(message2).toContain('Broadcasting to all!');
    } finally {
      await page1a.close();
      await page1b.close();
      await page2.close();
    }
  });

  test('adapter handles client disconnection and reconnection', async ({
    browser,
  }) => {
    const page1 = await browser.newPage();
    const page2 = await browser.newPage();

    try {
      await page1.goto(`http://localhost:${PORT_1}`);
      await page2.goto(`http://localhost:${PORT_2}`);

      await page1.waitForLoadState('networkidle');
      await page2.waitForLoadState('networkidle');
      await sleep(1000);

      await page1.fill('input[name=author]', 'Dave');
      await page1.fill('input[name=content]', 'Initial message');
      await page1.click('button[type=submit]');
      await sleep(1500);

      let message = await page2.textContent('li:last-child');
      expect(message).toContain('Initial message');

      await page2.reload();
      await page2.waitForLoadState('networkidle');
      await sleep(1000);

      await page1.fill('input[name=author]', 'Dave');
      await page1.fill('input[name=content]', 'After reconnect');
      await page1.click('button[type=submit]');
      await sleep(1500);

      message = await page2.textContent('li:last-child');
      expect(message).toContain('After reconnect');
    } finally {
      await page1.close();
      await page2.close();
    }
  });
});

async function waitForServer(
  port: number,
  process: ChildProcess,
  timeout = 30000,
): Promise<void> {
  const readyPromise = new Promise<void>((resolve, reject) => {
    let timer: NodeJS.Timeout;

    const onData = (data: Buffer) => {
      const output = data.toString();
      if (output.includes('Ready on')) {
        cleanup();
        resolve();
      }
    };

    const onExit = (code: number | null) => {
      cleanup();
      reject(new Error(`Server process exited with code ${code}`));
    };

    const cleanup = () => {
      clearTimeout(timer);
      process.stdout?.off('data', onData);
      process.off('exit', onExit);
    };

    process.stdout?.on('data', onData);
    process.on('exit', onExit);

    timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(`Server on port ${port} did not start within ${timeout}ms`),
      );
    }, timeout);
  });

  await readyPromise;
}

async function waitForProcessExit(
  proc: ChildProcess,
  timeout = 5000,
): Promise<void> {
  return new Promise((resolve) => {
    // Already exited
    if (proc.exitCode !== null || proc.signalCode) return resolve();

    const timer = setTimeout(() => {
      try {
        // Only attempt if still running
        if (proc.exitCode === null && !proc.killed) proc.kill('SIGKILL');
      } catch {}
      resolve();
    }, timeout);

    proc.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
