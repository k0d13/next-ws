import minimist from 'minimist';
import { version } from '../../../package.json';

export interface Definition {
  name: string;
  description: string;
}

// ===== CommandGroup ===== //

export interface CommandGroupDefinition extends Definition {
  children: (CommandGroup | Command)[];
}

export interface CommandGroup extends CommandGroupDefinition {
  parse(parents: CommandGroup[], argv: string[]): void;
}

/**
 * Define a command group.
 *
 * @param definition The definition for the command group
 * @returns The command group
 */
export function defineCommandGroup(definition: CommandGroupDefinition): CommandGroup {
  return {
    ...definition,
    parse(parents: CommandGroup[], argv: string[]) {
      const parsed = minimist(argv);
      for (const child of this.children)
        if (parsed._[0] === child.name)
          return void child.parse(parents.concat(this), argv.slice(1));
      if (parsed.help) return void console.log(buildCommandGroupHelp(parents, this));
      if (parsed.v || parsed.version) return void console.log(version);
      return void console.log(buildCommandGroupHelp(parents, this));
    },
  };
}

/**
 * Build the help message for a command group.
 *
 * @param parents List of parent command groups used to build the usage
 * @param group The command group to build the help message for
 * @returns The help message for the command group
 */
function buildCommandGroupHelp(parents: CommandGroup[], group: CommandGroup) {
  return `Usage: ${[...parents, group].map((p) => p.name).join(' ')} [command] [options]

${group.description}

Commands:
  ${group.children.map((c) => `${c.name} | ${c.description}`).join('\n  ')}

Options:
  --help | Show this help message and exit.
  --version | Show the version number and exit.
`;
}

// ===== Command ===== //

export interface CommandDefinition<TOptions extends OptionDefinition[]> extends Definition {
  options: TOptions;
  action(options: Record<TOptions[number]['name'], unknown>): Promise<void> | void;
}

export interface Command<
  TOptions extends OptionDefinition[] = OptionDefinition[],
> extends CommandDefinition<TOptions> {
  parse(parents: CommandGroup[], argv: string[]): void;
}

/**
 * Define a command.
 *
 * @param definition The definition for the command
 * @returns The command
 */
export function defineCommand<const TOptions extends OptionDefinition[]>(
  definition: CommandDefinition<TOptions>,
): Command<TOptions> {
  return {
    ...definition,
    parse(parents: CommandGroup[], argv: string[]) {
      const parsed = minimist(argv);
      if (parsed.help) return void console.log(buildCommandHelp(parents, this));
      return this.action(parsed as never);
    },
  };
}

/**
 * Build the help message for a command.
 *
 * @param parents List of parent command groups used to build the usage
 * @param command The command to build the help message for
 * @returns The help message for the command
 */
function buildCommandHelp(parents: CommandGroup[], command: Command) {
  return `Usage: ${[...parents, command].map((p) => p.name).join(' ')} [options]

${command.description}

Options:
  --help | Show this help message and exit.
  ${command.options.map((o) => `--${o.name} | ${o.description}`).join('\n  ')}
`;
}

// ===== Option ===== //

export interface OptionDefinition extends Definition {
  alias?: string | string[];
}
