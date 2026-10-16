import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { integrationDirectory } from './helpers/server.js';

const rootDirectory = resolve(import.meta.dirname, '../..');

function run(args: string[], cwd: string) {
  const result = spawnSync(process.execPath, args, { cwd, encoding: 'utf8' });
  if (result.status !== 0)
    throw new Error(`${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

/** Build next-ws and patch the Next.js installation the fixtures use. */
export default function setup() {
  if (!process.env.SKIP_BUILD) {
    const tsdown = resolve(rootDirectory, 'node_modules/tsdown/dist/run.mjs');
    run([tsdown], rootDirectory);
  }

  const cli = resolve(rootDirectory, 'dist/cli.cjs');
  run([cli, 'patch', '--yes'], integrationDirectory);
  run([cli, 'verify'], integrationDirectory);
}
