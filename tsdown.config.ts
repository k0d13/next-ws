import { defineConfig } from 'tsdown';

export default defineConfig([
  {
    entry: { 'server/index': 'src/server/index.ts' },
    // Patched Next.js code requires dist/server/index.cjs, so that path must not change. The ESM
    // build gives ESM projects types that agree with their own `ws` types
    format: ['cjs', 'esm'],
    platform: 'node',
    dts: true,
  },
  {
    entry: { cli: 'src/cli.ts' },
    format: 'cjs',
    platform: 'node',
    dts: false,
    clean: false,
    // The CLI ships with everything it needs, so installing next-ws pulls in no dependencies
    deps: {
      onlyBundle: ['acorn', 'magic-string', '@jridgewell/sourcemap-codec', 'semver', 'chalk'],
    },
  },
]);
