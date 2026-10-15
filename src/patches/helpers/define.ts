import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as console from '~/commands/helpers/console.js';
import { writeFileAtomic } from './fs.js';
import { resolveNextDirectory } from './next.js';

export interface PatchDefinition {
  name: string;
  // Due to the auto update github action, the typing of this needs to be strict
  versions: `>=${string}.${string}.${string} <=${string}.${string}.${string}`;
  steps: PatchStep[];
}

export interface Patch extends PatchDefinition {
  execute(): Promise<void>;
}

/**
 * Define a patch.
 * @param definition The definition for the patch
 * @returns The patch
 */
export function definePatch(definition: PatchDefinition): Patch {
  return {
    ...definition,
    async execute() {
      for (const step of this.steps)
        await console.task(step.execute(), step.title);
    },
  };
}

export interface PatchStepDefinition {
  title: string;
  path: `next:${string}` | (string & {});
  transform(code: string): Promise<string>;
}

export interface PatchStep extends PatchStepDefinition {
  execute(): Promise<void>;
}

/**
 * Define a step for a patch.
 * @param definition The definition for the step
 * @returns The step
 */
export function definePatchStep(definition: PatchStepDefinition): PatchStep {
  return {
    ...definition,
    get path() {
      return resolvePath(definition.path);
    },
    async execute() {
      console.debug(`Applying '${this.title}' to '${this.path}'`);
      const code = await readFile(this.path, 'utf8') //
        .then((code) => this.transform(code));
      await writeFileAtomic(this.path, code);
    },
  };
}

/**
 * Patches allow prepending short-hands to paths, this will resolve them.
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
