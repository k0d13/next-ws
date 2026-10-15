import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { version } from '../../../package.json';
import { defineCommand, defineCommandGroup } from './define.js';

let log: ReturnType<typeof vi.fn<typeof console.log>>;
beforeEach(() => {
  log = vi.fn();
  vi.spyOn(console, 'log').mockImplementation(log);
});
afterEach(() => void vi.restoreAllMocks());

function createCommand() {
  const action = vi.fn();
  const command = defineCommand({
    name: 'patch',
    description: 'Patch the thing',
    options: [{ name: 'yes', description: 'Skip the prompt', alias: 'y' }],
    action,
  });
  return { command, action };
}

// ===== Command ===== //

describe('defineCommand', () => {
  it('keeps the definition', () => {
    const { command } = createCommand();
    expect(command.name).toBe('patch');
    expect(command.description).toBe('Patch the thing');
    expect(command.options).toHaveLength(1);
  });

  it('runs the action with no options', () => {
    const { command, action } = createCommand();
    command.parse([], []);
    expect(action).toHaveBeenCalledOnce();
    expect(action.mock.calls[0]?.[0]).not.toHaveProperty('yes');
  });

  it('passes long options to the action', () => {
    const { command, action } = createCommand();
    command.parse([], ['--yes']);
    expect(action).toHaveBeenCalledWith(expect.objectContaining({ yes: true }));
  });

  // Bug: `minimist` is called without the aliases from the option definitions
  it.fails('passes aliased options to the action under their full name', () => {
    const { command, action } = createCommand();
    command.parse([], ['-y']);
    expect(action).toHaveBeenCalledWith(expect.objectContaining({ yes: true }));
  });

  it('prints help instead of running the action', () => {
    const { command, action } = createCommand();
    command.parse([], ['--help']);
    expect(action).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledOnce();
  });

  it('lists the usage and every option in the help', () => {
    const { command } = createCommand();
    const group = defineCommandGroup({ name: 'next-ws', description: '', children: [command] });
    command.parse([group], ['--help']);
    const help = String(log.mock.calls[0]?.[0]);
    expect(help).toContain('Usage: next-ws patch [options]');
    expect(help).toContain('Patch the thing');
    expect(help).toContain('--help');
    expect(help).toContain('--yes | Skip the prompt');
  });

  it('returns the result of the action', async () => {
    const command = defineCommand({
      name: 'patch',
      description: '',
      options: [],
      action: async () => {},
    });
    await expect(command.parse([], [])).resolves.toBeUndefined();
  });
});

// ===== Command Group ===== //

describe('defineCommandGroup', () => {
  function createGroup() {
    const { command, action } = createCommand();
    const verify = vi.fn();
    const group = defineCommandGroup({
      name: 'next-ws',
      description: 'The CLI',
      children: [
        command,
        defineCommand({ name: 'verify', description: 'Verify it', options: [], action: verify }),
      ],
    });
    return { group, patch: action, verify };
  }

  it('runs the named child command', () => {
    const { group, patch, verify } = createGroup();
    group.parse([], ['verify']);
    expect(verify).toHaveBeenCalledOnce();
    expect(patch).not.toHaveBeenCalled();
  });

  it('passes the remaining arguments to the child', () => {
    const { group, patch } = createGroup();
    group.parse([], ['patch', '--yes']);
    expect(patch).toHaveBeenCalledWith(expect.objectContaining({ yes: true }));
  });

  it('prints its own help with no command', () => {
    const { group } = createGroup();
    group.parse([], []);
    const help = String(log.mock.calls[0]?.[0]);
    expect(help).toContain('Usage: next-ws [command] [options]');
    expect(help).toContain('patch | Patch the thing');
    expect(help).toContain('verify | Verify it');
  });

  it('prints its own help for an unknown command', () => {
    const { group, patch, verify } = createGroup();
    group.parse([], ['unknown']);
    expect(patch).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
    expect(String(log.mock.calls[0]?.[0])).toContain('Usage: next-ws');
  });

  it('prints help with --help', () => {
    const { group } = createGroup();
    group.parse([], ['--help']);
    expect(String(log.mock.calls[0]?.[0])).toContain('Usage: next-ws');
  });

  it.each([['--version'], ['-v']])('prints the version with %s', (flag) => {
    const { group } = createGroup();
    group.parse([], [flag]);
    expect(log).toHaveBeenCalledWith(version);
  });

  it('shows the parent chain in a nested usage line', () => {
    const { group } = createGroup();
    const root = defineCommandGroup({ name: 'root', description: '', children: [group] });
    root.parse([], ['next-ws', 'patch', '--help']);
    expect(String(log.mock.calls[0]?.[0])).toContain('Usage: root next-ws patch [options]');
  });
});
