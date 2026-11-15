import { defineConfig } from 'oxfmt';

export default defineConfig({
  singleQuote: true,
  sortImports: {
    groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'unknown'],
    newlinesBetween: false,
  },
  sortPackageJson: {
    sortScripts: true,
  },
  jsdoc: true,
  ignorePatterns: ['.changeset/*.md', 'CHANGELOG.md', '**/next-env.d.ts'],
});
