import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { version as nextWsVersion } from '../../package.json';

const next = vi.hoisted(() => ({
  version: '16.0.0',
  trace: null as Record<string, string> | null,
}));
vi.mock('~/patches/helpers/next.js', () => ({
  getInstalledNextVersion: async () => next.version,
  readTrace: async () => next.trace,
  writeTrace: vi.fn(async (trace: Record<string, string>) => void (next.trace = trace)),
}));

const execute = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('~/patches/index.js', () => ({
  default: [{ name: 'patch', versions: '>=15.0.0 <=16.4.1', steps: [], execute }],
}));

const console = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
  confirm: vi.fn(async () => false),
}));
vi.mock('./helpers/console.js', () => console);

const { default: patchCommand } = await import('./patch.js');
const { default: verifyCommand } = await import('./verify.js');

class Exit extends Error {}
beforeEach(() => {
  next.version = '16.0.0';
  next.trace = null;
  vi.spyOn(process, 'exit').mockImplementation((code) => {
    throw new Exit(`exit ${code}`);
  });
});
afterEach(() => void vi.clearAllMocks());

// ===== Patch ===== //

describe('patch', () => {
  it('applies the patch for a supported version', async () => {
    await patchCommand.action({ yes: false });
    expect(execute).toHaveBeenCalledOnce();
    expect(next.trace).toEqual({
      patch: '>=15.0.0 <=16.4.1',
      version: '16.0.0',
      nextWs: nextWsVersion,
    });
  });

  it('exits for a version below the minimum', async () => {
    next.version = '14.2.0';
    await expect(patchCommand.action({ yes: false })).rejects.toThrow('exit 1');
    expect(console.error).toHaveBeenCalledWith(
      'Next.js v14.2.0 is not supported, a minimum of v15.0.0 is required',
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it('asks before patching a newer version', async () => {
    next.version = '17.0.0';
    console.confirm.mockResolvedValueOnce(true);
    await patchCommand.action({ yes: false });
    expect(console.confirm).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledOnce();
  });

  it('aborts a newer version when not confirmed', async () => {
    next.version = '17.0.0';
    await expect(patchCommand.action({ yes: false })).rejects.toThrow('exit 1');
    expect(execute).not.toHaveBeenCalled();
  });

  it('skips the question with yes', async () => {
    next.version = '17.0.0';
    await patchCommand.action({ yes: true });
    expect(console.confirm).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledOnce();
  });
});

// ===== Verify ===== //

describe('verify', () => {
  const current = () => ({ patch: '>=15.0.0 <=16.4.1', version: '16.0.0', nextWs: nextWsVersion });

  it('passes when the trace matches', async () => {
    next.trace = current();
    await verifyCommand.action({ ensure: false });
    expect(console.info).toHaveBeenCalledWith('Next.js has been patched!');
  });

  it.each([
    ['there is no trace', null, 'Next.js has not been patched'],
    [
      'Next.js changed',
      { ...current(), version: '15.0.0' },
      'Next.js has been patched with a different version',
    ],
    [
      'next-ws changed',
      { ...current(), nextWs: '2.0.0' },
      'Next.js has been patched by a different version of next-ws',
    ],
    [
      'the trace predates next-ws versions',
      { patch: '>=15.0.0 <=16.4.1', version: '16.0.0' },
      'Next.js has been patched by a different version of next-ws',
    ],
  ])('fails when %s', async (_, trace, problem) => {
    next.trace = trace;
    await expect(verifyCommand.action({ ensure: false })).rejects.toThrow('exit 1');
    expect(console.error).toHaveBeenCalledWith(`${problem}, you'll need to run the patch command`);
  });

  it('patches instead of failing with ensure', async () => {
    next.trace = { ...current(), nextWs: '2.0.0' };
    await verifyCommand.action({ ensure: true });
    expect(execute).toHaveBeenCalledOnce();
    expect(next.trace).toEqual(current());
  });
});
