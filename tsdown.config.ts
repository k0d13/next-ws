import { defineConfig } from 'tsdown';

export default defineConfig([
  {
    entry: { 'server/index': 'src/server/index.ts' },
    // Keep the extension as .cjs as to not break the require() calls in the patches
    format: 'cjs',
    platform: 'node',
    dts: true,
  },
  {
    entry: { cli: 'src/cli.ts' },
    format: 'cjs',
    platform: 'node',
    dts: false,
    clean: false,
  },
]);
