import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';

export const integrationDirectory = resolve(import.meta.dirname, '..');
export const fixturesDirectory = join(integrationDirectory, 'fixtures');

const require = createRequire(join(integrationDirectory, 'package.json'));
const nextBin = require.resolve('next/dist/bin/next');

/** Version of Next.js the fixtures run on, CI swaps it per matrix entry. */
export const nextVersion = (require('next/package.json') as { version: string }).version;

export type Mode = 'dev' | 'prod';

/** Modes to run every fixture in, `TEST_MODES=dev` narrows it while iterating locally. */
export const modes = (process.env.TEST_MODES?.split(',') ?? ['dev', 'prod']) as Mode[];

export interface Server {
  port: number;
  /** HTTP URL for a path on this server. */
  url(path?: string): string;
  /** WebSocket URL for a path on this server. */
  wsUrl(path?: string): string;
  /** Everything the server has written to stdout and stderr. */
  output(): string;
  /** Whether the process is still running. */
  alive(): boolean;
  stop(): Promise<void>;
}

interface StartOptions {
  /** Fixture directory name inside `fixtures/`. */
  fixture: string;
  mode: Mode;
  /** Directory Next.js builds into, so modes and instances never share one. */
  distDir?: string;
  /** Run this script instead of the Next.js CLI, for custom servers. */
  script?: string;
  env?: Record<string, string>;
}

/**
 * Build a fixture for production.
 *
 * @param fixture Fixture directory name
 * @param distDir Directory to build into
 */
export function buildFixture(fixture: string, distDir: string) {
  const result = spawnSync(process.execPath, [nextBin, 'build'], {
    cwd: join(fixturesDirectory, fixture),
    env: { ...process.env, ...baseEnv(), NEXT_DIST_DIR: distDir, NODE_ENV: 'production' },
    encoding: 'utf8',
  });
  if (result.status !== 0)
    throw new Error(`next build failed for ${fixture}\n${result.stdout}\n${result.stderr}`);
}

/**
 * Start a fixture with `next dev`, `next start` or its own server script, and wait until it answers
 * HTTP requests.
 *
 * @param options What to start and how
 * @returns The running server
 */
export async function startFixture(options: StartOptions): Promise<Server> {
  const port = await getFreePort();
  const distDir = options.distDir ?? `.next-${options.mode}`;
  const args = options.script
    ? [options.script]
    : [nextBin, options.mode === 'dev' ? 'dev' : 'start', '--port', `${port}`];

  const child = spawn(process.execPath, args, {
    cwd: join(fixturesDirectory, options.fixture),
    env: {
      ...process.env,
      ...baseEnv(),
      NODE_ENV: options.mode === 'dev' ? 'development' : 'production',
      NEXT_DIST_DIR: distDir,
      PORT: `${port}`,
      ...options.env,
    },
    // A process group on POSIX lets stop() take down the workers Next.js forks
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout?.on('data', (chunk) => (output += chunk));
  child.stderr?.on('data', (chunk) => (output += chunk));

  const server: Server = {
    port,
    url: (path = '/') => `http://127.0.0.1:${port}${path}`,
    wsUrl: (path = '/') => `ws://127.0.0.1:${port}${path}`,
    output: () => output,
    alive: () => child.exitCode === null && child.signalCode === null,
    stop: () => killTree(child),
  };

  try {
    await waitForHttp(server, child);
  } catch (cause) {
    await server.stop();
    throw new Error(`${options.fixture} (${options.mode}) did not start\n${output}`, { cause });
  }
  return server;
}

function baseEnv() {
  return { NEXT_TELEMETRY_DISABLED: '1', FORCE_COLOR: '0' };
}

async function getFreePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(typeof address === 'object' && address ? address.port : 0));
    });
  });
}

/** Wait until the server responds to an HTTP request, or the process exits. */
async function waitForHttp(server: Server, child: ChildProcess, timeout = 120_000) {
  const exited = new Promise<never>((_, reject) =>
    child.once('exit', (code) => reject(new Error(`Process exited with code ${code}`))),
  );
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const ready = await Promise.race([
      fetch(server.url('/__ready'), { signal: AbortSignal.timeout(5_000) }).then(
        () => true,
        () => false,
      ),
      exited,
    ]);
    if (ready) return;
    // Polling a condition, the server takes a moment to bind its port
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out after ${timeout}ms`);
}

/** Kill a process and everything it started. */
async function killTree(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null || !child.pid) return;
  const exited = new Promise<void>((r) => child.once('exit', () => r()));

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', `${child.pid}`, '/t', '/f'], { stdio: 'ignore' });
  } else {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
  }

  await exited;
}
