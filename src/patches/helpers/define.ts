import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as console from '~/commands/helpers/console.js';
import { writeFileAtomic } from './fs.js';
import { resolveNextDirectory } from './next.js';

export interface PatchDefinition {
  name: string;
  /** Next.js versions the patch applies to. */
  versions: `>=${string}.${string}.${string} <${string}.${string}.${string}`;
  /** Newest Next.js version the patch has been tested against, the daily bump workflow updates it. */
  tested: `${string}.${string}.${string}`;
  steps: PatchStep[];
}

export interface Patch extends PatchDefinition {
  execute(): Promise<void>;
}

/**
 * Define a patch.
 *
 * @param definition The definition for the patch
 * @returns The patch
 */
export function definePatch(definition: PatchDefinition): Patch {
  return {
    ...definition,
    async execute() {
      // Transform every file before writing any, so a step that fails leaves Next.js untouched
      const files = new Map<string, string>();
      for (const step of this.steps) {
        const path = step.path;
        const code = files.get(path) ?? (await readFile(path, 'utf8'));
        console.debug(`Applying '${step.title}' to '${path}'`);
        files.set(path, await console.task(step.transform(code), step.title));
      }
      for (const [path, code] of files) await writeFileAtomic(path, code);
    },
  };
}

export interface PatchStepDefinition {
  title: string;
  path: `next:${string}` | (string & {});
  /**
   * Apply the step to a file. It must throw when it cannot find what it changes, and give the same
   * output when run again on its own output.
   */
  transform(code: string): Promise<string>;
}

export type PatchStep = PatchStepDefinition;

/**
 * Define a step for a patch.
 *
 * @param definition The definition for the step
 * @returns The step
 */
export function definePatchStep(definition: PatchStepDefinition): PatchStep {
  return {
    ...definition,
    get path() {
      return resolvePath(definition.path);
    },
  };
}

/**
 * Patches allow prepending short-hands to paths, this will resolve them.
 *
 * @param path The path to resolve
 * @returns The resolved path
 */
function resolvePath(path: string) {
  switch (path.split(':')[0]) {
    case 'next': {
      const nextDirectory = resolveNextDirectory();
      const realPath = path.slice(5);
      return resolve(nextDirectory, realPath);
    }
    default: {
      return path;
    }
  }
}
