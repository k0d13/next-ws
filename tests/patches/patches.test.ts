import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { relative as relativePath } from 'node:path';
import { Script } from 'node:vm';
import { applyPatch, createTwoFilesPatch } from 'diff';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as semver from '~/commands/helpers/semver.js';
import type { Patch } from '~/patches/helpers/define.js';
import { getNextDist } from './next-dist.js';

// Steps resolve `next:` paths and the next-ws directory through these, so point
// them at the downloaded package and at a path that is the same on every machine
const state = vi.hoisted(() => ({
  nextDirectory: '',
  nextWsDirectory: '/path/to/node_modules/next-ws',
}));
vi.mock('~/patches/helpers/next.js', () => ({
  resolveNextDirectory: () => state.nextDirectory,
  resolveNextWsDirectory: () => state.nextWsDirectory,
}));

const { default: patches } = await import('~/patches/index.js');

/**
 * Versions every patch is checked against. The lowest version and the newest tested one are always
 * included, so when the daily bump raises `tested` the `max` snapshots show what changed in
 * Next.js.
 */
const extraVersions: Record<string, string[]> = {
  'patch-2': ['15.5.28'],
};

const targets = patches.flatMap((patch) => [
  { patch, label: 'min', version: semver.minVersion(patch.versions)!.version },
  { patch, label: 'max', version: patch.tested },
  ...(extraVersions[patch.name] ?? []).map((version) => ({ patch, label: version, version })),
]);

/** Paths inside the Next.js package that a patch touches. */
function getPatchFiles(patch: Patch) {
  return [...new Set(patch.steps.map((s) => relative(s.path)))];
}

function relative(path: string) {
  return relativePath(state.nextDirectory, path).replaceAll('\\', '/');
}

/** Check the code is valid CommonJS by compiling it the way Node.js would. */
function compiles(code: string) {
  new Script(`(function (exports, require, module, __filename, __dirname) {${code}\n})`);
  return true;
}

function slug(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/** Version the next-ws 2 fixtures were patched from. */
const legacyVersion = '16.4.1';

// Download every version up front, in parallel
const directories = new Map<string, Promise<string>>();
beforeAll(async () => {
  for (const { patch, version } of [...targets, { patch: patches[0], version: legacyVersion }]) {
    state.nextDirectory = process.cwd();
    const files = getPatchFiles(patch);
    if (!directories.has(version)) directories.set(version, getNextDist(version, files));
  }
  await Promise.all(directories.values());
});

describe.each(targets)('$patch.name on next@$version ($label)', ({ patch, label, version }) => {
  /** Contents of each patched file, keyed by path inside the package. */
  const original = new Map<string, string>();
  const patched = new Map<string, string>();
  const stepOutputs: { title: string; path: string; before: string; after: string }[] = [];

  beforeAll(async () => {
    state.nextDirectory = await directories.get(version)!;

    for (const step of patch.steps) {
      const path = relative(step.path);
      if (!original.has(path)) {
        const code = await readFile(step.path, 'utf8');
        original.set(path, code);
        patched.set(path, code);
      }

      // Steps that share a file run one after another, just like `Patch.execute`
      const before = patched.get(path)!;
      const after = await step.transform(before);
      patched.set(path, after);
      stepOutputs.push({ title: step.title, path, before, after });
    }
  });

  it('is in the supported range', () => {
    expect(semver.satisfies(version, patch.versions)).toBe(true);
  });

  it('finds every file it patches', () => {
    for (const step of patch.steps) expect(existsSync(step.path), relative(step.path)).toBe(true);
  });

  it.each(patch.steps.map((s) => [s.title, s] as const))('changes the code: %s', (title) => {
    const output = stepOutputs.find((s) => s.title === title)!;
    expect(output.after, `${title} did not change ${output.path}`).not.toBe(output.before);
  });

  it('produces code that still compiles', () => {
    for (const [path, code] of patched) expect(compiles(code), path).toBe(true);
  });

  it('handles quotes in the next-ws path', async () => {
    const directory = state.nextWsDirectory;
    state.nextWsDirectory = "/home/O'Brien/node_modules/next-ws";
    try {
      for (const step of patch.steps) {
        const code = await step.transform(original.get(relative(step.path))!);
        expect(compiles(code), step.title).toBe(true);
      }
    } finally {
      state.nextWsDirectory = directory;
    }
  });

  it.each(patch.steps.map((s) => [s.title, s] as const))(
    'fails when it cannot find what it changes: %s',
    async (_, step) => {
      await expect(step.transform('function unrelated() {}')).rejects.toThrow(/Could not find/);
    },
  );

  it('is idempotent', async () => {
    const again = new Map(patched);
    for (const step of patch.steps) {
      const path = relative(step.path);
      again.set(path, await step.transform(again.get(path)!));
    }
    for (const [path, code] of patched) expect(again.get(path), path).toBe(code);
  });

  it.each(patch.steps.map((s) => [s.title, s] as const))(
    'matches the snapshot: %s',
    async (title) => {
      const { path, before, after } = stepOutputs.find((s) => s.title === title)!;
      const diff = createTwoFilesPatch(`a/${path}`, `b/${path}`, before, after, '', '', {
        context: 3,
      });
      await expect(`# next@${version}\n${diff}`).toMatchFileSnapshot(
        `__snapshots__/${patch.name}/${label}/${slug(title)}.diff`,
      );
    },
  );
});

describe(`upgrading next@${legacyVersion} patched by next-ws 2`, () => {
  const steps = patches.at(-1)!.steps;

  beforeAll(async () => {
    state.nextDirectory = await directories.get(legacyVersion)!;
  });

  it.each(steps.map((s) => [s.title, s] as const))(
    'replaces the old patch: %s',
    async (title, step) => {
      const original = await readFile(step.path, 'utf8');
      const fixture = await readFile(
        `${import.meta.dirname}/__fixtures__/next-ws-2/${slug(title)}.diff`,
        'utf8',
      );
      const legacy = applyPatch(original, fixture.replace(/^# .*\n/, ''));
      if (legacy === false) throw new Error(`Could not apply the fixture for ${title}`);

      const upgraded = await step.transform(legacy);
      const fresh = await step.transform(original);
      expect(upgraded).not.toMatch(/@patch |\/\/ socket\.end\(\)/);
      // The old patch is gone rather than patched again
      for (const marker of [/\/\*next-ws:begin /g, /'UPGRADE'/g, /setupWebSocketServer/g])
        expect(upgraded.match(marker)?.length, String(marker)).toBe(fresh.match(marker)?.length);
      expect(compiles(upgraded)).toBe(true);
    },
  );
});
