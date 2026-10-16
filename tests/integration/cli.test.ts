import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { version as nextWsVersion } from '../../package.json';
import { getNextDist } from '../patches/next-dist.js';

const rootDirectory = resolve(import.meta.dirname, '../..');
const cli = join(rootDirectory, 'dist/cli.cjs');

// The newest supported Next.js and every file the newest patch touches
const nextVersion = '16.4.1';
const nextFiles = [
  'dist/server/next-server.js',
  'dist/server/lib/router-server.js',
  'dist/build/webpack/plugins/next-types-plugin/index.js',
  'dist/server/request/headers.js',
  'dist/server/request/cookies.js',
];

let nextDist: string;
beforeAll(async () => {
  nextDist = await getNextDist(nextVersion, nextFiles);
});

/** A throwaway project with Next.js and next-ws installed. */
let project: string;
let nextDirectory: string;
beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), 'next-ws-cli-'));
  nextDirectory = join(project, 'node_modules/next');
  await cp(nextDist, nextDirectory, { recursive: true });
  await mkdir(join(project, 'node_modules'), { recursive: true });
  // A junction needs no extra permissions on Windows, and is a plain symlink elsewhere
  await symlink(rootDirectory, join(project, 'node_modules/next-ws'), 'junction');
});
afterEach(() => rm(project, { recursive: true, force: true }));

function run(...args: string[]) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: project,
    encoding: 'utf8',
    // No TTY, the same as a `prepare` script in CI
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '0' },
    timeout: 30_000,
  });
  return {
    status: result.status,
    timedOut: result.error?.message.includes('ETIMEDOUT') ?? false,
    output: `${result.stdout}${result.stderr}`,
  };
}

async function setNextVersion(version: string) {
  const path = join(nextDirectory, 'package.json');
  const pkg = JSON.parse(await readFile(path, 'utf8'));
  await writeFile(path, JSON.stringify({ ...pkg, version }));
}

const readNext = (file: string) => readFile(join(nextDirectory, file), 'utf8');
const readTrace = async () => JSON.parse(await readNext('.next-ws-trace.json'));

// ===== Patch ===== //

describe('patch', () => {
  it('patches a supported version', async () => {
    const result = run('patch');
    expect(result.status).toBe(0);
    expect(result.output).toContain(`Patching Next.js v${nextVersion}`);
    expect(await readNext('dist/server/next-server.js')).toContain(
      '@patch attach-websocket-server',
    );
    expect(await readNext('dist/server/request/headers.js')).toContain('@patch headers');
    expect(await readNext('dist/server/request/cookies.js')).toContain('@patch cookies');
  });

  it('writes a trace of what it patched', async () => {
    run('patch');
    expect(await readTrace()).toMatchObject({ version: nextVersion, nextWs: nextWsVersion });
  });

  it('gives the same result when run twice', async () => {
    run('patch');
    const once = await Promise.all(nextFiles.map(readNext));
    expect(run('patch').status).toBe(0);
    expect(await Promise.all(nextFiles.map(readNext))).toEqual(once);
  });

  it('refuses a version below the minimum', async () => {
    await setNextVersion('12.0.0');
    const result = run('patch');
    expect(result.status).toBe(1);
    expect(result.output).toContain('Next.js v12.0.0 is not supported');
  });

  it.each([['--yes'], ['-y']])('patches a newer version with %s', async (flag) => {
    await setNextVersion('99.0.0');
    const result = run('patch', flag);
    expect(result.status).toBe(0);
    expect(result.output).toContain('is not officially supported');
    expect(await readNext('dist/server/next-server.js')).toContain(
      '@patch attach-websocket-server',
    );
  });

  it('aborts a newer version when there is no terminal to confirm in', async () => {
    await setNextVersion('99.0.0');
    const result = run('patch');
    expect(result.timedOut).toBe(false);
    expect(result.status).toBe(1);
    expect(await readNext('dist/server/next-server.js')).not.toContain('@patch');
  });

  it('prints help', () => {
    const result = run('patch', '--help');
    expect(result.status).toBe(0);
    expect(result.output).toContain('Usage: next-ws patch [options]');
  });
});

// ===== Verify ===== //

describe('verify', () => {
  it('passes once patched', () => {
    run('patch');
    const result = run('verify');
    expect(result.status).toBe(0);
    expect(result.output).toContain('Next.js has been patched');
  });

  it('fails when not patched', () => {
    const result = run('verify');
    expect(result.status).toBe(1);
    expect(result.output).toContain('has not been patched');
  });

  it('fails when Next.js changed since patching', async () => {
    run('patch');
    await setNextVersion('16.4.0');
    expect(run('verify').status).toBe(1);
  });

  it('fails when next-ws changed since patching', async () => {
    run('patch');
    const trace = await readTrace();
    await writeFile(
      join(nextDirectory, '.next-ws-trace.json'),
      JSON.stringify({ ...trace, nextWs: '0.0.1' }),
    );
    expect(run('verify').status).toBe(1);
  });

  it.each([['--ensure'], ['-e']])('patches when not patched with %s', async (flag) => {
    const result = run('verify', flag);
    expect(result.status).toBe(0);
    expect(await readNext('dist/server/next-server.js')).toContain(
      '@patch attach-websocket-server',
    );
  });
});

// ===== CLI ===== //

describe('cli', () => {
  it('prints the version', () => {
    expect(run('--version').output.trim()).toBe(nextWsVersion);
  });

  it('prints help with no command', () => {
    const result = run();
    expect(result.output).toContain('Usage: next-ws [command] [options]');
    expect(result.output).toContain('patch |');
    expect(result.output).toContain('verify |');
  });
});
