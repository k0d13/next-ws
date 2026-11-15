#!/usr/bin/env node

import * as console from './commands/helpers/console.js';
import program from './commands/index.js';

// Show why a command failed without a stack trace, `NODE_DEBUG=next-ws` prints the full error
Promise.resolve()
  .then(() => program.parse([], process.argv.slice(2)))
  .catch((cause: unknown) => {
    console.error(cause instanceof Error ? cause.message : cause);
    console.debug('%o', cause);
    process.exit(1);
  });
