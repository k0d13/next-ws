import { describe, expect, it } from 'vitest';
import { maxVersion } from './semver.js';

describe('maxVersion', () => {
  it('returns the upper bound of an inclusive range', () => {
    expect(maxVersion('>=15.0.0 <=16.4.1')?.version).toBe('16.4.1');
  });

  it('returns the highest upper bound across a union of ranges', () => {
    expect(maxVersion('>=13.5.1 <=14.2.32 || >=15.0.0 <=16.4.1')?.version).toBe('16.4.1');
  });

  it('does not depend on the order of the union', () => {
    expect(maxVersion('>=15.0.0 <=16.4.1 || >=13.5.1 <=14.2.32')?.version).toBe('16.4.1');
  });

  it('steps back one patch for an exclusive upper bound', () => {
    expect(maxVersion('>=15.0.0 <16.4.1')?.version).toBe('16.4.0');
  });

  it('keeps the raw string in step with the version', () => {
    expect(maxVersion('>=15.0.0 <16.4.1')?.raw).toBe('16.4.0');
  });

  it('returns an exact version', () => {
    expect(maxVersion('16.4.1')?.version).toBe('16.4.1');
  });

  it('returns null when the range has no upper bound', () => {
    expect(maxVersion('>=15.0.0')).toBeNull();
  });

  // Bug: `<17.0.0` produces `17.0.-1` instead of a version below 17
  it.fails('returns a valid version for an exclusive bound on a .0 patch', () => {
    const version = maxVersion('>=16.0.0 <17.0.0');
    expect(version?.patch).toBeGreaterThanOrEqual(0);
    expect(version?.major).toBe(16);
  });
});
