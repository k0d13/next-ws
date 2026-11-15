import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { writeFileAtomic } from './fs.js';

export function resolveNextWsDirectory() {
  const id = //
    require.resolve('next-ws/package.json', { paths: [process.cwd()] });
  return dirname(id);
}

export function resolveNextDirectory() {
  const id = //
    require.resolve('next/package.json', { paths: [process.cwd()] });
  return dirname(id);
}

/** Installed Next.js version, without any prerelease suffix. */
export async function getInstalledNextVersion() {
  const id = join(resolveNextDirectory(), 'package.json');
  const pkg = await readFile(id, 'utf8').then(JSON.parse);
  return String(pkg.version.split('-')[0]);
}

export interface Trace {
  /** Version range of the patch that was applied. */
  patch: string;
  /** Version of Next.js that was patched. */
  version: string;
  /** Version of next-ws that applied the patch, whose path is written into the patched code. */
  nextWs: string;
}

/** Read what the installed Next.js was last patched with, null if it never was. */
export async function readTrace() {
  const id = join(resolveNextDirectory(), '.next-ws-trace.json');
  return readFile(id, 'utf-8')
    .then<Partial<Trace>>(JSON.parse)
    .catch(() => null);
}

export async function writeTrace(trace: Trace) {
  const id = join(resolveNextDirectory(), '.next-ws-trace.json');
  await writeFileAtomic(id, JSON.stringify(trace, null, 2));
}
