import { existsSync } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { x as extract } from 'tar';

const cacheDirectory = resolve(import.meta.dirname, '../../node_modules/.cache/next-ws/next');

/**
 * Get a directory containing the given files from the published `next@version` package. Only the
 * requested files are extracted from the tarball, and they are cached between runs.
 *
 * @param version Exact Next.js version
 * @param files Paths inside the package, such as `dist/server/next-server.js`
 * @returns Directory laid out like `node_modules/next`
 */
export async function getNextDist(version: string, files: string[]) {
  const directory = join(cacheDirectory, version);
  if (files.every((f) => existsSync(join(directory, f)))) return directory;

  const url = `https://registry.npmjs.org/next/-/next-${version}.tgz`;
  const response = await fetch(url);
  if (!response.ok || !response.body)
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);

  // Extract next to the final directory so an interrupted download is never mistaken for a cache hit
  const temporary = `${directory}.${process.pid}.tmp`;
  await rm(temporary, { recursive: true, force: true });
  await mkdir(temporary, { recursive: true });

  const wanted = new Set(['package.json', ...files].map((f) => `package/${f}`));
  await pipeline(
    Readable.fromWeb(response.body as never),
    extract({ cwd: temporary, strip: 1, filter: (path) => wanted.has(path) }),
  );

  await rm(directory, { recursive: true, force: true });
  await rename(temporary, directory);
  return directory;
}
