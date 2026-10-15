import readline from 'node:readline';
import { debuglog as createDebugger } from 'node:util';
import chalk from 'chalk';

export function log(...message: unknown[]) {
  console.log('[next-ws]', ...message);
}

export function info(...message: unknown[]) {
  console.log(chalk.blue('[next-ws]'), ...message);
}

export function warn(...message: unknown[]) {
  console.log(chalk.yellow('[next-ws]'), ...message);
}

export function error(...message: unknown[]) {
  console.log(chalk.red('[next-ws]'), ...message);
}

export const debug = createDebugger('next-ws');

export function success(...message: unknown[]) {
  console.log(chalk.green('[next-ws]', '✔'), ...message);
}

export function failure(...message: unknown[]) {
  console.log(chalk.red('[next-ws]', '✖'), ...message);
}

/**
 * Show a confirmation prompt where the user can choose to confirm or deny.
 *
 * @param message The message to show
 * @returns A promise that resolves to a boolean indicating whether the user confirmed or denied
 */
export async function confirm(...message: unknown[]) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise<boolean>((resolve) => {
    const question = chalk.yellow('[next-ws]', ...message);
    const options = chalk.cyan('[y/N]');

    rl.question(`${question} ${options}`, (answer) => {
      const normalisedAnswer = answer.trim().toLowerCase();
      if (normalisedAnswer === 'y') resolve(true);
      else resolve(false);
      rl.close();
    });
  });
}

/**
 * Show a loading spinner while a promise is running.
 *
 * @param promise The promise to run
 * @param message The message to show
 * @returns The result of the promise
 */
export async function task<T>(promise: Promise<T>, ...message: unknown[]) {
  // Hide the cursor
  process.stdout.write('\x1B[?25l');

  const spinnerChars = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧'];
  let spinnerIndex = 0;
  const spinnerInterval = setInterval(() => {
    readline.cursorTo(process.stdout, 0);
    const spinnerChar = spinnerChars[spinnerIndex++ % spinnerChars.length] ?? ' ';
    process.stdout.write(chalk.cyan('[next-ws]', spinnerChar, ...message));
  }, 100);

  return promise
    .then((value) => {
      clearInterval(spinnerInterval);
      readline.cursorTo(process.stdout, 0);
      readline.clearLine(process.stdout, 0);
      success(...message);
      return value;
    })
    .catch((err) => {
      clearInterval(spinnerInterval);
      readline.cursorTo(process.stdout, 0);
      readline.clearLine(process.stdout, 0);
      failure(...message);
      throw err;
    })
    .finally(() => {
      // Show the cursor
      process.stdout.write('\x1B[?25h');
    });
}
