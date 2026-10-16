import { randomBytes } from 'node:crypto';
import { rename, rm, writeFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';

/**
 * Write a file by writing a temporary file next to it and renaming it over the original, so readers
 * never see it empty or half written. Package managers run every workspace's `prepare` at once, and
 * those all patch the same Next.js installation.
 *
 * @param path The file to write
 * @param data The contents to write
 */
export async function writeFileAtomic(path: string, data: string) {
  const temporary = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  try {
    await writeFile(temporary, data);
    await renameWithRetry(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

/**
 * Windows refuses to rename over a file while another process is reading or replacing it, so retry
 * for a short while when that happens.
 *
 * @param from The file to rename
 * @param to The path to rename it to
 */
async function renameWithRetry(from: string, to: string) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await rename(from, to);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const busy = code === 'EPERM' || code === 'EACCES' || code === 'EBUSY';
      if (!busy || attempt >= 20) throw error;
      await setTimeout(attempt * 25);
    }
  }
}
